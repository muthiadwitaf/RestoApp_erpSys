/**
 * add_AP_AR.js — Migration: AP/AR Payment History Tables & Columns
 *
 * Menambahkan:
 * 1. Tabel bill_payments   — riwayat pembayaran hutang (AP)
 * 2. Tabel invoice_payments — riwayat penerimaan piutang (AR)
 * 3. Kolom purchase_bills.amount_paid, purchase_bills.gr_id
 * 4. Kolom invoices.amount_paid, invoices.gi_id
 *
 * Usage: node add_AP_AR.js
 * Aman dijalankan ulang (idempotent).
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

const q = (sql, params) => pool.query(sql, params);

const safeAlter = async (sql, label) => {
    try {
        await q(sql);
        if (label) console.log(`  ✓ ${label}`);
    } catch (e) {
        if (
            e.message.includes('already exists') ||
            e.message.includes('duplicate column') ||
            e.message.includes('does not exist')
        ) {
            if (label) console.log(`  ~ ${label} (skipped, already exists)`);
        } else {
            throw e;
        }
    }
};

async function run() {
    console.log('🏗️  Memulai migrasi AP/AR...\n');
    try {

        // ── 1. Tabel bill_payments (riwayat bayar hutang / AP) ───────────────
        await q(`
            CREATE TABLE IF NOT EXISTS bill_payments (
                id              SERIAL PRIMARY KEY,
                uuid            UUID NOT NULL DEFAULT gen_random_uuid(),
                bill_id         INTEGER NOT NULL REFERENCES purchase_bills(id) ON DELETE CASCADE,
                date            DATE NOT NULL DEFAULT CURRENT_DATE,
                amount          NUMERIC(15,2) NOT NULL,
                cash_account_id INTEGER REFERENCES chart_of_accounts(id),
                journal_id      INTEGER REFERENCES journal_entries(id),
                notes           TEXT,
                created_by      VARCHAR,
                created_at      TIMESTAMPTZ DEFAULT NOW()
            )
        `);
        console.log('  ✓ bill_payments table ready');

        await safeAlter(
            `CREATE UNIQUE INDEX IF NOT EXISTS idx_bill_payments_uuid ON bill_payments(uuid)`,
            'bill_payments uuid index'
        );

        // ── 2. Tabel invoice_payments (riwayat terima piutang / AR) ──────────
        await q(`
            CREATE TABLE IF NOT EXISTS invoice_payments (
                id              SERIAL PRIMARY KEY,
                uuid            UUID NOT NULL DEFAULT gen_random_uuid(),
                invoice_id      INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
                date            DATE NOT NULL DEFAULT CURRENT_DATE,
                amount          NUMERIC(15,2) NOT NULL,
                cash_account_id INTEGER REFERENCES chart_of_accounts(id),
                journal_id      INTEGER REFERENCES journal_entries(id),
                notes           TEXT,
                created_by      VARCHAR,
                created_at      TIMESTAMPTZ DEFAULT NOW()
            )
        `);
        console.log('  ✓ invoice_payments table ready');

        await safeAlter(
            `CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_payments_uuid ON invoice_payments(uuid)`,
            'invoice_payments uuid index'
        );

        // ── 3. Kolom baru di purchase_bills ──────────────────────────────────
        await safeAlter(
            `ALTER TABLE purchase_bills ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(15,2) DEFAULT 0`,
            'purchase_bills.amount_paid'
        );
        await safeAlter(
            `ALTER TABLE purchase_bills ADD COLUMN IF NOT EXISTS gr_id INTEGER REFERENCES goods_receives(id)`,
            'purchase_bills.gr_id'
        );

        // Backfill: bill yang sudah paid → amount_paid = total
        await q(`
            UPDATE purchase_bills
            SET amount_paid = total
            WHERE status = 'paid' AND (amount_paid IS NULL OR amount_paid = 0)
        `);
        console.log('  ✓ purchase_bills backfill amount_paid for paid bills');

        // ── 4. Kolom baru di invoices ─────────────────────────────────────────
        await safeAlter(
            `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(15,2) DEFAULT 0`,
            'invoices.amount_paid'
        );
        await safeAlter(
            `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS gi_id INTEGER REFERENCES goods_issues(id)`,
            'invoices.gi_id'
        );

        // Backfill: invoice yang sudah paid → amount_paid = total
        await q(`
            UPDATE invoices
            SET amount_paid = total
            WHERE status = 'paid' AND (amount_paid IS NULL OR amount_paid = 0)
        `);
        console.log('  ✓ invoices backfill amount_paid for paid invoices');

        // ── 5. Index performa ─────────────────────────────────────────────────
        await safeAlter(
            `CREATE INDEX IF NOT EXISTS idx_bill_payments_bill ON bill_payments(bill_id)`,
            'idx_bill_payments_bill'
        );
        await safeAlter(
            `CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice ON invoice_payments(invoice_id)`,
            'idx_invoice_payments_invoice'
        );

        // ── 6. Cek tabel yang dibuat ──────────────────────────────────────────
        const r = await pool.query(`
            SELECT table_name FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name IN ('bill_payments','invoice_payments')
            ORDER BY table_name
        `);
        console.log(`\n✅ AP/AR migration selesai. Tabel baru:`);
        r.rows.forEach(t => console.log(`  ✓ ${t.table_name}`));
        console.log('\nLanjutkan: deploy BE perubahan receives.js, issues.js, bills.js, invoices.js\n');

    } catch (e) {
        console.error('❌ Migrasi gagal:', e.message);
        process.exit(1);
    }
    await pool.end();
}

run();
