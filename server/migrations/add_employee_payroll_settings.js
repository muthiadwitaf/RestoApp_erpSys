/**
 * BE/migrations/add_employee_payroll_settings.js
 * Tabel konfigurasi potongan otomatis payroll per karyawan.
 * Usage: node migrations/add_employee_payroll_settings.js
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
        console.log('Memulai migrasi add_employee_payroll_settings...\n');
        await client.query('BEGIN');

        await client.query(`
            CREATE TABLE IF NOT EXISTS employee_payroll_settings (
                id              SERIAL PRIMARY KEY,
                employee_id     INTEGER NOT NULL UNIQUE REFERENCES employees(id) ON DELETE CASCADE,

                -- BPJS Kesehatan (employee portion: default 1%)
                bpjs_kes_aktif   BOOLEAN NOT NULL DEFAULT FALSE,
                bpjs_kes_persen  DECIMAL(5,2) NOT NULL DEFAULT 1.00,

                -- JHT / Jaminan Hari Tua BPJS TK (employee: default 2%)
                jht_aktif        BOOLEAN NOT NULL DEFAULT FALSE,
                jht_persen       DECIMAL(5,2) NOT NULL DEFAULT 2.00,

                -- JKK / Jaminan Kecelakaan Kerja (employee: default 0.24%)
                jkk_aktif        BOOLEAN NOT NULL DEFAULT FALSE,
                jkk_persen       DECIMAL(5,2) NOT NULL DEFAULT 0.24,

                -- JKM / Jaminan Kematian (employee: default 0.30%)
                jkm_aktif        BOOLEAN NOT NULL DEFAULT FALSE,
                jkm_persen       DECIMAL(5,2) NOT NULL DEFAULT 0.30,

                -- JP / Jaminan Pensiun (employee: default 1%)
                jp_aktif         BOOLEAN NOT NULL DEFAULT FALSE,
                jp_persen        DECIMAL(5,2) NOT NULL DEFAULT 1.00,

                -- PPh 21 (nominal tetap per bulan, ditetapkan manual oleh HR)
                pph21_aktif      BOOLEAN NOT NULL DEFAULT FALSE,
                pph21_nominal    DECIMAL(15,2) NOT NULL DEFAULT 0,

                updated_by       VARCHAR(100),
                updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_emp_payroll_settings_employee
            ON employee_payroll_settings(employee_id)
        `);

        await client.query('COMMIT');
        console.log('Migrasi add_employee_payroll_settings selesai!');
        console.log('Tabel: employee_payroll_settings');
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
