const { query } = require('./src/config/db');
query("SELECT constraint_name FROM information_schema.table_constraints WHERE table_name='branches' AND constraint_type='UNIQUE'")
  .then(res => console.log(res.rows))
  .catch(console.error)
  .finally(() => setTimeout(() => process.exit(0), 1000));
