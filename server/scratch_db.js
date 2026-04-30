const { query } = require('./src/config/db');

async function test() {
    try {
        const res = await query('SELECT id, email, password_hash, is_active FROM users');
        console.log("Users:", res.rows);
        process.exit(0);
    } catch(e) {
        console.error(e);
        process.exit(1);
    }
}
test();
