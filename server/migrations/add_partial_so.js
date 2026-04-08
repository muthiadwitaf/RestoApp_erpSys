/**
 * migrations/add_partial_so.js
 * Tambah status 'partial' ke sales_orders untuk mendukung partial delivery GI.
 *
 * Usage: node migrations/add_partial_so.js
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
        console.log('Memulai migrasi add_partial_so...\n');

        // 1. Drop old constraint
        await client.query(`
            ALTER TABLE sales_orders
            DROP CONSTRAINT IF EXISTS sales_orders_status_check
        `);
        console.log('  [1/2] Constraint lama sales_orders_status_check di-drop');

        // 2. Add new constraint including 'partial'
        await client.query(`
            ALTER TABLE sales_orders
            ADD CONSTRAINT sales_orders_status_check
            CHECK (status IN ('draft','pending','approved','rejected','partial','processed','paid'))
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
