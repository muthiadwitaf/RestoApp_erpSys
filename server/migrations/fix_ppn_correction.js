/**
 * migrations/fix_ppn_correction.js
 * Script koreksi jurnal PPN untuk data lama (sebelum implementasi jurnal PPN terpisah).
 *
 * Script ini TIDAK mengubah jurnal lama. Hanya menambah jurnal adjustment baru
 * untuk bills & invoices yang:
 * - Punya nilai PPN (tax_amount > 0)
 * - Belum punya jurnal dengan akun PPN Masukan / PPN Keluaran
 *
 * Usage: node migrations/fix_ppn_correction.js
 * Safe to run multiple times (idempotent — skip jika sudah ada).
 */
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'erpsys',
});

// Helper: cari atau buat akun COA
async function findOrCreateAccount(client, companyId, code, name, type, category, searchTerms) {
    const whereTerms = searchTerms.map(t => `LOWER(coa.name) LIKE '%${t}%'`).join(' OR ');
    const res = await client.query(
        `SELECT id FROM chart_of_accounts coa
         WHERE company_id = $1 AND (${whereTerms})
         ORDER BY code LIMIT 1`, [companyId]
    );
    if (res.rows.length > 0) return res.rows[0].id;
    const ins = await client.query(
        `INSERT INTO chart_of_accounts (code, name, type, category, currency, company_id)
         VALUES ($1,$2,$3,$4,'IDR',$5)
         ON CONFLICT (code, company_id) DO UPDATE SET name=EXCLUDED.name RETURNING id`,
        [code, name, type, category, companyId]
    );
    return ins.rows[0].id;
}

// Helper: generate auto number sederhana (tanggal + random untuk koreksi)
function correctionNumber(prefix) {
    const d = new Date();
    const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
    return `ADJ-${prefix}-${ym}-${Math.floor(Math.random() * 9000 + 1000)}`;
}

