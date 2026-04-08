/**
 * BE/migrations/add_payroll_tables.js
 * Membuat tabel-tabel untuk modul Payroll:
 *   1. payroll_periods   — periode penggajian (bulan/tahun per company)
 *   2. payroll_slips     — slip gaji per karyawan per periode
 *   3. payroll_allowances — komponen tunjangan per slip
 *   4. payroll_deductions — komponen potongan per slip
 *
 * Usage: node migrations/add_payroll_tables.js
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
        console.log('Memulai migrasi add_payroll_tables...\n');
        await client.query('BEGIN');

        // ── 1. payroll_periods ────────────────────────────────────────────────
        await client.query(`
            CREATE TABLE IF NOT EXISTS payroll_periods (
                id              SERIAL PRIMARY KEY,
                uuid            UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
                company_id      INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
                bulan           SMALLINT NOT NULL CHECK (bulan BETWEEN 1 AND 12),
                tahun           SMALLINT NOT NULL CHECK (tahun >= 2020),
                label           VARCHAR(50),            -- e.g. "Maret 2026"
                status          VARCHAR(20) NOT NULL DEFAULT 'draft'
                                    CHECK (status IN ('draft','finalized')),
                total_gaji      DECIMAL(18,2) DEFAULT 0, -- sum net_salary periode ini
                total_karyawan  INTEGER DEFAULT 0,
                finalized_at    TIMESTAMPTZ,
                finalized_by    VARCHAR(100),
                created_by      VARCHAR(100),
                created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE (company_id, bulan, tahun)
            )
        `);
        console.log('  [1/4] Tabel payroll_periods dibuat');

        // ── 2. payroll_slips ──────────────────────────────────────────────────
        await client.query(`
            CREATE TABLE IF NOT EXISTS payroll_slips (
                id                  SERIAL PRIMARY KEY,
                uuid                UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
                period_id           INTEGER NOT NULL REFERENCES payroll_periods(id) ON DELETE CASCADE,
                company_id          INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
                employee_id         INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
                gaji_pokok          DECIMAL(15,2) NOT NULL DEFAULT 0,
                total_tunjangan     DECIMAL(15,2) NOT NULL DEFAULT 0,
                total_potongan      DECIMAL(15,2) NOT NULL DEFAULT 0,
                total_kasbon        DECIMAL(15,2) NOT NULL DEFAULT 0,  -- total cicilan kasbon bulan ini
                net_salary          DECIMAL(15,2) NOT NULL DEFAULT 0,  -- gaji_pokok + tunjangan - potongan - kasbon
                status              VARCHAR(20) NOT NULL DEFAULT 'draft'
                                        CHECK (status IN ('draft','approved')),
                catatan             TEXT,
                approved_by         VARCHAR(100),
                approved_at         TIMESTAMPTZ,
                created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE (period_id, employee_id)
            )
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_payroll_slips_period ON payroll_slips(period_id);
            CREATE INDEX IF NOT EXISTS idx_payroll_slips_employee ON payroll_slips(employee_id);
        `);
        console.log('  [2/4] Tabel payroll_slips dibuat');

        // ── 3. payroll_allowances ─────────────────────────────────────────────
        await client.query(`
            CREATE TABLE IF NOT EXISTS payroll_allowances (
                id          SERIAL PRIMARY KEY,
                slip_id     INTEGER NOT NULL REFERENCES payroll_slips(id) ON DELETE CASCADE,
                nama        VARCHAR(100) NOT NULL,   -- "Tunjangan Makan", "Tunjangan Transport", dll
                amount      DECIMAL(15,2) NOT NULL DEFAULT 0,
                created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `);
        console.log('  [3/4] Tabel payroll_allowances dibuat');

        // ── 4. payroll_deductions ─────────────────────────────────────────────
        await client.query(`
            CREATE TABLE IF NOT EXISTS payroll_deductions (
                id          SERIAL PRIMARY KEY,
                slip_id     INTEGER NOT NULL REFERENCES payroll_slips(id) ON DELETE CASCADE,
                nama        VARCHAR(100) NOT NULL,   -- "BPJS Kesehatan", "PPh21", "Keterlambatan", dll
                amount      DECIMAL(15,2) NOT NULL DEFAULT 0,
                created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `);
        console.log('  [4/4] Tabel payroll_deductions dibuat');

        await client.query('COMMIT');
        console.log('\nMigrasi add_payroll_tables selesai!');
        console.log('Tabel: payroll_periods, payroll_slips, payroll_allowances, payroll_deductions');
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
