require('dotenv').config();
const { getClient, query } = require('./src/config/db');

const RAW_MATERIALS = [
  { code: 'RM-001', name: 'Beras Jepang (Sushi Rice)', price: 30000 },
  { code: 'RM-002', name: 'Daging Ayam Fillet', price: 45000 },
  { code: 'RM-003', name: 'Daging Sapi Premium (Wagyu)', price: 250000 },
  { code: 'RM-004', name: 'Daging Sapi Slice (Gyu)', price: 120000 },
  { code: 'RM-005', name: 'Telur Ayam', price: 25000 },
  { code: 'RM-006', name: 'Tuna Fillet Segar', price: 150000 },
  { code: 'RM-007', name: 'Salmon Fillet Segar', price: 280000 },
  { code: 'RM-008', name: 'Udang Pancet (Ebi)', price: 120000 },
  { code: 'RM-009', name: 'Nori (Rumput Laut)', price: 2000 }, // per lembar
  { code: 'RM-010', name: 'Ramen Noodle', price: 35000 },
  { code: 'RM-011', name: 'Udon Noodle', price: 35000 },
  { code: 'RM-012', name: 'Kuah Kaldu (Miso/Paitan)', price: 20000 },
  { code: 'RM-013', name: 'Saus Teriyaki/Yakiniku', price: 60000 },
  { code: 'RM-014', name: 'Bumbu Kari Jepang', price: 80000 },
  { code: 'RM-015', name: 'Matcha Powder', price: 400000 },
  { code: 'RM-016', name: 'Susu Segar (Fresh Milk)', price: 20000 },
  { code: 'RM-017', name: 'Gula Pasir', price: 18000 },
  { code: 'RM-018', name: 'Tepung Tempura/Panko', price: 25000 },
  { code: 'RM-019', name: 'Minyak Goreng', price: 18000 },
  { code: 'RM-020', name: 'Kentang', price: 20000 },
  { code: 'RM-021', name: 'Tofu Sabao', price: 10000 },
  { code: 'RM-022', name: 'Sirup Rasa (Lychee/Lemon)', price: 80000 },
  { code: 'RM-023', name: 'Kopi Espresso', price: 150000 },
  { code: 'RM-024', name: 'Gyoza Skin & Filling', price: 50000 },
  { code: 'RM-025', name: 'Tepung Mochi', price: 40000 },
  { code: 'RM-026', name: 'Es Soda', price: 15000 }
];

