const { query, pool } = require('./src/config/db');

async function fixDB() {
    try {
        console.log('Using app DB config...');
        
        await query(`ALTER TABLE resto_orders ADD COLUMN IF NOT EXISTS service_pct NUMERIC(5,2) DEFAULT 0`);
        console.log('✅ Added service_pct');

        await query(`
            CREATE TABLE IF NOT EXISTS resto_order_payments (
                id SERIAL PRIMARY KEY,
                order_id INTEGER NOT NULL REFERENCES resto_orders(id) ON DELETE CASCADE,
                amount NUMERIC(15,2) NOT NULL,
                method VARCHAR(50) NOT NULL DEFAULT 'cash',
                cashier_id INTEGER REFERENCES users(id),
                notes TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            )
        `);
        console.log('✅ Created resto_order_payments');

        await query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS pos_tax_pct NUMERIC(5,2) DEFAULT 10`);
        await query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS pos_service_pct NUMERIC(5,2) DEFAULT 0`);
        console.log('✅ Checked companies config');

        const checkres = await query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'resto_order_payments'`);
        if (checkres.rows.length === 0) {
            console.log('❌ TABLE STILL NOT FOUND');
        } else {
            console.log('✅ TABLE CONFIRMED CREATED:', checkres.rows.map(r => r.column_name).join(', '));
        }

    } catch(e) {
        console.error(e);
    } finally {
        if(pool) pool.end();
        process.exit(0);
    }
}
fixDB();
