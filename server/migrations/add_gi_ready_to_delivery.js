/**
 * add_gi_ready_to_delivery.js
 * Tambah status 'ready_to_delivery' dan kolom ready_by, ready_at ke goods_issues.
 * Usage: node migrations/add_gi_ready_to_delivery.js
 */
require('dotenv').config({ path: '../.env' });
const { query, pool } = require('../src/config/db');

async function run() {
    console.log('=== Migration: GI Ready to Delivery ===\n');

    await query(`ALTER TABLE goods_issues ADD COLUMN IF NOT EXISTS ready_by VARCHAR`);
    console.log('✓ Kolom ready_by ditambahkan');

    await query(`ALTER TABLE goods_issues ADD COLUMN IF NOT EXISTS ready_at TIMESTAMPTZ`);
    console.log('✓ Kolom ready_at ditambahkan');

    // Verifikasi
    const res = await query(`
        SELECT column_name, data_type FROM information_schema.columns
        WHERE table_name = 'goods_issues'
          AND column_name IN ('status','approved_by','approved_at','ready_by','ready_at')
        ORDER BY column_name
    `);
    console.log('\nKolom goods_issues saat ini:');
    res.rows.forEach(r => console.log(`  ${r.column_name}: ${r.data_type}`));

    console.log('\n✅ Migration selesai!');
    await pool.end();
}

run().catch(err => {
    console.error('❌ Gagal:', err.message);
    pool.end().catch(() => { });
    process.exit(1);
});
