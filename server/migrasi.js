/**
 * migrasi.js — Full DDL Migration for ERPsys
 * Untuk fresh install di production server.
 * Jika tabel sudah ada, tidak akan di-drop (aman dijalankan ulang).
 *
 * Usage: node migrasi.js
 * Pastikan .env sudah dikonfigurasi dengan DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
 */
require('dotenv').config();
const { Pool } = require('pg');

// Gunakan config DB langsung dari env (bukan dari src/config/db karena file ini sering dijalankan mandiri)
const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'erpsys',
});

const q = (sql) => pool.query(sql);

const DDL = `
-- ─── Extensions ───────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── 1. Branches ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS branches (
    id          SERIAL PRIMARY KEY,
    uuid        UUID NOT NULL DEFAULT gen_random_uuid(),
    code        VARCHAR NOT NULL UNIQUE,
    name        VARCHAR NOT NULL,
    address     TEXT,
    phone       VARCHAR,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 2. Roles & Permissions ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS roles (
    id          SERIAL PRIMARY KEY,
    uuid        UUID NOT NULL DEFAULT gen_random_uuid(),
    name        VARCHAR NOT NULL UNIQUE,
    description TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS permissions (
    id   SERIAL PRIMARY KEY,
    name VARCHAR NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS role_permissions (
    role_id       INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- ─── 3. Users ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    uuid          UUID NOT NULL DEFAULT gen_random_uuid(),
    username      VARCHAR NOT NULL UNIQUE,
    email         VARCHAR NOT NULL UNIQUE,
    name          VARCHAR NOT NULL,
    password_hash VARCHAR NOT NULL,
    is_active     BOOLEAN DEFAULT TRUE,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_roles (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS user_branches (
    user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, branch_id)
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token      TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 4. Master Data ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
    id          SERIAL PRIMARY KEY,
    uuid        UUID NOT NULL DEFAULT gen_random_uuid(),
    code        VARCHAR NOT NULL UNIQUE,
    name        VARCHAR NOT NULL,
    description TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS units (
    id          SERIAL PRIMARY KEY,
    uuid        UUID NOT NULL DEFAULT gen_random_uuid(),
    code        VARCHAR NOT NULL UNIQUE,
    name        VARCHAR NOT NULL,
    description TEXT,
    is_active   BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS warehouses (
    id          SERIAL PRIMARY KEY,
    uuid        UUID NOT NULL DEFAULT gen_random_uuid(),
    code        VARCHAR NOT NULL UNIQUE,
    name        VARCHAR NOT NULL,
    branch_id   INTEGER REFERENCES branches(id),
    address     TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS warehouse_zones (
    id           SERIAL PRIMARY KEY,
    uuid         UUID NOT NULL DEFAULT gen_random_uuid(),
    warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
    code         VARCHAR NOT NULL,
    name         VARCHAR NOT NULL,
    description  TEXT,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS items (
    id                SERIAL PRIMARY KEY,
    uuid              UUID NOT NULL DEFAULT gen_random_uuid(),
    code              VARCHAR NOT NULL UNIQUE,
    barcode           VARCHAR,
    name              VARCHAR NOT NULL,
    small_uom_id      INTEGER REFERENCES units(id),
    big_uom_id        INTEGER REFERENCES units(id),
    conversion_factor INTEGER DEFAULT 1,
    buy_price         NUMERIC DEFAULT 0,
    sell_price        NUMERIC DEFAULT 0,
    hpp               NUMERIC DEFAULT 0,
    min_stock         INTEGER DEFAULT 0,
    category_id       INTEGER REFERENCES categories(id),
    image_url         TEXT,
    min_sell_qty      INTEGER DEFAULT 1,
    is_active         BOOLEAN DEFAULT TRUE,
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS item_price_tiers (
    id        SERIAL PRIMARY KEY,
    item_id   INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    name      VARCHAR NOT NULL,
    min_qty   INTEGER NOT NULL DEFAULT 1,
    price     NUMERIC NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS bundles (
    id          SERIAL PRIMARY KEY,
    uuid        UUID NOT NULL DEFAULT gen_random_uuid(),
    code        VARCHAR NOT NULL UNIQUE,
    name        VARCHAR NOT NULL,
    sell_price  NUMERIC DEFAULT 0,
    is_active   BOOLEAN DEFAULT TRUE,
    branch_id   INTEGER REFERENCES branches(id),
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bundle_items (
    id        SERIAL PRIMARY KEY,
    bundle_id INTEGER NOT NULL REFERENCES bundles(id) ON DELETE CASCADE,
    item_id   INTEGER NOT NULL REFERENCES items(id),
    qty       INTEGER NOT NULL DEFAULT 1
);

-- ─── 5. Inventory ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory (
    id           SERIAL PRIMARY KEY,
    item_id      INTEGER NOT NULL REFERENCES items(id),
    warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
    qty          INTEGER DEFAULT 0,
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (item_id, warehouse_id)
);

CREATE TABLE IF NOT EXISTS stock_movements (
    id           SERIAL PRIMARY KEY,
    item_id      INTEGER REFERENCES items(id),
    date         DATE NOT NULL,
    type         VARCHAR NOT NULL,  -- 'in', 'out', 'adjustment'
    qty          INTEGER NOT NULL,
    ref          VARCHAR,
    warehouse_id INTEGER REFERENCES warehouses(id),
    description  TEXT,
    balance      INTEGER DEFAULT 0,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 6. BATCH TRACKING (Expiry Dates) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS suppliers (
    id         SERIAL PRIMARY KEY,
    uuid       UUID NOT NULL DEFAULT gen_random_uuid(),
    code       VARCHAR NOT NULL UNIQUE,
    name       VARCHAR NOT NULL,
    address    TEXT,
    phone      VARCHAR,
    email      VARCHAR,
    branch_id  INTEGER REFERENCES branches(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS batches (
    id            SERIAL PRIMARY KEY,
    uuid          UUID NOT NULL DEFAULT gen_random_uuid(),
    item_id       INTEGER REFERENCES items(id),
    warehouse_id  INTEGER REFERENCES warehouses(id),
    batch_no      VARCHAR NOT NULL,
    expiry_date   DATE,
    received_date DATE,
    qty           INTEGER DEFAULT 0,
    status        VARCHAR DEFAULT 'active'
                  CHECK (status IN ('active','expiring','expired','depleted')),
    gr_id         INTEGER,
    supplier_id   INTEGER REFERENCES suppliers(id),
    notes         TEXT,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_batches_item_id     ON batches(item_id);
CREATE INDEX IF NOT EXISTS idx_batches_status      ON batches(status);
CREATE INDEX IF NOT EXISTS idx_batches_expiry_date ON batches(expiry_date);

-- ─── 7. Suppliers & Purchasing ────────────────────────────────────────────────


CREATE TABLE IF NOT EXISTS supplier_prices (
    id          SERIAL PRIMARY KEY,
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    item_id     INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    price       NUMERIC NOT NULL DEFAULT 0,
    min_qty     INTEGER NOT NULL DEFAULT 1,
    UNIQUE (supplier_id, item_id)
);

CREATE TABLE IF NOT EXISTS purchase_orders (
    id           SERIAL PRIMARY KEY,
    uuid         UUID NOT NULL DEFAULT gen_random_uuid(),
    number       VARCHAR NOT NULL UNIQUE,
    date         DATE NOT NULL,
    supplier_id  INTEGER REFERENCES suppliers(id),
    branch_id    INTEGER REFERENCES branches(id),
    warehouse_id INTEGER REFERENCES warehouses(id),
    status       VARCHAR DEFAULT 'draft'
                 CHECK (status IN ('draft','pending','approved','rejected','processed','billed','paid')),
    approved_by  VARCHAR,
    currency     VARCHAR DEFAULT 'IDR',
    notes        TEXT,
    created_by   VARCHAR,
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchase_order_lines (
    id      SERIAL PRIMARY KEY,
    po_id   INTEGER REFERENCES purchase_orders(id),
    item_id INTEGER REFERENCES items(id),
    qty     INTEGER NOT NULL,
    uom     VARCHAR,
    price   NUMERIC NOT NULL,
    discount NUMERIC DEFAULT 0
);

CREATE TABLE IF NOT EXISTS goods_receives (
    id           SERIAL PRIMARY KEY,
    uuid         UUID NOT NULL DEFAULT gen_random_uuid(),
    number       VARCHAR NOT NULL UNIQUE,
    date         DATE NOT NULL,
    po_id        INTEGER REFERENCES purchase_orders(id),
    warehouse_id INTEGER REFERENCES warehouses(id),
    branch_id    INTEGER REFERENCES branches(id),
    status       VARCHAR DEFAULT 'completed',
    notes        TEXT,
    created_by   VARCHAR,
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS goods_receive_lines (
    id       SERIAL PRIMARY KEY,
    gr_id    INTEGER REFERENCES goods_receives(id),
    item_id  INTEGER REFERENCES items(id),
    qty      INTEGER NOT NULL,
    uom      VARCHAR,
    batch_id INTEGER REFERENCES batches(id)   -- nullable: items tanpa batch tracking
);

-- Add FK from batches to goods_receives (after both tables exist)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'batches_gr_id_fkey'
    ) THEN
        ALTER TABLE batches ADD CONSTRAINT batches_gr_id_fkey
        FOREIGN KEY (gr_id) REFERENCES goods_receives(id);
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS purchase_bills (
    id           SERIAL PRIMARY KEY,
    uuid         UUID NOT NULL DEFAULT gen_random_uuid(),
    number       VARCHAR NOT NULL UNIQUE,
    po_id        INTEGER REFERENCES purchase_orders(id),
    branch_id    INTEGER REFERENCES branches(id),
    date         DATE NOT NULL,
    due_date     DATE,
    total        NUMERIC DEFAULT 0,
    status       VARCHAR DEFAULT 'unpaid'
                 CHECK (status IN ('unpaid','partial','paid')),
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchase_returns (
    id              SERIAL PRIMARY KEY,
    uuid            UUID NOT NULL DEFAULT gen_random_uuid(),
    number          VARCHAR NOT NULL UNIQUE,
    po_id           INTEGER REFERENCES purchase_orders(id),
    supplier_id     INTEGER REFERENCES suppliers(id),
    warehouse_id    INTEGER REFERENCES warehouses(id),
    branch_id       INTEGER REFERENCES branches(id),
    date            DATE NOT NULL,
    reason          TEXT,
    total           NUMERIC DEFAULT 0,
    status          VARCHAR DEFAULT 'draft'
                    CHECK (status IN ('draft','approved','rejected','shipped','resolved','completed')),
    created_by      VARCHAR,
    approved_by     VARCHAR,
    shipped_by      VARCHAR,
    shipped_at      TIMESTAMPTZ,
    resolution_type VARCHAR,
    resolution_note TEXT,
    resolved_by     VARCHAR,
    resolved_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchase_return_lines (
    id        SERIAL PRIMARY KEY,
    return_id INTEGER REFERENCES purchase_returns(id),
    item_id   INTEGER REFERENCES items(id),
    qty       INTEGER NOT NULL,
    uom       VARCHAR,
    price     NUMERIC DEFAULT 0
);

-- ─── 8. Customers & Sales ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_groups (
    id   SERIAL PRIMARY KEY,
    name VARCHAR NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS customers (
    id         SERIAL PRIMARY KEY,
    uuid       UUID NOT NULL DEFAULT gen_random_uuid(),
    code       VARCHAR NOT NULL UNIQUE,
    name       VARCHAR NOT NULL,
    address    TEXT,
    phone      VARCHAR,
    email      VARCHAR,
    group_id   INTEGER REFERENCES customer_groups(id),
    branch_id  INTEGER REFERENCES branches(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sales_orders (
    id          SERIAL PRIMARY KEY,
    uuid        UUID NOT NULL DEFAULT gen_random_uuid(),
    number      VARCHAR NOT NULL UNIQUE,
    date        DATE NOT NULL,
    customer_id INTEGER REFERENCES customers(id),
    branch_id   INTEGER REFERENCES branches(id),
    status      VARCHAR DEFAULT 'draft'
                CHECK (status IN ('draft','pending','approved','rejected','processed','paid')),
    approved_by VARCHAR,
    currency    VARCHAR DEFAULT 'IDR',
    notes       TEXT,
    created_by  VARCHAR,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sales_order_lines (
    id       SERIAL PRIMARY KEY,
    so_id    INTEGER REFERENCES sales_orders(id),
    item_id  INTEGER REFERENCES items(id),
    qty      INTEGER NOT NULL,
    uom      VARCHAR,
    price    NUMERIC NOT NULL,
    discount NUMERIC DEFAULT 0
);

CREATE TABLE IF NOT EXISTS goods_issues (
    id           SERIAL PRIMARY KEY,
    uuid         UUID NOT NULL DEFAULT gen_random_uuid(),
    number       VARCHAR NOT NULL UNIQUE,
    date         DATE NOT NULL,
    so_id        INTEGER REFERENCES sales_orders(id),
    warehouse_id INTEGER REFERENCES warehouses(id),
    branch_id    INTEGER REFERENCES branches(id),
    status       VARCHAR DEFAULT 'completed',
    notes        TEXT,
    created_by   VARCHAR,
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS goods_issue_lines (
    id      SERIAL PRIMARY KEY,
    gi_id   INTEGER REFERENCES goods_issues(id),
    item_id INTEGER REFERENCES items(id),
    qty     INTEGER NOT NULL,
    uom     VARCHAR
);

CREATE TABLE IF NOT EXISTS invoices (
    id         SERIAL PRIMARY KEY,
    uuid       UUID NOT NULL DEFAULT gen_random_uuid(),
    number     VARCHAR NOT NULL UNIQUE,
    so_id      INTEGER REFERENCES sales_orders(id),
    date       DATE,
    due_date   DATE,
    branch_id  INTEGER REFERENCES branches(id),
    status     VARCHAR DEFAULT 'unpaid'
               CHECK (status IN ('unpaid','partial','paid')),
    total      NUMERIC DEFAULT 0,
    currency   VARCHAR DEFAULT 'IDR',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sales_returns (
    id              SERIAL PRIMARY KEY,
    uuid            UUID NOT NULL DEFAULT gen_random_uuid(),
    number          VARCHAR NOT NULL UNIQUE,
    so_id           INTEGER REFERENCES sales_orders(id),
    customer_id     INTEGER REFERENCES customers(id),
    warehouse_id    INTEGER REFERENCES warehouses(id),
    branch_id       INTEGER REFERENCES branches(id),
    date            DATE NOT NULL,
    reason          TEXT,
    total           NUMERIC DEFAULT 0,
    status          VARCHAR DEFAULT 'draft'
                    CHECK (status IN ('draft','approved','rejected','received','refunded','completed')),
    created_by      VARCHAR,
    approved_by     VARCHAR,
    received_by     VARCHAR,
    received_at     TIMESTAMPTZ,
    resolution_type VARCHAR,
    resolution_note TEXT,
    resolved_by     VARCHAR,
    resolved_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sales_return_lines (
    id        SERIAL PRIMARY KEY,
    return_id INTEGER REFERENCES sales_returns(id),
    item_id   INTEGER REFERENCES items(id),
    qty       INTEGER NOT NULL,
    uom       VARCHAR,
    price     NUMERIC DEFAULT 0
);

CREATE TABLE IF NOT EXISTS consignments (
    id           SERIAL PRIMARY KEY,
    uuid         UUID NOT NULL DEFAULT gen_random_uuid(),
    number       VARCHAR NOT NULL UNIQUE,
    item_id      INTEGER REFERENCES items(id),
    partner_name VARCHAR NOT NULL,
    qty_given    INTEGER NOT NULL DEFAULT 0,
    qty_sold     INTEGER DEFAULT 0,
    qty_returned INTEGER DEFAULT 0,
    sell_price   NUMERIC DEFAULT 0,
    branch_id    INTEGER REFERENCES branches(id),
    date         DATE NOT NULL,
    status       VARCHAR DEFAULT 'active'
                 CHECK (status IN ('active','settled','returned')),
    notes        TEXT,
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 9. POS ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pos_transactions (
    id             SERIAL PRIMARY KEY,
    uuid           UUID NOT NULL DEFAULT gen_random_uuid(),
    number         VARCHAR NOT NULL UNIQUE,
    date           TIMESTAMPTZ DEFAULT NOW(),
    branch_id      INTEGER REFERENCES branches(id),
    items_json     JSONB NOT NULL DEFAULT '[]',
    subtotal       NUMERIC DEFAULT 0,
    discount_pct   NUMERIC DEFAULT 0,
    total          NUMERIC DEFAULT 0,
    payment_method VARCHAR DEFAULT 'cash',
    cash_paid      NUMERIC DEFAULT 0,
    change         NUMERIC DEFAULT 0,
    cashier_id     INTEGER REFERENCES users(id),
    created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 10. Stock Operations ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stock_transfers (
    id               SERIAL PRIMARY KEY,
    uuid             UUID NOT NULL DEFAULT gen_random_uuid(),
    number           VARCHAR NOT NULL UNIQUE,
    date             DATE NOT NULL,
    from_warehouse_id INTEGER REFERENCES warehouses(id),
    to_warehouse_id   INTEGER REFERENCES warehouses(id),
    branch_id        INTEGER REFERENCES branches(id),
    status           VARCHAR DEFAULT 'draft'
                     CHECK (status IN ('draft','pending','approved','shipping','received')),
    notes            TEXT,
    created_by       VARCHAR,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_transfer_lines (
    id          SERIAL PRIMARY KEY,
    transfer_id INTEGER REFERENCES stock_transfers(id),
    item_id     INTEGER REFERENCES items(id),
    qty         INTEGER NOT NULL,
    uom         VARCHAR
);

CREATE TABLE IF NOT EXISTS stock_opnames (
    id           SERIAL PRIMARY KEY,
    uuid         UUID NOT NULL DEFAULT gen_random_uuid(),
    number       VARCHAR NOT NULL UNIQUE,
    date         DATE NOT NULL,
    warehouse_id INTEGER REFERENCES warehouses(id),
    branch_id    INTEGER REFERENCES branches(id),
    status       VARCHAR DEFAULT 'draft'
                 CHECK (status IN ('draft','approved','rejected')),
    approved_by  VARCHAR,
    notes        TEXT,
    created_by   VARCHAR,
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_opname_lines (
    id           SERIAL PRIMARY KEY,
    opname_id    INTEGER REFERENCES stock_opnames(id),
    item_id      INTEGER REFERENCES items(id),
    system_qty   INTEGER NOT NULL DEFAULT 0,
    actual_qty   INTEGER NOT NULL DEFAULT 0,
    difference   INTEGER GENERATED ALWAYS AS (actual_qty - system_qty) STORED,
    uom          VARCHAR
);

-- ─── 11. Accounting ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chart_of_accounts (
    id          SERIAL PRIMARY KEY,
    uuid        UUID NOT NULL DEFAULT gen_random_uuid(),
    code        VARCHAR NOT NULL UNIQUE,
    name        VARCHAR NOT NULL,
    type        VARCHAR NOT NULL
                CHECK (type IN ('asset','liability','equity','revenue','expense')),
    parent_id   INTEGER REFERENCES chart_of_accounts(id),
    branch_id   INTEGER REFERENCES branches(id),
    is_active   BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS journal_entries (
    id          SERIAL PRIMARY KEY,
    uuid        UUID NOT NULL DEFAULT gen_random_uuid(),
    number      VARCHAR NOT NULL UNIQUE,
    date        DATE NOT NULL,
    description TEXT,
    branch_id   INTEGER REFERENCES branches(id),
    created_by  VARCHAR,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS journal_lines (
    id          SERIAL PRIMARY KEY,
    journal_id  INTEGER NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
    account_id  INTEGER NOT NULL REFERENCES chart_of_accounts(id),
    debit       NUMERIC DEFAULT 0,
    credit      NUMERIC DEFAULT 0,
    description TEXT
);

-- ─── 12. Auto Numbering ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS auto_number_counters (
    id        SERIAL PRIMARY KEY,
    prefix    VARCHAR NOT NULL,
    year      VARCHAR(4) NOT NULL,
    letter    CHAR(1) NOT NULL DEFAULT 'A',
    counter   INTEGER NOT NULL DEFAULT 0,
    UNIQUE (prefix, year, letter)
);

-- ─── 13. Audit Trail ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_trail (
    id           SERIAL PRIMARY KEY,
    action       VARCHAR NOT NULL,
    module       VARCHAR NOT NULL,
    description  TEXT,
    user_id      INTEGER REFERENCES users(id),
    user_name    VARCHAR,
    branch_id    INTEGER REFERENCES branches(id),
    timestamp    TIMESTAMPTZ DEFAULT NOW(),
    details_json JSONB DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_trail(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_module    ON audit_trail(module);
`;

