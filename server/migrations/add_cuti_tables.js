/**
 * BE/migrations/add_cuti_tables.js
 * Membuat tabel untuk modul Manajemen Cuti (Leave Management):
 *   1. leave_types    — jenis/tipe cuti
 *   2. leave_balances — saldo cuti per karyawan per tahun
 *   3. leave_requests — pengajuan cuti karyawan
 *
 * Usage: node migrations/add_cuti_tables.js
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
        console.log('Memulai migrasi add_cuti_tables...\n');
        await client.query('BEGIN');

        // ── 1. leave_types ────────────────────────────────────────────────────
        await client.query(`
            CREATE TABLE IF NOT EXISTS leave_types (
                id              SERIAL PRIMARY KEY,
                company_id      INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
                name            VARCHAR(100) NOT NULL,        -- e.g. "Cuti Tahunan", "Cuti Sakit"
                code            VARCHAR(20)  NOT NULL,        -- e.g. "ANNUAL", "SICK"
                quota_days      INTEGER      NOT NULL DEFAULT 12, -- kuota hari per tahun
                is_paid         BOOLEAN      NOT NULL DEFAULT TRUE,  -- cuti berbayar?
                requires_doc    BOOLEAN      NOT NULL DEFAULT FALSE, -- butuh lampiran?
                color           VARCHAR(20)  NOT NULL DEFAULT '#6366f1', -- warna kalender
                is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
                description     TEXT,
                created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
                updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
                UNIQUE (company_id, code)
            )
        `);
        console.log('  [1/3] Tabel leave_types dibuat');

        // ── 2. leave_balances ─────────────────────────────────────────────────
        await client.query(`
            CREATE TABLE IF NOT EXISTS leave_balances (
                id              SERIAL PRIMARY KEY,
                company_id      INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
                employee_id     INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
                leave_type_id   INTEGER NOT NULL REFERENCES leave_types(id) ON DELETE CASCADE,
                year            SMALLINT NOT NULL,            -- tahun berlaku
                quota_days      INTEGER  NOT NULL DEFAULT 0,  -- kuota (bisa override per karyawan)
                used_days       INTEGER  NOT NULL DEFAULT 0,  -- terpakai (auto-update saat approved)
                carry_over_days INTEGER  NOT NULL DEFAULT 0,  -- sisa dari tahun lalu
                created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE (employee_id, leave_type_id, year)
            )
        `);
        console.log('  [2/3] Tabel leave_balances dibuat');

        // ── 3. leave_requests ─────────────────────────────────────────────────
        await client.query(`
            CREATE TABLE IF NOT EXISTS leave_requests (
                id              SERIAL PRIMARY KEY,
                uuid            UUID         NOT NULL DEFAULT gen_random_uuid(),
                number          VARCHAR(50)  NOT NULL UNIQUE,  -- auto-generated, e.g. "LV-2026-A-00001"
                company_id      INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
                employee_id     INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
                leave_type_id   INTEGER NOT NULL REFERENCES leave_types(id),
                start_date      DATE         NOT NULL,
                end_date        DATE         NOT NULL,
                total_days      INTEGER      NOT NULL DEFAULT 1,
                reason          TEXT,
                attachment_path VARCHAR(500),                 -- surat dokter, dll (optional)
                status          VARCHAR(20)  NOT NULL DEFAULT 'draft'
                                CHECK (status IN ('draft','approved','rejected')),
                reviewed_by     INTEGER REFERENCES users(id),
                reviewed_at     TIMESTAMPTZ,
                review_notes    TEXT,                         -- alasan penolakan dsb
                created_by      VARCHAR(100),
                created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
                updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
            )
        `);

        // Indeks untuk query umum
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_leave_requests_employee
                ON leave_requests(employee_id);
            CREATE INDEX IF NOT EXISTS idx_leave_requests_company_status
                ON leave_requests(company_id, status);
            CREATE INDEX IF NOT EXISTS idx_leave_requests_dates
                ON leave_requests(start_date, end_date);
        `);
        console.log('  [3/3] Tabel leave_requests + index dibuat');

        // ── Seed: jenis cuti default (jika company ada) ───────────────────────
        // (Dibiarkan kosong — HR admin yang isi via UI atau seed terpisah)

        await client.query('COMMIT');
        console.log('\nMigrasi selesai! Tabel: leave_types, leave_balances, leave_requests');
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
