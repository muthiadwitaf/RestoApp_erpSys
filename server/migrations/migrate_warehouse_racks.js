/**
 * migrate_warehouse_racks.js
 * Tambah tabel warehouse_racks untuk menyimpan posisi tiap rak di lantai gudang
 * (floor_row, floor_col = koordinat rak pada denah gudang).
 * Aman dijalankan berkali-kali.
 *
 * Jalankan: node migrations/migrate_warehouse_racks.js
 */
const { query } = require('../src/config/db');

(async () => {
    console.log('🚀 Menjalankan migrasi warehouse_racks...\n');

    // 1. Tabel warehouse_racks: posisi rak di lantai gudang
    await query(`
        CREATE TABLE IF NOT EXISTS warehouse_racks (
            id          SERIAL PRIMARY KEY,
            uuid        UUID    NOT NULL DEFAULT gen_random_uuid() UNIQUE,
            warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
            rack        VARCHAR(50) NOT NULL,
            floor_row   SMALLINT NOT NULL DEFAULT 1,  -- baris di lantai gudang (1 = atas)
            floor_col   SMALLINT NOT NULL DEFAULT 1,  -- kolom di lantai gudang (1 = kiri)
            total_rows  SMALLINT NOT NULL DEFAULT 4,  -- jumlah baris dalam rak
            total_cols  SMALLINT NOT NULL DEFAULT 5,  -- jumlah kolom dalam rak
            created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
            updated_at  TIMESTAMP NOT NULL DEFAULT NOW(),
            UNIQUE (warehouse_id, rack)
        )
    `);
    console.log('  ✓ Tabel warehouse_racks dibuat');

    // 2. Migrasi rak yang sudah ada di warehouse_bins (jika ada)
    const migrated = await query(`
        INSERT INTO warehouse_racks (warehouse_id, rack, floor_row, floor_col, total_rows, total_cols)
        SELECT
            warehouse_id,
            rack,
            1                      AS floor_row,
            ROW_NUMBER() OVER (
                PARTITION BY warehouse_id
                ORDER BY rack
            )                      AS floor_col,
            MAX(row_num)           AS total_rows,
            MAX(col_num)           AS total_cols
        FROM warehouse_bins
        GROUP BY warehouse_id, rack
        ON CONFLICT (warehouse_id, rack) DO NOTHING
    `);
    console.log(`  ✓ Migrasi rak lama: ${migrated.rowCount} rak`);

    // 3. Index
    await query(`CREATE INDEX IF NOT EXISTS idx_warehouse_racks_warehouse ON warehouse_racks(warehouse_id)`);
    console.log('  ✓ Index dibuat');

    console.log('\n✅ Selesai!');
    process.exit(0);
})().catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
});
