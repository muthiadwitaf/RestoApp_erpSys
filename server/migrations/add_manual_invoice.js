/**
 * add_manual_invoice.js
 * Migration — tambah support Manual Invoice (tanpa SO, free-text line items)
 * Idempotent (aman dijalankan berkali-kali via IF NOT EXISTS / IF EXISTS checks)
 *
 * Jalankan: node migrations/add_manual_invoice.js
 */
const { query } = require('../src/config/db');

(async () => {
    console.log('🚀 Menjalankan migrasi Manual Invoice...\n');

    const steps = [
        {
            name: 'Tambah kolom is_manual ke invoices',
            sql: `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS is_manual BOOLEAN DEFAULT FALSE`
        },
        {
            name: 'Tambah kolom customer_id ke invoices (untuk invoice manual tanpa SO)',
            sql: `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_id INTEGER REFERENCES customers(id)`
        },
        {
            name: 'Tambah kolom kode_transaksi ke invoices',
            sql: `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS kode_transaksi VARCHAR(5)`
        },
        {
            name: 'Tambah kolom customer_name_manual ke invoices (untuk tamu / customer tanpa data master)',
            sql: `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_name_manual TEXT`
        },
        {
            name: 'Buat tabel invoice_lines (free-text, tidak FK ke items)',
            sql: `
                CREATE TABLE IF NOT EXISTS invoice_lines (
                    id         SERIAL PRIMARY KEY,
                    inv_id     INTEGER       NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
                    item_name  TEXT          NOT NULL,
                    item_code  VARCHAR(50),
                    qty        NUMERIC(15,4) NOT NULL DEFAULT 1,
                    uom        VARCHAR(20)   NOT NULL DEFAULT 'pcs',
                    price      NUMERIC(15,2) NOT NULL,
                    discount   NUMERIC(5,2)  DEFAULT 0,
                    notes      TEXT
                )
            `
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

    // Verifikasi kolom invoices
    console.log('\n📋 Verifikasi kolom invoices:');
    const cols = await query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'invoices'
        ORDER BY ordinal_position
    `);
    cols.rows.forEach(c => console.log(`   ${c.column_name} (${c.data_type})`));

    // Verifikasi tabel invoice_lines
    console.log('\n📋 Verifikasi tabel invoice_lines:');
    const lineCols = await query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'invoice_lines'
        ORDER BY ordinal_position
    `);
    if (lineCols.rows.length) {
        lineCols.rows.forEach(c => console.log(`   ${c.column_name} (${c.data_type})`));
    } else {
        console.log('   ⚠️  Tabel invoice_lines tidak ditemukan!');
    }

    console.log('\n✅ Migrasi selesai!');
    process.exit();
})().catch(e => { console.error('Fatal error:', e.message); process.exit(1); });
