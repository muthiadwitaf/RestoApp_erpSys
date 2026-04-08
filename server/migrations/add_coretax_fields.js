/**
 * BE/migrations/add_coretax_fields.js
 * Menambahkan kolom-kolom yang dibutuhkan untuk generate XML eBupot Masa PPh 21 (Coretax).
 *
 * Perubahan:
 *   - companies            : no_npwp, id_tempat_usaha
 *   - employee_identities  : is_foreign, no_passport
 *   - employee_payroll_settings : tax_object_code
 *   - payroll_periods      : withholding_date (override manual tanggal pemotongan)
 *
 * Usage: node migrations/add_coretax_fields.js
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
        console.log('Memulai migrasi add_coretax_fields...\n');
        await client.query('BEGIN');

        // ── 1. companies: NPWP perusahaan + ID Tempat Kegiatan Usaha ─────────
        await client.query(`
            ALTER TABLE companies
                ADD COLUMN IF NOT EXISTS no_npwp          VARCHAR(30),
                ADD COLUMN IF NOT EXISTS id_tempat_usaha  VARCHAR(10) DEFAULT '000000'
        `);
        console.log('  [1/4] companies: kolom no_npwp, id_tempat_usaha ditambahkan');

        // ── 2. employee_identities: WNA flags ─────────────────────────────────
        await client.query(`
            ALTER TABLE employee_identities
                ADD COLUMN IF NOT EXISTS is_foreign   BOOLEAN NOT NULL DEFAULT FALSE,
                ADD COLUMN IF NOT EXISTS no_passport  VARCHAR(30)
        `);
        console.log('  [2/4] employee_identities: kolom is_foreign, no_passport ditambahkan');

        // ── 3. employee_payroll_settings: kode objek pajak ────────────────────
        await client.query(`
            ALTER TABLE employee_payroll_settings
                ADD COLUMN IF NOT EXISTS tax_object_code VARCHAR(15) NOT NULL DEFAULT '21-100-01'
        `);
        console.log('  [3/4] employee_payroll_settings: kolom tax_object_code ditambahkan');

        // ── 4. payroll_periods: tanggal pemotongan manual ─────────────────────
        await client.query(`
            ALTER TABLE payroll_periods
                ADD COLUMN IF NOT EXISTS withholding_date DATE
        `);
        console.log('  [4/4] payroll_periods: kolom withholding_date ditambahkan');

        await client.query('COMMIT');
        console.log('\nMigrasi add_coretax_fields selesai!');
        console.log('Siap untuk generate XML eBupot Masa PPh 21.');
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
