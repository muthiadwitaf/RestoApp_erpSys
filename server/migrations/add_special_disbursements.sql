-- Migration: Special Disbursements (THR / Bonus)
-- Date: 2026-03-29

CREATE TABLE IF NOT EXISTS special_disbursement_batches (
    id            SERIAL PRIMARY KEY,
    company_id    INTEGER NOT NULL REFERENCES companies(id),
    jenis         VARCHAR(20) NOT NULL CHECK (jenis IN ('thr','bonus','other')),
    label         VARCHAR(100) NOT NULL,
    tanggal_bayar DATE NOT NULL,
    bonus_mode    VARCHAR(10) DEFAULT 'manual' CHECK (bonus_mode IN ('flat','persen','manual')),
    bonus_nilai   NUMERIC(14,2),
    catatan       TEXT,
    status        VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','finalized')),
    total_karyawan INTEGER DEFAULT 0,
    total_nominal  NUMERIC(16,2) DEFAULT 0,
    finalized_at  TIMESTAMPTZ,
    finalized_by  VARCHAR(100),
    created_by    VARCHAR(100),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS special_disbursement_slips (
    id                   SERIAL PRIMARY KEY,
    batch_id             INTEGER NOT NULL REFERENCES special_disbursement_batches(id) ON DELETE CASCADE,
    company_id           INTEGER NOT NULL,
    employee_id          INTEGER NOT NULL REFERENCES employees(id),
    gaji_pokok_snapshot  NUMERIC(14,2) NOT NULL DEFAULT 0,
    masa_kerja_bulan     INTEGER,
    gross_amount         NUMERIC(14,2) NOT NULL DEFAULT 0,
    pph21_amount         NUMERIC(14,2) NOT NULL DEFAULT 0,
    potongan_lain        NUMERIC(14,2) NOT NULL DEFAULT 0,
    net_amount           NUMERIC(14,2) NOT NULL DEFAULT 0,
    catatan              TEXT,
    status               VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved')),
    approved_by          VARCHAR(100),
    approved_at          TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sdb_company  ON special_disbursement_batches(company_id);
CREATE INDEX IF NOT EXISTS idx_sds_batch    ON special_disbursement_slips(batch_id);
CREATE INDEX IF NOT EXISTS idx_sds_employee ON special_disbursement_slips(employee_id);
