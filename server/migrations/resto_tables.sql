-- =====================================================
-- POS RESTO MODULE — Database Migration
-- Tabel baru untuk modul restoran (denah meja + pesanan)
-- TIDAK mengubah tabel yang sudah ada
-- =====================================================

-- 1. Ruangan (area restoran)
CREATE TABLE IF NOT EXISTS resto_rooms (
    id          SERIAL PRIMARY KEY,
    uuid        UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
    company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name        VARCHAR(100) NOT NULL,
    description TEXT,
    sort_order  INTEGER DEFAULT 0,
    is_active   BOOLEAN DEFAULT true,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Meja restoran
CREATE TABLE IF NOT EXISTS resto_tables (
    id          SERIAL PRIMARY KEY,
    uuid        UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
    company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    room_id     INTEGER REFERENCES resto_rooms(id) ON DELETE SET NULL,
    number      VARCHAR(20) NOT NULL,
    label       VARCHAR(50),
    capacity    INTEGER DEFAULT 4,
    shape       VARCHAR(20) DEFAULT 'square',  -- square, round, rectangle
    pos_x       NUMERIC(8,2) DEFAULT 0,
    pos_y       NUMERIC(8,2) DEFAULT 0,
    width       NUMERIC(8,2) DEFAULT 80,
    height      NUMERIC(8,2) DEFAULT 80,
    status      VARCHAR(20) DEFAULT 'available', -- available, occupied, reserved, cleaning
    is_active   BOOLEAN DEFAULT true,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Pesanan restoran
CREATE TABLE IF NOT EXISTS resto_orders (
    id              SERIAL PRIMARY KEY,
    uuid            UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
    company_id      INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id       INTEGER REFERENCES branches(id) ON DELETE SET NULL,
    table_id        INTEGER REFERENCES resto_tables(id) ON DELETE SET NULL,
    order_number    VARCHAR(50) NOT NULL,
    status          VARCHAR(20) DEFAULT 'new',  -- new, cooking, ready, served, paid, cancelled
    customer_name   VARCHAR(100),
    guest_count     INTEGER DEFAULT 1,
    notes           TEXT,
    subtotal        NUMERIC(15,2) DEFAULT 0,
    discount_pct    NUMERIC(5,2) DEFAULT 0,
    tax_pct         NUMERIC(5,2) DEFAULT 0,
    total           NUMERIC(15,2) DEFAULT 0,
    payment_method  VARCHAR(20),
    cash_paid       NUMERIC(15,2) DEFAULT 0,
    change          NUMERIC(15,2) DEFAULT 0,
    cashier_id      INTEGER REFERENCES users(id),
    waiter_id       INTEGER REFERENCES users(id),
    ordered_at      TIMESTAMPTZ DEFAULT NOW(),
    served_at       TIMESTAMPTZ,
    paid_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Item pesanan restoran
CREATE TABLE IF NOT EXISTS resto_order_items (
    id          SERIAL PRIMARY KEY,
    uuid        UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
    order_id    INTEGER NOT NULL REFERENCES resto_orders(id) ON DELETE CASCADE,
    item_id     INTEGER REFERENCES items(id),
    item_name   VARCHAR(200) NOT NULL,
    qty         NUMERIC(10,2) DEFAULT 1,
    price       NUMERIC(15,2) DEFAULT 0,
    subtotal    NUMERIC(15,2) DEFAULT 0,
    notes       TEXT,
    status      VARCHAR(20) DEFAULT 'pending',  -- pending, cooking, ready, served, cancelled
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_resto_tables_company ON resto_tables(company_id);
CREATE INDEX IF NOT EXISTS idx_resto_tables_room ON resto_tables(room_id);
CREATE INDEX IF NOT EXISTS idx_resto_orders_company ON resto_orders(company_id);
CREATE INDEX IF NOT EXISTS idx_resto_orders_table ON resto_orders(table_id);
CREATE INDEX IF NOT EXISTS idx_resto_orders_status ON resto_orders(status);
CREATE INDEX IF NOT EXISTS idx_resto_order_items_order ON resto_order_items(order_id);