async function run() {
    const client = await pool.connect();
    let billFixed = 0, invFixed = 0, skipped = 0;

    try {
        console.log('=== fix_ppn_correction.js ===');
        console.log('Menambah jurnal koreksi PPN untuk data lama...\n');

        // ── 1. Koreksi Purchase Bills dengan PPN ──────────────────────────────────
        console.log('[1/2] Memeriksa purchase_bills...');

        // Ambil semua bills yang punya tax_amount > 0 (dari PO terkait)
        const billsRes = await client.query(`
            SELECT pb.id, pb.number, pb.total, pb.branch_id,
                   po.tax_amount, po.branch_id as po_branch,
                   b.code as branch_code,
                   comp.id as company_id
            FROM purchase_bills pb
            JOIN purchase_orders po ON pb.po_id = po.id AND po.tax_amount > 0
            JOIN branches b ON pb.branch_id = b.id
            JOIN companies comp ON b.company_id = comp.id
        `);

        for (const bill of billsRes.rows) {
            // Cek apakah sudah ada jurnal PPN Masukan untuk bill ini
            const existing = await client.query(`
                SELECT je.id FROM journal_entries je
                JOIN journal_lines jl ON jl.journal_id = je.id
                JOIN chart_of_accounts coa ON jl.account_id = coa.id
                WHERE je.ref_number = $1 AND je.ref_type = 'BILL'
                  AND (LOWER(coa.name) LIKE '%ppn masukan%' OR LOWER(coa.name) LIKE '%pajak masukan%'
                       OR LOWER(coa.name) LIKE '%input vat%')
                LIMIT 1
            `, [bill.number]);

            if (existing.rows.length > 0) {
                console.log(`  [SKIP] ${bill.number} — jurnal PPN Masukan sudah ada`);
                skipped++;
                continue;
            }

            // Buat jurnal koreksi
            await client.query('BEGIN');
            try {
                const taxAmount = parseFloat(bill.tax_amount || 0);
                const billTotal = parseFloat(bill.total || 0);
                const dpp = billTotal - taxAmount;

                const ppnMasukanId = await findOrCreateAccount(client, bill.company_id,
                    '1510', 'PPN Masukan', 'asset', 'pajak',
                    ['ppn masukan', 'pajak masukan', 'input vat']);
                const hutangId = await findOrCreateAccount(client, bill.company_id,
                    '2100', 'Hutang Usaha', 'liability', 'hutang',
                    ['hutang usaha', 'utang dagang', 'accounts payable', 'utang usaha']);

                const jNum = correctionNumber('BILL');
                const jRes = await client.query(`
                    INSERT INTO journal_entries (number, date, branch_id, description, status, created_by, ref_number, ref_type)
                    VALUES ($1, CURRENT_DATE, $2, $3, 'posted', 'SYSTEM-CORRECTION', $4, 'BILL') RETURNING id
                `, [jNum, bill.branch_id,
                    `[Koreksi PPN] Tagihan ${bill.number} — PPN Masukan`,
                    bill.number]);
                const jId = jRes.rows[0].id;

                // Dr. PPN Masukan / Cr. Hutang Usaha (selisih koreksi)
                // → Logika: jurnal lama sudah Dr. Persediaan (fullTotal) / Cr. Hutang (fullTotal)
                //   Koreksi: Dr. PPN Masukan / Cr. Persediaan (pindahkan PPN dari Persediaan ke PPN Masukan)
                const persediaanId = await findOrCreateAccount(client, bill.company_id,
                    '1300', 'Persediaan Barang', 'asset', 'persediaan',
                    ['persediaan', 'inventory', 'stok']);

                await client.query(`
                    INSERT INTO journal_lines (journal_id, account_id, debit, credit, description)
                    VALUES ($1,$2,$3,0,$5), ($1,$4,0,$3,$5)
                `, [jId, ppnMasukanId, taxAmount, persediaanId, `Koreksi PPN Masukan ${bill.number}`]);

                await client.query('COMMIT');
                console.log(`  [OK] ${bill.number} — jurnal koreksi PPN Masukan Rp ${taxAmount.toLocaleString('id-ID')} dibuat (${jNum})`);
                billFixed++;
            } catch (e) {
                await client.query('ROLLBACK');
                console.error(`  [ERR] ${bill.number}: ${e.message}`);
            }
        }

        // ── 2. Koreksi Invoices (dari GI) dengan PPN ─────────────────────────────
        console.log('\n[2/2] Memeriksa invoices...');

        const invRes = await client.query(`
            SELECT inv.id, inv.number, inv.total, inv.branch_id,
                   so.tax_amount as so_tax_amount,
                   b.code as branch_code,
                   comp.id as company_id
            FROM invoices inv
            JOIN sales_orders so ON inv.so_id = so.id AND so.tax_amount > 0
            JOIN branches b ON inv.branch_id = b.id
            JOIN companies comp ON b.company_id = comp.id
            WHERE inv.gi_id IS NOT NULL
        `);

        for (const inv of invRes.rows) {
            // Cek apakah sudah ada jurnal PPN Keluaran untuk invoice ini
            const existing = await client.query(`
                SELECT je.id FROM journal_entries je
                JOIN journal_lines jl ON jl.journal_id = je.id
                JOIN chart_of_accounts coa ON jl.account_id = coa.id
                WHERE je.ref_number = $1 AND je.ref_type = 'GI'
                  AND (LOWER(coa.name) LIKE '%ppn keluaran%' OR LOWER(coa.name) LIKE '%pajak keluaran%'
                       OR LOWER(coa.name) LIKE '%output vat%')
                LIMIT 1
            `, [inv.number]);

            if (existing.rows.length > 0) {
                console.log(`  [SKIP] ${inv.number} — jurnal PPN Keluaran sudah ada`);
                skipped++;
                continue;
            }

            // Estimasi PPN dari so.tax_amount (proporsional sudah disimpan di kolom baru, atau estimasi)
            const taxCol = await client.query(`SELECT tax_amount FROM invoices WHERE id = $1`, [inv.id]);
            const ppnAmount = parseFloat(taxCol.rows[0]?.tax_amount || 0);
            if (ppnAmount <= 0) {
                console.log(`  [SKIP] ${inv.number} — tax_amount = 0, tidak ada koreksi`);
                skipped++;
                continue;
            }

            await client.query('BEGIN');
            try {
                const ppnKeluaranId = await findOrCreateAccount(client, inv.company_id,
                    '2200', 'PPN Keluaran', 'liability', 'pajak',
                    ['ppn keluaran', 'pajak keluaran', 'output vat']);
                const pendapatanId = await findOrCreateAccount(client, inv.company_id,
                    '4100', 'Pendapatan Penjualan', 'revenue', 'pendapatan',
                    ['penjualan', 'pendapatan', 'revenue']);

                const jNum = correctionNumber('INV');
                const jRes = await client.query(`
                    INSERT INTO journal_entries (number, date, branch_id, description, status, created_by, ref_number, ref_type)
                    VALUES ($1, CURRENT_DATE, $2, $3, 'posted', 'SYSTEM-CORRECTION', $4, 'GI') RETURNING id
                `, [jNum, inv.branch_id,
                    `[Koreksi PPN] Invoice ${inv.number} — PPN Keluaran`,
                    inv.number]);
                const jId = jRes.rows[0].id;

                // Koreksi: Cr. PPN Keluaran / Dr. Pendapatan Penjualan
                // (sebelumnya semua masuk Pendapatan, sekarang pisahkan PPN)
                await client.query(`
                    INSERT INTO journal_lines (journal_id, account_id, debit, credit, description)
                    VALUES ($1,$2,$3,0,$5), ($1,$4,0,$3,$5)
                `, [jId, pendapatanId, ppnAmount, ppnKeluaranId,
                    `Koreksi PPN Keluaran ${inv.number}`]);

                await client.query('COMMIT');
                console.log(`  [OK] ${inv.number} — jurnal koreksi PPN Keluaran Rp ${ppnAmount.toLocaleString('id-ID')} dibuat (${jNum})`);
                invFixed++;
            } catch (e) {
                await client.query('ROLLBACK');
                console.error(`  [ERR] ${inv.number}: ${e.message}`);
            }
        }

        console.log(`\n✅ Selesai:`);
        console.log(`   Purchase Bills dikoreksi : ${billFixed}`);
        console.log(`   Invoices dikoreksi       : ${invFixed}`);
        console.log(`   Dilewati (sudah ada)     : ${skipped}`);

    } catch (e) {
        console.error('Error fatal:', e.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

run();
