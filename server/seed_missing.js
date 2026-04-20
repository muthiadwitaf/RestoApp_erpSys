require('dotenv').config();
const { getClient, query } = require('./src/config/db');

const EXTRA_RAW_MATERIALS = [
  { code: 'RM-027', name: 'Tepung Takoyaki & Gurita', price: 60000 },
  { code: 'RM-028', name: 'Es Krim Vanilla/Matcha', price: 50000 }, // per tub
  { code: 'RM-029', name: 'Buah Strawberry Segar', price: 60000 },
  { code: 'RM-030', name: 'Keju Mozzarella', price: 120000 },
  { code: 'RM-031', name: 'Kulit Ayam (Tori Skin)', price: 25000 },
];

async function seed() {
    const client = await getClient();
    try {
        console.log("Starting missing items seeder...");
        await client.query('BEGIN');

        // First, get the company ID (assume company_id = 1 for seeds)
        const compRes = await client.query('SELECT id FROM companies LIMIT 1');
        const companyId = compRes.rows[0].id;
        const whRes = await client.query('SELECT id FROM warehouses LIMIT 1');
        const whId = whRes.rows[0]?.id;

        // Fetch existing items for quick map
        let itemMap = {}; 
        const ext = await client.query('SELECT id, name, buy_price FROM items');
        ext.rows.forEach(r => itemMap[r.name] = r.id);

        console.log("Inserting extra raw materials...");
        for (const rm of EXTRA_RAW_MATERIALS) {
            if (!itemMap[rm.name]) {
                const res = await client.query(
                    `INSERT INTO items (code, name, buy_price, sell_price, hpp, min_stock, is_active, company_id, item_type)
                     VALUES ($1, $2, $3, 0, $3, 5, true, $4, 'raw_material') RETURNING id`,
                    [rm.code, rm.name, rm.price, companyId]
                );
                itemMap[rm.name] = res.rows[0].id;
                
                if (whId) {
                    await client.query(`INSERT INTO inventory (item_id, warehouse_id, qty) VALUES ($1, $2, 50)`, [res.rows[0].id, whId]);
                }
            }
        }

        // Fetch missing menus
        const menusRes = await client.query('SELECT m.id, m.name, m.category FROM resto_menu_items m LEFT JOIN menu_recipes r ON m.id = r.menu_item_id GROUP BY m.id HAVING count(r.id) = 0');
        const menus = menusRes.rows;

        // 3. Helper to insert recipe
        const addRecipe = async (menuId, ingName, qty) => {
            const ingId = itemMap[ingName];
            if (!ingId) throw new Error("Unknown ingredient " + ingName);
            await client.query('INSERT INTO menu_recipes (menu_item_id, item_id, qty) VALUES ($1, $2, $3)', [menuId, ingId, qty]);
        };

        console.log("Wiring up recipes for " + menus.length + " missing menus...");
        for (const menu of menus) {
            let laborCost = 1500;  
            let overheadCost = 1000;

            const lower = menu.name.toLowerCase();
            
            if (lower.includes('takoyaki')) {
                await addRecipe(menu.id, 'Tepung Takoyaki & Gurita', 0.1);
                await addRecipe(menu.id, 'Minyak Goreng', 0.05);
            } else if (lower.includes('ice cream') || lower.includes('sorbet') || lower.includes('parfait')) {
                await addRecipe(menu.id, 'Es Krim Vanilla/Matcha', 0.05);
                if (lower.includes('ichigo')) await addRecipe(menu.id, 'Buah Strawberry Segar', 0.02);
            } else if (lower.includes('chicken roll')) {
                await addRecipe(menu.id, 'Daging Ayam Fillet', 0.1);
                await addRecipe(menu.id, 'Nori (Rumput Laut)', 1); // 1 sheet
                await addRecipe(menu.id, 'Minyak Goreng', 0.05);
            } else if (lower.includes('milk pudding')) {
                await addRecipe(menu.id, 'Susu Segar (Fresh Milk)', 0.1);
                await addRecipe(menu.id, 'Gula Pasir', 0.02);
            } else if (lower.includes('ichigo daifuku')) {
                await addRecipe(menu.id, 'Tepung Mochi', 0.05);
                await addRecipe(menu.id, 'Buah Strawberry Segar', 0.02);
            } else if (lower.includes('yaki onigiri')) {
                await addRecipe(menu.id, 'Beras Jepang (Sushi Rice)', 0.08);
                if (lower.includes('chiizu')) await addRecipe(menu.id, 'Keju Mozzarella', 0.02);
            } else if (lower.includes('skin crisps')) {
                await addRecipe(menu.id, 'Kulit Ayam (Tori Skin)', 0.1);
                await addRecipe(menu.id, 'Tepung Tempura/Panko', 0.02);
                await addRecipe(menu.id, 'Minyak Goreng', 0.05);
            }

            // Recalculate HPP
            const result = await client.query(
                `SELECT SUM(r.qty * i.buy_price) as bbb
                 FROM menu_recipes r
                 JOIN items i ON r.item_id = i.id
                 WHERE r.menu_item_id = $1`,
                [menu.id]
            );
            const bbb = parseFloat(result.rows[0].bbb) || 0;
            const cogs = bbb + laborCost + overheadCost;

            await client.query(
                `UPDATE resto_menu_items
                 SET recipe_cost = $1, labor_cost = $2, overhead_cost = $3, cogs = $4, updated_at = NOW()
                 WHERE id = $5`,
                [bbb, laborCost, overheadCost, cogs, menu.id]
            );
        }

        await client.query('COMMIT');
        console.log("Seeding complete! Recipes applied to missing items.");
    } catch (e) {
        await client.query('ROLLBACK');
        console.error("Error during seeding", e);
    } finally {
        client.release();
    }
}

seed().then(() => process.exit(0)).catch(() => process.exit(1));
