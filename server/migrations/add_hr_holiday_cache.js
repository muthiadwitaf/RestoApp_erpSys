/**
 * BE/migrations/add_hr_holiday_cache.js
 *
 * Tabel hr_holiday_cache — menyimpan data hari libur dari Calendarific
 * per perusahaan / negara / tahun, agar API hanya dipanggil 1x per tahun.
 *
 * Usage: node migrations/add_hr_holiday_cache.js
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
        console.log('Memulai migrasi add_hr_holiday_cache...\n');
        await client.query('BEGIN');

        await client.query(`
            CREATE TABLE IF NOT EXISTS hr_holiday_cache (
                id           SERIAL PRIMARY KEY,
                company_id   INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
                country_code VARCHAR(5)  NOT NULL,
                year         SMALLINT    NOT NULL,
                holidays     JSONB       NOT NULL DEFAULT '[]',
                source       VARCHAR(20) NOT NULL DEFAULT 'calendarific',
                fetched_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE (company_id, country_code, year)
            )
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_hr_holiday_cache_lookup
            ON hr_holiday_cache (company_id, country_code, year)
        `);
        console.log('  [1/1] Tabel hr_holiday_cache dibuat');

        await client.query('COMMIT');
        console.log('\nMigrasi selesai!');
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
