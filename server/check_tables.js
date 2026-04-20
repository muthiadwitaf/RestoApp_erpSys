const { query } = require('./src/config/db');

async function check() {
  const tables = await query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
  console.log(tables.rows.map(r => r.table_name).join(', '));
  process.exit();
}
check();
