/**
 * migrations/add_kolom_theme.js
 * Adds theme_preference column to users table.
 * Used to persist user UI theme setting ('light' or 'dark').
 *
 * Usage: node migrations/add_kolom_theme.js
 */
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'erpsys',
});

async function run() {
    const client = await pool.connect();
    try {
        console.log('Running migration: add_kolom_theme\n');

        const safe = async (sql, label) => {
            try {
                await client.query(sql);
                console.log('  + ' + label);
            } catch (e) {
                if (e.message.includes('already exists') || e.message.includes('duplicate column')) {
                    console.log('  = already exists: ' + label);
                } else {
                    throw e;
                }
            }
        };

        // Tambah kolom theme_preference ke tabel users
        await safe(
            `ALTER TABLE users ADD COLUMN IF NOT EXISTS theme_preference VARCHAR(20) DEFAULT 'light'`,
            "users.theme_preference (VARCHAR 20, default 'light')"
        );

        console.log('\nMigration complete.');
    } finally {
        client.release();
        await pool.end();
    }
}

run().catch(err => { console.error('Migration failed:', err.message); process.exit(1); });
