/**
 * migrate_full.js — Consolidated DDL Migration for RestoApp ERPsys
 * ═══════════════════════════════════════════════════════════════════
 * Menggabungkan SEMUA definisi schema (Core ERP + HR + Payroll + Resto)
 * ke dalam satu file migrasi yang bisa dijalankan berulang kali (idempotent).
 *
 * Usage:   node migrate_full.js
 * Pastikan .env sudah dikonfigurasi: DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
 *
 * Apa yang dikerjakan:
 *   1. Execute 001_full_schema.sql (CREATE TABLE IF NOT EXISTS untuk semua modul)
 *   2. Execute ALTER TABLE migrations untuk backward-compat dengan data lama
 *   3. Cetak daftar semua tabel yang ada di database
 */
require('dotenv').config();
const { readFileSync } = require('fs');
const { join } = require('path');
const { Pool } = require('pg');

const pool = new Pool({
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT || '5432'),
    user:     process.env.DB_USER     || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME     || 'erpsys',
});

const q = (sql) => pool.query(sql);

// ── Helper: safe ALTER — ignores "already exists" / "duplicate column" ──
const safeAlter = async (sql) => {
    try {
        await q(sql);
    } catch (e) {
        if (
            !e.message.includes('already exists') &&
            !e.message.includes('duplicate column') &&
            !e.message.includes('does not exist') &&
            !e.message.includes('multiple primary keys')
        ) throw e;
    }
};

