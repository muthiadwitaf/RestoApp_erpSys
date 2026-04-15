require('dotenv').config();
const { query } = require('./src/config/db');
const logger = require('./src/utils/logger');
query("SELECT id, message, endpoint, stack FROM error_logs WHERE endpoint LIKE '%pos-sessions%' ORDER BY id DESC LIMIT 5")
  .then(res => logger.info(res.rows))
  .catch(err => logger.error(err))
  .finally(() => setTimeout(() => process.exit(0), 1000));
