/**
 * add_asset_location.js
 * - Tambah kolom lokasi & koordinat ke tabel assets
 * - Buat tabel asset_location_logs (riwayat perpindahan)
 * Idempotent (aman dijalankan berkali-kali)
 */
const { query } = require('../src/config/db');

(async () => {
    console.log('Running add_asset_location migration...\n');

    const steps = [
        {
            name: 'Add current_location to assets',
            sql: `ALTER TABLE assets ADD COLUMN IF NOT EXISTS current_location TEXT`
        },
        {
            name: 'Add latitude to assets',
            sql: `ALTER TABLE assets ADD COLUMN IF NOT EXISTS latitude DECIMAL(10,7)`
        },
        {
            name: 'Add longitude to assets',
            sql: `ALTER TABLE assets ADD COLUMN IF NOT EXISTS longitude DECIMAL(10,7)`
        },
        {
            name: 'Add pic_employee_uuid to assets',
            sql: `ALTER TABLE assets ADD COLUMN IF NOT EXISTS pic_employee_uuid UUID`
        },
        {
            name: 'Add pic_name to assets',
            sql: `ALTER TABLE assets ADD COLUMN IF NOT EXISTS pic_name VARCHAR(200)`
        },
        {
            name: 'Create table: asset_location_logs',
            sql: `CREATE TABLE IF NOT EXISTS asset_location_logs (
                id                  SERIAL PRIMARY KEY,
                uuid                UUID DEFAULT gen_random_uuid() NOT NULL UNIQUE,
                asset_id            INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
                from_location       TEXT,
                to_location         TEXT,
                from_lat            DECIMAL(10,7),
                from_lng            DECIMAL(10,7),
                to_lat              DECIMAL(10,7),
                to_lng              DECIMAL(10,7),
                from_pic_name       VARCHAR(200),
                to_pic_name         VARCHAR(200),
                to_pic_employee_uuid UUID,
                reason              TEXT,
                effective_date      DATE NOT NULL DEFAULT CURRENT_DATE,
                changed_by          VARCHAR(100),
                created_at          TIMESTAMPTZ DEFAULT NOW()
            )`
        },
        {
            name: 'Index asset_location_logs.asset_id',
            sql: `CREATE INDEX IF NOT EXISTS idx_asset_location_logs_asset
                  ON asset_location_logs(asset_id)`
        }
    ];

    for (const step of steps) {
        try {
            await query(step.sql);
            console.log('OK   ' + step.name);
        } catch (e) {
            console.error('FAIL ' + step.name + ': ' + e.message);
        }
    }

    console.log('\nVerification (asset_location_logs columns):');
    const r = await query(
        `SELECT column_name, data_type
         FROM information_schema.columns
         WHERE table_name = 'asset_location_logs'
         ORDER BY ordinal_position`
    );
    r.rows.forEach(c => console.log('  ' + c.column_name + ' (' + c.data_type + ')'));

    console.log('\nMigration complete!');
    process.exit(0);
})().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
