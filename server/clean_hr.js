require('dotenv').config();
const { getClient } = require('./src/config/db');

(async () => {
    const client = await getClient();
    try {
        const res = await client.query("DELETE FROM employees WHERE company_id = 12 AND LOWER(nama_lengkap) NOT IN ('ahmad', 'budi', 'm', 'pita')");
        console.log(`Deleted ${res.rowCount} old/dummy employees.`);
    } catch(e) {
        console.error(e);
    } finally {
        client.release();
        process.exit(0);
    }
})();
