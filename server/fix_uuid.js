require('dotenv').config();
const { getClient } = require('./src/config/db');

(async () => {
    const client = await getClient();
    try {
        await client.query("UPDATE employees SET company_uuid = '65b9250e-20ca-4159-a94f-301728e583f8' WHERE company_id = 12 AND company_uuid IS NULL");
        console.log('Fixed company_uuid for the 3 missing waiters.');
    } catch(e) {
        console.error(e);
    } finally {
        client.release();
        process.exit(0);
    }
})();