async function run() {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  RestoApp ERPsys — Full Database Migration');
    console.log('═══════════════════════════════════════════════════════════════\n');

    try {
        // ──────────────────────────────────────────────────────────────────
        // STEP 1: Execute full SQL schema
        // ──────────────────────────────────────────────────────────────────
        console.log('🏗️  [1/3] Creating all tables from 001_full_schema.sql ...\n');
        const sqlPath = join(__dirname, 'migrations', '001_full_schema.sql');
        const sql = readFileSync(sqlPath, 'utf8');
        await q(sql);
        console.log('✅ All tables created / already exist\n');

        // ──────────────────────────────────────────────────────────────────
        // STEP 2: ALTER TABLE migrations (backward-compat with old data)
        //   These handle cases where an existing production database was
        //   created before newer columns were added.
        // ──────────────────────────────────────────────────────────────────
        console.log('🔧  [2/3] Applying incremental ALTER TABLE migrations ...\n');

        // -- Companies ----
        await safeAlter(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS pos_tax_pct NUMERIC(5,2) DEFAULT 10`);
        await safeAlter(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS pos_service_pct NUMERIC(5,2) DEFAULT 0`);
        await safeAlter(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS short_name VARCHAR(30)`);
        await safeAlter(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS is_pkp BOOLEAN DEFAULT FALSE`);
        await safeAlter(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS pkp_since DATE`);
        await safeAlter(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS efaktur_series_prefix VARCHAR(3) DEFAULT '010'`);
        await safeAlter(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS efaktur_last_number INTEGER DEFAULT 0`);
        await safeAlter(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS id_tempat_usaha VARCHAR(10) DEFAULT '000000'`);
        console.log('  ✓ companies');

        // -- Users ----
        await safeAlter(`ALTER TABLE users ADD COLUMN IF NOT EXISTS uuid UUID DEFAULT gen_random_uuid()`);
        await safeAlter(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT FALSE`);
        await safeAlter(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20)`);
        console.log('  ✓ users');

        // -- Branches ----
        await safeAlter(`ALTER TABLE branches ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id)`);
        await safeAlter(`ALTER TABLE branches ALTER COLUMN code TYPE VARCHAR(30)`);
        console.log('  ✓ branches');

        // -- Roles ----
        await safeAlter(`ALTER TABLE roles ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id)`);
        await safeAlter(`ALTER TABLE roles ADD COLUMN IF NOT EXISTS company_uuid UUID`);
        try { await q(`ALTER TABLE roles DROP CONSTRAINT IF EXISTS roles_name_key`); } catch (_) {}
        try { await q(`CREATE UNIQUE INDEX IF NOT EXISTS uq_roles_name_company ON roles (name, COALESCE(company_id, 0))`); } catch (_) {}
        console.log('  ✓ roles');

        // -- Items ----
        await safeAlter(`ALTER TABLE items ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id)`);
        await safeAlter(`ALTER TABLE items ADD COLUMN IF NOT EXISTS is_taxable BOOLEAN DEFAULT TRUE`);
        await safeAlter(`ALTER TABLE items ADD COLUMN IF NOT EXISTS hpp NUMERIC DEFAULT 0`);
        await safeAlter(`ALTER TABLE items ADD COLUMN IF NOT EXISTS item_type VARCHAR DEFAULT 'product'`);
        await safeAlter(`ALTER TABLE items ADD COLUMN IF NOT EXISTS image_id UUID`);
        await safeAlter(`ALTER TABLE items ADD COLUMN IF NOT EXISTS image_company_uuid VARCHAR(36)`);
        await safeAlter(`ALTER TABLE items ADD COLUMN IF NOT EXISTS image_size_bytes INTEGER`);
        try { await q(`ALTER TABLE items DROP CONSTRAINT IF EXISTS items_code_key`); } catch (_) {}
        try { await q(`CREATE UNIQUE INDEX IF NOT EXISTS uq_items_code_company ON items (code, company_id)`); } catch (_) {}
        console.log('  ✓ items');

        // -- Categories ----
        await safeAlter(`ALTER TABLE categories ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id)`);
        try { await q(`ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_code_key`); } catch (_) {}
        try { await q(`CREATE UNIQUE INDEX IF NOT EXISTS uq_categories_code_company ON categories (code, company_id)`); } catch (_) {}
        console.log('  ✓ categories');

        // -- Units ----
        await safeAlter(`ALTER TABLE units ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id)`);
        try { await q(`ALTER TABLE units DROP CONSTRAINT IF EXISTS units_code_key`); } catch (_) {}
        try { await q(`CREATE UNIQUE INDEX IF NOT EXISTS uq_units_code_company ON units (code, company_id)`); } catch (_) {}
        console.log('  ✓ units');

        // -- Suppliers & Customers (multi-tenant) ----
        await safeAlter(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS is_pkp BOOLEAN DEFAULT FALSE`);
        await safeAlter(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS npwp VARCHAR(30)`);
        await safeAlter(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id)`);
        try { await q(`ALTER TABLE suppliers DROP CONSTRAINT IF EXISTS suppliers_code_key`); } catch (_) {}
        try { await q(`CREATE UNIQUE INDEX IF NOT EXISTS idx_suppliers_code_company ON suppliers(code, company_id)`); } catch (_) {}

        await safeAlter(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_pkp BOOLEAN DEFAULT FALSE`);
        await safeAlter(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS npwp VARCHAR(30)`);
        await safeAlter(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS customer_type VARCHAR(30) DEFAULT 'regular'`);
        await safeAlter(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id)`);
        try { await q(`ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_code_key`); } catch (_) {}
        try { await q(`CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_code_company ON customers(code, company_id)`); } catch (_) {}
        console.log('  ✓ suppliers/customers');

        // -- Warehouses ----
        await safeAlter(`ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE`);
        console.log('  ✓ warehouses');

        // -- Chart of Accounts ----
        await safeAlter(`ALTER TABLE chart_of_accounts ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id)`);
        await safeAlter(`ALTER TABLE chart_of_accounts ADD COLUMN IF NOT EXISTS category VARCHAR(100)`);
        await safeAlter(`ALTER TABLE chart_of_accounts ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'IDR'`);
        await safeAlter(`ALTER TABLE chart_of_accounts ADD COLUMN IF NOT EXISTS balance NUMERIC DEFAULT 0`);
        await safeAlter(`ALTER TABLE chart_of_accounts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`);
        try { await q(`ALTER TABLE chart_of_accounts DROP CONSTRAINT IF EXISTS chart_of_accounts_code_key`); } catch (_) {}
        try { await q(`ALTER TABLE chart_of_accounts DROP CONSTRAINT IF EXISTS chart_of_accounts_type_check`); } catch (_) {}
        try { await q(`CREATE UNIQUE INDEX IF NOT EXISTS uq_coa_code_company ON chart_of_accounts (code, company_id)`); } catch (_) {}
        console.log('  ✓ chart_of_accounts');

        // -- Tax configs ----
        await safeAlter(`ALTER TABLE tax_configs ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id)`);
        console.log('  ✓ tax_configs');

        // -- Auto number counters ----
        await safeAlter(`ALTER TABLE auto_number_counters ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id)`);
        console.log('  ✓ auto_number_counters');

        // -- Journal entries ----
        await safeAlter(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'draft'`);
        await safeAlter(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`);
        // Rename entry_id → journal_id if needed
        try {
            const colCheck = await q(`SELECT column_name FROM information_schema.columns WHERE table_name='journal_lines' AND column_name='entry_id'`);
            if (colCheck.rows.length > 0) {
                await q(`ALTER TABLE journal_lines RENAME COLUMN entry_id TO journal_id`);
                console.log('  ✓ Renamed entry_id → journal_id in journal_lines');
            }
        } catch (_) {}
        console.log('  ✓ journal_entries/journal_lines');

        // -- Purchase Orders ----
        await safeAlter(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS payment_method VARCHAR(30) DEFAULT 'transfer'`);
        await safeAlter(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS payment_term_days INTEGER DEFAULT 30`);
        await safeAlter(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS extra_discount NUMERIC(5,2) DEFAULT 0`);
        await safeAlter(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5,2) DEFAULT 0`);
        await safeAlter(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(15,2) DEFAULT 0`);
        console.log('  ✓ purchase_orders');

        // -- Sales Orders ----
        await safeAlter(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS extra_discount NUMERIC(5,2) DEFAULT 0`);
        await safeAlter(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5,2) DEFAULT 0`);
        await safeAlter(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(15,2) DEFAULT 0`);
        console.log('  ✓ sales_orders');

        // -- Invoices ----
        await safeAlter(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS subtotal NUMERIC(15,2) DEFAULT 0`);
        await safeAlter(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS extra_discount NUMERIC(5,2) DEFAULT 0`);
        await safeAlter(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5,2) DEFAULT 0`);
        await safeAlter(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(15,2) DEFAULT 0`);
        await safeAlter(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS faktur_pajak_number VARCHAR(20)`);
        await safeAlter(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS kode_transaksi VARCHAR(2) DEFAULT '01'`);
        await safeAlter(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS npwp_pembeli VARCHAR(30)`);
        await safeAlter(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS nama_pembeli VARCHAR`);
        await safeAlter(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS notes TEXT`);
        await safeAlter(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS created_by VARCHAR`);
        console.log('  ✓ invoices');

        // -- Purchase Bills ----
        await safeAlter(`ALTER TABLE purchase_bills ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'IDR'`);
        await safeAlter(`ALTER TABLE purchase_bills ADD COLUMN IF NOT EXISTS created_by VARCHAR`);
        console.log('  ✓ purchase_bills');

        // -- Returns: update CHECK constraints for full flow ----
        try { await q(`ALTER TABLE sales_returns DROP CONSTRAINT IF EXISTS sales_returns_status_check`); } catch (_) {}
        try { await q(`ALTER TABLE sales_returns ADD CONSTRAINT sales_returns_status_check CHECK (status IN ('draft','approved','rejected','received','refunded','completed'))`); } catch (_) {}
        try { await q(`ALTER TABLE purchase_returns DROP CONSTRAINT IF EXISTS purchase_returns_status_check`); } catch (_) {}
        try { await q(`ALTER TABLE purchase_returns ADD CONSTRAINT purchase_returns_status_check CHECK (status IN ('draft','approved','rejected','shipped','resolved','completed'))`); } catch (_) {}
        console.log('  ✓ sales_returns/purchase_returns constraints');

        // -- Stock transfers ----
        await safeAlter(`ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`);
        try { await q(`ALTER TABLE stock_transfers DROP CONSTRAINT IF EXISTS stock_transfers_status_check`); } catch (_) {}
        try { await q(`ALTER TABLE stock_transfers ADD CONSTRAINT stock_transfers_status_check CHECK (status IN ('draft','pending','approved','shipping','received'))`); } catch (_) {}

        // -- Stock opnames ----
        try { await q(`ALTER TABLE stock_opnames DROP CONSTRAINT IF EXISTS stock_opnames_status_check`); } catch (_) {}
        try { await q(`ALTER TABLE stock_opnames ADD CONSTRAINT stock_opnames_status_check CHECK (status IN ('draft','pending','approved','rejected'))`); } catch (_) {}
        await safeAlter(`ALTER TABLE stock_opnames ADD COLUMN IF NOT EXISTS submitted_by VARCHAR`);
        await safeAlter(`ALTER TABLE stock_opnames ADD COLUMN IF NOT EXISTS rejected_by VARCHAR`);
        console.log('  ✓ stock_transfers/stock_opnames');

        // -- Item price tiers ----
        await safeAlter(`ALTER TABLE item_price_tiers ADD COLUMN IF NOT EXISTS label VARCHAR(100)`);
        await safeAlter(`ALTER TABLE item_price_tiers ADD COLUMN IF NOT EXISTS uuid UUID DEFAULT gen_random_uuid()`);
        await q(`UPDATE item_price_tiers SET uuid = gen_random_uuid() WHERE uuid IS NULL`).catch(() => {});
        console.log('  ✓ item_price_tiers');

        // -- Resto: additional columns ----
        await safeAlter(`ALTER TABLE resto_orders ADD COLUMN IF NOT EXISTS session_id INTEGER`);
        await safeAlter(`ALTER TABLE resto_orders ADD COLUMN IF NOT EXISTS service_pct NUMERIC(5,2) DEFAULT 0`);
        await safeAlter(`ALTER TABLE resto_orders ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ`);
        await safeAlter(`ALTER TABLE resto_orders ADD COLUMN IF NOT EXISTS preparing_at TIMESTAMPTZ`);
        await safeAlter(`ALTER TABLE resto_orders ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ`);
        await safeAlter(`ALTER TABLE resto_orders ADD COLUMN IF NOT EXISTS waiter_id INTEGER`);
        await safeAlter(`ALTER TABLE resto_waiters ADD COLUMN IF NOT EXISTS pin VARCHAR(255)`);
        console.log('  ✓ resto_orders/resto_waiters');

        // -- Margin defaults ----
        await safeAlter(`ALTER TABLE margin_defaults ADD COLUMN IF NOT EXISTS uuid UUID NOT NULL DEFAULT gen_random_uuid()`);
        console.log('  ✓ margin_defaults');

        // -- Users: unique email index ----
        try { await q(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL`); } catch (_) {}
        console.log('  ✓ users email index');

        console.log('\n✅ All ALTER TABLE migrations applied\n');

        // ──────────────────────────────────────────────────────────────────
        // STEP 3: List all created tables
        // ──────────────────────────────────────────────────────────────────
        console.log('📊  [3/3] Listing all tables ...\n');
        const r = await pool.query(`
            SELECT table_name FROM information_schema.tables
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
            ORDER BY table_name
        `);
        console.log(`   Total tables: ${r.rows.length}`);
        r.rows.forEach(t => console.log(`   ✓ ${t.table_name}`));

        console.log('\n═══════════════════════════════════════════════════════════════');
        console.log('  ✅ Migration complete! Run: node seed.js');
        console.log('═══════════════════════════════════════════════════════════════\n');

    } catch (e) {
        console.error('\n❌ Migration failed:', e.message);
        console.error(e.stack);
        process.exit(1);
    }

    await pool.end();
}

run();
