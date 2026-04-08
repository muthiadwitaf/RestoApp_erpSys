require('dotenv').config();
const { query } = require('./src/config/db');

async function revert() {
    try {
        await query(`ALTER TABLE pos_sessions DROP COLUMN IF EXISTS total_cash_in;`);
        await query(`ALTER TABLE pos_sessions DROP COLUMN IF EXISTS total_cash_out;`);
        await query(`ALTER TABLE pos_sessions DROP COLUMN IF EXISTS expected_cash;`);
        await query(`ALTER TABLE pos_sessions DROP COLUMN IF EXISTS actual_cash;`);
        await query(`ALTER TABLE pos_sessions DROP COLUMN IF EXISTS difference;`);
        console.log("Revert complete!");
    } catch(e) {
        console.error("Revert failed:", e);
    } finally {
        process.exit();
    }
}

revert();
