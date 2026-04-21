-- ═══════════════════════════════════════════════════════════════════════════════
-- RestoApp ERPsys — Full Schema Migration (v1.0)
-- Generated: 2026-04-21
-- ═══════════════════════════════════════════════════════════════════════════════
-- Usage:  node migrate_full.js   (atau psql -f migrations/001_full_schema.sql)
-- Aman dijalankan berulang kali (semua CREATE TABLE IF NOT EXISTS).
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── Extensions ──────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ═══════════════════════════════════════════════════════════════════════════════
-- PHASE 1: CORE FOUNDATION
-- Tables with zero FK dependencies (leaf nodes of the dependency graph)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1.1 Companies ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS companies (
    id                      SERIAL PRIMARY KEY,
    uuid                    UUID NOT NULL DEFAULT gen_random_uuid(),
    code                    VARCHAR(20) UNIQUE NOT NULL,
    short_name              VARCHAR(30),
    name                    VARCHAR NOT NULL,
    npwp                    VARCHAR(30),
    id_tempat_usaha         VARCHAR(10) DEFAULT '000000',
    address                 TEXT,
    phone                   VARCHAR,
    logo_url                VARCHAR,
    is_pkp                  BOOLEAN DEFAULT FALSE,
    pkp_since               DATE,
    efaktur_series_prefix   VARCHAR(3) DEFAULT '010',
    efaktur_last_number     INTEGER DEFAULT 0,
    pos_tax_pct             NUMERIC(5,2) DEFAULT 10,
    pos_service_pct         NUMERIC(5,2) DEFAULT 0,
    is_active               BOOLEAN DEFAULT TRUE,
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 1.2 Branches ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS branches (
    id          SERIAL PRIMARY KEY,
    uuid        UUID NOT NULL DEFAULT gen_random_uuid(),
    code        VARCHAR(30) NOT NULL,
    name        VARCHAR NOT NULL,
    address     TEXT,
    phone       VARCHAR,
    company_id  INTEGER REFERENCES companies(id),
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 1.3 Roles & Permissions ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS roles (
    id          SERIAL PRIMARY KEY,
    uuid        UUID NOT NULL DEFAULT gen_random_uuid(),
    name        VARCHAR NOT NULL,
    description TEXT,
    company_id  INTEGER REFERENCES companies(id),  -- NULL = platform-level
    company_uuid UUID,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_roles_name_company
    ON roles (name, COALESCE(company_id, 0));

CREATE TABLE IF NOT EXISTS permissions (
    id   SERIAL PRIMARY KEY,
    name VARCHAR NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS role_permissions (
    role_id       INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- ─── 1.4 Users ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id              SERIAL PRIMARY KEY,
    uuid            UUID NOT NULL DEFAULT gen_random_uuid(),
    username        VARCHAR NOT NULL UNIQUE,
    email           VARCHAR NOT NULL,
    name            VARCHAR NOT NULL,
    password_hash   VARCHAR NOT NULL,
    phone           VARCHAR(20),
    is_active       BOOLEAN DEFAULT TRUE,
    is_super_admin  BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email
    ON users(email) WHERE email IS NOT NULL;

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

CREATE TABLE IF NOT EXISTS user_companies (
    user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
    company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, company_id)
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token      TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- PHASE 2: MASTER DATA (Inventory, Items, Suppliers, Customers)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 2.1 Categories & Units ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
    id          SERIAL PRIMARY KEY,
    uuid        UUID NOT NULL DEFAULT gen_random_uuid(),
    code        VARCHAR NOT NULL,
    name        VARCHAR NOT NULL,
    description TEXT,
    company_id  INTEGER REFERENCES companies(id),
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_categories_code_company
    ON categories (code, company_id);

CREATE TABLE IF NOT EXISTS units (
    id          SERIAL PRIMARY KEY,
    uuid        UUID NOT NULL DEFAULT gen_random_uuid(),
    code        VARCHAR NOT NULL,
    name        VARCHAR NOT NULL,
    description TEXT,
    is_active   BOOLEAN DEFAULT TRUE,
    company_id  INTEGER REFERENCES companies(id),
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_units_code_company
    ON units (code, company_id);

-- ─── 2.2 Warehouses ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS warehouses (
    id          SERIAL PRIMARY KEY,
    uuid        UUID NOT NULL DEFAULT gen_random_uuid(),
    code        VARCHAR NOT NULL,
    name        VARCHAR NOT NULL,
    branch_id   INTEGER REFERENCES branches(id),
    address     TEXT,
    is_active   BOOLEAN DEFAULT TRUE,
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

-- ─── 2.3 Items ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS items (
    id                  SERIAL PRIMARY KEY,
    uuid                UUID NOT NULL DEFAULT gen_random_uuid(),
    code                VARCHAR NOT NULL,
    barcode             VARCHAR,
    name                VARCHAR NOT NULL,
    small_uom_id        INTEGER REFERENCES units(id),
    big_uom_id          INTEGER REFERENCES units(id),
    conversion_factor   INTEGER DEFAULT 1,
    buy_price           NUMERIC DEFAULT 0,
    sell_price          NUMERIC DEFAULT 0,
    hpp                 NUMERIC DEFAULT 0,
    min_stock           INTEGER DEFAULT 0,
    category_id         INTEGER REFERENCES categories(id),
    min_sell_qty        INTEGER DEFAULT 1,
    is_active           BOOLEAN DEFAULT TRUE,
    is_taxable          BOOLEAN DEFAULT TRUE,
    item_type           VARCHAR DEFAULT 'product',
    image_id            UUID,
    image_company_uuid  VARCHAR(36),
    image_size_bytes    INTEGER,
    company_id          INTEGER REFERENCES companies(id),
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_items_code_company
    ON items (code, company_id);

CREATE TABLE IF NOT EXISTS item_price_tiers (
    id         SERIAL PRIMARY KEY,
    uuid       UUID NOT NULL DEFAULT gen_random_uuid(),
    item_id    INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    name       VARCHAR,
    label      VARCHAR(100),
    min_qty    INTEGER NOT NULL DEFAULT 1,
    price      NUMERIC NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
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

-- ─── 2.4 Inventory & Stock ───────────────────────────────────────────────────
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

-- ─── 2.5 Suppliers ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS suppliers (
    id         SERIAL PRIMARY KEY,
    uuid       UUID NOT NULL DEFAULT gen_random_uuid(),
    code       VARCHAR NOT NULL,
    name       VARCHAR NOT NULL,
    address    TEXT,
    phone      VARCHAR,
    email      VARCHAR,
    is_pkp     BOOLEAN DEFAULT FALSE,
    npwp       VARCHAR(30),
    branch_id  INTEGER REFERENCES branches(id),
    company_id INTEGER REFERENCES companies(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_suppliers_code_company
    ON suppliers(code, company_id);

-- ─── 2.6 Batches (Expiry Tracking) ──────────────────────────────────────────
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
    gr_id         INTEGER,  -- FK added after goods_receives created
    supplier_id   INTEGER REFERENCES suppliers(id),
    notes         TEXT,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_batches_item_id     ON batches(item_id);
CREATE INDEX IF NOT EXISTS idx_batches_status      ON batches(status);
CREATE INDEX IF NOT EXISTS idx_batches_expiry_date ON batches(expiry_date);

-- ═══════════════════════════════════════════════════════════════════════════════
-- PHASE 3: PURCHASING MODULE
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS supplier_prices (
    id          SERIAL PRIMARY KEY,
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    item_id     INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    price       NUMERIC NOT NULL DEFAULT 0,
    min_qty     INTEGER NOT NULL DEFAULT 1,
    UNIQUE (supplier_id, item_id)
);

CREATE TABLE IF NOT EXISTS purchase_orders (
    id                SERIAL PRIMARY KEY,
    uuid              UUID NOT NULL DEFAULT gen_random_uuid(),
    number            VARCHAR NOT NULL UNIQUE,
    date              DATE NOT NULL,
    supplier_id       INTEGER REFERENCES suppliers(id),
    branch_id         INTEGER REFERENCES branches(id),
    warehouse_id      INTEGER REFERENCES warehouses(id),
    status            VARCHAR DEFAULT 'draft'
                      CHECK (status IN ('draft','pending','approved','rejected','processed','billed','paid')),
    approved_by       VARCHAR,
    currency          VARCHAR DEFAULT 'IDR',
    payment_method    VARCHAR(30) DEFAULT 'transfer',
    payment_term_days INTEGER DEFAULT 30,
    extra_discount    NUMERIC(5,2) DEFAULT 0,
    tax_rate          NUMERIC(5,2) DEFAULT 0,
    tax_amount        NUMERIC(15,2) DEFAULT 0,
    notes             TEXT,
    created_by        VARCHAR,
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchase_order_lines (
    id       SERIAL PRIMARY KEY,
    po_id    INTEGER REFERENCES purchase_orders(id),
    item_id  INTEGER REFERENCES items(id),
    qty      INTEGER NOT NULL,
    uom      VARCHAR,
    price    NUMERIC NOT NULL,
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
    batch_id INTEGER REFERENCES batches(id)
);

-- Add FK from batches to goods_receives (deferred because of circular dependency)
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
    currency     VARCHAR(10) DEFAULT 'IDR',
    created_by   VARCHAR,
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

-- ═══════════════════════════════════════════════════════════════════════════════
-- PHASE 4: SALES MODULE
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS customer_groups (
    id   SERIAL PRIMARY KEY,
    name VARCHAR NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS customers (
    id            SERIAL PRIMARY KEY,
    uuid          UUID NOT NULL DEFAULT gen_random_uuid(),
    code          VARCHAR NOT NULL,
    name          VARCHAR NOT NULL,
    address       TEXT,
    phone         VARCHAR,
    email         VARCHAR,
    is_pkp        BOOLEAN DEFAULT FALSE,
    npwp          VARCHAR(30),
    customer_type VARCHAR(30) DEFAULT 'regular',
    group_id      INTEGER REFERENCES customer_groups(id),
    branch_id     INTEGER REFERENCES branches(id),
    company_id    INTEGER REFERENCES companies(id),
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_code_company
    ON customers(code, company_id);

CREATE TABLE IF NOT EXISTS sales_orders (
    id             SERIAL PRIMARY KEY,
    uuid           UUID NOT NULL DEFAULT gen_random_uuid(),
    number         VARCHAR NOT NULL UNIQUE,
    date           DATE NOT NULL,
    customer_id    INTEGER REFERENCES customers(id),
    branch_id      INTEGER REFERENCES branches(id),
    status         VARCHAR DEFAULT 'draft'
                   CHECK (status IN ('draft','pending','approved','rejected','processed','paid')),
    approved_by    VARCHAR,
    currency       VARCHAR DEFAULT 'IDR',
    extra_discount NUMERIC(5,2) DEFAULT 0,
    tax_rate       NUMERIC(5,2) DEFAULT 0,
    tax_amount     NUMERIC(15,2) DEFAULT 0,
    notes          TEXT,
    created_by     VARCHAR,
    created_at     TIMESTAMPTZ DEFAULT NOW(),
    updated_at     TIMESTAMPTZ DEFAULT NOW()
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
    id                    SERIAL PRIMARY KEY,
    uuid                  UUID NOT NULL DEFAULT gen_random_uuid(),
    number                VARCHAR NOT NULL UNIQUE,
    so_id                 INTEGER REFERENCES sales_orders(id),
    date                  DATE,
    due_date              DATE,
    branch_id             INTEGER REFERENCES branches(id),
    status                VARCHAR DEFAULT 'unpaid'
                          CHECK (status IN ('unpaid','partial','paid')),
    subtotal              NUMERIC(15,2) DEFAULT 0,
    extra_discount        NUMERIC(5,2) DEFAULT 0,
    tax_rate              NUMERIC(5,2) DEFAULT 0,
    tax_amount            NUMERIC(15,2) DEFAULT 0,
    total                 NUMERIC DEFAULT 0,
    currency              VARCHAR DEFAULT 'IDR',
    faktur_pajak_number   VARCHAR(20),
    kode_transaksi        VARCHAR(2) DEFAULT '01',
    npwp_pembeli          VARCHAR(30),
    nama_pembeli          VARCHAR,
    notes                 TEXT,
    created_by            VARCHAR,
    created_at            TIMESTAMPTZ DEFAULT NOW(),
    updated_at            TIMESTAMPTZ DEFAULT NOW()
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

-- ═══════════════════════════════════════════════════════════════════════════════
-- PHASE 5: POS & STOCK OPERATIONS
-- ═══════════════════════════════════════════════════════════════════════════════

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

CREATE TABLE IF NOT EXISTS pos_sessions (
    id             SERIAL PRIMARY KEY,
    uuid           UUID NOT NULL DEFAULT gen_random_uuid(),
    company_id     INTEGER REFERENCES companies(id),
    branch_id      INTEGER REFERENCES branches(id),
    user_id        INTEGER REFERENCES users(id),
    open_date      TIMESTAMPTZ DEFAULT NOW(),
    close_date     TIMESTAMPTZ,
    opening_cash   NUMERIC DEFAULT 0,
    total_cash_in  NUMERIC(15,2) DEFAULT 0,
    total_cash_out NUMERIC(15,2) DEFAULT 0,
    expected_cash  NUMERIC(15,2) DEFAULT 0,
    actual_cash    NUMERIC(15,2),
    difference     NUMERIC(15,2),
    status         VARCHAR DEFAULT 'open',
    notes          TEXT,
    created_at     TIMESTAMPTZ DEFAULT NOW(),
    updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_transfers (
    id                SERIAL PRIMARY KEY,
    uuid              UUID NOT NULL DEFAULT gen_random_uuid(),
    number            VARCHAR NOT NULL UNIQUE,
    date              DATE NOT NULL,
    from_warehouse_id INTEGER REFERENCES warehouses(id),
    to_warehouse_id   INTEGER REFERENCES warehouses(id),
    branch_id         INTEGER REFERENCES branches(id),
    status            VARCHAR DEFAULT 'draft'
                      CHECK (status IN ('draft','pending','approved','shipping','received')),
    notes             TEXT,
    created_by        VARCHAR,
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW()
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
                 CHECK (status IN ('draft','pending','approved','rejected')),
    approved_by  VARCHAR,
    submitted_by VARCHAR,
    rejected_by  VARCHAR,
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

-- ═══════════════════════════════════════════════════════════════════════════════
-- PHASE 6: ACCOUNTING MODULE
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS chart_of_accounts (
    id          SERIAL PRIMARY KEY,
    uuid        UUID NOT NULL DEFAULT gen_random_uuid(),
    code        VARCHAR NOT NULL,
    name        VARCHAR NOT NULL,
    type        VARCHAR NOT NULL,
    category    VARCHAR(100),
    currency    VARCHAR(10) DEFAULT 'IDR',
    balance     NUMERIC DEFAULT 0,
    parent_id   INTEGER REFERENCES chart_of_accounts(id),
    branch_id   INTEGER REFERENCES branches(id),
    company_id  INTEGER REFERENCES companies(id),
    is_active   BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_coa_code_company
    ON chart_of_accounts (code, company_id);

CREATE TABLE IF NOT EXISTS journal_entries (
    id          SERIAL PRIMARY KEY,
    uuid        UUID NOT NULL DEFAULT gen_random_uuid(),
    number      VARCHAR NOT NULL UNIQUE,
    date        DATE NOT NULL,
    description TEXT,
    status      VARCHAR(20) DEFAULT 'draft',
    branch_id   INTEGER REFERENCES branches(id),
    created_by  VARCHAR,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS journal_lines (
    id          SERIAL PRIMARY KEY,
    journal_id  INTEGER NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
    account_id  INTEGER NOT NULL REFERENCES chart_of_accounts(id),
    debit       NUMERIC DEFAULT 0,
    credit      NUMERIC DEFAULT 0,
    description TEXT
);

CREATE TABLE IF NOT EXISTS tax_configs (
    id             SERIAL PRIMARY KEY,
    uuid           UUID NOT NULL DEFAULT gen_random_uuid(),
    name           VARCHAR(50) NOT NULL,
    rate           NUMERIC(5,2) NOT NULL DEFAULT 0,
    is_active      BOOLEAN DEFAULT FALSE,
    effective_date DATE,
    notes          TEXT,
    company_id     INTEGER REFERENCES companies(id),
    created_at     TIMESTAMPTZ DEFAULT NOW(),
    updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS closing_periods (
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
);

CREATE TABLE IF NOT EXISTS margin_defaults (
    id          SERIAL PRIMARY KEY,
    uuid        UUID NOT NULL DEFAULT gen_random_uuid(),
    company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    margin_pct  NUMERIC(6,2) NOT NULL DEFAULT 20.00,
    updated_by  VARCHAR(100),
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (company_id)
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- PHASE 7: UTILITY TABLES
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS auto_number_counters (
    id         SERIAL PRIMARY KEY,
    prefix     VARCHAR NOT NULL,
    year       VARCHAR(4) NOT NULL,
    letter     CHAR(1) NOT NULL DEFAULT 'A',
    counter    INTEGER NOT NULL DEFAULT 0,
    company_id INTEGER REFERENCES companies(id),
    UNIQUE (prefix, year, letter)
);

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

CREATE TABLE IF NOT EXISTS company_settings (
    id                     SERIAL PRIMARY KEY,
    uuid                   UUID NOT NULL DEFAULT gen_random_uuid(),
    branch_id              INTEGER REFERENCES branches(id) UNIQUE,
    company_name           VARCHAR NOT NULL DEFAULT 'CV Demo ERP',
    npwp                   VARCHAR(30),
    is_pkp                 BOOLEAN DEFAULT TRUE,
    pkp_since              DATE,
    address                TEXT,
    phone                  VARCHAR,
    efaktur_series_prefix  VARCHAR(3) DEFAULT '010',
    efaktur_last_number    INTEGER DEFAULT 0,
    created_at             TIMESTAMPTZ DEFAULT NOW(),
    updated_at             TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS error_logs (
    id         SERIAL PRIMARY KEY,
    message    TEXT,
    stack      TEXT,
    module     VARCHAR,
    user_id    INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- PHASE 8: RESTAURANT (RESTO) MODULE
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 8.1 Rooms & Tables ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS resto_rooms (
    id          SERIAL PRIMARY KEY,
    uuid        UUID NOT NULL DEFAULT gen_random_uuid(),
    company_id  INTEGER NOT NULL REFERENCES companies(id),
    name        VARCHAR NOT NULL,
    sort_order  INTEGER DEFAULT 0,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS resto_tables (
    id          SERIAL PRIMARY KEY,
    uuid        UUID NOT NULL DEFAULT gen_random_uuid(),
    company_id  INTEGER NOT NULL REFERENCES companies(id),
    room_id     INTEGER REFERENCES resto_rooms(id) ON DELETE SET NULL,
    number      VARCHAR NOT NULL,
    capacity    INTEGER DEFAULT 4,
    status      VARCHAR DEFAULT 'available',
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 8.2 Menu Items & Recipes ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS resto_menu_items (
    id             SERIAL PRIMARY KEY,
    uuid           UUID NOT NULL DEFAULT gen_random_uuid(),
    company_id     INTEGER NOT NULL REFERENCES companies(id),
    name           VARCHAR NOT NULL,
    description    TEXT,
    category       VARCHAR,
    price          NUMERIC DEFAULT 0,
    image_url      VARCHAR,
    is_available   BOOLEAN DEFAULT TRUE,
    sort_order     INTEGER DEFAULT 0,
    recipe_cost    NUMERIC DEFAULT 0,
    labor_cost     NUMERIC DEFAULT 0,
    overhead_cost  NUMERIC DEFAULT 0,
    cogs           NUMERIC DEFAULT 0,
    created_at     TIMESTAMPTZ DEFAULT NOW(),
    updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS menu_recipes (
    id            SERIAL PRIMARY KEY,
    uuid          UUID NOT NULL DEFAULT gen_random_uuid(),
    menu_item_id  INTEGER NOT NULL REFERENCES resto_menu_items(id) ON DELETE CASCADE,
    item_id       INTEGER NOT NULL REFERENCES items(id),
    qty           NUMERIC NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 8.3 Waiters ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS resto_waiters (
    id             SERIAL PRIMARY KEY,
    uuid           UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    company_id     INTEGER NOT NULL REFERENCES companies(id),
    name           VARCHAR(100) NOT NULL,
    phone          VARCHAR(20),
    pin            VARCHAR(255),
    commission_pct NUMERIC(5,2) DEFAULT NULL,
    is_active      BOOLEAN DEFAULT TRUE,
    created_at     TIMESTAMPTZ DEFAULT NOW(),
    updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS resto_waiter_attendance (
    id            SERIAL PRIMARY KEY,
    uuid          UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    waiter_id     INTEGER NOT NULL REFERENCES resto_waiters(id) ON DELETE CASCADE,
    tanggal       DATE NOT NULL,
    waktu_masuk   TIMESTAMPTZ,
    waktu_pulang  TIMESTAMPTZ,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 8.4 Orders & Payments ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS resto_orders (
    id              SERIAL PRIMARY KEY,
    uuid            UUID NOT NULL DEFAULT gen_random_uuid(),
    company_id      INTEGER NOT NULL REFERENCES companies(id),
    branch_id       INTEGER REFERENCES branches(id),
    table_id        INTEGER REFERENCES resto_tables(id),
    order_number    VARCHAR NOT NULL,
    customer_name   VARCHAR,
    guest_count     INTEGER DEFAULT 1,
    notes           TEXT,
    cashier_id      INTEGER REFERENCES users(id),
    waiter_id       INTEGER,
    session_id      INTEGER,
    status          VARCHAR DEFAULT 'confirmed',
    subtotal        NUMERIC DEFAULT 0,
    discount_pct    NUMERIC(5,2) DEFAULT 0,
    service_pct     NUMERIC(5,2) DEFAULT 0,
    tax_pct         NUMERIC(5,2) DEFAULT 0,
    total           NUMERIC DEFAULT 0,
    payment_method  VARCHAR,
    cash_paid       NUMERIC DEFAULT 0,
    change          NUMERIC DEFAULT 0,
    confirmed_at    TIMESTAMPTZ,
    preparing_at    TIMESTAMPTZ,
    paid_at         TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS resto_order_items (
    id          SERIAL PRIMARY KEY,
    uuid        UUID NOT NULL DEFAULT gen_random_uuid(),
    order_id    INTEGER NOT NULL REFERENCES resto_orders(id) ON DELETE CASCADE,
    item_id     INTEGER,   -- FK ke resto_menu_items.id
    item_name   VARCHAR,
    qty         INTEGER DEFAULT 1,
    price       NUMERIC DEFAULT 0,
    subtotal    NUMERIC DEFAULT 0,
    notes       TEXT,
    status      VARCHAR DEFAULT 'pending',
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS resto_order_payments (
    id          SERIAL PRIMARY KEY,
    order_id    INTEGER NOT NULL REFERENCES resto_orders(id) ON DELETE CASCADE,
    amount      NUMERIC(15,2) NOT NULL,
    method      VARCHAR(50) NOT NULL DEFAULT 'cash',
    cashier_id  INTEGER REFERENCES users(id),
    notes       TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- PHASE 9: HR MODULE — Employees & Organisation Structure
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 9.1 Organisation Structure (UUID-based PK) ──────────────────────────────
CREATE TABLE IF NOT EXISTS departments (
    uuid         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_uuid UUID NOT NULL,
    nama         VARCHAR NOT NULL,
    kode         VARCHAR,
    deskripsi    TEXT,
    is_deleted   BOOLEAN DEFAULT FALSE,
    created_by   VARCHAR,
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS divisions (
    uuid            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_uuid    UUID NOT NULL,
    department_uuid UUID NOT NULL REFERENCES departments(uuid),
    nama            VARCHAR NOT NULL,
    kode            VARCHAR,
    deskripsi       TEXT,
    is_deleted      BOOLEAN DEFAULT FALSE,
    created_by      VARCHAR,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS positions (
    uuid         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_uuid UUID NOT NULL,
    nama         VARCHAR NOT NULL,
    kode         VARCHAR,
    level        INTEGER DEFAULT 1,
    deskripsi    TEXT,
    is_deleted   BOOLEAN DEFAULT FALSE,
    created_by   VARCHAR,
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 9.2 Employees ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employees (
    id                SERIAL PRIMARY KEY,
    uuid              UUID NOT NULL DEFAULT gen_random_uuid(),
    nik               VARCHAR NOT NULL,
    nama_lengkap      VARCHAR NOT NULL,
    nama_panggilan    VARCHAR,
    gender            VARCHAR(20),
    tanggal_lahir     DATE,
    tempat_lahir      VARCHAR,
    agama             VARCHAR(30),
    status_kawin      VARCHAR(30),
    golongan_darah    VARCHAR(5),
    email_kerja       VARCHAR,
    email_pribadi     VARCHAR,
    no_hp             VARCHAR(20),
    no_hp_darurat     VARCHAR(20),
    nama_darurat      VARCHAR,
    hubungan_darurat  VARCHAR,
    alamat_ktp        TEXT,
    kota_ktp          VARCHAR,
    provinsi_ktp      VARCHAR,
    kode_pos_ktp      VARCHAR(10),
    alamat_domisili   TEXT,
    foto_url          VARCHAR,
    branch_id         INTEGER REFERENCES branches(id),
    company_id        INTEGER REFERENCES companies(id),
    company_uuid      UUID NOT NULL,
    user_id           INTEGER REFERENCES users(id) ON DELETE SET NULL,
    status            VARCHAR DEFAULT 'aktif',
    is_active         BOOLEAN DEFAULT TRUE,
    created_by        VARCHAR,
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (nik, company_uuid)
);

-- ─── 9.3 Employee Relations (all CASCADE on employee delete) ─────────────────
CREATE TABLE IF NOT EXISTS employee_identities (
    id                        SERIAL PRIMARY KEY,
    employee_id               INTEGER NOT NULL UNIQUE REFERENCES employees(id) ON DELETE CASCADE,
    no_ktp                    VARCHAR(20),
    no_npwp                   VARCHAR(30),
    no_bpjs_kesehatan         VARCHAR(20),
    no_bpjs_ketenagakerjaan   VARCHAR(20),
    no_rekening               VARCHAR(30),
    nama_bank                 VARCHAR(50),
    nama_rekening             VARCHAR(100),
    is_foreign                BOOLEAN DEFAULT FALSE,
    no_passport               VARCHAR(30),
    created_at                TIMESTAMPTZ DEFAULT NOW(),
    updated_at                TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS employee_family (
    id             SERIAL PRIMARY KEY,
    employee_id    INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    nama           VARCHAR NOT NULL,
    hubungan       VARCHAR NOT NULL,
    tanggal_lahir  DATE,
    is_tanggungan  BOOLEAN DEFAULT FALSE,
    created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS employee_jobs (
    id              SERIAL PRIMARY KEY,
    employee_id     INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    jabatan         VARCHAR,
    departemen      VARCHAR,
    divisi          VARCHAR,
    branch_id       INTEGER REFERENCES branches(id),
    jenis_karyawan  VARCHAR(30),
    tanggal_mulai   DATE,
    tanggal_selesai DATE,
    gaji_pokok      NUMERIC DEFAULT 0,
    is_current      BOOLEAN DEFAULT FALSE,
    keterangan      TEXT,
    role_id         INTEGER REFERENCES roles(id),
    created_by      VARCHAR,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS employee_documents (
    id                  SERIAL PRIMARY KEY,
    uuid                UUID NOT NULL DEFAULT gen_random_uuid(),
    employee_id         INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    jenis_dokumen       VARCHAR NOT NULL,
    nomor_dokumen       VARCHAR,
    file_url            VARCHAR,
    file_name           VARCHAR,
    file_size           INTEGER,
    tanggal_terbit      DATE,
    tanggal_kadaluarsa  DATE,
    catatan             TEXT,
    created_by          VARCHAR,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- PHASE 10: HR MODULE — Attendance & Shift Management
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS shift_types (
    id               SERIAL PRIMARY KEY,
    company_id       INTEGER REFERENCES companies(id),
    company_uuid     UUID NOT NULL,
    nama_shift       VARCHAR NOT NULL,
    jam_masuk        TIME NOT NULL,
    jam_pulang       TIME NOT NULL,
    toleransi_menit  INTEGER DEFAULT 15,
    is_overnight     BOOLEAN DEFAULT FALSE,
    is_active        BOOLEAN DEFAULT TRUE,
    created_by       VARCHAR,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS employee_schedules (
    id             SERIAL PRIMARY KEY,
    employee_id    INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    shift_type_id  INTEGER NOT NULL REFERENCES shift_types(id),
    tanggal        DATE NOT NULL,
    keterangan     TEXT,
    created_by     VARCHAR,
    created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS attendance_records (
    id                   SERIAL PRIMARY KEY,
    uuid                 UUID NOT NULL DEFAULT gen_random_uuid(),
    employee_id          INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    tanggal              DATE NOT NULL,
    session_no           INTEGER DEFAULT 1,
    waktu_masuk          TIMESTAMPTZ,
    waktu_pulang         TIMESTAMPTZ,
    shift_type_id        INTEGER REFERENCES shift_types(id),
    status               VARCHAR DEFAULT 'hadir',
    terlambat_menit      INTEGER DEFAULT 0,
    pulang_awal_menit    INTEGER DEFAULT 0,
    lat_masuk            NUMERIC,
    lon_masuk            NUMERIC,
    lokasi_alamat_masuk  TEXT,
    catatan              TEXT,
    created_by           VARCHAR,
    created_at           TIMESTAMPTZ DEFAULT NOW(),
    updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- PHASE 11: PAYROLL MODULE
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 11.1 Employee Payroll Settings ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employee_payroll_settings (
    id                SERIAL PRIMARY KEY,
    employee_id       INTEGER NOT NULL UNIQUE REFERENCES employees(id) ON DELETE CASCADE,
    ptkp_status       VARCHAR(10) DEFAULT 'TK/0',
    pph21_mode        VARCHAR(20) DEFAULT 'ter',
    pph21_aktif       BOOLEAN DEFAULT FALSE,
    pph21_nominal     NUMERIC DEFAULT 0,
    bpjs_kes_aktif    BOOLEAN DEFAULT FALSE,
    bpjs_kes_persen   NUMERIC(5,2) DEFAULT 1.00,
    jht_aktif         BOOLEAN DEFAULT FALSE,
    jht_persen        NUMERIC(5,2) DEFAULT 2.00,
    jkk_aktif         BOOLEAN DEFAULT FALSE,
    jkk_persen        NUMERIC(5,2) DEFAULT 0.24,
    jkm_aktif         BOOLEAN DEFAULT FALSE,
    jkm_persen        NUMERIC(5,2) DEFAULT 0.30,
    jp_aktif          BOOLEAN DEFAULT FALSE,
    jp_persen         NUMERIC(5,2) DEFAULT 1.00,
    tax_object_code   VARCHAR(20),
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS employee_payroll_custom_deductions (
    id          SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    nama        VARCHAR NOT NULL,
    tipe        VARCHAR(20) DEFAULT 'nominal',
    nilai       NUMERIC DEFAULT 0,
    aktif       BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS employee_payroll_custom_allowances (
    id          SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    nama        VARCHAR NOT NULL,
    tipe        VARCHAR(20) DEFAULT 'nominal',
    nilai       NUMERIC DEFAULT 0,
    aktif       BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 11.2 Payroll Periods & Slips ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_periods (
    id               SERIAL PRIMARY KEY,
    company_id       INTEGER REFERENCES companies(id),
    company_uuid     UUID NOT NULL,
    bulan            INTEGER NOT NULL,
    tahun            INTEGER NOT NULL,
    label            VARCHAR,
    status           VARCHAR DEFAULT 'draft',
    total_gaji       NUMERIC DEFAULT 0,
    total_karyawan   INTEGER DEFAULT 0,
    withholding_date DATE,
    finalized_at     TIMESTAMPTZ,
    finalized_by     VARCHAR,
    created_by       VARCHAR,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    updated_at       TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (company_uuid, bulan, tahun)
);

CREATE TABLE IF NOT EXISTS payroll_slips (
    id               SERIAL PRIMARY KEY,
    period_id        INTEGER NOT NULL REFERENCES payroll_periods(id) ON DELETE CASCADE,
    company_id       INTEGER REFERENCES companies(id),
    company_uuid     UUID NOT NULL,
    employee_id      INTEGER NOT NULL REFERENCES employees(id),
    gaji_pokok       NUMERIC DEFAULT 0,
    total_tunjangan  NUMERIC DEFAULT 0,
    total_potongan   NUMERIC DEFAULT 0,
    total_kasbon     NUMERIC DEFAULT 0,
    net_salary       NUMERIC DEFAULT 0,
    status           VARCHAR DEFAULT 'draft',
    catatan          TEXT,
    approved_by      VARCHAR,
    approved_at      TIMESTAMPTZ,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payroll_allowances (
    id      SERIAL PRIMARY KEY,
    slip_id INTEGER NOT NULL REFERENCES payroll_slips(id) ON DELETE CASCADE,
    nama    VARCHAR NOT NULL,
    amount  NUMERIC DEFAULT 0
);

CREATE TABLE IF NOT EXISTS payroll_deductions (
    id      SERIAL PRIMARY KEY,
    slip_id INTEGER NOT NULL REFERENCES payroll_slips(id) ON DELETE CASCADE,
    nama    VARCHAR NOT NULL,
    amount  NUMERIC DEFAULT 0
);

-- ─── 11.3 Salary Advances (Kasbon) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS salary_advances (
    id                    SERIAL PRIMARY KEY,
    nomor                 VARCHAR NOT NULL,
    company_id            INTEGER REFERENCES companies(id),
    company_uuid          UUID NOT NULL,
    employee_id           INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    amount                NUMERIC NOT NULL,
    alasan                TEXT,
    jumlah_cicilan_bulan  INTEGER DEFAULT 1,
    amount_per_cicilan    NUMERIC DEFAULT 0,
    cicilan_mulai_bulan   INTEGER,
    cicilan_mulai_tahun   INTEGER,
    sisa_cicilan          INTEGER DEFAULT 0,
    status                VARCHAR DEFAULT 'draft',
    reviewed_by           INTEGER REFERENCES users(id),
    reviewed_at           TIMESTAMPTZ,
    review_notes          TEXT,
    created_by            VARCHAR,
    created_at            TIMESTAMPTZ DEFAULT NOW(),
    updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS advance_cicilan (
    id          SERIAL PRIMARY KEY,
    advance_id  INTEGER NOT NULL REFERENCES salary_advances(id) ON DELETE CASCADE,
    urutan      INTEGER NOT NULL,
    bulan       INTEGER NOT NULL,
    tahun       INTEGER NOT NULL,
    amount      NUMERIC DEFAULT 0,
    status      VARCHAR DEFAULT 'pending',
    slip_id     INTEGER REFERENCES payroll_slips(id) ON DELETE SET NULL,
    period_id   INTEGER REFERENCES payroll_periods(id),
    paid_at     TIMESTAMPTZ,
    UNIQUE (advance_id, urutan)
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- PHASE 12: LEAVE MANAGEMENT MODULE
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS leave_types (
    id              SERIAL PRIMARY KEY,
    company_id      INTEGER REFERENCES companies(id),
    company_uuid    UUID NOT NULL,
    name            VARCHAR NOT NULL,
    code            VARCHAR NOT NULL,
    quota_days      INTEGER NOT NULL DEFAULT 12,
    is_paid         BOOLEAN DEFAULT TRUE,
    requires_doc    BOOLEAN DEFAULT FALSE,
    color           VARCHAR DEFAULT '#6366f1',
    description     TEXT,
    count_saturday  BOOLEAN DEFAULT FALSE,
    count_sunday    BOOLEAN DEFAULT FALSE,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS leave_balances (
    id              SERIAL PRIMARY KEY,
    company_id      INTEGER REFERENCES companies(id),
    company_uuid    UUID NOT NULL,
    employee_id     INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    leave_type_id   INTEGER NOT NULL REFERENCES leave_types(id),
    year            INTEGER NOT NULL,
    quota_days      INTEGER DEFAULT 0,
    used_days       INTEGER DEFAULT 0,
    carry_over_days INTEGER DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (employee_id, leave_type_id, year)
);

CREATE TABLE IF NOT EXISTS leave_requests (
    id              SERIAL PRIMARY KEY,
    uuid            UUID NOT NULL DEFAULT gen_random_uuid(),
    number          VARCHAR NOT NULL,
    company_id      INTEGER REFERENCES companies(id),
    company_uuid    UUID NOT NULL,
    employee_id     INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    leave_type_id   INTEGER NOT NULL REFERENCES leave_types(id),
    start_date      DATE NOT NULL,
    end_date        DATE NOT NULL,
    total_days      INTEGER NOT NULL,
    reason          TEXT,
    attachment_path VARCHAR,
    status          VARCHAR DEFAULT 'draft',
    reviewed_by     INTEGER REFERENCES users(id),
    reviewed_at     TIMESTAMPTZ,
    review_notes    TEXT,
    created_by      VARCHAR,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- PHASE 13: CLAIM MODULE
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS claim_types (
    id           SERIAL PRIMARY KEY,
    company_id   INTEGER REFERENCES companies(id),
    company_uuid UUID NOT NULL,
    nama         VARCHAR NOT NULL,
    kode         VARCHAR,
    deskripsi    TEXT,
    max_amount   NUMERIC,
    is_deleted   BOOLEAN DEFAULT FALSE,
    created_by   VARCHAR,
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS claims (
    id              SERIAL PRIMARY KEY,
    company_id      INTEGER REFERENCES companies(id),
    company_uuid    UUID NOT NULL,
    claim_type_id   INTEGER NOT NULL REFERENCES claim_types(id),
    user_id         INTEGER NOT NULL REFERENCES users(id),
    tanggal         DATE NOT NULL,
    detail          TEXT,
    amount          NUMERIC,
    bukti_filename  VARCHAR,
    bukti_ext       VARCHAR,
    bukti_path      VARCHAR,
    status          VARCHAR DEFAULT 'pending',
    catatan_review  TEXT,
    reviewed_by     VARCHAR,
    reviewed_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- PHASE 14: SPECIAL DISBURSEMENTS (THR, Bonus)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS special_disbursement_batches (
    id               SERIAL PRIMARY KEY,
    company_id       INTEGER REFERENCES companies(id),
    company_uuid     UUID NOT NULL,
    jenis            VARCHAR NOT NULL CHECK (jenis IN ('thr','bonus','other')),
    label            VARCHAR NOT NULL,
    tanggal_bayar    DATE NOT NULL,
    bonus_mode       VARCHAR DEFAULT 'manual',
    bonus_nilai      NUMERIC,
    catatan          TEXT,
    status           VARCHAR DEFAULT 'draft',
    total_karyawan   INTEGER DEFAULT 0,
    total_nominal    NUMERIC DEFAULT 0,
    finalized_at     TIMESTAMPTZ,
    finalized_by     VARCHAR,
    created_by       VARCHAR,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS special_disbursement_slips (
    id                    SERIAL PRIMARY KEY,
    batch_id              INTEGER NOT NULL REFERENCES special_disbursement_batches(id) ON DELETE CASCADE,
    company_id            INTEGER REFERENCES companies(id),
    company_uuid          UUID NOT NULL,
    employee_id           INTEGER NOT NULL REFERENCES employees(id),
    gaji_pokok_snapshot   NUMERIC DEFAULT 0,
    masa_kerja_bulan      INTEGER DEFAULT 0,
    gross_amount          NUMERIC DEFAULT 0,
    pph21_amount          NUMERIC DEFAULT 0,
    potongan_lain         NUMERIC DEFAULT 0,
    net_amount            NUMERIC DEFAULT 0,
    status                VARCHAR DEFAULT 'draft',
    catatan               TEXT,
    approved_by           VARCHAR,
    approved_at           TIMESTAMPTZ,
    created_at            TIMESTAMPTZ DEFAULT NOW(),
    updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- PHASE 15: HR CONFIGURATION & HOLIDAYS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS hr_config (
    id            SERIAL PRIMARY KEY,
    company_id    INTEGER REFERENCES companies(id),
    company_uuid  UUID NOT NULL UNIQUE,
    country_code  VARCHAR(5) DEFAULT 'ID',
    timezone      VARCHAR DEFAULT 'Asia/Jakarta',
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hr_holiday_cache (
    id            SERIAL PRIMARY KEY,
    company_id    INTEGER REFERENCES companies(id),
    company_uuid  UUID NOT NULL,
    country_code  VARCHAR(5) NOT NULL,
    year          INTEGER NOT NULL,
    holidays      JSONB DEFAULT '[]',
    source        VARCHAR DEFAULT 'calendarific',
    fetched_at    TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (company_uuid, country_code, year)
);

CREATE TABLE IF NOT EXISTS hr_custom_holidays (
    id            SERIAL PRIMARY KEY,
    company_id    INTEGER REFERENCES companies(id),
    company_uuid  UUID NOT NULL,
    date          DATE NOT NULL,
    name          VARCHAR NOT NULL,
    description   TEXT,
    type          VARCHAR DEFAULT 'holiday',
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (company_id, date, name)
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- DONE — All tables created.
-- ═══════════════════════════════════════════════════════════════════════════════
