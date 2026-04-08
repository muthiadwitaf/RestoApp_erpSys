/**
 * migrate_bin_items_stored_at.js
 * Tambah kolom stored_at (tanggal masuk ke bin) dan stored_by (siapa yang memasukkan)
 * ke tabel bin_items.
 *
 * Jalankan: node migrations/migrate_bin_items_stored_at.js
 */
const { query } = require('../src/config/db');

(async () => {
    console.log('🚀 Migrasi bin_items.stored_at...\n');

    // stored_at: waktu pertama kali item dimasukkan ke bin (tidak berubah saat qty diupdate)
    await query(`
        ALTER TABLE bin_items
        ADD COLUMN IF NOT EXISTS stored_at  TIMESTAMP,
        ADD COLUMN IF NOT EXISTS stored_by  VARCHAR(150)
    `);
    console.log('  ✓ Kolom stored_at & stored_by ditambahkan');

    // Isi stored_at dari created_at untuk data lama
    await query(`
        UPDATE bin_items
        SET stored_at = created_at
        WHERE stored_at IS NULL
    `);
    console.log('  ✓ Data lama di-backfill dari created_at');

    // Set default agar baris baru selalu terisi
    await query(`
        ALTER TABLE bin_items
        ALTER COLUMN stored_at SET DEFAULT NOW()
    `);
    console.log('  ✓ Default stored_at = NOW()');

    console.log('\n✅ Selesai!');
    process.exit(0);
})().catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
});
