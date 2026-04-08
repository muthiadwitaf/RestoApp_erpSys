/**
 * add_gi_approval_flow.js
 *
 * Migration: Tambahkan approval workflow ke tabel goods_issues.
 *  - Ubah default status dari 'completed' → 'draft'
 *  - Tambah kolom approved_by, approved_at
 *
 * GI yang sudah ada (status='completed') TIDAK diubah, tetap valid.
 * Safe to run multiple times (IF NOT EXISTS / IF EXISTS guards).
 *
 * Usage: node migrations/add_gi_approval_flow.js
 */
require('dotenv').config();
const { pool, query } = require('../src/config/db');

async function run() {
    console.log('=== GI Approval Flow Migration ===\n');

    // 1. Ubah default status goods_issues dari 'completed' → 'draft'
    await query(`ALTER TABLE goods_issues ALTER COLUMN status SET DEFAULT 'draft'`);
    console.log('✓ Default status goods_issues → draft');

    // 2. Tambah kolom approved_by
    await query(`ALTER TABLE goods_issues ADD COLUMN IF NOT EXISTS approved_by VARCHAR`);
    console.log('✓ Kolom approved_by ditambahkan');

    // 3. Tambah kolom approved_at
    await query(`ALTER TABLE goods_issues ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ`);
    console.log('✓ Kolom approved_at ditambahkan');

    // 4. Verifikasi
    const res = await query(`
        SELECT column_name, column_default, is_nullable, data_type
        FROM information_schema.columns
        WHERE table_name = 'goods_issues'
          AND column_name IN ('status','approved_by','approved_at')
        ORDER BY column_name
    `);
    console.log('\nStruktur kolom goods_issues yang diperbarui:');
    res.rows.forEach(r => {
        console.log(`  ${r.column_name}: ${r.data_type} | default: ${r.column_default || '-'} | nullable: ${r.is_nullable}`);
    });

    // 5. Ringkasan data saat ini
    const counts = await query(`
        SELECT status, COUNT(*) as total
        FROM goods_issues
        GROUP BY status ORDER BY status
    `);
    console.log('\nJumlah GI per status saat ini:');
    counts.rows.forEach(r => console.log(`  ${r.status}: ${r.total}`));

    console.log('\n✅ Migration selesai!');
    await pool.end();
}

run().catch(err => {
    console.error('❌ Migration gagal:', err.message);
    pool.end().catch(() => { });
    process.exit(1);
});
