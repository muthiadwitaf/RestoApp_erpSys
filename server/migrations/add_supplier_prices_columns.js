/**
 * migrations/add_supplier_prices_columns.js
 * Fix supplier_prices table: tambah kolom uuid, uom_id, effective_date, notes
 * yang dipakai di kode tapi belum ada di DDL awal (migrasi.js).
 *
 * Juga memperbaiki UNIQUE constraint dari (supplier_id, item_id)
 * menjadi (supplier_id, item_id, uom_id) agar bisa menyimpan harga
 * berbeda per satuan (UOM) dari supplier yang sama untuk item yang sama.
 *
 * Usage: node migrations/add_supplier_prices_columns.js
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
        console.log('Running migration: add_supplier_prices_columns\n');

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

        // 1. Tambah kolom uuid
        await safe(
            `ALTER TABLE supplier_prices ADD COLUMN IF NOT EXISTS uuid UUID NOT NULL DEFAULT gen_random_uuid()`,
            'supplier_prices.uuid'
        );

        // 2. Unique index pada uuid (untuk lookup DELETE/UPDATE by uuid)
        await safe(
            `CREATE UNIQUE INDEX IF NOT EXISTS idx_supplier_prices_uuid ON supplier_prices(uuid)`,
            'unique index on supplier_prices.uuid'
        );

        // 3. Tambah kolom uom_id (FK ke units)
        await safe(
            `ALTER TABLE supplier_prices ADD COLUMN IF NOT EXISTS uom_id INTEGER REFERENCES units(id)`,
            'supplier_prices.uom_id'
        );

        // 4. Tambah kolom effective_date
        await safe(
            `ALTER TABLE supplier_prices ADD COLUMN IF NOT EXISTS effective_date DATE`,
            'supplier_prices.effective_date'
        );

        // 5. Tambah kolom notes
        await safe(
            `ALTER TABLE supplier_prices ADD COLUMN IF NOT EXISTS notes TEXT`,
            'supplier_prices.notes'
        );

        // 6. Perbaiki UNIQUE constraint: hapus lama, buat baru per (supplier_id, item_id, uom_id)
        //    Agar harga per UOM berbeda bisa disimpan untuk supplier+item yang sama.
        try {
            await client.query(`ALTER TABLE supplier_prices DROP CONSTRAINT IF EXISTS supplier_prices_supplier_id_item_id_key`);
            console.log('  - dropped old UNIQUE(supplier_id, item_id)');
        } catch (e) {
            console.log('  = old unique constraint not found, skipping drop');
        }

        await safe(
            `CREATE UNIQUE INDEX IF NOT EXISTS idx_supplier_prices_supplier_item_uom
             ON supplier_prices(supplier_id, item_id, COALESCE(uom_id, 0))`,
            'unique index on supplier_prices(supplier_id, item_id, uom_id)'
        );

        console.log('\nMigration complete.');
    } finally {
        client.release();
        await pool.end();
    }
}

run().catch(err => { console.error('Migration failed:', err.message); process.exit(1); });
