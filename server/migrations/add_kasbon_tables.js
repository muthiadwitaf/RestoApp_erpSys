/**
 * BE/migrations/add_kasbon_tables.js
 * Membuat tabel untuk modul Kasbon (Advance Salary):
 *   1. salary_advances   — pengajuan kasbon karyawan
 *   2. advance_cicilan   — cicilan kasbon per periode payroll
 *
 * Usage: node migrations/add_kasbon_tables.js
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
        console.log('Memulai migrasi add_kasbon_tables...\n');
        await client.query('BEGIN');

        // ── 1. salary_advances ────────────────────────────────────────────────
        await client.query(`
            CREATE TABLE IF NOT EXISTS salary_advances (
                id                  SERIAL PRIMARY KEY,
                uuid                UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
                nomor               VARCHAR(50) NOT NULL UNIQUE,  -- auto-generated: KSB-2026-00001
                company_id          INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
                employee_id         INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
                amount              DECIMAL(15,2) NOT NULL CHECK (amount > 0),
                alasan              TEXT,
                jumlah_cicilan_bulan INTEGER NOT NULL DEFAULT 1 CHECK (jumlah_cicilan_bulan BETWEEN 1 AND 24),
                amount_per_cicilan  DECIMAL(15,2),               -- amount / jumlah_cicilan_bulan
                cicilan_mulai_bulan SMALLINT CHECK (cicilan_mulai_bulan BETWEEN 1 AND 12),
                cicilan_mulai_tahun SMALLINT,
                status              VARCHAR(20) NOT NULL DEFAULT 'draft'
                                        CHECK (status IN ('draft','approved','rejected','lunas')),
                sisa_cicilan        INTEGER DEFAULT 0,           -- berapa bulan cicilan yang belum terbayar
                reviewed_by         INTEGER REFERENCES users(id),
                reviewed_at         TIMESTAMPTZ,
                review_notes        TEXT,
                created_by          VARCHAR(100),
                created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_salary_advances_employee ON salary_advances(employee_id);
            CREATE INDEX IF NOT EXISTS idx_salary_advances_company_status ON salary_advances(company_id, status);
        `);
        console.log('  [1/2] Tabel salary_advances dibuat');

        // ── 2. advance_cicilan ────────────────────────────────────────────────
        await client.query(`
            CREATE TABLE IF NOT EXISTS advance_cicilan (
                id              SERIAL PRIMARY KEY,
                advance_id      INTEGER NOT NULL REFERENCES salary_advances(id) ON DELETE CASCADE,
                period_id       INTEGER REFERENCES payroll_periods(id) ON DELETE SET NULL,
                slip_id         INTEGER REFERENCES payroll_slips(id) ON DELETE SET NULL,
                urutan          SMALLINT NOT NULL,               -- ke-N dari total cicilan
                bulan           SMALLINT NOT NULL CHECK (bulan BETWEEN 1 AND 12),
                tahun           SMALLINT NOT NULL,
                amount          DECIMAL(15,2) NOT NULL,
                status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                                    CHECK (status IN ('pending','paid')),
                paid_at         TIMESTAMPTZ,
                created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE (advance_id, urutan)
            )
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_advance_cicilan_advance ON advance_cicilan(advance_id);
            CREATE INDEX IF NOT EXISTS idx_advance_cicilan_period ON advance_cicilan(period_id);
        `);
        console.log('  [2/2] Tabel advance_cicilan dibuat');

        await client.query('COMMIT');
        console.log('\nMigrasi add_kasbon_tables selesai!');
        console.log('Tabel: salary_advances, advance_cicilan');
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
