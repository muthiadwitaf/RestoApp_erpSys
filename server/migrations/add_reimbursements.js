/**
 * Migration: tambah tabel reimbursements + reimbursement_items
 * Jalankan: node migrations/add_reimbursements.js
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

        // ── Tabel header reimburse ──────────────────────────────────────────
        await client.query(`
            CREATE TABLE IF NOT EXISTS reimbursements (
                id              SERIAL PRIMARY KEY,
                uuid            UUID DEFAULT gen_random_uuid() NOT NULL UNIQUE,
                number          VARCHAR(50) NOT NULL UNIQUE,
                branch_id       INTEGER REFERENCES branches(id) ON DELETE CASCADE,
                employee_id     INTEGER REFERENCES employees(id) ON DELETE SET NULL,
                date            DATE NOT NULL DEFAULT CURRENT_DATE,
                description     TEXT NOT NULL,
                payment_method  VARCHAR(20) NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash','transfer')),
                bank_name       VARCHAR(100),
                bank_account    VARCHAR(100),
                total_amount    NUMERIC(15,2) NOT NULL DEFAULT 0,
                status          VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','posted')),
                notes           TEXT,
                journal_id      INTEGER REFERENCES journal_entries(id) ON DELETE SET NULL,
                created_by      VARCHAR(100),
                created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `);

        // ── Tabel line items reimburse ──────────────────────────────────────
        await client.query(`
            CREATE TABLE IF NOT EXISTS reimbursement_items (
                id                  SERIAL PRIMARY KEY,
                uuid                UUID DEFAULT gen_random_uuid() NOT NULL UNIQUE,
                reimbursement_id    INTEGER NOT NULL REFERENCES reimbursements(id) ON DELETE CASCADE,
                date_item           DATE,
                category            VARCHAR(100) NOT NULL DEFAULT 'Lain-lain',
                description         TEXT NOT NULL,
                amount              NUMERIC(15,2) NOT NULL DEFAULT 0,
                coa_id              INTEGER REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
                attachment_path     TEXT,
                created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `);

        // ── Indeks ──────────────────────────────────────────────────────────
        await client.query(`CREATE INDEX IF NOT EXISTS idx_reimbursements_uuid        ON reimbursements(uuid)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_reimbursements_branch_id   ON reimbursements(branch_id)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_reimbursements_employee_id ON reimbursements(employee_id)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_reimbursements_date        ON reimbursements(date)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_reimbursements_status      ON reimbursements(status)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_reimb_items_reimb_id       ON reimbursement_items(reimbursement_id)`);

        await client.query('COMMIT');
        console.log('Tabel reimbursements + reimbursement_items berhasil dibuat');
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Migration gagal:', e.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

migrate();
