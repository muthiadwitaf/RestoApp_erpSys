/**
 * BE/migrations/add_hr_custom_holidays.js
 *
 * Tabel hr_custom_holidays — untuk menyimpan hari libur tambahan
 * (Cuti Bersama, hari libur daerah, dll.) yang tidak ada di Nager.Date.
 *
 * Usage: node migrations/add_hr_custom_holidays.js
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
        console.log('Memulai migrasi add_hr_custom_holidays...\n');
        await client.query('BEGIN');

        await client.query(`
            CREATE TABLE IF NOT EXISTS hr_custom_holidays (
                id           SERIAL PRIMARY KEY,
                company_id   INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
                date         DATE NOT NULL,
                name         VARCHAR(200) NOT NULL,
                description  TEXT,
                type         VARCHAR(20) NOT NULL DEFAULT 'holiday'
                             CHECK (type IN ('holiday', 'cuti_bersama', 'local')),
                created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE (company_id, date, name)
            )
        `);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_hr_custom_holidays_company_date
                            ON hr_custom_holidays (company_id, date)`);
        console.log('  [1/1] Tabel hr_custom_holidays dibuat');

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
