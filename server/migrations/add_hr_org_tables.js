/**
 * migrations/add_hr_org_tables.js
 * Membuat tabel master struktur organisasi perusahaan:
 *   - departments  : departemen
 *   - divisions    : divisi (di bawah departemen)
 *   - positions    : jabatan
 *
 * Soft-delete: kolom is_deleted BOOLEAN DEFAULT FALSE
 *
 * Usage: node migrations/add_hr_org_tables.js
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

async function run() {
    const client = await pool.connect();
    try {
        console.log('Memulai migrasi add_hr_org_tables...\n');
        await client.query('BEGIN');

        // ── 1. departments ────────────────────────────────────────────────────
        await client.query(`
            CREATE TABLE IF NOT EXISTS departments (
                id          SERIAL PRIMARY KEY,
                company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
                nama        VARCHAR(100) NOT NULL,
                kode        VARCHAR(20),
                deskripsi   TEXT,
                is_deleted  BOOLEAN NOT NULL DEFAULT FALSE,
                created_by  VARCHAR(100),
                created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE NULLS NOT DISTINCT (company_id, kode)
            )
        `);
        console.log('  [1/3] Tabel departments dibuat');

        // ── 2. divisions ──────────────────────────────────────────────────────
        await client.query(`
            CREATE TABLE IF NOT EXISTS divisions (
                id              SERIAL PRIMARY KEY,
                company_id      INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
                department_id   INTEGER NOT NULL REFERENCES departments(id),
                nama            VARCHAR(100) NOT NULL,
                kode            VARCHAR(20),
                deskripsi       TEXT,
                is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,
                created_by      VARCHAR(100),
                created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE NULLS NOT DISTINCT (company_id, kode)
            )
        `);
        console.log('  [2/3] Tabel divisions dibuat');

        // ── 3. positions ──────────────────────────────────────────────────────
        await client.query(`
            CREATE TABLE IF NOT EXISTS positions (
                id          SERIAL PRIMARY KEY,
                company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
                nama        VARCHAR(100) NOT NULL,
                kode        VARCHAR(20),
                level       INTEGER DEFAULT 1,
                deskripsi   TEXT,
                is_deleted  BOOLEAN NOT NULL DEFAULT FALSE,
                created_by  VARCHAR(100),
                created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE NULLS NOT DISTINCT (company_id, kode)
            )
        `);
        console.log('  [3/3] Tabel positions dibuat');

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
