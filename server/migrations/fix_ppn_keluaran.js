/**
 * fix_ppn_keluaran.js
 * 1. Fix type "liability" -> "Liabilitas" pada akun PPN Keluaran (code=2200) semua company
 * 2. Fix category "pajak" -> "Utang Pajak" pada akun yg sama
 * 3. Hapus akun "Utang PPN" (2-2001) dari semua company yang saldonya 0
 *    (akun duplikat -- PPN Keluaran yg dipakai di flow)
 * Idempotent -- aman dijalankan berkali-kali
 * Jalankan: node migrations/fix_ppn_keluaran.js
 */
require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT || '5432'),
    user:     process.env.DB_USER     || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME     || 'erpsys',
});

async function run() {
    const client = await pool.connect();
    try {
        // 1. Fix type & category PPN Keluaran
        const fixRes = await client.query(
            `UPDATE chart_of_accounts
             SET type     = 'Liabilitas',
                 category = 'Utang Pajak'
             WHERE code = '2200'
               AND (type = 'liability' OR category != 'Utang Pajak')
             RETURNING id, company_id`
        );
        console.log('Fixed PPN Keluaran (type + category): ' + fixRes.rows.length + ' row(s)');

        // 2. Hapus Utang PPN (2-2001) hanya jika saldo = 0
        const delRes = await client.query(
            `DELETE FROM chart_of_accounts
             WHERE code = '2-2001'
               AND name = 'Utang PPN'
               AND balance = 0
             RETURNING id, company_id`
        );
        console.log('Deleted Utang PPN (2-2001, balance=0): ' + delRes.rows.length + ' row(s)');

        // 3. Cek jika masih ada 2-2001 dengan saldo != 0 (tidak dihapus)
        const remain = await client.query(
            `SELECT c.name as company_name, ca.balance
             FROM chart_of_accounts ca
             JOIN companies c ON ca.company_id = c.id
             WHERE ca.code = '2-2001'`
        );
        if (remain.rows.length > 0) {
            console.log('\nPerhatian: akun 2-2001 berikut TIDAK dihapus karena saldo != 0:');
            remain.rows.forEach(r => console.log('  ' + r.company_name + ' -- saldo: ' + r.balance));
        }

        console.log('\nSelesai!');
    } catch (e) {
        console.error('Gagal:', e.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

run();
