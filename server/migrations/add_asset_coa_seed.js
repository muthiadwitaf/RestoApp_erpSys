/**
 * add_asset_coa_seed.js
 * Seed 24 COA default untuk Manajemen Aset ke semua company yang sudah ada.
 * Aman dijalankan berkali-kali (ON CONFLICT DO NOTHING).
 * Jalankan: node migrations/add_asset_coa_seed.js
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

const ASSET_COA = [
    // Nilai Perolehan Aset Tetap (Aktiva)
    ['1-2100', 'Kendaraan',                              'Aset',      'Aset Tetap'],
    ['1-2110', 'Akumulasi Penyusutan Kendaraan',         'Aset',      'Aset Tetap'],
    ['1-2200', 'Peralatan & Mesin',                      'Aset',      'Aset Tetap'],
    ['1-2210', 'Akumulasi Penyusutan Peralatan & Mesin', 'Aset',      'Aset Tetap'],
    ['1-2300', 'Bangunan & Renovasi',                    'Aset',      'Aset Tetap'],
    ['1-2310', 'Akumulasi Penyusutan Bangunan',          'Aset',      'Aset Tetap'],
    ['1-2400', 'Furnitur & Inventaris',                  'Aset',      'Aset Tetap'],
    ['1-2410', 'Akumulasi Penyusutan Furnitur & Inventaris', 'Aset',  'Aset Tetap'],
    ['1-2500', 'Peralatan IT & Komputer',                'Aset',      'Aset Tetap'],
    ['1-2510', 'Akumulasi Penyusutan Peralatan IT',      'Aset',      'Aset Tetap'],
    // Beban Penyusutan
    ['6-2100', 'Beban Penyusutan Kendaraan',             'Beban',     'Beban Penyusutan Aset'],
    ['6-2200', 'Beban Penyusutan Peralatan & Mesin',     'Beban',     'Beban Penyusutan Aset'],
    ['6-2300', 'Beban Penyusutan Bangunan',              'Beban',     'Beban Penyusutan Aset'],
    ['6-2400', 'Beban Penyusutan Furnitur & Inventaris', 'Beban',     'Beban Penyusutan Aset'],
    ['6-2500', 'Beban Penyusutan Peralatan IT',          'Beban',     'Beban Penyusutan Aset'],
    // Beban Pemeliharaan
    ['6-2600', 'Beban Pemeliharaan Kendaraan',           'Beban',     'Beban Pemeliharaan Aset'],
    ['6-2700', 'Beban Pemeliharaan Peralatan & Mesin',   'Beban',     'Beban Pemeliharaan Aset'],
    ['6-2800', 'Beban Pemeliharaan Bangunan',            'Beban',     'Beban Pemeliharaan Aset'],
    ['6-2900', 'Beban Pemeliharaan Furnitur & IT',       'Beban',     'Beban Pemeliharaan Aset'],
    // Disposal & Revaluasi (shared semua kategori)
    ['8-1100', 'Keuntungan Pelepasan Aset',              'Pendapatan','Pendapatan Lain-lain'],
    ['6-3000', 'Kerugian Pelepasan Aset',                'Beban',     'Beban Lain-lain'],
    ['6-3100', 'Kerugian Revaluasi Aset',                'Beban',     'Beban Lain-lain'],
    ['3-2100', 'Surplus Revaluasi Aset',                 'Ekuitas',   'Ekuitas'],
];

async function seed() {
    const client = await pool.connect();
    try {
        // Pastikan kolom category ada
        await client.query(`ALTER TABLE chart_of_accounts ADD COLUMN IF NOT EXISTS category VARCHAR(100)`);

        const companies = await client.query(`SELECT id, code, name FROM companies ORDER BY name`);
        console.log('Found ' + companies.rows.length + ' company(s).\n');

        let inserted = 0;
        let skipped  = 0;

        for (const company of companies.rows) {
            let compIns = 0;
            for (const [code, name, type, category] of ASSET_COA) {
                const r = await client.query(
                    `INSERT INTO chart_of_accounts
                     (code, name, type, category, currency, balance, company_id)
                     VALUES ($1,$2,$3,$4,'IDR',0,$5)
                     ON CONFLICT (code, company_id) DO NOTHING
                     RETURNING id`,
                    [code, name, type, category, company.id]
                );
                if (r.rows.length > 0) { inserted++; compIns++; }
                else skipped++;
            }
            console.log('  [OK] ' + company.name + ' (' + company.code + ') -- ' + compIns + ' COA baru');
        }

        console.log('\nSelesai! Inserted: ' + inserted + ', Skipped (sudah ada): ' + skipped);
    } catch (e) {
        console.error('Seed gagal:', e.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

seed();
