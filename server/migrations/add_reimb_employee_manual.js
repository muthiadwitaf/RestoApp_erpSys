/**
 * Migration: tambah kolom employee_name_manual di reimbursements
 * Jalankan: node migrations/add_reimb_employee_manual.js
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

        // Tambah kolom employee_name_manual (nullable, untuk input manual)
        await client.query(`
            ALTER TABLE reimbursements
            ADD COLUMN IF NOT EXISTS employee_name_manual VARCHAR(200);
        `);

        // employee_id boleh null jika employee_name_manual terisi
        // (FK sudah ON DELETE SET NULL, constraint ini tidak perlu diubah)

        await client.query('COMMIT');
        console.log('Kolom employee_name_manual berhasil ditambahkan ke tabel reimbursements');
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
