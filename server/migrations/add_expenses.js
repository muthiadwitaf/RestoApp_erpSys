/**
 * Migration: tambah tabel expenses (Biaya Operasional)
 * Jalankan: node migrations/add_expenses.js
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

async function migrate() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        await client.query(`
            CREATE TABLE IF NOT EXISTS expenses (
                id              SERIAL PRIMARY KEY,
                uuid            UUID DEFAULT gen_random_uuid() NOT NULL UNIQUE,
                number          VARCHAR(50) NOT NULL UNIQUE,
                date            DATE NOT NULL DEFAULT CURRENT_DATE,
                description     TEXT NOT NULL,
                category        VARCHAR(100) NOT NULL DEFAULT 'Lain-lain',
                amount          NUMERIC(15,2) NOT NULL DEFAULT 0,
                payment_method  VARCHAR(50) NOT NULL DEFAULT 'cash',
                paid_by         VARCHAR(100),
                coa_id          INTEGER REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
                status          VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','posted')),
                branch_id       INTEGER REFERENCES branches(id) ON DELETE CASCADE,
                created_by      VARCHAR(100),
                notes           TEXT,
                journal_id      INTEGER REFERENCES journal_entries(id) ON DELETE SET NULL,
                created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `);

        await client.query(`CREATE INDEX IF NOT EXISTS idx_expenses_uuid      ON expenses(uuid)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_expenses_branch_id ON expenses(branch_id)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_expenses_date      ON expenses(date)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_expenses_status    ON expenses(status)`);

        await client.query('COMMIT');
        console.log('✅ Tabel expenses berhasil dibuat');
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('❌ Migration gagal:', e.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

migrate();
