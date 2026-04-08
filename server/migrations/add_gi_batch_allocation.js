/**
 * add_gi_batch_allocation.js
 * Migration: goods_issue_batch_allocations table
 * Tracks which batches are used for each GI line (FEFO support)
 * Idempotent — safe to run multiple times.
 */
const { query } = require('../src/config/db');

(async () => {
    console.log('🚀 Menjalankan migrasi batch allocation untuk GI...\n');

    const steps = [
        {
            name: 'Buat tabel goods_issue_batch_allocations',
            sql: `CREATE TABLE IF NOT EXISTS goods_issue_batch_allocations (
                id         SERIAL PRIMARY KEY,
                gi_line_id INTEGER NOT NULL REFERENCES goods_issue_lines(id) ON DELETE CASCADE,
                batch_id   INTEGER NOT NULL REFERENCES batches(id),
                qty        INTEGER NOT NULL CHECK (qty > 0),
                created_at TIMESTAMPTZ DEFAULT NOW()
            )`
        },
        {
            name: 'Index gi_line_id untuk join cepat',
            sql: `CREATE INDEX IF NOT EXISTS idx_gi_batch_alloc_line ON goods_issue_batch_allocations(gi_line_id)`
        },
        {
            name: 'Index batch_id untuk lookup batch usage',
            sql: `CREATE INDEX IF NOT EXISTS idx_gi_batch_alloc_batch ON goods_issue_batch_allocations(batch_id)`
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

    // Verify
    console.log('\n📋 Verifikasi kolom goods_issue_batch_allocations:');
    const cols = await query(
        `SELECT column_name, data_type, column_default
         FROM information_schema.columns
         WHERE table_name = 'goods_issue_batch_allocations'
         ORDER BY ordinal_position`
    );
    cols.rows.forEach(c => console.log(`   ${c.column_name} (${c.data_type})`));

    console.log('\n✅ Migrasi batch allocation selesai!');
    process.exit();
})().catch(e => { console.error('Fatal error:', e.message); process.exit(1); });