async function seed() {
    const client = await getClient();
    try {
        console.log("Starting seeder...");
        await client.query('BEGIN');

        // First, get the company ID (assume company_id = 1 for seeds)
        const compRes = await client.query('SELECT id FROM companies LIMIT 1');
        const companyId = compRes.rows[0].id;

        // Truncate to make sure it's clean
        await client.query('TRUNCATE TABLE items CASCADE');

        // 1. Insert Raw Materials
        const itemIdMap = {}; // name -> id
        console.log("Inserting raw materials...");
        for (const rm of RAW_MATERIALS) {
            const res = await client.query(
                `INSERT INTO items (code, name, buy_price, sell_price, hpp, min_stock, is_active, company_id, item_type)
                 VALUES ($1, $2, $3, 0, $3, 5, true, $4, 'raw_material') RETURNING id`,
                [rm.code, rm.name, rm.price, companyId]
            );
            itemIdMap[rm.name] = res.rows[0].id;
        }

        // Add 50 stock for each item in default warehouse
        const whRes = await client.query('SELECT id FROM warehouses LIMIT 1');
        const whId = whRes.rows[0]?.id;
        if (whId) {
            for (const rm of RAW_MATERIALS) {
                const iId = itemIdMap[rm.name];
                await client.query(`INSERT INTO inventory (item_id, warehouse_id, qty) VALUES ($1, $2, 50)`, [iId, whId]);
            }
        }

        // 2. Fetch all menus
        const menusRes = await client.query('SELECT id, name, category FROM resto_menu_items');
        const menus = menusRes.rows;

        // 3. Helper to insert recipe
        const addRecipe = async (menuId, ingName, qty) => {
            const ingId = itemIdMap[ingName];
            if (!ingId) throw new Error("Unknown ingredient " + ingName);
            await client.query('INSERT INTO menu_recipes (menu_item_id, item_id, qty) VALUES ($1, $2, $3)', [menuId, ingId, qty]);
        };

        console.log("Wiring up recipes...");
        for (const menu of menus) {
            let laborCost = 2000;  // Base BTK
            let overheadCost = 1500; // Base BOP

            const lower = menu.name.toLowerCase();
            
            // Heuristic matching
            if (menu.category === 'Beverage') {
                laborCost = 1000; overheadCost = 1000;
                if (lower.includes('matcha')) {
                    await addRecipe(menu.id, 'Matcha Powder', 0.015);
                    await addRecipe(menu.id, 'Susu Segar (Fresh Milk)', 0.15);
                } else if (lower.includes('koohii') || lower.includes('latte')) {
                    await addRecipe(menu.id, 'Kopi Espresso', 0.02);
                    await addRecipe(menu.id, 'Susu Segar (Fresh Milk)', 0.15);
                } else if (lower.includes('soda') || lower.includes('calpis')) {
                    await addRecipe(menu.id, 'Es Soda', 0.2);
                    await addRecipe(menu.id, 'Sirup Rasa (Lychee/Lemon)', 0.03);
                } else {
                    await addRecipe(menu.id, 'Sirup Rasa (Lychee/Lemon)', 0.03);
                    await addRecipe(menu.id, 'Es Soda', 0.15);
                }
            } 
            else if (menu.category === 'Dessert') {
                laborCost = 1500; overheadCost = 1000;
                if (lower.includes('cake') || lower.includes('dorayaki') || lower.includes('tiramisu')) {
                    await addRecipe(menu.id, 'Telur Ayam', 0.05); // 1 pc is roughly 0.05kg
                    await addRecipe(menu.id, 'Susu Segar (Fresh Milk)', 0.05);
                    await addRecipe(menu.id, 'Gula Pasir', 0.03);
                } else if (lower.includes('mochi')) {
                    await addRecipe(menu.id, 'Tepung Mochi', 0.05);
                    await addRecipe(menu.id, 'Gula Pasir', 0.02);
                }
                if (lower.includes('matcha')) await addRecipe(menu.id, 'Matcha Powder', 0.01);
            }
            else if (menu.category === 'Sushi') {
                laborCost = 3000; overheadCost = 2000;
                await addRecipe(menu.id, 'Beras Jepang (Sushi Rice)', 0.08); // 80gr rice per roll
                await addRecipe(menu.id, 'Nori (Rumput Laut)', 1); // 1 sheet
                if (lower.includes('salmon') || lower.includes('sake')) await addRecipe(menu.id, 'Salmon Fillet Segar', 0.05);
                if (lower.includes('tuna')) await addRecipe(menu.id, 'Tuna Fillet Segar', 0.05);
                if (lower.includes('ebi')) await addRecipe(menu.id, 'Udang Pancet (Ebi)', 0.05);
                if (lower.includes('tamago')) await addRecipe(menu.id, 'Telur Ayam', 0.05);
                if (lower.includes('crunch')) await addRecipe(menu.id, 'Tepung Tempura/Panko', 0.02);
            }
            else if (menu.category === 'Noodles') {
                laborCost = 2500; overheadCost = 2000;
                await addRecipe(menu.id, 'Kuah Kaldu (Miso/Paitan)', 0.3); // 300ml
                if (lower.includes('udon')) await addRecipe(menu.id, 'Udon Noodle', 0.15);
                else await addRecipe(menu.id, 'Ramen Noodle', 0.12);

                if (lower.includes('tori')) await addRecipe(menu.id, 'Daging Ayam Fillet', 0.05);
                if (lower.includes('seafood')) await addRecipe(menu.id, 'Udang Pancet (Ebi)', 0.05);
                await addRecipe(menu.id, 'Telur Ayam', 0.05);
            }
            else if (menu.category === 'Side dish') {
                if (lower.includes('ebi tempura')) {
                    await addRecipe(menu.id, 'Udang Pancet (Ebi)', 0.08);
                    await addRecipe(menu.id, 'Tepung Tempura/Panko', 0.03);
                    await addRecipe(menu.id, 'Minyak Goreng', 0.05);
                } else if (lower.includes('karaage') || lower.includes('katsu bites')) {
                    await addRecipe(menu.id, 'Daging Ayam Fillet', 0.1);
                    await addRecipe(menu.id, 'Tepung Tempura/Panko', 0.03);
                    await addRecipe(menu.id, 'Minyak Goreng', 0.05);
                } else if (lower.includes('fries') || lower.includes('korokke')) {
                    await addRecipe(menu.id, 'Kentang', 0.15);
                    await addRecipe(menu.id, 'Minyak Goreng', 0.05);
                } else if (lower.includes('gyoza')) {
                    await addRecipe(menu.id, 'Gyoza Skin & Filling', 0.1);
                    await addRecipe(menu.id, 'Minyak Goreng', 0.02);
                } else if (lower.includes('tofu')) {
                    await addRecipe(menu.id, 'Tofu Sabao', 1);
                    await addRecipe(menu.id, 'Minyak Goreng', 0.05);
                }
            }
            else if (menu.category === 'Main course' || lower.includes('don')) {
                laborCost = 3000; overheadCost = 2500;
                // Rice bowls
                if (lower.includes('don')) await addRecipe(menu.id, 'Beras Jepang (Sushi Rice)', 0.15);
                
                if (lower.includes('wagyu')) {
                    await addRecipe(menu.id, 'Daging Sapi Premium (Wagyu)', 0.12);
                    await addRecipe(menu.id, 'Saus Teriyaki/Yakiniku', 0.03);
                } else if (lower.includes('gyu')) {
                    await addRecipe(menu.id, 'Daging Sapi Slice (Gyu)', 0.12);
                    await addRecipe(menu.id, 'Saus Teriyaki/Yakiniku', 0.03);
                } else if (lower.includes('teriyaki') || lower.includes('karaage') || lower.includes('katsu') || lower.includes('tori') || lower.includes('oyako')) {
                    await addRecipe(menu.id, 'Daging Ayam Fillet', 0.12);
                    if (lower.includes('katsu') || lower.includes('karaage')) {
                        await addRecipe(menu.id, 'Tepung Tempura/Panko', 0.04);
                        await addRecipe(menu.id, 'Minyak Goreng', 0.05);
                    } else {
                        await addRecipe(menu.id, 'Saus Teriyaki/Yakiniku', 0.03);
                    }
                } else if (lower.includes('curry')) {
                    await addRecipe(menu.id, 'Bumbu Kari Jepang', 0.08);
                    await addRecipe(menu.id, 'Kentang', 0.05);
                }

                if (lower.includes('tamago') || lower.includes('oyako')) {
                    await addRecipe(menu.id, 'Telur Ayam', 0.05);
                }
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
        console.log("Seeding complete! Recipes applied to 53 items.");
    } catch (e) {
        await client.query('ROLLBACK');
        console.error("Error during seeding", e);
    } finally {
        client.release();
    }
}

seed().then(() => process.exit(0)).catch(() => process.exit(1));
