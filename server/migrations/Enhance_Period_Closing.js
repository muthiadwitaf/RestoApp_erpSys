/**
 * Migration: Enhance_Period_Closing
 *
 * Adds fiscal year configuration to companies table and enhances
 * closing_periods with company_id, fiscal tracking, and overdue detection.
 *
 * Run: node migrations/Enhance_Period_Closing.js
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

        // ── 1. Companies: Fiscal Year & Closing Config ───────────────────────
        // fiscal_year_start_month: 1=Jan (default), 4=Apr, 7=Jul, etc.
        await safeAlter(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS fiscal_year_start_month INTEGER DEFAULT 1`);
        // closing_deadline_day: books must be closed by this day of the NEXT month
        await safeAlter(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS closing_deadline_day INTEGER DEFAULT 5`);
        console.log('  ok companies: fiscal_year_start_month, closing_deadline_day added');

        // ── 2. Closing Periods: Enhanced tracking ────────────────────────────
        // company_id: direct reference for company-level queries
        await safeAlter(`ALTER TABLE closing_periods ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id)`);
        // fiscal_year: the fiscal year this period belongs to (e.g. 2026)
        await safeAlter(`ALTER TABLE closing_periods ADD COLUMN IF NOT EXISTS fiscal_year INTEGER`);
        // fiscal_month: month sequence within fiscal year (1-12)
        await safeAlter(`ALTER TABLE closing_periods ADD COLUMN IF NOT EXISTS fiscal_month INTEGER`);
        // is_overdue: flag set when past deadline and still open
        await safeAlter(`ALTER TABLE closing_periods ADD COLUMN IF NOT EXISTS is_overdue BOOLEAN DEFAULT FALSE`);
        console.log('  ok closing_periods: company_id, fiscal_year, fiscal_month, is_overdue added');

        // ── 3. Index for efficient queries ───────────────────────────────────
        await safeAlter(`CREATE INDEX IF NOT EXISTS idx_closing_periods_company ON closing_periods(company_id, fiscal_year)`);
        await safeAlter(`CREATE INDEX IF NOT EXISTS idx_closing_periods_branch_year ON closing_periods(branch_id, fiscal_year, fiscal_month)`);
        await safeAlter(`CREATE INDEX IF NOT EXISTS idx_closing_periods_overdue ON closing_periods(is_overdue) WHERE is_overdue = TRUE`);
        console.log('  ok indexes on closing_periods created');

        await client.query('COMMIT');
        console.log('');
        console.log('Migration Enhance_Period_Closing: SELESAI');
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
