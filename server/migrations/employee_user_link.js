/**
 * migrations/employee_user_link.js
 * Menambahkan kolom user_id (FK ke users) di tabel employees,
 * dan kolom role_id (FK ke roles) di tabel employee_jobs.
 * Idempotent: aman dijalankan berulang.
 *
 * Usage: node migrations/employee_user_link.js
 */
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'erpsys',
    connectionTimeoutMillis: 10000,
});

async function run() {
    const client = await pool.connect();
    console.log('Mulai migration: employee_user_link...\n');

    try {
        await client.query('BEGIN');

        // 1. Tambah kolom user_id di employees (FK ke users, nullable)
        await client.query(`
            ALTER TABLE employees
            ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL
        `);
        console.log('  [OK] employees.user_id ditambahkan');

        // 2. Unique index: satu user hanya bisa linked ke satu karyawan
        await client.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_user_id
            ON employees(user_id)
            WHERE user_id IS NOT NULL
        `);
        console.log('  [OK] Unique index idx_employees_user_id dibuat');

        // 3. Tambah kolom role_id di employee_jobs (FK ke roles, nullable)
        await client.query(`
            ALTER TABLE employee_jobs
            ADD COLUMN IF NOT EXISTS role_id INTEGER REFERENCES roles(id) ON DELETE SET NULL
        `);
        console.log('  [OK] employee_jobs.role_id ditambahkan');

        await client.query('COMMIT');
        console.log('\nMigration selesai.');
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('ERROR:', e.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

run();
