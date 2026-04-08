/**
 * Migration: Seed_Enhance_Period_Closing
 *
 * Backfills existing closing_periods records with company_id, fiscal_year,
 * fiscal_month derived from their branch and period dates.
 * Also sets default fiscal config on companies that don't have it.
 *
 * Run: node migrations/Seed_Enhance_Period_Closing.js
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

        // ── 1. Ensure companies have default fiscal config ───────────────────
        await client.query(`
            UPDATE companies
            SET fiscal_year_start_month = 1,
                closing_deadline_day = 5
            WHERE fiscal_year_start_month IS NULL
               OR closing_deadline_day IS NULL
        `);
        console.log('  ok companies: default fiscal config applied');

        // ── 2. Backfill closing_periods.company_id from branch ───────────────
        const backfillCompany = await client.query(`
            UPDATE closing_periods cp
            SET company_id = b.company_id
            FROM branches b
            WHERE cp.branch_id = b.id
              AND cp.company_id IS NULL
              AND b.company_id IS NOT NULL
        `);
        console.log('  ok closing_periods.company_id backfilled:', backfillCompany.rowCount, 'rows');

        // ── 3. Backfill fiscal_year and fiscal_month ─────────────────────────
        // For existing records: derive from period_start date
        // fiscal_year = year of period_start (simple: assume calendar year fiscal)
        // fiscal_month = month of period_start
        const backfillFiscal = await client.query(`
            UPDATE closing_periods
            SET fiscal_year = EXTRACT(YEAR FROM period_start)::INTEGER,
                fiscal_month = EXTRACT(MONTH FROM period_start)::INTEGER
            WHERE fiscal_year IS NULL
              AND period_type = 'monthly'
        `);
        console.log('  ok closing_periods fiscal_year/fiscal_month backfilled:', backfillFiscal.rowCount, 'rows');

        // For yearly periods
        await client.query(`
            UPDATE closing_periods
            SET fiscal_year = EXTRACT(YEAR FROM period_start)::INTEGER,
                fiscal_month = NULL
            WHERE fiscal_year IS NULL
              AND period_type = 'yearly'
        `);

        // ── 4. Mark overdue periods ──────────────────────────────────────────
        // A period is overdue if: status='open' AND today > deadline
        // deadline = closing_deadline_day of the month AFTER period_end
        const markOverdue = await client.query(`
            UPDATE closing_periods cp
            SET is_overdue = TRUE
            FROM branches b
            JOIN companies c ON b.company_id = c.id
            WHERE cp.branch_id = b.id
              AND cp.status = 'open'
              AND cp.period_type = 'monthly'
              AND NOW() > (cp.period_end + INTERVAL '1 month')::DATE
                          + ((COALESCE(c.closing_deadline_day, 5) - 1) || ' days')::INTERVAL
        `);
        console.log('  ok overdue periods marked:', markOverdue.rowCount, 'rows');

        await client.query('COMMIT');
        console.log('');
        console.log('Migration Seed_Enhance_Period_Closing: SELESAI');
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
