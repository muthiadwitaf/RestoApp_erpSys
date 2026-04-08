const { readFileSync } = require('fs');
const { join } = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'erpsys',
});

async function run() {
    const sql = readFileSync(join(__dirname, 'migrations', 'resto_menu.sql'), 'utf8');
    try {
        await pool.query(sql);
        console.log('✅ Resto menu table created successfully!');
    } catch (err) {
        console.error('❌ Migration error:', err.message);
    } finally {
        await pool.end();
    }
}

run();
