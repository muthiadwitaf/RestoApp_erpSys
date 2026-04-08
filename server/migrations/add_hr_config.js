/**
 * BE/migrations/add_hr_config.js
 *
 * Membuat tabel hr_config untuk menyimpan konfigurasi HR per perusahaan:
 *   - country_code : kode negara ISO 2 (MY, ID, SG, US, dll.)
 *   - timezone     : zona waktu (untuk referensi, opsional)
 *
 * Usage: node migrations/add_hr_config.js
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
        console.log('Memulai migrasi add_hr_config...\n');
        await client.query('BEGIN');

        await client.query(`
            CREATE TABLE IF NOT EXISTS hr_config (
                id           SERIAL PRIMARY KEY,
                company_id   INTEGER NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
                country_code VARCHAR(5)  NOT NULL DEFAULT 'ID',  -- ISO 3166-1 alpha-2
                timezone     VARCHAR(60) NOT NULL DEFAULT 'Asia/Jakarta',
                created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `);
        console.log('  [1/1] Tabel hr_config dibuat');

        await client.query('COMMIT');
        console.log('\nMigrasi selesai!');
        console.log('Default country: ID (Indonesia), timezone: Asia/Jakarta');
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
