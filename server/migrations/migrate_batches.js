/**
 * migrate_batches.js
 * Incremental migration — tambah kolom ke tabel batches & goods_receive_lines
 * Aman dijalankan berkali-kali (idempotent via IF NOT EXISTS)
 */
const { query } = require('../src/config/db');


(async () => {
    console.log('🚀 Menjalankan migrasi batch tracking...\n');

    const steps = [
        {
            name: 'Tambah kolom status ke batches',
            sql: `ALTER TABLE batches ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active','expiring','expired','depleted'))`
        },
        {
            name: 'Tambah kolom gr_id ke batches (FK goods_receives)',
            sql: `ALTER TABLE batches ADD COLUMN IF NOT EXISTS gr_id INTEGER REFERENCES goods_receives(id) ON DELETE SET NULL`
        },
        {
            name: 'Tambah kolom notes ke batches',
            sql: `ALTER TABLE batches ADD COLUMN IF NOT EXISTS notes TEXT`
        },
        {
            name: 'Tambah kolom batch_id ke goods_receive_lines (FK ke batches)',
            sql: `ALTER TABLE goods_receive_lines ADD COLUMN IF NOT EXISTS batch_id INTEGER REFERENCES batches(id) ON DELETE SET NULL`
        },
        {
            name: 'Update status batches yang sudah expired (otomatis berdasarkan tanggal)',
            sql: `UPDATE batches SET status = CASE
        WHEN expiry_date IS NULL THEN 'active'
        WHEN expiry_date < CURRENT_DATE THEN 'expired'
        WHEN expiry_date <= CURRENT_DATE + INTERVAL '30 days' THEN 'expiring'
        ELSE 'active'
      END
      WHERE status = 'active'`
        },
        {
            name: 'Buat index expiry_date untuk performa query',
            sql: `CREATE INDEX IF NOT EXISTS idx_batches_expiry ON batches(expiry_date) WHERE status != 'depleted'`
        },
        {
            name: 'Buat index status untuk filter',
            sql: `CREATE INDEX IF NOT EXISTS idx_batches_status ON batches(status)`
        }
    ];

    for (const step of steps) {
        try {
            await query(step.sql);
            console.log(`✅ ${step.name}`);
        } catch (e) {
            console.error(`❌ ${step.name}: ${e.message}`);
        }
    }

    // Verifikasi
    console.log('\n📋 Verifikasi kolom batches:');
    const cols = await query(`SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = 'batches' ORDER BY ordinal_position`);
    cols.rows.forEach(c => console.log(`   ${c.column_name} (${c.data_type})`));

    console.log('\n📋 Verifikasi kolom goods_receive_lines:');
    const grl = await query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'goods_receive_lines' ORDER BY ordinal_position`);
    grl.rows.forEach(c => console.log(`   ${c.column_name} (${c.data_type})`));

    console.log('\n✅ Migrasi selesai!');
    process.exit();
})().catch(e => { console.error('Fatal error:', e.message); process.exit(1); });