async function run() {
    console.log('🏗️  Memulai migrasi DDL database...\n');
    try {
        await q(DDL);
        console.log('✅ Semua tabel berhasil dibuat / sudah ada\n');

        // ── ALTER TABLE migrations for existing tables ──
        const safeAlter = async (sql) => {
            try { await q(sql); } catch (e) {
                if (!e.message.includes('already exists') && !e.message.includes('duplicate column') && !e.message.includes('does not exist')) throw e;
            }
        };

        // Sales Returns — add full flow columns
        await safeAlter(`ALTER TABLE sales_returns ADD COLUMN IF NOT EXISTS customer_id INTEGER REFERENCES customers(id)`);
        await safeAlter(`ALTER TABLE sales_returns ADD COLUMN IF NOT EXISTS total NUMERIC DEFAULT 0`);
        await safeAlter(`ALTER TABLE sales_returns ADD COLUMN IF NOT EXISTS approved_by VARCHAR`);
        await safeAlter(`ALTER TABLE sales_returns ADD COLUMN IF NOT EXISTS received_by VARCHAR`);
        await safeAlter(`ALTER TABLE sales_returns ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ`);
        await safeAlter(`ALTER TABLE sales_returns ADD COLUMN IF NOT EXISTS resolution_type VARCHAR`);
        await safeAlter(`ALTER TABLE sales_returns ADD COLUMN IF NOT EXISTS resolution_note TEXT`);
        await safeAlter(`ALTER TABLE sales_returns ADD COLUMN IF NOT EXISTS resolved_by VARCHAR`);
        await safeAlter(`ALTER TABLE sales_returns ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ`);
        await safeAlter(`ALTER TABLE sales_returns ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`);
        await safeAlter(`ALTER TABLE sales_return_lines ADD COLUMN IF NOT EXISTS price NUMERIC DEFAULT 0`);

        // Purchase Returns — add full flow columns
        await safeAlter(`ALTER TABLE purchase_returns ADD COLUMN IF NOT EXISTS supplier_id INTEGER REFERENCES suppliers(id)`);
        await safeAlter(`ALTER TABLE purchase_returns ADD COLUMN IF NOT EXISTS total NUMERIC DEFAULT 0`);
        await safeAlter(`ALTER TABLE purchase_returns ADD COLUMN IF NOT EXISTS approved_by VARCHAR`);
        await safeAlter(`ALTER TABLE purchase_returns ADD COLUMN IF NOT EXISTS shipped_by VARCHAR`);
        await safeAlter(`ALTER TABLE purchase_returns ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMPTZ`);
        await safeAlter(`ALTER TABLE purchase_returns ADD COLUMN IF NOT EXISTS resolution_type VARCHAR`);
        await safeAlter(`ALTER TABLE purchase_returns ADD COLUMN IF NOT EXISTS resolution_note TEXT`);
        await safeAlter(`ALTER TABLE purchase_returns ADD COLUMN IF NOT EXISTS resolved_by VARCHAR`);
        await safeAlter(`ALTER TABLE purchase_returns ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ`);
        await safeAlter(`ALTER TABLE purchase_returns ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`);
        await safeAlter(`ALTER TABLE purchase_return_lines ADD COLUMN IF NOT EXISTS price NUMERIC DEFAULT 0`);

        // Drop old CHECK constraints and add new ones (status flow)
        try {
            await q(`ALTER TABLE sales_returns DROP CONSTRAINT IF EXISTS sales_returns_status_check`);
            await q(`ALTER TABLE sales_returns ADD CONSTRAINT sales_returns_status_check CHECK (status IN ('draft','approved','rejected','received','refunded','completed'))`);
        } catch (e) { /* constraint may not exist or already correct */ }
        try {
            await q(`ALTER TABLE purchase_returns DROP CONSTRAINT IF EXISTS purchase_returns_status_check`);
            await q(`ALTER TABLE purchase_returns ADD CONSTRAINT purchase_returns_status_check CHECK (status IN ('draft','approved','rejected','shipped','resolved','completed'))`);
        } catch (e) { /* constraint may not exist or already correct */ }

        // Journal entries — ensure status column exists
        await safeAlter(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS status VARCHAR DEFAULT 'draft'`);
        await safeAlter(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`);
        // journal_lines — ensure journal_id column exists (rename from entry_id if needed)
        try {
            const colCheck = await q(`SELECT column_name FROM information_schema.columns WHERE table_name='journal_lines' AND column_name='entry_id'`);
            if (colCheck.rows.length > 0) {
                // Rename entry_id to journal_id for consistency
                await q(`ALTER TABLE journal_lines RENAME COLUMN entry_id TO journal_id`);
                console.log('  ✓ Renamed entry_id → journal_id in journal_lines');
            }
        } catch (e) { /* already renamed or doesn\'t exist */ }
        await safeAlter(`ALTER TABLE journal_lines ADD COLUMN IF NOT EXISTS journal_id INTEGER REFERENCES journal_entries(id)`);

        // stock_transfers — ensure updated_at and proper status
        await safeAlter(`ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`);
        try { await q(`ALTER TABLE stock_transfers DROP CONSTRAINT IF EXISTS stock_transfers_status_check`); } catch (e) { }
        await safeAlter(`ALTER TABLE stock_transfers ADD CONSTRAINT stock_transfers_status_check CHECK (status IN ('draft','pending','approved','shipping','received'))`);

        // warehouses — add is_active for deactivation support
        await safeAlter(`ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE`);

        // stock_opnames — add 'pending' status + submitted/rejected tracking
        try { await q(`ALTER TABLE stock_opnames DROP CONSTRAINT IF EXISTS stock_opnames_status_check`); } catch (e) { }
        await safeAlter(`ALTER TABLE stock_opnames ADD CONSTRAINT stock_opnames_status_check CHECK (status IN ('draft','pending','approved','rejected'))`);
        await safeAlter(`ALTER TABLE stock_opnames ADD COLUMN IF NOT EXISTS submitted_by VARCHAR`);
        await safeAlter(`ALTER TABLE stock_opnames ADD COLUMN IF NOT EXISTS rejected_by VARCHAR`);

        // ── Companies (multi-company foundation) ──────────────────────────
        await q(`CREATE TABLE IF NOT EXISTS companies (
            id          SERIAL PRIMARY KEY,
            uuid        UUID NOT NULL DEFAULT gen_random_uuid(),
            code        VARCHAR(20) UNIQUE NOT NULL,
            name        VARCHAR NOT NULL,
            npwp        VARCHAR(30),
            address     TEXT,
            phone       VARCHAR,
            logo_url    VARCHAR,
            is_active   BOOLEAN DEFAULT TRUE,
            created_at  TIMESTAMPTZ DEFAULT NOW(),
            updated_at  TIMESTAMPTZ DEFAULT NOW()
        )`);
        console.log('  ✓ companies table ready');

        await q(`CREATE TABLE IF NOT EXISTS user_companies (
            user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
            company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
            PRIMARY KEY (user_id, company_id)
        )`);
        console.log('  ✓ user_companies table ready');

        await safeAlter(`ALTER TABLE branches ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id)`);
        await safeAlter(`ALTER TABLE users ADD COLUMN IF NOT EXISTS uuid UUID DEFAULT gen_random_uuid()`);
        await safeAlter(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT FALSE`);
        console.log('  ✓ branches.company_id, users.uuid, users.is_super_admin added');

        // ── Tax Configs table ────────────────────────────────────────────────
        await q(`CREATE TABLE IF NOT EXISTS tax_configs (
            id             SERIAL PRIMARY KEY,
            uuid           UUID NOT NULL DEFAULT gen_random_uuid(),
            name           VARCHAR(50) NOT NULL,
            rate           NUMERIC(5,2) NOT NULL DEFAULT 0,
            is_active      BOOLEAN DEFAULT FALSE,
            effective_date DATE,
            notes          TEXT,
            created_at     TIMESTAMPTZ DEFAULT NOW(),
            updated_at     TIMESTAMPTZ DEFAULT NOW()
        )`);
        console.log('  ✓ tax_configs table ready');

        // ── Company Settings (profil perusahaan for e-Faktur) ────────────────
        await q(`CREATE TABLE IF NOT EXISTS company_settings (
            id                     SERIAL PRIMARY KEY,
            uuid                   UUID NOT NULL DEFAULT gen_random_uuid(),
            branch_id              INTEGER REFERENCES branches(id) UNIQUE,
            company_name           VARCHAR NOT NULL DEFAULT 'CV Demo ERP',
            npwp                   VARCHAR(30),          -- NPWP penjual 15 digit
            is_pkp                 BOOLEAN DEFAULT TRUE,
            pkp_since              DATE,
            address                TEXT,
            phone                  VARCHAR,
            efaktur_series_prefix  VARCHAR(3) DEFAULT '010',  -- prefix 3 digit nomor seri
            efaktur_last_number    INTEGER DEFAULT 0,
            created_at             TIMESTAMPTZ DEFAULT NOW(),
            updated_at             TIMESTAMPTZ DEFAULT NOW()
        )`);
        console.log('  ✓ company_settings table ready (legacy)');

        // ── PKP & e-Faktur fields on companies table (replaces company_settings) ──
        await safeAlter(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS is_pkp BOOLEAN DEFAULT FALSE`);
        await safeAlter(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS pkp_since DATE`);
        await safeAlter(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS efaktur_series_prefix VARCHAR(3) DEFAULT '010'`);
        await safeAlter(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS efaktur_last_number INTEGER DEFAULT 0`);
        console.log('  ✓ companies: is_pkp, pkp_since, efaktur_series_prefix, efaktur_last_number added');

        // ── Suppliers: PKP status & NPWP + company_id for isolation ────────
        await safeAlter(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS is_pkp BOOLEAN DEFAULT FALSE`);
        await safeAlter(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS npwp VARCHAR(30)`);
        await safeAlter(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id)`);
        console.log('  + suppliers: is_pkp, npwp, company_id');

        // ── Customers: PKP status, NPWP, Customer Type + company_id ──
        await safeAlter(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_pkp BOOLEAN DEFAULT FALSE`);
        await safeAlter(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS npwp VARCHAR(30)`);
        await safeAlter(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS customer_type VARCHAR(30) DEFAULT 'regular'`);
        await safeAlter(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id)`);
        console.log('  + customers: is_pkp, npwp, customer_type, company_id');

        // ── Users: phone field ──────────────────────────────────────────────
        await safeAlter(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20)`);
        await safeAlter(`ALTER TABLE items ADD COLUMN IF NOT EXISTS is_taxable BOOLEAN DEFAULT TRUE`);
        // is_taxable=false: barang bebas PPN (beras, gula curah, dll per PP 49/2022)
        // ── Items: image_url untuk foto produk ─────────────────────────────
        await safeAlter(`ALTER TABLE items ADD COLUMN IF NOT EXISTS image_url VARCHAR(500)`);

        // ── Purchase Orders: payment & tax snapshot ─────────────────────────
        await safeAlter(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS payment_method VARCHAR(30) DEFAULT 'transfer'`);
        await safeAlter(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS payment_term_days INTEGER DEFAULT 30`);
        await safeAlter(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS extra_discount NUMERIC(5,2) DEFAULT 0`);
        await safeAlter(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5,2) DEFAULT 0`);
        await safeAlter(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(15,2) DEFAULT 0`);

        // ── Sales Orders: extra discount & tax snapshot ──────────────────────
        await safeAlter(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS extra_discount NUMERIC(5,2) DEFAULT 0`);
        await safeAlter(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5,2) DEFAULT 0`);
        await safeAlter(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(15,2) DEFAULT 0`);

        // ── Invoices: full tax & e-Faktur fields ─────────────────────────────
        await safeAlter(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS subtotal NUMERIC(15,2) DEFAULT 0`);
        await safeAlter(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS extra_discount NUMERIC(5,2) DEFAULT 0`);
        await safeAlter(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5,2) DEFAULT 0`);
        await safeAlter(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(15,2) DEFAULT 0`);
        await safeAlter(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS faktur_pajak_number VARCHAR(20)`); // format: 010-25.00000001
        await safeAlter(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS kode_transaksi VARCHAR(2) DEFAULT '01'`);
        await safeAlter(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS npwp_pembeli VARCHAR(30)`); // 00.000.000.0-000.000 untuk non-PKP
        await safeAlter(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS nama_pembeli VARCHAR`);
        await safeAlter(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS notes TEXT`);
        await safeAlter(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS created_by VARCHAR`);

        // ── Purchase Bills: minor additions ──────────────────────────────────
        await safeAlter(`ALTER TABLE purchase_bills ADD COLUMN IF NOT EXISTS currency VARCHAR DEFAULT 'IDR'`);
        await safeAlter(`ALTER TABLE purchase_bills ADD COLUMN IF NOT EXISTS created_by VARCHAR`);

        // ── Closing Periods (tutup buku bulanan/tahunan) ────────────────
        await q(`CREATE TABLE IF NOT EXISTS closing_periods (
            id           SERIAL PRIMARY KEY,
            uuid         UUID NOT NULL DEFAULT gen_random_uuid(),
            period_type  VARCHAR(10) NOT NULL CHECK (period_type IN ('monthly', 'yearly')),
            period_start DATE NOT NULL,
            period_end   DATE NOT NULL,
            status       VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'closed', 'cancelled')),
            closed_by    VARCHAR,
            closed_at    TIMESTAMPTZ,
            notes        TEXT,
            created_by   VARCHAR,
            branch_id    INTEGER REFERENCES branches(id),
            created_at   TIMESTAMPTZ DEFAULT NOW(),
            updated_at   TIMESTAMPTZ DEFAULT NOW()
        )`);
        console.log('  ✓ closing_periods table ready');

        // ── Items: add label column to item_price_tiers if missing ───
        await safeAlter(`ALTER TABLE item_price_tiers ADD COLUMN IF NOT EXISTS label VARCHAR`);

        // ── Multi-tenant isolation: add company_id to master data tables ──
        console.log('  Applying multi-tenant isolation columns...');

        // roles: company_id nullable (NULL = Super Admin / platform-level)
        await safeAlter(`ALTER TABLE roles ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id)`);
        try { await q(`ALTER TABLE roles DROP CONSTRAINT IF EXISTS roles_name_key`); } catch (e) { }
        try { await q(`CREATE UNIQUE INDEX IF NOT EXISTS uq_roles_name_company ON roles (name, COALESCE(company_id, 0))`); } catch (e) { }
        console.log('  ✓ roles.company_id (nullable, NULL=platform)');

        // categories: company_id NOT NULL
        await safeAlter(`ALTER TABLE categories ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id)`);
        try { await q(`ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_code_key`); } catch (e) { }
        try { await q(`CREATE UNIQUE INDEX IF NOT EXISTS uq_categories_code_company ON categories (code, company_id)`); } catch (e) { }
        console.log('  ✓ categories.company_id');

        // units: company_id NOT NULL
        await safeAlter(`ALTER TABLE units ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id)`);
        try { await q(`ALTER TABLE units DROP CONSTRAINT IF EXISTS units_code_key`); } catch (e) { }
        try { await q(`CREATE UNIQUE INDEX IF NOT EXISTS uq_units_code_company ON units (code, company_id)`); } catch (e) { }
        console.log('  ✓ units.company_id');

        // items: company_id NOT NULL
        await safeAlter(`ALTER TABLE items ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id)`);
        try { await q(`ALTER TABLE items DROP CONSTRAINT IF EXISTS items_code_key`); } catch (e) { }
        try { await q(`CREATE UNIQUE INDEX IF NOT EXISTS uq_items_code_company ON items (code, company_id)`); } catch (e) { }
        console.log('  ✓ items.company_id');

        // chart_of_accounts: company_id NOT NULL
        await safeAlter(`ALTER TABLE chart_of_accounts ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id)`);
        try { await q(`ALTER TABLE chart_of_accounts DROP CONSTRAINT IF EXISTS chart_of_accounts_code_key`); } catch (e) { }
        try { await q(`CREATE UNIQUE INDEX IF NOT EXISTS uq_coa_code_company ON chart_of_accounts (code, company_id)`); } catch (e) { }
        console.log('  ✓ chart_of_accounts.company_id');

        // tax_configs: company_id NOT NULL
        await safeAlter(`ALTER TABLE tax_configs ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id)`);
        console.log('  ✓ tax_configs.company_id');

        // auto_number_counters: company_id (if table exists)
        try { await safeAlter(`ALTER TABLE auto_number_counters ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id)`); } catch (e) { }

        // ── Fix: drop global UNIQUE on suppliers.code / customers.code ───────
        // Old schema has UNIQUE on code globally — should be per-company
        await safeAlter(`ALTER TABLE suppliers DROP CONSTRAINT IF EXISTS suppliers_code_key`);
        await safeAlter(`ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_code_key`);
        // Add per-company unique (code is unique within a company, not globally)
        await safeAlter(`CREATE UNIQUE INDEX IF NOT EXISTS idx_suppliers_code_company ON suppliers(code, company_id)`);
        await safeAlter(`CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_code_company ON customers(code, company_id)`);
        console.log('  ✓ suppliers/customers: dropped global UNIQUE on code, added per-company unique index');

        // ── Ensure users.email has a unique index ────────────────────────────
        await safeAlter(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL`);
        console.log('  ✓ users: unique index on email');

        // ── branches.code: extend to VARCHAR(30) for format {CODE}-00001 ─────
        await safeAlter(`ALTER TABLE branches ALTER COLUMN code TYPE VARCHAR(30)`);
        console.log('  ✓ branches.code extended to VARCHAR(30)');

        // ── companies.short_name: display abbreviation e.g. PT-SSP ──────────
        await safeAlter(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS short_name VARCHAR(30)`);
        console.log('  ✓ companies.short_name added');

        // ── item_price_tiers table (tiered/graduated pricing) ───────────────
        await q(`CREATE TABLE IF NOT EXISTS item_price_tiers (
            id         SERIAL PRIMARY KEY,
            uuid       UUID NOT NULL DEFAULT gen_random_uuid(),
            item_id    INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
            min_qty    INTEGER NOT NULL DEFAULT 1,
            price      NUMERIC NOT NULL,
            label      VARCHAR(100),
            created_at TIMESTAMPTZ DEFAULT NOW()
        )`);
        // Add uuid column to existing table if it was created before this migration
        await safeAlter(`ALTER TABLE item_price_tiers ADD COLUMN IF NOT EXISTS uuid UUID DEFAULT gen_random_uuid()`);
        // Backfill any null UUIDs from before
        await q(`UPDATE item_price_tiers SET uuid = gen_random_uuid() WHERE uuid IS NULL`).catch(() => { });
        console.log('  ✓ item_price_tiers table ensured');

        // ── items: hpp column ────────────────────────────────────────────────
        await safeAlter(`ALTER TABLE items ADD COLUMN IF NOT EXISTS hpp NUMERIC DEFAULT 0`);
        console.log('  ✓ items.hpp added');

        // ── items: is_taxable column ─────────────────────────────────────────
        await safeAlter(`ALTER TABLE items ADD COLUMN IF NOT EXISTS is_taxable BOOLEAN DEFAULT false`);
        console.log('  ✓ items.is_taxable added');

        // ── chart_of_accounts: category, currency, balance, company_id ───────
        await safeAlter(`ALTER TABLE chart_of_accounts ADD COLUMN IF NOT EXISTS category VARCHAR(100)`);
        await safeAlter(`ALTER TABLE chart_of_accounts ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'IDR'`);
        await safeAlter(`ALTER TABLE chart_of_accounts ADD COLUMN IF NOT EXISTS balance NUMERIC DEFAULT 0`);
        await safeAlter(`ALTER TABLE chart_of_accounts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`);
        // Fix COA type constraint to accept Indonesian type names
        try { await q(`ALTER TABLE chart_of_accounts DROP CONSTRAINT IF EXISTS chart_of_accounts_type_check`); } catch (e) { }
        console.log('  ✓ chart_of_accounts: category/currency/balance/updated_at added');

        // ── journal_entries: status column ────────────────────────────────────
        await safeAlter(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft','posted'))`);
        console.log('  ✓ journal_entries.status added');

        // ── purchase_bills: created_by + currency ─────────────────────────────
        await safeAlter(`ALTER TABLE purchase_bills ADD COLUMN IF NOT EXISTS created_by VARCHAR`);
        await safeAlter(`ALTER TABLE purchase_bills ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'IDR'`);
        console.log('  ✓ purchase_bills.created_by/currency added');

        // ── sales_orders: tax_rate + tax_amount ───────────────────────────────
        await safeAlter(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS tax_rate NUMERIC DEFAULT 0`);
        await safeAlter(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS tax_amount NUMERIC DEFAULT 0`);
        await safeAlter(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS extra_discount NUMERIC DEFAULT 0`);
        console.log('  ✓ sales_orders: tax_rate/tax_amount/extra_discount added');

        // ── Items: image storage refactor (local WebP files) ─────────────────
        // Drop old base64 text column (if exists), add structured image metadata
        await safeAlter(`ALTER TABLE items DROP COLUMN IF EXISTS image_url`);
        await safeAlter(`ALTER TABLE items ADD COLUMN IF NOT EXISTS image_id UUID`);
        await safeAlter(`ALTER TABLE items ADD COLUMN IF NOT EXISTS image_company_uuid VARCHAR(36)`);
        await safeAlter(`ALTER TABLE items ADD COLUMN IF NOT EXISTS image_size_bytes INTEGER`);
        console.log('  ✓ items: image_url dropped, image_id/image_company_uuid/image_size_bytes added');

        // ── Margin Defaults (Pricelist-First Architecture) ────────────────────
        // Global per-company margin % used to auto-fill sell price after Goods Receive
        await pool.query(`
            CREATE TABLE IF NOT EXISTS margin_defaults (
                id          SERIAL PRIMARY KEY,
                uuid        UUID NOT NULL DEFAULT gen_random_uuid(),
                company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
                margin_pct  NUMERIC(6,2) NOT NULL DEFAULT 20.00,
                updated_by  VARCHAR(100),
                updated_at  TIMESTAMPTZ DEFAULT NOW(),
                UNIQUE (company_id)
            );
        `);
        await safeAlter(`ALTER TABLE margin_defaults ADD COLUMN IF NOT EXISTS uuid UUID NOT NULL DEFAULT gen_random_uuid()`);
        console.log('  ✓ margin_defaults table created');

        console.log('  ✓ Multi-tenant isolation columns applied');

        console.log('✅ ALTER TABLE migrations applied\n');



        // List tables created
        const r = await pool.query(`
            SELECT table_name FROM information_schema.tables
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
            ORDER BY table_name
        `);
        console.log(`📊 Total tabel: ${r.rows.length}`);
        r.rows.forEach(t => console.log(`  ✓ ${t.table_name}`));
        console.log('\n✅ Migrasi selesai. Sekarang jalankan: node seed.js\n');
    } catch (e) {
        console.error('❌ Migrasi gagal:', e.message);
        process.exit(1);
    }
    await pool.end();
}

run();
