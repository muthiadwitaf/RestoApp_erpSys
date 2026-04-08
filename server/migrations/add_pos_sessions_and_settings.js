/**
 * Migration: add_pos_sessions_and_settings
 * Membuat tabel pos_sessions (Buka/Tutup Kasir) dan menambah kolom
 * Pengaturan Kasir pada tabel companies (pos_require_opening_cash,
 * pos_hide_stock, pos_payment_methods, pos_auto_close_time).
 *
 * Jalankan: node migrations/add_pos_sessions_and_settings.js
 * Uses only plain ASCII characters.
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

async function migrate() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // ── 1. Tabel pos_sessions (sesi kasir per shift) ─────────────────────
        await client.query(`
            CREATE TABLE IF NOT EXISTS pos_sessions (
                id                SERIAL PRIMARY KEY,
                uuid              UUID DEFAULT gen_random_uuid() NOT NULL UNIQUE,
                company_id        INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
                branch_id         INTEGER REFERENCES branches(id) ON DELETE SET NULL,
                cashier_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
                cashier_name      VARCHAR(100),
                opened_at         TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                closed_at         TIMESTAMP WITH TIME ZONE,
                opening_cash      DECIMAL(15,2) NOT NULL DEFAULT 0,
                closing_cash      DECIMAL(15,2),
                total_cash        DECIMAL(15,2) DEFAULT 0,
                total_qris        DECIMAL(15,2) DEFAULT 0,
                total_transfer    DECIMAL(15,2) DEFAULT 0,
                total_debit       DECIMAL(15,2) DEFAULT 0,
                total_sales       DECIMAL(15,2) DEFAULT 0,
                transaction_count INTEGER DEFAULT 0,
                status            VARCHAR(20) NOT NULL DEFAULT 'open'
                                  CHECK (status IN ('open', 'closed')),
                notes             TEXT,
                created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            )
        `);
        console.log('  ok Table pos_sessions created (or already exists)');

        // Index untuk pencarian sesi aktif yang cepat
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_pos_sessions_company_status
              ON pos_sessions (company_id, status, closed_at)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_pos_sessions_cashier
              ON pos_sessions (cashier_id, status)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_pos_sessions_branch
              ON pos_sessions (branch_id, status)
        `);
        console.log('  ok Indexes on pos_sessions created');

        // ── 2. Kolom Pengaturan Kasir pada tabel companies ───────────────────
        // Kolom QRIS + bank (mungkin sudah ada, gunakan IF NOT EXISTS)
        const safeAlter = async (sql) => {
            try {
                await client.query(sql);
            } catch (e) {
                if (!e.message.includes('already exists') &&
                    !e.message.includes('duplicate column')) {
                    throw e;
                }
            }
        };

        await safeAlter(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS pos_bank_name    VARCHAR(100)`);
        await safeAlter(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS pos_bank_holder  VARCHAR(100)`);
        await safeAlter(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS pos_bank_number  VARCHAR(50)`);
        await safeAlter(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS pos_qris_url     VARCHAR(500)`);
        console.log('  ok companies: pos bank/QRIS columns ensured');

        // Kolom Pengaturan Kasir baru
        await safeAlter(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS pos_require_opening_cash BOOLEAN DEFAULT true`);
        await safeAlter(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS pos_hide_stock           BOOLEAN DEFAULT false`);
        await safeAlter(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS pos_payment_methods      VARCHAR(200) DEFAULT 'cash,qris,transfer'`);
        await safeAlter(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS pos_auto_close_time      VARCHAR(10)`);
        console.log('  ok companies: Pengaturan Kasir columns ensured');

        // ── 3. Permission pos:settings ────────────────────────────────────────
        await client.query(`
            INSERT INTO permissions (name)
            VALUES ('pos:settings')
            ON CONFLICT (name) DO NOTHING
        `);
        console.log('  ok Permission pos:settings ensured');

        await client.query('COMMIT');
        console.log('');
        console.log('Migration add_pos_sessions_and_settings: SELESAI');
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Migration GAGAL:', e.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

migrate();
