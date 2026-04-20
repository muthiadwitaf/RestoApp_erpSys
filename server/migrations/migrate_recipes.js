const { query, getClient } = require('../src/config/db');

async function run() {
    const client = await getClient();
    try {
        await client.query('BEGIN');
        console.log('1. Clearing POS Transactions...');
        await client.query(`TRUNCATE resto_orders CASCADE`);
        
        // stock_movements from resto_orders usually have ref starting with RO- 
        // We will just clear stock movements related to RESTO to be safe, but keep inventory qty intact.
        await client.query(`DELETE FROM stock_movements WHERE ref LIKE 'RO-%' OR description LIKE 'Pesanan Resto%'`);

        console.log('2. Adding cost columns to resto_menu_items...');
        await client.query(`ALTER TABLE resto_menu_items ADD COLUMN IF NOT EXISTS labor_cost NUMERIC DEFAULT 0`);
        await client.query(`ALTER TABLE resto_menu_items ADD COLUMN IF NOT EXISTS overhead_cost NUMERIC DEFAULT 0`);
        await client.query(`ALTER TABLE resto_menu_items ADD COLUMN IF NOT EXISTS recipe_cost NUMERIC DEFAULT 0`); // BBB
        await client.query(`ALTER TABLE resto_menu_items ADD COLUMN IF NOT EXISTS cogs NUMERIC DEFAULT 0`); // Total HPP

        console.log('3. Adding item_type to items...');
        await client.query(`ALTER TABLE items ADD COLUMN IF NOT EXISTS item_type VARCHAR(50) DEFAULT 'raw_material'`);
        
        console.log('4. Creating recipes table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS menu_recipes (
                id SERIAL PRIMARY KEY,
                uuid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
                menu_item_id INTEGER NOT NULL REFERENCES resto_menu_items(id) ON DELETE CASCADE,
                item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
                qty NUMERIC(10,4) NOT NULL DEFAULT 1,
                unit_id INTEGER REFERENCES units(id) ON DELETE SET NULL,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            )
        `);

        // Seed some data? No need.
        
        await client.query('COMMIT');
        console.log('Migration successful!');
        process.exit(0);
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Migration failed', e);
        process.exit(1);
    } finally {
        client.release();
    }
}
run();
