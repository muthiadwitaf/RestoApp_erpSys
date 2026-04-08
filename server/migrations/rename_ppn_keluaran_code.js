/**
 * rename_ppn_keluaran_code.js
 *
 * Rename kode COA "PPN Keluaran" dari format lama "2200" ke format standar "2-2200"
 * untuk semua company yang ada di database.
 *
 * Aman dijalankan berulang kali (idempotent):
 * - Jika kode sudah "2-2200", skip.
 * - Jika ada konflik kode "2-2200" di company yang sama, merge (hapus duplikat lama).
 *
 * Jalankan: node migrations/rename_ppn_keluaran_code.js
 */

const { query, getClient } = require('../src/config/db');

async function run() {
    console.log('=== Rename COA PPN Keluaran: 2200 -> 2-2200 ===\n');

    // Ambil semua akun dengan kode '2200' yang namanya PPN Keluaran
    const oldRes = await query(
        `SELECT id, uuid, code, name, company_id
         FROM chart_of_accounts
         WHERE code = '2200'
         ORDER BY company_id`
    );

    if (oldRes.rows.length === 0) {
        console.log('Tidak ada akun dengan kode "2200" ditemukan. Mungkin sudah dimigrasi sebelumnya.');
        return;
    }

    console.log(`Ditemukan ${oldRes.rows.length} akun dengan kode "2200":\n`);

    for (const acct of oldRes.rows) {
        console.log(`  Company ID ${acct.company_id} — "${acct.name}" (ID: ${acct.id})`);

        // Cek apakah kode '2-2200' sudah ada di company ini
        const conflictRes = await query(
            `SELECT id FROM chart_of_accounts WHERE code = '2-2200' AND company_id = $1`,
            [acct.company_id]
        );

        if (conflictRes.rows.length > 0) {
            // Ada konflik: '2-2200' sudah ada — update semua referensi journal_lines ke ID yang lama
            // lalu hapus akun duplikat lama ('2200')
            const existingId = conflictRes.rows[0].id;
            console.log(`    [CONFLICT] Kode "2-2200" sudah ada (ID: ${existingId}). Menggabungkan referensi...`);

            const client = await getClient();
            try {
                await client.query('BEGIN');

                // Pindahkan semua referensi journal_lines ke akun yang benar (2-2200)
                const updLines = await client.query(
                    `UPDATE journal_lines SET account_id = $1 WHERE account_id = $2`,
                    [existingId, acct.id]
                );
                console.log(`    -> Dipindahkan ${updLines.rowCount} baris jurnal`);

                // Hapus akun duplikat lama
                await client.query(`DELETE FROM chart_of_accounts WHERE id = $1`, [acct.id]);
                console.log(`    -> Akun lama (ID: ${acct.id}) dihapus`);

                await client.query('COMMIT');
            } catch (err) {
                await client.query('ROLLBACK');
                console.error(`    [ERROR] Gagal merge company ${acct.company_id}:`, err.message);
            } finally {
                client.release();
            }
        } else {
            // Tidak ada konflik — rename saja
            try {
                await query(
                    `UPDATE chart_of_accounts SET code = '2-2200', updated_at = NOW() WHERE id = $1`,
                    [acct.id]
                );
                console.log(`    [OK] Berhasil di-rename ke "2-2200"`);
            } catch (err) {
                console.error(`    [ERROR] Gagal rename:`, err.message);
            }
        }
    }

    // Verifikasi hasil
    console.log('\n=== Verifikasi ===');
    const verifyOld = await query(`SELECT COUNT(*) FROM chart_of_accounts WHERE code = '2200'`);
    const verifyNew = await query(`SELECT COUNT(*) FROM chart_of_accounts WHERE code = '2-2200'`);
    console.log(`Akun dengan kode "2200"   : ${verifyOld.rows[0].count} (harus 0)`);
    console.log(`Akun dengan kode "2-2200" : ${verifyNew.rows[0].count}`);

    if (parseInt(verifyOld.rows[0].count) === 0) {
        console.log('\n[SUKSES] Semua akun PPN Keluaran berhasil di-rename ke "2-2200"');
    } else {
        console.log('\n[PERINGATAN] Masih ada akun dengan kode lama "2200". Cek manual.');
    }

    process.exit(0);
}

run().catch(err => {
    console.error('[FATAL]', err);
    process.exit(1);
});
