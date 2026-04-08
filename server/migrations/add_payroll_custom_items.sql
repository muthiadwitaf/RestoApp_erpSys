-- ============================================================
-- Migration: Tambah tabel custom potongan & tunjangan otomatis payroll
-- Date: 2026-03-29
-- ============================================================

-- Tabel: Custom Potongan Otomatis per Karyawan
-- Digunakan sebagai konfigurasi: saat generate payroll, item yang aktif
-- akan otomatis ditambahkan ke payroll_deductions slip karyawan tersebut.
CREATE TABLE IF NOT EXISTS employee_payroll_custom_deductions (
    id           SERIAL PRIMARY KEY,
    employee_id  INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    nama         VARCHAR(100) NOT NULL,           -- Nama potongan, misal: "Cicilan KPR", "Denda Keterlambatan"
    tipe         VARCHAR(10) NOT NULL DEFAULT 'nominal'
                     CHECK (tipe IN ('nominal', 'persen')),
    nilai        NUMERIC(14,4) NOT NULL DEFAULT 0, -- Nominal (Rp) atau Persentase (%)
    aktif        BOOLEAN NOT NULL DEFAULT TRUE,
    urutan       INTEGER NOT NULL DEFAULT 0,        -- Urutan tampil (opsional)
    created_by   VARCHAR(100),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_emp_custom_deduct_employee
    ON employee_payroll_custom_deductions(employee_id);

-- Tabel: Custom Tunjangan Otomatis per Karyawan
-- Digunakan sebagai konfigurasi: saat generate payroll, item yang aktif
-- akan otomatis ditambahkan ke payroll_allowances slip karyawan tersebut.
CREATE TABLE IF NOT EXISTS employee_payroll_custom_allowances (
    id           SERIAL PRIMARY KEY,
    employee_id  INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    nama         VARCHAR(100) NOT NULL,           -- Nama tunjangan, misal: "Tunjangan Makan", "Tunjangan Transport"
    tipe         VARCHAR(10) NOT NULL DEFAULT 'nominal'
                     CHECK (tipe IN ('nominal', 'persen')),
    nilai        NUMERIC(14,4) NOT NULL DEFAULT 0, -- Nominal (Rp) atau Persentase (%)
    aktif        BOOLEAN NOT NULL DEFAULT TRUE,
    urutan       INTEGER NOT NULL DEFAULT 0,        -- Urutan tampil (opsional)
    created_by   VARCHAR(100),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_emp_custom_allow_employee
    ON employee_payroll_custom_allowances(employee_id);
