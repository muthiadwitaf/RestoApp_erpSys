/**
 * migrate_asset_photos.js
 * Tabel asset_photos -- foto aset dengan dukungan gambar utama (is_primary)
 * Idempotent (aman dijalankan berkali-kali)
 */
const { query } = require('../src/config/db');

(async () => {
    console.log('Running asset_photos migration...\n');

    const steps = [
        {
            name: 'Create table: asset_photos',
            sql: `CREATE TABLE IF NOT EXISTS asset_photos (
                id           SERIAL PRIMARY KEY,
                uuid         UUID DEFAULT gen_random_uuid() NOT NULL UNIQUE,
                asset_id     INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
                file_uuid    VARCHAR(36) NOT NULL,
                image_url    TEXT NOT NULL,
                is_primary   BOOLEAN NOT NULL DEFAULT false,
                sort_order   INTEGER NOT NULL DEFAULT 0,
                uploaded_by  VARCHAR(100),
                created_at   TIMESTAMPTZ DEFAULT NOW()
            )`
        },
        {
            name: 'Index asset_photos.asset_id',
            sql: `CREATE INDEX IF NOT EXISTS idx_asset_photos_asset
                  ON asset_photos(asset_id)`
        },
        {
            name: 'Partial unique index: only one primary photo per asset',
            sql: `CREATE UNIQUE INDEX IF NOT EXISTS idx_asset_photos_primary
                  ON asset_photos(asset_id) WHERE is_primary = true`
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

    console.log('\nVerification:');
    const r = await query(
        `SELECT column_name, data_type
         FROM information_schema.columns
         WHERE table_name = 'asset_photos'
         ORDER BY ordinal_position`
    );
    r.rows.forEach(c => console.log('  ' + c.column_name + ' (' + c.data_type + ')'));

    console.log('\nMigration complete!');
    process.exit(0);
})().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
