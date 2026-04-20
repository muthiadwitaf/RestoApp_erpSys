const { query } = require('./src/config/db');

async function check() {
  const tables = ['items', 'resto_menu_items', 'inventory'];
  for (const table of tables) {
    const cols = await query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '${table}'`);
    console.log(`\n### ${table} ###\n`, cols.rows.map(r => `${r.column_name} (${r.data_type})`).join('\n'));
  }
  process.exit();
}
check();
