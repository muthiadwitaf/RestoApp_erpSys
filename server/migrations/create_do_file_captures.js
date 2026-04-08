/**
 * Migration: Create do_file_captures table
 * Run: node migrations/create_do_file_captures.js
 */
require('dotenv').config();
const { query } = require('../src/config/db');

async function up() {
    await query(`
        CREATE TABLE IF NOT EXISTS do_file_captures (
            id          SERIAL PRIMARY KEY,
            uuid        UUID NOT NULL DEFAULT gen_random_uuid(),
            delivery_id INTEGER NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
            company_id  INTEGER NOT NULL,
            file_uuid   VARCHAR(36) NOT NULL,
            filename    VARCHAR(255) NOT NULL,
            file_url    TEXT NOT NULL,
            file_size   INTEGER,
            caption     TEXT,
            captured_by INTEGER REFERENCES users(id),
            captured_by_name VARCHAR(200),
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_do_file_captures_delivery ON do_file_captures(delivery_id);
        CREATE INDEX IF NOT EXISTS idx_do_file_captures_uuid ON do_file_captures(uuid);
    `);
    console.log('✅ Table do_file_captures created successfully');
}

up().then(() => process.exit(0)).catch(e => { console.error('❌', e.message); process.exit(1); });
