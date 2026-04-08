/**
 * Migration: add_holiday_cache_unique_constraint.js
 * Adds unique constraint on hr_holiday_cache(company_uuid, country_code, year)
 * Required for ON CONFLICT upsert in hrConfig.js
 */
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT) || 5432,
    user:     process.env.DB_USER     || 'postgres',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME     || 'erpsys',
});

async function run() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Pastikan tabel ada
        await client.query(`
            CREATE TABLE IF NOT EXISTS hr_holiday_cache (
                id           SERIAL PRIMARY KEY,
                company_id   INTEGER,
                company_uuid UUID,
                country_code VARCHAR(10) NOT NULL,
                year         INTEGER     NOT NULL,
                holidays     JSONB       NOT NULL DEFAULT '[]',
                source       VARCHAR(50) DEFAULT 'calendarific',
                fetched_at   TIMESTAMPTZ DEFAULT NOW()
            )
        `);
        console.log('✅ Table hr_holiday_cache ensured.');

        // 2. Hapus duplicate rows sebelum tambah constraint
        const dupDel = await client.query(`
            DELETE FROM hr_holiday_cache a
            USING hr_holiday_cache b
            WHERE a.id < b.id
              AND a.company_uuid = b.company_uuid
              AND a.country_code = b.country_code
              AND a.year         = b.year
        `);
        if (dupDel.rowCount > 0) {
            console.log(`🧹 Removed ${dupDel.rowCount} duplicate rows.`);
        }

        // 3. Tambah unique constraint jika belum ada
        const constraintCheck = await client.query(`
            SELECT constraint_name
            FROM information_schema.table_constraints
            WHERE table_name    = 'hr_holiday_cache'
              AND constraint_type = 'UNIQUE'
              AND constraint_name = 'hr_holiday_cache_company_uuid_country_code_year_key'
        `);

        if (constraintCheck.rows.length === 0) {
            await client.query(`
                ALTER TABLE hr_holiday_cache
                ADD CONSTRAINT hr_holiday_cache_company_uuid_country_code_year_key
                UNIQUE (company_uuid, country_code, year)
            `);
            console.log('✅ UNIQUE constraint added on (company_uuid, country_code, year)');
        } else {
            console.log('ℹ️  UNIQUE constraint already exists, skipping.');
        }

        await client.query('COMMIT');
        console.log('✅ Migration completed successfully.');
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('❌ Migration failed:', e.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

run();
