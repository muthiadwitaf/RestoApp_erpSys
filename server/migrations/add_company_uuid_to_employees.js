/**
 * migrations/add_company_uuid_to_employees.js
 *
 * Menambahkan kolom `company_uuid UUID` ke tabel employees
 * (dan tabel lain yang perlu) sebagai kolom paralel dengan company_id.
 *
 * Setelah migrasi ini, backend bisa filter by `company_uuid` tanpa
 * harus drop `company_id` (aman untuk data produksi yang sudah ada).
 *
 * Usage: node migrations/add_company_uuid_to_employees.js
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
        console.log('Migrasi: add company_uuid to employees (+ audit_trail, user_companies)...\n');
        await client.query('BEGIN');

        // ── 1. employees ─────────────────────────────────────────────────────
        // Tambah kolom company_uuid jika belum ada
        await client.query(`
            ALTER TABLE employees
            ADD COLUMN IF NOT EXISTS company_uuid UUID
        `);
        // Backfill dari companies.uuid
        await client.query(`
            UPDATE employees e
            SET company_uuid = c.uuid
            FROM companies c
            WHERE c.id = e.company_id
              AND e.company_uuid IS NULL
        `);
        // Buat NOT NULL setelah backfill
        await client.query(`
            ALTER TABLE employees
            ALTER COLUMN company_uuid SET NOT NULL
        `);
        // Index
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_employees_company_uuid
            ON employees(company_uuid)
        `);
        console.log('  [1/3] employees.company_uuid ✔');

        // ── 2. audit_trail — tambah company_uuid saja (null OK, tidak ada company_id untuk backfill) ──
        await client.query(`
            ALTER TABLE audit_trail
            ADD COLUMN IF NOT EXISTS company_uuid UUID
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_audit_trail_company_uuid
            ON audit_trail(company_uuid)
        `);
        console.log('  [2/3] audit_trail.company_uuid ✔ (kolom ditambah, backfill tidak diperlukan)');


        // ── 3. roles (digunakan di karyawan.js untuk lookup role per company) ──
        // Cek apakah kolom company_id ada di roles (bisa integer atau UUID)
        const rolesCheck = await client.query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'roles' AND column_name = 'company_uuid'
        `);
        if (rolesCheck.rows.length === 0) {
            await client.query(`
                ALTER TABLE roles
                ADD COLUMN IF NOT EXISTS company_uuid UUID
            `);
            await client.query(`
                UPDATE roles r
                SET company_uuid = c.uuid
                FROM companies c
                WHERE c.id = r.company_id
                  AND r.company_uuid IS NULL
                  AND r.company_id IS NOT NULL
            `);
            await client.query(`
                CREATE INDEX IF NOT EXISTS idx_roles_company_uuid
                ON roles(company_uuid)
            `);
            console.log('  [3/3] roles.company_uuid ✔');
        } else {
            console.log('  [3/3] roles.company_uuid sudah ada, skip');
        }

        await client.query('COMMIT');
        console.log('\nMigrasi selesai!');
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Error:', e.message);
        throw e;
    } finally {
        client.release();
        await pool.end();
    }
}

run();
