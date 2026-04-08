/**
 * migrations/add_driver_employee_link.js
 *
 * Tambah kolom driver_employee_id ke tabel deliveries sebagai FK ke employees.
 * Kolom driver_name tetap ada untuk backward-compatibility.
 * Saat driver dipilih dari employees, driver_name otomatis diisi dari nama karyawan.
 *
 * Usage: node migrations/add_driver_employee_link.js
 */
require('dotenv').config();
const { pool, query } = require('../src/config/db');

async function run() {
    console.log('Running migration: add_driver_employee_link...\n');

    // 1. Tambah kolom driver_employee_id (FK nullable ke employees)
    await query(`
        ALTER TABLE deliveries
        ADD COLUMN IF NOT EXISTS driver_employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL
    `);
    console.log('  ✓ Kolom driver_employee_id ditambahkan ke tabel deliveries');

    // 2. Index untuk lookup cepat
    await query(`
        CREATE INDEX IF NOT EXISTS idx_deliveries_driver_employee ON deliveries(driver_employee_id)
    `);
    console.log('  ✓ Index idx_deliveries_driver_employee dibuat');

    console.log('\nMigration selesai.');
    console.log('Catatan: driver_name tetap ada untuk backward-compatibility.');
    console.log('         Saat driver dipilih dari employees, driver_name akan otomatis ter-populate.\n');

    await pool.end();
}

run().catch(err => {
    console.error('Migration gagal:', err.message);
    pool.end().catch(() => { });
    process.exit(1);
});
