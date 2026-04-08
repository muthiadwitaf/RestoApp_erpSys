/**
 * BE/migrations/add_company_fiscal_config.js
 * Menambahkan kolom konfigurasi tahun fiskal & accounting ke tabel companies.
 *
 * Kolom baru:
 *   - fiscal_year_start_month  INTEGER  DEFAULT 1  (bulan awal tahun fiskal, 1=Januari)
 *   - closing_deadline_day     INTEGER  DEFAULT 5  (deadline tutup buku, hari ke-N bulan berikutnya)
 *   - efaktur_series_prefix    VARCHAR(10) DEFAULT '010'
 *   - efaktur_last_number      INTEGER  DEFAULT 0
 *
 * Usage: node migrations/add_company_fiscal_config.js
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
        console.log('Memulai migrasi add_company_fiscal_config...\n');
        await client.query('BEGIN');

        await client.query(`
            ALTER TABLE companies
                ADD COLUMN IF NOT EXISTS fiscal_year_start_month  INTEGER NOT NULL DEFAULT 1,
                ADD COLUMN IF NOT EXISTS closing_deadline_day     INTEGER NOT NULL DEFAULT 5,
                ADD COLUMN IF NOT EXISTS efaktur_series_prefix    VARCHAR(10) DEFAULT '010',
                ADD COLUMN IF NOT EXISTS efaktur_last_number      INTEGER NOT NULL DEFAULT 0
        `);
        console.log('  [1/1] companies: kolom fiscal_year_start_month, closing_deadline_day,');
        console.log('                   efaktur_series_prefix, efaktur_last_number ditambahkan');

        await client.query('COMMIT');
        console.log('\nMigrasi add_company_fiscal_config selesai!');
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Error:', e.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

run();
