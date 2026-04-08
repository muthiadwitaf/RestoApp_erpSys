/**
 * migrate_asset_revaluation.js
 * Incremental migration -- Revaluation feature
 * 1. Tambah kolom is_depreciable ke asset_categories
 * 2. Tabel asset_revaluation_logs (log revaluasi naik / turun)
 * 3. Kolom coa_revalue_surplus_id & coa_revalue_loss_id ke asset_categories
 */
const { query } = require('../src/config/db');

(async () => {
    console.log('Running Revaluation migration...\n');

    const steps = [
        {
            name: 'Add is_depreciable to asset_categories',
            sql: `ALTER TABLE asset_categories ADD COLUMN IF NOT EXISTS is_depreciable BOOLEAN NOT NULL DEFAULT true`
        },
        {
            name: 'Add coa_revalue_surplus_id to asset_categories',
            sql: `ALTER TABLE asset_categories ADD COLUMN IF NOT EXISTS coa_revalue_surplus_id INTEGER REFERENCES chart_of_accounts(id) ON DELETE SET NULL`
        },
        {
            name: 'Add coa_revalue_loss_id to asset_categories',
            sql: `ALTER TABLE asset_categories ADD COLUMN IF NOT EXISTS coa_revalue_loss_id INTEGER REFERENCES chart_of_accounts(id) ON DELETE SET NULL`
        },
        {
            name: 'Add coa_revalue_surplus_id override to assets',
            sql: `ALTER TABLE assets ADD COLUMN IF NOT EXISTS coa_revalue_surplus_id INTEGER REFERENCES chart_of_accounts(id) ON DELETE SET NULL`
        },
        {
            name: 'Add coa_revalue_loss_id override to assets',
            sql: `ALTER TABLE assets ADD COLUMN IF NOT EXISTS coa_revalue_loss_id INTEGER REFERENCES chart_of_accounts(id) ON DELETE SET NULL`
        },
        {
            name: 'Create table: asset_revaluation_logs',
            sql: `CREATE TABLE IF NOT EXISTS asset_revaluation_logs (
                id                  SERIAL PRIMARY KEY,
                uuid                UUID DEFAULT gen_random_uuid() NOT NULL UNIQUE,
                asset_id            INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
                revaluation_date    DATE NOT NULL,
                old_value           NUMERIC(18,2) NOT NULL,
                new_value           NUMERIC(18,2) NOT NULL,
                difference          NUMERIC(18,2) NOT NULL,
                notes               TEXT,
                journal_id          INTEGER REFERENCES journal_entries(id) ON DELETE SET NULL,
                created_by          VARCHAR(100),
                created_at          TIMESTAMPTZ DEFAULT NOW()
            )`
        },
        {
            name: 'Index asset_revaluation_logs.asset_id',
            sql: `CREATE INDEX IF NOT EXISTS idx_reval_logs_asset ON asset_revaluation_logs(asset_id)`
        }
    ];

    for (const step of steps) {
        try {
            await query(step.sql);
            console.log('OK ' + step.name);
        } catch (e) {
            console.error('FAIL ' + step.name + ': ' + e.message);
        }
    }

    console.log('\nMigration complete!');
    process.exit(0);
})().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
