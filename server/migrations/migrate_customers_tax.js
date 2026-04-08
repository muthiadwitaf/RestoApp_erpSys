/**
 * migrate_customers_tax.js
 * Incremental migration — tambah kolom npwp & kode_transaksi ke tabel customers
 * untuk keperluan e-Faktur Pajak (PER-03/PJ/2022).
 * Aman dijalankan berkali-kali (idempotent via IF NOT EXISTS)
 *
 * Jalankan: node migrate_customers_tax.js
 */
const { query } = require('../src/config/db');

(async () => {
    console.log('🚀 Menjalankan migrasi customers tax info...\n');

    const steps = [
        {
            name: 'Tambah kolom npwp ke customers',
            sql: `ALTER TABLE customers ADD COLUMN IF NOT EXISTS npwp VARCHAR(30)`
        },
        {
            name: 'Tambah kolom is_pkp ke customers',
            sql: `ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_pkp BOOLEAN DEFAULT false`
        },
        {
            name: 'Tambah kolom customer_type ke customers',
            sql: `ALTER TABLE customers ADD COLUMN IF NOT EXISTS customer_type VARCHAR(20) DEFAULT 'retail'`
        },
        {
            name: 'Tambah kolom kode_transaksi ke customers (computed dari customer_type)',
            sql: `ALTER TABLE customers ADD COLUMN IF NOT EXISTS kode_transaksi VARCHAR(10)`
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
    console.log('\n📋 Verifikasi kolom customers:');
    const cols = await query(`
        SELECT column_name, data_type, column_default
        FROM information_schema.columns
        WHERE table_name = 'customers'
        ORDER BY ordinal_position
    `);
    cols.rows.forEach(c => console.log(`   ${c.column_name} (${c.data_type})`));

    console.log('\n✅ Migrasi selesai!');
    process.exit();
})().catch(e => { console.error('Fatal error:', e.message); process.exit(1); });
