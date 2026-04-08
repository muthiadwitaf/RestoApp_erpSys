/**
 * migrate_asset_fiscal.js
 * Add fiscal classification columns to asset_categories for CIT XML export.
 * Columns: fiscal_code, fiscal_group, fiscal_type, fiscal_method
 *
 * Jalankan: node migrations/migrate_asset_fiscal.js
 */
require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT || '5432'),
    user:     process.env.DB_USER     || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME     || 'erpsys',
});

(async () => {
    const client = await pool.connect();
    console.log('Running Asset Fiscal Classification migration...\n');

    const steps = [
        {
            name: 'Add fiscal_code to asset_categories',
            sql: `ALTER TABLE asset_categories ADD COLUMN IF NOT EXISTS fiscal_code VARCHAR(10)`
        },
        {
            name: 'Add fiscal_group to asset_categories',
            sql: `ALTER TABLE asset_categories ADD COLUMN IF NOT EXISTS fiscal_group VARCHAR(30)`
        },
        {
            name: 'Add fiscal_type to asset_categories',
            sql: `ALTER TABLE asset_categories ADD COLUMN IF NOT EXISTS fiscal_type VARCHAR(20) DEFAULT 'depreciation'`
        },
        {
            name: 'Add fiscal_method to asset_categories',
            sql: `ALTER TABLE asset_categories ADD COLUMN IF NOT EXISTS fiscal_method VARCHAR(10)`
        },
    ];

    for (const step of steps) {
        try {
            await client.query(step.sql);
            console.log('  OK  ' + step.name);
        } catch (e) {
            console.error('  FAIL  ' + step.name + ': ' + e.message);
        }
    }

    // ── Seed sensible fiscal defaults for existing categories ──────────
    console.log('\nUpdating fiscal defaults for existing categories...');

    /**
     * Mapping: partial category name (case-insensitive) -> fiscal defaults
     * [fiscal_code, fiscal_group, fiscal_type, fiscal_method]
     */
    const FISCAL_DEFAULTS = [
        { match: 'kendaraan',           code: '0408', group: 'Group 2',  type: 'depreciation', method: 'GL' },
        { match: 'peralatan',           code: '0408', group: 'Group 2',  type: 'depreciation', method: 'GL' },
        { match: 'mesin',               code: '0408', group: 'Group 2',  type: 'depreciation', method: 'GL' },
        { match: 'bangunan',            code: '0505', group: 'Permanent', type: 'depreciation', method: 'GL' },
        { match: 'renovasi',            code: '0505', group: 'Non-permanent', type: 'depreciation', method: 'GL' },
        { match: 'furnitur',            code: '0408', group: 'Group 1',  type: 'depreciation', method: 'GL' },
        { match: 'inventaris',          code: '0408', group: 'Group 1',  type: 'depreciation', method: 'GL' },
        { match: 'komputer',            code: '0408', group: 'Group 1',  type: 'depreciation', method: 'GL' },
        { match: 'it',                  code: '0408', group: 'Group 1',  type: 'depreciation', method: 'GL' },
    ];

    const catRes = await client.query(
        `SELECT id, name FROM asset_categories WHERE fiscal_code IS NULL`
    );

    let updated = 0;
    for (const cat of catRes.rows) {
        const lower = cat.name.toLowerCase();
        const match = FISCAL_DEFAULTS.find(fd => lower.includes(fd.match));
        if (match) {
            await client.query(
                `UPDATE asset_categories
                 SET fiscal_code = $1, fiscal_group = $2, fiscal_type = $3, fiscal_method = $4
                 WHERE id = $5`,
                [match.code, match.group, match.type, match.method, cat.id]
            );
            console.log(`  OK  Updated "${cat.name}" -> ${match.code} / ${match.group}`);
            updated++;
        }
    }
    console.log(`\n  ${updated} categories updated with fiscal defaults.`);

    // ── Verification ───────────────────────────────────────────────────
    console.log('\nVerification:');
    const verify = await client.query(
        `SELECT column_name, data_type FROM information_schema.columns
         WHERE table_name = 'asset_categories' AND column_name LIKE 'fiscal_%'
         ORDER BY ordinal_position`
    );
    verify.rows.forEach(c => console.log(`  ${c.column_name} (${c.data_type})`));

    console.log('\nMigration complete!');
    client.release();
    await pool.end();
    process.exit(0);
})().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
