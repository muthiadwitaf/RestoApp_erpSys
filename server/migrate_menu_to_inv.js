require('dotenv').config();
const { pool } = require('./src/config/db');
const { v4: uuidv4 } = require('uuid');

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // 1. Get or create a base unit "Porsi"
    let unitId = null;
    const unitRes = await client.query("SELECT id FROM units WHERE name ILIKE 'Porsi'");
    if (unitRes.rows.length > 0) {
      unitId = unitRes.rows[0].id;
    } else {
      const insUnit = await client.query(
        "INSERT INTO units (uuid, code, name, created_at) VALUES ($1, $2, $3, NOW()) RETURNING id",
        [uuidv4(), 'PORSI', 'Porsi']
      );
      unitId = insUnit.rows[0].id;
      console.log('Created unit Porsi');
    }

    // 2. Fetch all resto menu items
    const menuRes = await client.query("SELECT * FROM resto_menu_items");
    const menuItems = menuRes.rows;
    console.log(`Found ${menuItems.length} menu items to migrate.`);

    // 3. Migrate Categories dynamically per company_id
    const catMap = {}; // "company_id_categoryName" -> id
    for (const item of menuItems) {
      const catName = item.category || 'Uncategorized';
      const cId = item.company_id || 1;
      const mapKey = `${cId}_${catName}`;
      
      if (!catMap[mapKey]) {
        const catRes = await client.query("SELECT id FROM categories WHERE name ILIKE $1", [catName]);
        if (catRes.rows.length > 0) {
          catMap[mapKey] = catRes.rows[0].id;
        } else {
          const catCode = catName.substring(0, 3).toUpperCase() + Math.random().toString(36).substr(2, 3).toUpperCase();
          const insCat = await client.query(
            "INSERT INTO categories (uuid, code, name, created_at) VALUES ($1, $2, $3, NOW()) RETURNING id",
            [uuidv4(), catCode, catName]
          );
          catMap[mapKey] = insCat.rows[0].id;
          console.log(`Created category ${catName} for company ${cId}`);
        }
      }
    }

    // 4. Insert into items per company_id
    let insertedCount = 0;
    for (const item of menuItems) {
      const cId = item.company_id || 1;
      // check if it exists by name AND company_id to avoid duplicate
      const existRes = await client.query("SELECT id FROM items WHERE name = $1 AND company_id = $2", [item.name, cId]);
      if (existRes.rows.length === 0) {
        const itemCode = 'R-' + item.id.toString().padStart(4, '0');
        const hpp = item.price * 0.4; // fake HPP 40% of standard price
        const mapKey = `${cId}_${item.category || 'Uncategorized'}`;
        
        await client.query(`
          INSERT INTO items (
            uuid, company_id, code, name, category_id,
            small_uom_id, big_uom_id, conversion_factor,
            buy_price, sell_price, hpp,
            is_active, is_taxable, created_at
          ) VALUES (
            $1, $2, $3, $4, $5,
            $6, $6, 1,
            $7, $8, $9,
            true, true, NOW()
          )
        `, [
          uuidv4(), cId, itemCode, item.name, catMap[mapKey],
          unitId,
          hpp, item.price, hpp
        ]);
        insertedCount++;
      }
    }

    await client.query('COMMIT');
    console.log(`Migration completed. Migrated ${insertedCount} new items from POS Menu to Inventory Items.`);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
  } finally {
    client.release();
    process.exit(0);
  }
}

migrate();
