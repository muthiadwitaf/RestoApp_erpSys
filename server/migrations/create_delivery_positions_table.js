/**
 * Migration: create_delivery_positions_table
 * Membuat tabel delivery_positions (posisi/tracking DO) dan
 * gi_position_history (riwayat posisi per GI dari DO)
 */
const { query } = require('../src/config/db');

async function run() {
    console.log('\nRunning migration: create_delivery_positions_table...');

    // 1. delivery_positions — posisi real-time DO saat dispatched
    await query(`
        CREATE TABLE IF NOT EXISTS delivery_positions (
            id          SERIAL PRIMARY KEY,
            uuid        UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
            delivery_id INTEGER NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
            address     TEXT,
            latitude    NUMERIC(10, 7),
            longitude   NUMERIC(10, 7),
            notes       TEXT,
            recorded_by VARCHAR(150),
            created_at  TIMESTAMPTZ DEFAULT NOW()
        )
    `);
    console.log('  ✓ Table delivery_positions created');

    // 2. gi_position_history — history posisi tiap GI (disalin dari DO position)
    await query(`
        CREATE TABLE IF NOT EXISTS gi_position_history (
            id              SERIAL PRIMARY KEY,
            uuid            UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
            gi_id           INTEGER NOT NULL REFERENCES goods_issues(id) ON DELETE CASCADE,
            delivery_id     INTEGER REFERENCES deliveries(id) ON DELETE SET NULL,
            delivery_pos_id INTEGER REFERENCES delivery_positions(id) ON DELETE SET NULL,
            address         TEXT,
            latitude        NUMERIC(10, 7),
            longitude       NUMERIC(10, 7),
            notes           TEXT,
            recorded_by     VARCHAR(150),
            created_at      TIMESTAMPTZ DEFAULT NOW()
        )
    `);
    console.log('  ✓ Table gi_position_history created');

    // 3. Index
    await query(`CREATE INDEX IF NOT EXISTS idx_delivery_positions_delivery ON delivery_positions(delivery_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_gi_pos_history_gi    ON gi_position_history(gi_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_gi_pos_history_deliv ON gi_position_history(delivery_id)`);
    console.log('  ✓ Indexes created');

    console.log('Migration complete.\n');
    process.exit(0);
}

run().catch(err => { console.error(err.message); process.exit(1); });
