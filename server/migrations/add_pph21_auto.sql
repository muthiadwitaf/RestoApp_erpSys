-- Migration: PPh 21 otomatis (ptkp_status, pph21_mode)
ALTER TABLE employee_payroll_settings
    ADD COLUMN IF NOT EXISTS ptkp_status VARCHAR(10) NOT NULL DEFAULT 'TK/0',
    ADD COLUMN IF NOT EXISTS pph21_mode  VARCHAR(10) NOT NULL DEFAULT 'manual';

-- Drop dan re-create constraint agar menerima 'ter'
ALTER TABLE employee_payroll_settings 
    DROP CONSTRAINT IF EXISTS employee_payroll_settings_pph21_mode_check;

ALTER TABLE employee_payroll_settings
    ADD CONSTRAINT employee_payroll_settings_pph21_mode_check 
    CHECK (pph21_mode IN ('auto','manual','ter'));
