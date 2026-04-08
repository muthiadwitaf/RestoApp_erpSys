/**
 * migrations/add_partial_gr.js
 * Tambah status 'partial' ke purchase_orders untuk mendukung partial receive.
 *
 * Usage: node migrations/add_partial_gr.js
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
        console.log('Memulai migrasi add_partial_gr...\n');

        // 1. Drop old check constraint on purchase_orders.status
        await client.query(`
            ALTER TABLE purchase_orders
            DROP CONSTRAINT IF EXISTS purchase_orders_status_check
        `);
        console.log('  [1/2] Constraint lama purchase_orders_status_check di-drop');

        // 2. Add new constraint that includes 'partial'
        await client.query(`
            ALTER TABLE purchase_orders
            ADD CONSTRAINT purchase_orders_status_check
            CHECK (status IN ('draft','pending','approved','rejected','partial','processed','billed','paid'))
        `);
        console.log('  [2/2] Constraint baru ditambahkan (include partial)');

        console.log('\nMigrasi selesai.');
    } catch (e) {
        console.error('Error:', e.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

run();
