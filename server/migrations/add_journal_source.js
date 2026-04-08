/**
 * migrations/add_journal_source.js
 * Adds ref_number and ref_type columns to journal_entries for PO/SO traceability.
 * Also ensures journal_entries.uuid exists (should already exist from migrasi.js).
 *
 * Usage: node migrations/add_journal_source.js
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
        console.log('Running migration: add_journal_source\n');

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

        // Ensure uuid column exists on journal_entries
        await safe(
            `ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS uuid UUID NOT NULL DEFAULT gen_random_uuid()`,
            'journal_entries.uuid'
        );

        // Unique index on uuid
        await safe(
            `CREATE UNIQUE INDEX IF NOT EXISTS idx_journal_entries_uuid ON journal_entries(uuid)`,
            'unique index on journal_entries.uuid'
        );

        // ref_number: nomor dokumen sumber (PO-001, SO-001, GR-001, GI-001, dll)
        await safe(
            `ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS ref_number VARCHAR(50)`,
            'journal_entries.ref_number'
        );

        // ref_type: tipe dokumen sumber ('PO','GR','SO','GI','SRET','PRET','MANUAL')
        await safe(
            `ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS ref_type VARCHAR(20)`,
            'journal_entries.ref_type'
        );

        // Index for faster search by ref_number
        await safe(
            `CREATE INDEX IF NOT EXISTS idx_journal_entries_ref_number ON journal_entries(ref_number)`,
            'index on journal_entries.ref_number'
        );

        console.log('\nMigration complete.');
    } finally {
        client.release();
        await pool.end();
    }
}

run().catch(err => { console.error('Migration failed:', err.message); process.exit(1); });
