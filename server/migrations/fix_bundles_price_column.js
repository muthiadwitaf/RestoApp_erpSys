/**
 * migrations/fix_bundles_price_column.js
 * Fix mismatch kolom bundles: DDL awal (migrasi.js) memakai nama 'sell_price',
 * sedangkan kode backend (bundles.js) memakai nama 'price' untuk INSERT/UPDATE/SELECT.
 *
 * Fix: rename kolom sell_price -> price agar konsisten dengan kode.
 *
 * Usage: node migrations/fix_bundles_price_column.js
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
        console.log('Running migration: fix_bundles_price_column\n');

        // Cek apakah kolom 'sell_price' masih ada
        const check = await client.query(`
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'bundles' AND column_name = 'sell_price'
        `);

        if (check.rows.length > 0) {
            // Rename sell_price -> price
            await client.query(`ALTER TABLE bundles RENAME COLUMN sell_price TO price`);
            console.log('  + renamed bundles.sell_price -> bundles.price');
        } else {
            // Kolom sell_price sudah tidak ada, pastikan kolom 'price' ada
            const checkPrice = await client.query(`
                SELECT column_name FROM information_schema.columns
                WHERE table_name = 'bundles' AND column_name = 'price'
            `);
            if (checkPrice.rows.length > 0) {
                console.log('  = bundles.price already exists, nothing to do');
            } else {
                // Keduanya tidak ada — tambah kolom price baru
                await client.query(`ALTER TABLE bundles ADD COLUMN IF NOT EXISTS price NUMERIC DEFAULT 0`);
                console.log('  + added bundles.price (NUMERIC DEFAULT 0)');
            }
        }

        console.log('\nMigration complete.');
    } finally {
        client.release();
        await pool.end();
    }
}

run().catch(err => { console.error('Migration failed:', err.message); process.exit(1); });
