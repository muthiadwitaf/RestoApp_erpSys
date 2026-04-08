/**
 * migrations/alter_hr_org_to_uuid.js
 * Mengubah tabel master struktur organisasi perusahaan:
 *   - departments  : ganti id SERIAL → uuid PRIMARY KEY, company_id → company_uuid
 *   - divisions    : ganti id SERIAL → uuid PRIMARY KEY, company_id → company_uuid,
 *                    department_id INTEGER → department_uuid UUID
 *   - positions    : ganti id SERIAL → uuid PRIMARY KEY, company_id → company_uuid
 *
 * PERHATIAN:
 *   Script ini DROP dan RECREATE ketiga tabel tersebut.
 *   Pastikan tidak ada data penting di tabel ini sebelum menjalankan,
 *   atau backup terlebih dahulu!
 *
 * Usage: node migrations/alter_hr_org_to_uuid.js
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
        console.log('Memulai migrasi alter_hr_org_to_uuid...\n');
        await client.query('BEGIN');

        // ── Drop tabel lama (urutan: child dulu) ──────────────────────────────
        await client.query(`DROP TABLE IF EXISTS divisions   CASCADE`);
        await client.query(`DROP TABLE IF EXISTS departments CASCADE`);
        await client.query(`DROP TABLE IF EXISTS positions   CASCADE`);
        console.log('  [1/4] Tabel lama di-drop');

        // ── 1. departments (entitas mandiri, tidak punya parent) ──────────────
        await client.query(`
            CREATE TABLE departments (
                uuid        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
                company_uuid UUID       NOT NULL,
                nama        VARCHAR(100) NOT NULL,
                kode        VARCHAR(20),
                deskripsi   TEXT,
                is_deleted  BOOLEAN     NOT NULL DEFAULT FALSE,
                created_by  VARCHAR(100),
                created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE NULLS NOT DISTINCT (company_uuid, kode)
            )
        `);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_departments_company_uuid ON departments(company_uuid)`);
        console.log('  [2/4] Tabel departments dibuat (uuid PK, company_uuid)');

        // ── 2. divisions (child dari departments) ────────────────────────────
        await client.query(`
            CREATE TABLE divisions (
                uuid            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
                company_uuid    UUID        NOT NULL,
                department_uuid UUID        NOT NULL REFERENCES departments(uuid) ON DELETE CASCADE,
                nama            VARCHAR(100) NOT NULL,
                kode            VARCHAR(20),
                deskripsi       TEXT,
                is_deleted      BOOLEAN     NOT NULL DEFAULT FALSE,
                created_by      VARCHAR(100),
                created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE NULLS NOT DISTINCT (company_uuid, kode)
            )
        `);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_divisions_company_uuid    ON divisions(company_uuid)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_divisions_department_uuid ON divisions(department_uuid)`);
        console.log('  [3/4] Tabel divisions dibuat (uuid PK, company_uuid, department_uuid)');

        // ── 3. positions ──────────────────────────────────────────────────────
        await client.query(`
            CREATE TABLE positions (
                uuid        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
                company_uuid UUID       NOT NULL,
                nama        VARCHAR(100) NOT NULL,
                kode        VARCHAR(20),
                level       INTEGER     DEFAULT 1,
                deskripsi   TEXT,
                is_deleted  BOOLEAN     NOT NULL DEFAULT FALSE,
                created_by  VARCHAR(100),
                created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE NULLS NOT DISTINCT (company_uuid, kode)
            )
        `);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_positions_company_uuid ON positions(company_uuid)`);
        console.log('  [4/4] Tabel positions dibuat (uuid PK, company_uuid)');

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
