/**
 * migrations/add_HR_table.js
 * Membuat tabel-tabel untuk modul HR: Master Karyawan.
 *
 * Tabel yang dibuat:
 *   - employees          : data induk karyawan
 *   - employee_identities: NIK, NPWP, BPJS, rekening
 *   - employee_family    : data keluarga / tanggungan (untuk PTKP PPh21)
 *   - employee_jobs      : riwayat jabatan (append-only)
 *   - employee_documents : dokumen karyawan (upload KTP, ijazah, dll)
 *
 * Usage: node migrations/add_HR_table.js
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
        console.log('Memulai migrasi add_HR_table...\n');

        await client.query('BEGIN');

        // ── 1. employees ─────────────────────────────────────────────────────
        await client.query(`
            CREATE TABLE IF NOT EXISTS employees (
                id              SERIAL PRIMARY KEY,
                uuid            UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
                nik             VARCHAR(20) UNIQUE,
                nama_lengkap    VARCHAR(100) NOT NULL,
                nama_panggilan  VARCHAR(50),
                gender          VARCHAR(10) CHECK (gender IN ('L','P')),
                tanggal_lahir   DATE,
                tempat_lahir    VARCHAR(100),
                agama           VARCHAR(20) CHECK (agama IN ('Islam','Kristen','Katolik','Hindu','Buddha','Konghucu','Lainnya')),
                status_kawin    VARCHAR(20) CHECK (status_kawin IN ('Belum Kawin','Kawin','Cerai Hidup','Cerai Mati')),
                golongan_darah  VARCHAR(5),
                foto_url        VARCHAR(500),
                email_kerja     VARCHAR(150),
                email_pribadi   VARCHAR(150),
                no_hp           VARCHAR(20),
                no_hp_darurat   VARCHAR(20),
                nama_darurat    VARCHAR(100),
                hubungan_darurat VARCHAR(50),
                alamat_ktp      TEXT,
                kota_ktp        VARCHAR(100),
                provinsi_ktp    VARCHAR(100),
                kode_pos_ktp    VARCHAR(10),
                alamat_domisili TEXT,
                branch_id       INTEGER REFERENCES branches(id),
                company_id      INTEGER NOT NULL REFERENCES companies(id),
                status          VARCHAR(20) NOT NULL DEFAULT 'aktif'
                                    CHECK (status IN ('aktif','nonaktif','resign','phk')),
                is_active       BOOLEAN NOT NULL DEFAULT TRUE,
                created_by      VARCHAR(100),
                created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `);
        console.log('  [1/5] Tabel employees dibuat');

        // ── 2. employee_identities ───────────────────────────────────────────
        await client.query(`
            CREATE TABLE IF NOT EXISTS employee_identities (
                id                      SERIAL PRIMARY KEY,
                employee_id             INTEGER NOT NULL UNIQUE REFERENCES employees(id) ON DELETE CASCADE,
                no_ktp                  VARCHAR(20),
                no_npwp                 VARCHAR(30),
                no_bpjs_kesehatan       VARCHAR(20),
                no_bpjs_ketenagakerjaan VARCHAR(20),
                no_rekening             VARCHAR(30),
                nama_bank               VARCHAR(100),
                nama_rekening           VARCHAR(100),
                updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `);
        console.log('  [2/5] Tabel employee_identities dibuat');

        // ── 3. employee_family ───────────────────────────────────────────────
        await client.query(`
            CREATE TABLE IF NOT EXISTS employee_family (
                id            SERIAL PRIMARY KEY,
                employee_id   INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
                nama          VARCHAR(100) NOT NULL,
                hubungan      VARCHAR(20) NOT NULL CHECK (hubungan IN ('Pasangan','Anak','Orang Tua','Saudara','Lainnya')),
                tanggal_lahir DATE,
                is_tanggungan BOOLEAN NOT NULL DEFAULT FALSE,
                created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `);
        console.log('  [3/5] Tabel employee_family dibuat');

        // ── 4. employee_jobs ─────────────────────────────────────────────────
        await client.query(`
            CREATE TABLE IF NOT EXISTS employee_jobs (
                id              SERIAL PRIMARY KEY,
                employee_id     INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
                jabatan         VARCHAR(100),
                departemen      VARCHAR(100),
                divisi          VARCHAR(100),
                branch_id       INTEGER REFERENCES branches(id),
                jenis_karyawan  VARCHAR(30) CHECK (jenis_karyawan IN ('Tetap','PKWT','PKWTT','Magang','Freelance','Part-time')),
                tanggal_mulai   DATE NOT NULL,
                tanggal_selesai DATE,
                gaji_pokok      DECIMAL(15,2) DEFAULT 0,
                is_current      BOOLEAN NOT NULL DEFAULT TRUE,
                keterangan      TEXT,
                created_by      VARCHAR(100),
                created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `);
        console.log('  [4/5] Tabel employee_jobs dibuat');

        // ── 5. employee_documents ────────────────────────────────────────────
        await client.query(`
            CREATE TABLE IF NOT EXISTS employee_documents (
                id                  SERIAL PRIMARY KEY,
                uuid                UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
                employee_id         INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
                jenis_dokumen       VARCHAR(30) NOT NULL
                                        CHECK (jenis_dokumen IN ('ktp','npwp','bpjs_kes','bpjs_tk','ijazah','kontrak','sk_pengangkatan','foto','lainnya')),
                nomor_dokumen       VARCHAR(100),
                file_url            VARCHAR(500),
                file_name           VARCHAR(255),
                file_size           INTEGER,
                tanggal_terbit      DATE,
                tanggal_kadaluarsa  DATE,
                catatan             TEXT,
                created_by          VARCHAR(100),
                created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `);
        console.log('  [5/5] Tabel employee_documents dibuat');

        await client.query('COMMIT');
        console.log('\nMigrasi add_HR_table selesai.');
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
