/**
 * migrate_assets.js
 * Incremental migration -- Asset Management module
 * 4 tabel baru: asset_categories, assets, asset_depreciation_logs, asset_maintenance_logs
 * Idempotent (aman dijalankan berkali-kali via IF NOT EXISTS / DO NOTHING)
 */
const { query } = require('../src/config/db');

(async () => {
    console.log('Running Asset Management migration...\n');

    const steps = [

        // ── 1. asset_categories ─────────────────────────────────────────────
        {
            name: 'Create table: asset_categories',
            sql: `CREATE TABLE IF NOT EXISTS asset_categories (
                id                          SERIAL PRIMARY KEY,
                uuid                        UUID DEFAULT gen_random_uuid() NOT NULL UNIQUE,
                company_id                  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
                name                        VARCHAR(100) NOT NULL,
                depreciation_method         VARCHAR(30) NOT NULL DEFAULT 'straight-line'
                                                CHECK (depreciation_method IN ('straight-line','declining-balance')),
                useful_life_months          INTEGER NOT NULL DEFAULT 60,
                residual_value_pct          NUMERIC(5,2) NOT NULL DEFAULT 0,
                coa_asset_id                INTEGER REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
                coa_depreciation_id         INTEGER REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
                coa_accum_depreciation_id   INTEGER REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
                coa_disposal_gain_id        INTEGER REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
                coa_disposal_loss_id        INTEGER REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
                coa_maintenance_id          INTEGER REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
                created_at                  TIMESTAMPTZ DEFAULT NOW(),
                updated_at                  TIMESTAMPTZ DEFAULT NOW()
            )`
        },
        {
            name: 'Index asset_categories.company_id',
            sql: `CREATE INDEX IF NOT EXISTS idx_asset_categories_company ON asset_categories(company_id)`
        },

        // ── 2. assets ────────────────────────────────────────────────────────
        {
            name: 'Create table: assets',
            sql: `CREATE TABLE IF NOT EXISTS assets (
                id                          SERIAL PRIMARY KEY,
                uuid                        UUID DEFAULT gen_random_uuid() NOT NULL UNIQUE,
                number                      VARCHAR(50) NOT NULL,
                branch_id                   INTEGER NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
                asset_category_id           INTEGER NOT NULL REFERENCES asset_categories(id) ON DELETE RESTRICT,
                name                        VARCHAR(200) NOT NULL,
                description                 TEXT,
                acquisition_date            DATE NOT NULL,
                acquisition_cost            NUMERIC(18,2) NOT NULL DEFAULT 0,
                useful_life_months          INTEGER,
                residual_value              NUMERIC(18,2) NOT NULL DEFAULT 0,
                depreciation_method         VARCHAR(30),
                current_book_value          NUMERIC(18,2) NOT NULL DEFAULT 0,
                accumulated_depreciation    NUMERIC(18,2) NOT NULL DEFAULT 0,
                coa_asset_id                INTEGER REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
                coa_depreciation_id         INTEGER REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
                coa_accum_depreciation_id   INTEGER REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
                coa_disposal_gain_id        INTEGER REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
                coa_disposal_loss_id        INTEGER REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
                coa_maintenance_id          INTEGER REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
                status                      VARCHAR(20) NOT NULL DEFAULT 'draft'
                                                CHECK (status IN ('draft','active','disposed')),
                journal_id                  INTEGER REFERENCES journal_entries(id) ON DELETE SET NULL,
                disposal_journal_id         INTEGER REFERENCES journal_entries(id) ON DELETE SET NULL,
                disposal_date               DATE,
                disposal_price              NUMERIC(18,2),
                disposal_notes              TEXT,
                notes                       TEXT,
                created_by                  VARCHAR(100),
                created_at                  TIMESTAMPTZ DEFAULT NOW(),
                updated_at                  TIMESTAMPTZ DEFAULT NOW()
            )`
        },
        {
            name: 'Index assets.branch_id',
            sql: `CREATE INDEX IF NOT EXISTS idx_assets_branch ON assets(branch_id)`
        },
        {
            name: 'Index assets.asset_category_id',
            sql: `CREATE INDEX IF NOT EXISTS idx_assets_category ON assets(asset_category_id)`
        },
        {
            name: 'Index assets.status',
            sql: `CREATE INDEX IF NOT EXISTS idx_assets_status ON assets(status)`
        },

        // ── 3. asset_depreciation_logs ───────────────────────────────────────
        {
            name: 'Create table: asset_depreciation_logs',
            sql: `CREATE TABLE IF NOT EXISTS asset_depreciation_logs (
                id                  SERIAL PRIMARY KEY,
                uuid                UUID DEFAULT gen_random_uuid() NOT NULL UNIQUE,
                asset_id            INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
                period              VARCHAR(7) NOT NULL,
                depreciation_date   DATE NOT NULL,
                amount              NUMERIC(18,2) NOT NULL DEFAULT 0,
                book_value_after    NUMERIC(18,2) NOT NULL DEFAULT 0,
                journal_id          INTEGER REFERENCES journal_entries(id) ON DELETE SET NULL,
                created_by          VARCHAR(100),
                created_at          TIMESTAMPTZ DEFAULT NOW()
            )`
        },
        {
            name: 'Index asset_depreciation_logs.asset_id',
            sql: `CREATE INDEX IF NOT EXISTS idx_dep_logs_asset ON asset_depreciation_logs(asset_id)`
        },
        {
            name: 'Unique constraint: one depreciation per asset per period',
            sql: `CREATE UNIQUE INDEX IF NOT EXISTS idx_dep_logs_unique_period
                  ON asset_depreciation_logs(asset_id, period)`
        },

        // ── 4. asset_maintenance_logs ────────────────────────────────────────
        {
            name: 'Create table: asset_maintenance_logs',
            sql: `CREATE TABLE IF NOT EXISTS asset_maintenance_logs (
                id                  SERIAL PRIMARY KEY,
                uuid                UUID DEFAULT gen_random_uuid() NOT NULL UNIQUE,
                asset_id            INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
                maintenance_date    DATE NOT NULL,
                description         TEXT NOT NULL,
                cost                NUMERIC(18,2) NOT NULL DEFAULT 0,
                vendor              VARCHAR(200),
                payment_method      VARCHAR(20) NOT NULL DEFAULT 'cash'
                                        CHECK (payment_method IN ('cash','hutang')),
                journal_id          INTEGER REFERENCES journal_entries(id) ON DELETE SET NULL,
                created_by          VARCHAR(100),
                created_at          TIMESTAMPTZ DEFAULT NOW()
            )`
        },
        {
            name: 'Index asset_maintenance_logs.asset_id',
            sql: `CREATE INDEX IF NOT EXISTS idx_maint_logs_asset ON asset_maintenance_logs(asset_id)`
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

    // Verification
    console.log('\nVerification -- tables:');
    const tables = ['asset_categories', 'assets', 'asset_depreciation_logs', 'asset_maintenance_logs'];
    for (const t of tables) {
        const r = await query(
            `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`,
            [t]
        );
        console.log(`\n  [${t}] -- ${r.rows.length} columns`);
        r.rows.forEach(c => console.log(`    ${c.column_name} (${c.data_type})`));
    }

    console.log('\nMigration complete!');
    process.exit(0);
})().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
