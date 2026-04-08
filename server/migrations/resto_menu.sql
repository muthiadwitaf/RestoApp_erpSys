-- =====================================================
-- RESTO MENU — Katalog / Daftar Menu Restoran
-- Tabel baru terpisah dari inventory items
-- =====================================================

CREATE TABLE IF NOT EXISTS resto_menu_items (
    id              SERIAL PRIMARY KEY,
    uuid            UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
    company_id      INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    category        VARCHAR(100) DEFAULT 'Umum',
    name            VARCHAR(200) NOT NULL,
    description     TEXT,
    price           NUMERIC(15,2) DEFAULT 0,
    image_url       TEXT,
    is_available    BOOLEAN DEFAULT true,
    sort_order      INTEGER DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_resto_menu_company ON resto_menu_items(company_id);
CREATE INDEX IF NOT EXISTS idx_resto_menu_category ON resto_menu_items(category);
