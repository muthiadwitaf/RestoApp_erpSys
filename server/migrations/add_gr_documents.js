/**
 * migrations/add_gr_documents.js
 * Tambah tabel gr_documents untuk menyimpan dokumen supplier/invoice
 * yang diupload saat penerimaan barang (Goods Receipt).
 *
 * Usage: node migrations/add_gr_documents.js
 */
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT || '5432'),
    user:     process.env.DB_USER     || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME     || 'erpsys',
});

async function run() {
    const client = await pool.connect();
    try {
        console.log('Memulai migrasi add_gr_documents...\n');

        // 1. Buat tabel gr_documents
        await client.query(`
            CREATE TABLE IF NOT EXISTS gr_documents (
                id          SERIAL PRIMARY KEY,
                uuid        UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
                gr_id       INTEGER NOT NULL REFERENCES goods_receives(id) ON DELETE CASCADE,
                filename    TEXT NOT NULL,
                file_uuid   UUID NOT NULL,
                mime_type   TEXT NOT NULL,
                size_bytes  INTEGER,
                file_path   TEXT NOT NULL,
                uploaded_by TEXT,
                created_at  TIMESTAMPTZ DEFAULT NOW()
            )
        `);
        console.log('  [1/2] Tabel gr_documents dibuat (atau sudah ada).');

        // 2. Buat index pada gr_id untuk performa JOIN
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_gr_documents_gr_id
            ON gr_documents(gr_id)
        `);
        console.log('  [2/2] Index idx_gr_documents_gr_id dibuat.');

        console.log('\nMigrasi selesai.');
    } catch (e) {
        console.error('Error:', e.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

run();
