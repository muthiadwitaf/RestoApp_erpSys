/**
 * migrations/fix_customer_groups_columns.js
 * DDL awal customer_groups hanya punya: id, name.
 * Kode backend (customers.js) SELECT: uuid, name, discount_pct, description.
 *
 * Fix: tambah kolom uuid, discount_pct, description.
 *
 * Usage: node migrations/fix_customer_groups_columns.js
 */
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'erpsys',
});

async function run() {
    const client = await pool.connect();
    try {
        console.log('Running migration: fix_customer_groups_columns\n');

        const safe = async (sql, label) => {
            try {
                await client.query(sql);
                console.log('  + ' + label);
            } catch (e) {
                if (e.message.includes('already exists') || e.message.includes('duplicate column')) {
                    console.log('  = already exists: ' + label);
                } else {
                    throw e;
                }
            }
        };

        // 1. Tambah uuid
        await safe(
            `ALTER TABLE customer_groups ADD COLUMN IF NOT EXISTS uuid UUID DEFAULT gen_random_uuid()`,
            'customer_groups.uuid'
        );

        // 2. Backfill uuid yang null
        await client.query(`UPDATE customer_groups SET uuid = gen_random_uuid() WHERE uuid IS NULL`);
        console.log('  ~ backfilled uuid for existing rows');

        // 3. Unique index pada uuid
        await safe(
            `CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_groups_uuid ON customer_groups(uuid)`,
            'unique index on customer_groups.uuid'
        );

        // 4. Tambah discount_pct
        await safe(
            `ALTER TABLE customer_groups ADD COLUMN IF NOT EXISTS discount_pct NUMERIC DEFAULT 0`,
            'customer_groups.discount_pct'
        );

        // 5. Tambah description
        await safe(
            `ALTER TABLE customer_groups ADD COLUMN IF NOT EXISTS description TEXT`,
            'customer_groups.description'
        );

        console.log('\nMigration complete.');
    } finally {
        client.release();
        await pool.end();
    }
}

run().catch(err => { console.error('Migration failed:', err.message); process.exit(1); });
