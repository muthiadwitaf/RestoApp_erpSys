require('dotenv').config();
const { query } = require('./src/config/db');
query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'pos_sessions'")
  .then(res => console.log(JSON.stringify(res.rows, null, 2)))
  .catch(console.error)
  .finally(() => setTimeout(() => process.exit(0), 1000));
