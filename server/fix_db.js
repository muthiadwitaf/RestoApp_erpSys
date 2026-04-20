require('dotenv').config();
const { query, pool } = require('./src/config/db');

async function fix() {
  try {
    const res = await query('ALTER TABLE employees ADD COLUMN IF NOT EXISTS company_uuid UUID;');
    console.log('Added company_uuid to employees.');
    
    // Also set company_uuid from company_id for existing records
    const res2 = await query(`
      UPDATE employees e
      SET company_uuid = c.uuid
      FROM companies c
      WHERE e.company_id = c.id AND e.company_uuid IS NULL;
    `);
    console.log('Updated existing employees with company_uuid:', res2.rowCount);
  } catch (e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}
fix();
