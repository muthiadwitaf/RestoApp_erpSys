require('dotenv').config();
const { pool } = require('./src/config/db');

async function explore() {
  try {
    const res2 = await pool.query("SELECT company_id, COUNT(*) FROM items GROUP BY company_id");
    console.log('items company_id:', res2.rows);
    const res3 = await pool.query("SELECT company_id, COUNT(*) FROM resto_menu_items GROUP BY company_id");
    console.log('resto_menu_items company_id:', res3.rows);
  } catch (e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}
explore();
