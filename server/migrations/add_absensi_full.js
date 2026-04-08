/**
 * migrations/add_absensi_full.js
 * Migrasi lengkap untuk modul HR Absensi — GABUNGAN dari:
 *   - add_absensi_tables.js
 *   - add_absensi_location.js
 *   - rename_location_columns.js
 *   - add_multi_clockin.js
 *
 * Semua operasi idempotent (IF NOT EXISTS / DO $$ ... $$) sehingga
 * aman dijalankan di database baru maupun yang sudah ada data sebelumnya.
 *
 * Tabel yang dibuat / dimodifikasi:
 *   - shift_types          : master tipe shift
 *   - employee_schedules   : jadwal shift per karyawan per tanggal
 *   - attendance_records   : record clock-in/out harian (multi-sesi + geolokasi)
 *
 * Usage: node migrations/add_absensi_full.js
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
        console.log('Memulai migrasi add_absensi_full...\n');
        await client.query('BEGIN');

        // ── 1. Tabel shift_types ───────────────────────────────────────────────
        await client.query(`
            CREATE TABLE IF NOT EXISTS shift_types (
                id              SERIAL PRIMARY KEY,
                company_id      INTEGER NOT NULL REFERENCES companies(id),
                nama_shift      VARCHAR(50) NOT NULL,
                jam_masuk       TIME NOT NULL,
                jam_pulang      TIME NOT NULL,
                toleransi_menit INTEGER NOT NULL DEFAULT 15,
                is_overnight    BOOLEAN NOT NULL DEFAULT FALSE,
                is_active       BOOLEAN NOT NULL DEFAULT TRUE,
                created_by      VARCHAR(100),
                created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `);
        console.log('  [1/3] Tabel shift_types OK');

        // ── 2. Tabel employee_schedules ────────────────────────────────────────
        await client.query(`
            CREATE TABLE IF NOT EXISTS employee_schedules (
                id            SERIAL PRIMARY KEY,
                employee_id   INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
                shift_type_id INTEGER NOT NULL REFERENCES shift_types(id),
                tanggal       DATE NOT NULL,
                keterangan    VARCHAR(200),
                created_by    VARCHAR(100),
                created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE(employee_id, tanggal)
            )
        `);
        console.log('  [2/3] Tabel employee_schedules OK');

        // ── 3. Tabel attendance_records (lengkap: multi-sesi + geolokasi) ──────
        await client.query(`
            CREATE TABLE IF NOT EXISTS attendance_records (
                id                      SERIAL PRIMARY KEY,
                uuid                    UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
                employee_id             INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
                tanggal                 DATE NOT NULL,
                session_no              INTEGER NOT NULL DEFAULT 1,
                waktu_masuk             TIMESTAMPTZ,
                waktu_pulang            TIMESTAMPTZ,
                shift_type_id           INTEGER REFERENCES shift_types(id),
                status                  VARCHAR(20) NOT NULL DEFAULT 'hadir'
                                            CHECK (status IN ('hadir','terlambat','tidak_hadir','izin','cuti','libur')),
                terlambat_menit         INTEGER NOT NULL DEFAULT 0,
                pulang_awal_menit       INTEGER NOT NULL DEFAULT 0,
                lat_masuk               DOUBLE PRECISION,
                lon_masuk               DOUBLE PRECISION,
                lokasi_alamat_masuk     TEXT,
                lat_pulang              DOUBLE PRECISION,
                lon_pulang              DOUBLE PRECISION,
                lokasi_alamat_pulang    TEXT,
                catatan                 TEXT,
                created_by              VARCHAR(100),
                created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE(employee_id, tanggal, session_no)
            )
        `);
        console.log('  [3/3] Tabel attendance_records OK');

        // ── 4. Patch tabel lama: tambah kolom yang mungkin belum ada ──────────
        //    (untuk database yang sudah ada tabel dari migration lama)

        // session_no
        await client.query(`
            ALTER TABLE attendance_records
            ADD COLUMN IF NOT EXISTS session_no INTEGER NOT NULL DEFAULT 1
        `);

        // Geolokasi masuk
        await client.query(`
            ALTER TABLE attendance_records
            ADD COLUMN IF NOT EXISTS lat_masuk           DOUBLE PRECISION,
            ADD COLUMN IF NOT EXISTS lon_masuk           DOUBLE PRECISION,
            ADD COLUMN IF NOT EXISTS lokasi_alamat_masuk TEXT
        `);

        // Geolokasi pulang
        await client.query(`
            ALTER TABLE attendance_records
            ADD COLUMN IF NOT EXISTS lat_pulang           DOUBLE PRECISION,
            ADD COLUMN IF NOT EXISTS lon_pulang           DOUBLE PRECISION,
            ADD COLUMN IF NOT EXISTS lokasi_alamat_pulang TEXT
        `);

        // Rename kolom lama "lat" -> "lat_masuk" jika masih ada
        await client.query(`
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'attendance_records' AND column_name = 'lat'
                ) THEN
                    ALTER TABLE attendance_records RENAME COLUMN lat TO lat_masuk;
                END IF;
                IF EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'attendance_records' AND column_name = 'lon'
                ) THEN
                    ALTER TABLE attendance_records RENAME COLUMN lon TO lon_masuk;
                END IF;
                IF EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'attendance_records' AND column_name = 'lokasi_alamat'
                ) THEN
                    ALTER TABLE attendance_records RENAME COLUMN lokasi_alamat TO lokasi_alamat_masuk;
                END IF;
            END$$
        `);

        // Drop UNIQUE lama (employee_id, tanggal) dan ganti dengan (employee_id, tanggal, session_no)
        await client.query(`
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conrelid = 'attendance_records'::regclass
                      AND contype = 'u'
                      AND conname = 'attendance_records_employee_id_tanggal_key'
                ) THEN
                    ALTER TABLE attendance_records
                    DROP CONSTRAINT attendance_records_employee_id_tanggal_key;
                END IF;

                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conrelid = 'attendance_records'::regclass
                      AND contype = 'u'
                      AND conname = 'attendance_records_emp_tanggal_session_key'
                ) THEN
                    ALTER TABLE attendance_records
                    ADD CONSTRAINT attendance_records_emp_tanggal_session_key
                    UNIQUE (employee_id, tanggal, session_no);
                END IF;
            END$$
        `);
        console.log('  [4/4] Patch & constraint attendance_records OK');

        await client.query('COMMIT');
        console.log('\nMigrasi add_absensi_full selesai! ✓');

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
