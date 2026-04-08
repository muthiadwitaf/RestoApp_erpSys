/**
 * migrate_warehouse_bins.js
 * Tambah tabel warehouse_bins dan bin_items untuk fitur lokasi bin di gudang.
 * Aman dijalankan berkali-kali (IF NOT EXISTS).
 *
 * Jalankan: node migrations/migrate_warehouse_bins.js
 */
const { query } = require('../src/config/db');

(async () => {
    console.log('🚀 Menjalankan migrasi warehouse bins...\n');

    // 1. Tabel warehouse_bins: definisi fisik slot / bin di dalam gudang
    await query(`
        CREATE TABLE IF NOT EXISTS warehouse_bins (
            id          SERIAL PRIMARY KEY,
            uuid        UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
            warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
            rack        VARCHAR(50) NOT NULL,       -- nama/kode rak, e.g. "A", "B", "RACK-01"
            row_num     SMALLINT    NOT NULL,        -- baris (vertikal), 1 = paling bawah
            col_num     SMALLINT    NOT NULL,        -- kolom (horizontal), 1 = paling kiri
            label       VARCHAR(100),               -- label tambahan opsional
            is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
            created_at  TIMESTAMP   NOT NULL DEFAULT NOW(),
            updated_at  TIMESTAMP   NOT NULL DEFAULT NOW(),
            UNIQUE (warehouse_id, rack, row_num, col_num)
        )
    `);
    console.log('  ✓ Tabel warehouse_bins siap');

    // 2. Tabel bin_items: barang yang tersimpan di sebuah bin
    await query(`
        CREATE TABLE IF NOT EXISTS bin_items (
            id          SERIAL PRIMARY KEY,
            bin_id      INTEGER NOT NULL REFERENCES warehouse_bins(id) ON DELETE CASCADE,
            item_id     INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
            batch_id    INTEGER REFERENCES batches(id) ON DELETE SET NULL,
            qty         NUMERIC(15,4) NOT NULL DEFAULT 0,
            uom         VARCHAR(30),
            created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
            updated_at  TIMESTAMP NOT NULL DEFAULT NOW(),
            UNIQUE (bin_id, item_id, batch_id)
        )
    `);
    console.log('  ✓ Tabel bin_items siap');

    // 3. Index untuk performa
    await query(`CREATE INDEX IF NOT EXISTS idx_warehouse_bins_warehouse ON warehouse_bins(warehouse_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_bin_items_bin ON bin_items(bin_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_bin_items_item ON bin_items(item_id)`);
    console.log('  ✓ Index dibuat');

    console.log('\n✅ Migrasi warehouse bins selesai!');
    process.exit(0);
})().catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
});
