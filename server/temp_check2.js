const { query } = require('./src/config/db');
query("SELECT pg_get_constraintdef((SELECT oid FROM pg_constraint WHERE conname = 'branches_code_key'))")
  .then(res => console.log(res.rows))
  .catch(console.error)
  .finally(() => setTimeout(() => process.exit(0), 1000));
