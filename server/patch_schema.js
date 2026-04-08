require('dotenv').config();
const { query } = require('./src/config/db');

async function migrate() {
    try {
        await query(`ALTER TABLE pos_sessions ADD COLUMN IF NOT EXISTS total_cash_in DECIMAL(15,2) DEFAULT 0;`);
        await query(`ALTER TABLE pos_sessions ADD COLUMN IF NOT EXISTS total_cash_out DECIMAL(15,2) DEFAULT 0;`);
        await query(`ALTER TABLE pos_sessions ADD COLUMN IF NOT EXISTS expected_cash DECIMAL(15,2) DEFAULT 0;`);
        await query(`ALTER TABLE pos_sessions ADD COLUMN IF NOT EXISTS actual_cash DECIMAL(15,2);`);
        await query(`ALTER TABLE pos_sessions ADD COLUMN IF NOT EXISTS difference DECIMAL(15,2);`);
        console.log("Migration success!");
    } catch(e) {
        console.error("Migration failed:", e);
    } finally {
        process.exit();
    }
}

migrate();
