/**
 * BE/migrations/add_leave_weekend_settings.js
 *
 * Menambah kolom pengaturan hari kerja ke tabel leave_types:
 *   count_saturday  — apakah Sabtu dihitung hari cuti (default: FALSE)
 *   count_sunday    — apakah Minggu dihitung hari cuti (default: FALSE)
 *
 * Usage: node migrations/add_leave_weekend_settings.js
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
        console.log('Memulai migrasi add_leave_weekend_settings...\n');
        await client.query('BEGIN');

        // Tambah kolom count_saturday (jika belum ada)
        await client.query(`
            ALTER TABLE leave_types
            ADD COLUMN IF NOT EXISTS count_saturday BOOLEAN NOT NULL DEFAULT FALSE
        `);
        console.log('  [1/2] Kolom count_saturday ditambahkan ke leave_types');

        // Tambah kolom count_sunday (jika belum ada)
        await client.query(`
            ALTER TABLE leave_types
            ADD COLUMN IF NOT EXISTS count_sunday BOOLEAN NOT NULL DEFAULT FALSE
        `);
        console.log('  [2/2] Kolom count_sunday ditambahkan ke leave_types');

        await client.query('COMMIT');
        console.log('\nMigrasi selesai!');
        console.log('Default: Sabtu & Minggu TIDAK dihitung hari cuti (false).');
        console.log('HR Manager dapat mengubah per jenis cuti melalui UI Setting Perusahaan.');
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
