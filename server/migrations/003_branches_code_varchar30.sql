-- Migration 003: Extend branches.code from VARCHAR(10) to VARCHAR(30)
-- Needed to support format: HO-{COMPANYCODE}-{SEQ5}, e.g. HO-MTKGROUP-00001

ALTER TABLE branches ALTER COLUMN code TYPE VARCHAR(30);
