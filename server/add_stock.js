require('dotenv').config();
const { getClient } = require('./src/config/db');

(async () => {
    const client = await getClient();
    try {
        await client.query('BEGIN');
        const wRes = await client.query("INSERT INTO warehouses (code, name, branch_id, is_active) VALUES ('GUDANG01', 'Gudang Bahan Baku', 16, true) RETURNING id"); 
        const wId = wRes.rows[0].id; 
        const itemsRes = await client.query('SELECT id FROM items WHERE company_id = 12'); 
        for(const item of itemsRes.rows) { 
            await client.query('INSERT INTO inventory (item_id, warehouse_id, qty) VALUES ($1, $2, 50)', [item.id, wId]); 
        } 
        await client.query('COMMIT'); 
        console.log('Successfully created warehouse and added 50 stock for each of the ' + itemsRes.rows.length + ' items'); 
    } catch (e) {
        await client.query('ROLLBACK'); 
        console.log('Err:', e); 
    } finally { 
        client.release(); 
        process.exit(0); 
    } 
})();
