/**
 * Migration: create_deliveries_table
 * Membuat tabel deliveries dan delivery_gi_links untuk fitur Delivery Order.
 */
const { query } = require('../src/config/db');

async function run() {
    console.log('Running migration: create_deliveries_table...');

    // Tabel utama delivery
    await query(`
        CREATE TABLE IF NOT EXISTS deliveries (
            id              SERIAL PRIMARY KEY,
            uuid            UUID DEFAULT gen_random_uuid() NOT NULL UNIQUE,
            number          VARCHAR(50) NOT NULL,
            date            DATE NOT NULL DEFAULT CURRENT_DATE,
            branch_id       INTEGER REFERENCES branches(id),
            status          VARCHAR(30) NOT NULL DEFAULT 'draft',
            driver_name     VARCHAR(100),
            vehicle_no      VARCHAR(50),
            notes           TEXT,
            created_by      VARCHAR(100),
            dispatched_by   VARCHAR(100),
            dispatched_at   TIMESTAMPTZ,
            delivered_by    VARCHAR(100),
            delivered_at    TIMESTAMPTZ,
            created_at      TIMESTAMPTZ DEFAULT NOW(),
            updated_at      TIMESTAMPTZ DEFAULT NOW()
        )
    `);
    console.log('  ✓ Table deliveries created');

    // Tabel link delivery → GI (satu delivery bisa memuat banyak GI)
    await query(`
        CREATE TABLE IF NOT EXISTS delivery_gi_links (
            id          SERIAL PRIMARY KEY,
            delivery_id INTEGER NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
            gi_id       INTEGER NOT NULL REFERENCES goods_issues(id),
            UNIQUE (delivery_id, gi_id)
        )
    `);
    console.log('  ✓ Table delivery_gi_links created');

    // Index
    await query(`CREATE INDEX IF NOT EXISTS idx_deliveries_branch ON deliveries(branch_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_deliveries_status ON deliveries(status)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_delivery_gi_links_delivery ON delivery_gi_links(delivery_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_delivery_gi_links_gi ON delivery_gi_links(gi_id)`);
    console.log('  ✓ Indexes created');

    console.log('Migration complete.');
    process.exit(0);
}

run().catch(e => { console.error('Migration failed:', e); process.exit(1); });
