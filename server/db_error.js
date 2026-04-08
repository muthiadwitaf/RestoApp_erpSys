require('dotenv').config();
const { query } = require('./src/config/db');
query("SELECT id, message, endpoint, stack FROM error_logs WHERE endpoint LIKE '%pos-sessions%' ORDER BY id DESC LIMIT 5")
  .then(res => console.log(JSON.stringify(res.rows, null, 2)))
  .catch(console.error)
  .finally(() => setTimeout(() => process.exit(0), 1000));
