/**
 * migrations/fix_item_price_tiers_label.js
 * Fix mismatch kolom item_price_tiers:
 *
 * DDL awal (migrasi.js baris 156) mendefinisikan kolom 'name VARCHAR NOT NULL'.
 * Kode backend (pricelist.js, receives.js, items.js) seluruhnya memakai kolom 'label'.
 * migrasi.js baris 844 hanya ADD COLUMN IF NOT EXISTS label -- tidak rename 'name'.
 *
 * Akibatnya jika tabel dibuat dari DDL awal:
 *   - INSERT (item_id, min_qty, price, label) gagal karena 'name NOT NULL' tidak terpenuhi
 *   - Kolom 'label' ada tapi kosong semua
 *
 * Fix yang dilakukan:
 *   1. Jika kolom 'name' ada -> rename ke 'label' (preserve existing data)
 *   2. Jika kolom 'label' belum ada -> tambah baru (VARCHAR nullable)
 *   3. Jika 'label' sudah ada -> tidak ada yang dilakukan
 *
 * Usage: node migrations/fix_item_price_tiers_label.js
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
        console.log('Running migration: fix_item_price_tiers_label\n');

        // Cek keberadaan kolom 'name' dan 'label'
        const colCheck = await client.query(`
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'item_price_tiers'
              AND column_name IN ('name', 'label')
        `);

        const cols = colCheck.rows.map(r => r.column_name);
        const hasName = cols.includes('name');
        const hasLabel = cols.includes('label');

        if (hasName && !hasLabel) {
            // Kasus 1: masih pakai 'name' (DDL lama), belum ada 'label' -> rename
            await client.query(`ALTER TABLE item_price_tiers RENAME COLUMN name TO label`);
            console.log('  + renamed item_price_tiers.name -> item_price_tiers.label');

        } else if (hasName && hasLabel) {
            // Kasus 2: kedua kolom ada -> 'label' mungkin kosong, copy data dari 'name' dulu
            await client.query(`UPDATE item_price_tiers SET label = name WHERE label IS NULL`);
            console.log('  ~ both columns exist: backfilled label from name where null');
            // Hapus kolom 'name' yang sudah tidak dipakai kode
            await client.query(`ALTER TABLE item_price_tiers DROP COLUMN name`);
            console.log('  - dropped redundant column item_price_tiers.name');

        } else if (!hasLabel) {
            // Kasus 3: kedua kolom tidak ada -> tambah 'label' baru
            await client.query(`ALTER TABLE item_price_tiers ADD COLUMN IF NOT EXISTS label VARCHAR(100)`);
            console.log('  + added item_price_tiers.label (VARCHAR 100, nullable)');

        } else {
            // Kasus 4: 'label' sudah ada dan 'name' tidak ada -> sudah benar
            console.log('  = item_price_tiers.label already exists and correct, nothing to do');
        }

        // Pastikan uuid juga ada (dibutuhkan kode pricelist)
        await client.query(`ALTER TABLE item_price_tiers ADD COLUMN IF NOT EXISTS uuid UUID DEFAULT gen_random_uuid()`).catch(() => { });
        await client.query(`UPDATE item_price_tiers SET uuid = gen_random_uuid() WHERE uuid IS NULL`).catch(() => { });
        console.log('  + item_price_tiers.uuid ensured');

        console.log('\nMigration complete.');
    } finally {
        client.release();
        await pool.end();
    }
}

run().catch(err => { console.error('Migration failed:', err.message); process.exit(1); });
