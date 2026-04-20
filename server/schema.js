require('dotenv').config();
const { getClient } = require('./src/config/db');

(async () => {
    const client = await getClient();
    try {
        const {rows} = await client.query("SELECT udt_name FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'status'");
        console.log("status column type:", rows);
        const enums = await client.query("SELECT unnest(enum_range(NULL::emp_status))");
        console.log("emp_status enum:", enums.rows);
    } catch(e) { console.error('Er:', e.message) } finally {
        client.release();
        process.exit(0);
    }
})();
