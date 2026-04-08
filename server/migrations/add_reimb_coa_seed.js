/**
 * Migration: Seed 8 akun Beban Reimburse ke semua company yang sudah ada.
 * Aman dijalankan berkali-kali (ON CONFLICT DO NOTHING).
 * Jalankan: node migrations/add_reimb_coa_seed.js
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

const REIMB_COA = [
    ['6-1100', 'Beban Perjalanan Dinas',         'Beban', 'Beban Reimburse', 'IDR', 0],
    ['6-1200', 'Beban Konsumsi & Representasi',   'Beban', 'Beban Reimburse', 'IDR', 0],
    ['6-1300', 'Beban ATK & Perlengkapan',        'Beban', 'Beban Reimburse', 'IDR', 0],
    ['6-1400', 'Beban Komunikasi & Internet',     'Beban', 'Beban Reimburse', 'IDR', 0],
    ['6-1500', 'Beban Kesehatan Karyawan',        'Beban', 'Beban Reimburse', 'IDR', 0],
    ['6-1600', 'Beban Jasa Profesional',          'Beban', 'Beban Reimburse', 'IDR', 0],
    ['6-1700', 'Beban Pemeliharaan & Perbaikan',  'Beban', 'Beban Reimburse', 'IDR', 0],
    ['6-1900', 'Beban Reimburse Lain-lain',       'Beban', 'Beban Reimburse', 'IDR', 0],
];

async function migrate() {
    const client = await pool.connect();
    try {
        // Pastikan kolom category ada (kalau belum ada di database lama)
        await client.query(`
            ALTER TABLE chart_of_accounts
            ADD COLUMN IF NOT EXISTS category VARCHAR(100);
        `);

        // Ambil semua company aktif
        const companies = await client.query(`SELECT id, code, name FROM companies ORDER BY name`);
        console.log(`Ditemukan ${companies.rows.length} company.`);

        let inserted = 0;
        let skipped  = 0;

        for (const company of companies.rows) {
            for (const [code, name, type, category, currency, balance] of REIMB_COA) {
                const res = await client.query(
                    `INSERT INTO chart_of_accounts
                     (code, name, type, category, currency, balance, company_id)
                     VALUES ($1,$2,$3,$4,$5,$6,$7)
                     ON CONFLICT (code, company_id) DO NOTHING
                     RETURNING id`,
                    [code, name, type, category, currency, balance, company.id]
                );
                if (res.rows.length > 0) {
                    inserted++;
                } else {
                    skipped++;
                }
            }
            console.log(`  [OK] ${company.name} (${company.code})`);
        }

        console.log(`\nSelesai! Inserted: ${inserted}, Skipped (sudah ada): ${skipped}`);
    } catch (e) {
        console.error('Migration gagal:', e.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

migrate();
