/**
 * migrate_asset_documents.js
 * Tabel asset_documents -- dokumen terkait aset (PDF/image) dengan label wajib
 * Idempotent (aman dijalankan berkali-kali)
 */
const { query } = require('../src/config/db');

(async () => {
    console.log('Running asset_documents migration...\n');

    const steps = [
        {
            name: 'Create table: asset_documents',
            sql: `CREATE TABLE IF NOT EXISTS asset_documents (
                id           SERIAL PRIMARY KEY,
                uuid         UUID DEFAULT gen_random_uuid() NOT NULL UNIQUE,
                asset_id     INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
                file_uuid    VARCHAR(36) NOT NULL,
                file_url     TEXT NOT NULL,
                ext          VARCHAR(10) NOT NULL,
                label        VARCHAR(200) NOT NULL,
                size_bytes   INTEGER,
                uploaded_by  VARCHAR(100),
                created_at   TIMESTAMPTZ DEFAULT NOW()
            )`
        },
        {
            name: 'Index asset_documents.asset_id',
            sql: `CREATE INDEX IF NOT EXISTS idx_asset_documents_asset
                  ON asset_documents(asset_id)`
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
         WHERE table_name = 'asset_documents'
         ORDER BY ordinal_position`
    );
    r.rows.forEach(c => console.log('  ' + c.column_name + ' (' + c.data_type + ')'));

    console.log('\nMigration complete!');
    process.exit(0);
})().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
