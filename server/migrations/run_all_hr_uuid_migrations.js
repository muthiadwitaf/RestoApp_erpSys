/**
 * migrations/run_all_hr_uuid_migrations.js
 * ==========================================
 * Comprehensive migration: add company_uuid to all HR-related tables.
 * Safe to re-run — semua operasi menggunakan IF NOT EXISTS / IS NULL guards.
 *
 * Tables covered:
 *   Core HR    : employees, roles, audit_trail
 *   Attendance : shift_types
 *   Leave      : leave_types, leave_balances, leave_requests
 *   Config     : hr_config, hr_holiday_cache, hr_custom_holidays
 *   Payroll    : payroll_periods, payroll_slips
 *   Disbursement: special_disbursement_batches, special_disbursement_slips
 *   Kasbon     : salary_advances
 *   Claim      : claim_types, claims (create if not exists)
 *   External   : branches, chart_of_accounts
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

// ─── helper ──────────────────────────────────────────────────────────────────
async function migrateTable(client, tableName, { extraIndexes = [] } = {}) {
    // 1. tambah kolom
    await client.query(
        `ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS company_uuid UUID`
    );
    // 2. backfill dari company_id → companies.uuid
    const res = await client.query(
        `UPDATE ${tableName} x
         SET company_uuid = co.uuid
         FROM companies co
         WHERE co.id = x.company_id
           AND x.company_uuid IS NULL`
    );
    // 3. index utama
    await client.query(
        `CREATE INDEX IF NOT EXISTS idx_${tableName}_company_uuid ON ${tableName}(company_uuid)`
    );
    // 4. extra unique indexes jika ada
    for (const idx of extraIndexes) {
        await client.query(idx);
    }
    const updated = res.rowCount ?? 0;
    console.log(`  ✓ ${tableName.padEnd(36)} — ${updated} rows backfilled`);
}

// ─── main ────────────────────────────────────────────────────────────────────
async function run() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        console.log('\n══════════════════════════════════════════');
        console.log('  HR UUID Migration — Full Run');
        console.log('══════════════════════════════════════════\n');

        // ── 1. Core HR ─────────────────────────────────────────────────────
        console.log('[ 1/10 ] Core HR Tables');
        await migrateTable(client, 'employees');
        await migrateTable(client, 'roles');
        // audit_trail tidak punya company_id FK — skip backfill, hanya tambah kolom
        await client.query(`ALTER TABLE audit_trail ADD COLUMN IF NOT EXISTS company_uuid UUID`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_audit_trail_company_uuid ON audit_trail(company_uuid)`);
        console.log(`  ✓ ${'audit_trail'.padEnd(36)} — column added (no backfill)`);

        // ── 2. Attendance ──────────────────────────────────────────────────
        console.log('\n[ 2/10 ] Attendance Tables');
        await migrateTable(client, 'shift_types');

        // ── 3. Leave Management ────────────────────────────────────────────
        console.log('\n[ 3/10 ] Leave Management Tables');
        await migrateTable(client, 'leave_types');
        await migrateTable(client, 'leave_balances');
        await migrateTable(client, 'leave_requests');

        // ── 4. HR Config ───────────────────────────────────────────────────
        console.log('\n[ 4/10 ] HR Config Tables');
        await migrateTable(client, 'hr_config', {
            extraIndexes: [
                `CREATE UNIQUE INDEX IF NOT EXISTS idx_hr_config_company_uuid
                 ON hr_config(company_uuid) WHERE company_uuid IS NOT NULL`
            ]
        });
        await migrateTable(client, 'hr_holiday_cache');
        await migrateTable(client, 'hr_custom_holidays');

        // ── 5. Payroll ─────────────────────────────────────────────────────
        console.log('\n[ 5/10 ] Payroll Tables');
        await migrateTable(client, 'payroll_periods', {
            extraIndexes: [
                `CREATE UNIQUE INDEX IF NOT EXISTS idx_payroll_periods_uuid_bulan_tahun
                 ON payroll_periods(company_uuid, bulan, tahun)
                 WHERE company_uuid IS NOT NULL`
            ]
        });
        await migrateTable(client, 'payroll_slips');

        // ── 6. Special Disbursement ────────────────────────────────────────
        console.log('\n[ 6/10 ] Special Disbursement Tables');
        await migrateTable(client, 'special_disbursement_batches');
        await migrateTable(client, 'special_disbursement_slips');

        // ── 7. Kasbon / Salary Advance ─────────────────────────────────────
        console.log('\n[ 7/10 ] Kasbon Tables');
        await migrateTable(client, 'salary_advances');

        // ── 8. Claim Tables (create if not exists) ─────────────────────────
        console.log('\n[ 8/10 ] Claim Tables');
        await client.query(`
            CREATE TABLE IF NOT EXISTS claim_types (
                id           SERIAL PRIMARY KEY,
                company_id   INTEGER REFERENCES companies(id) ON DELETE CASCADE,
                company_uuid UUID,
                nama         VARCHAR(120) NOT NULL,
                kode         VARCHAR(30),
                deskripsi    TEXT,
                max_amount   NUMERIC(15,2),
                is_deleted   BOOLEAN DEFAULT FALSE,
                created_by   VARCHAR(120),
                created_at   TIMESTAMPTZ DEFAULT NOW(),
                updated_at   TIMESTAMPTZ DEFAULT NOW()
            )
        `);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_claim_types_company_uuid ON claim_types(company_uuid)`);

        await client.query(`
            CREATE TABLE IF NOT EXISTS claims (
                id              SERIAL PRIMARY KEY,
                company_id      INTEGER REFERENCES companies(id) ON DELETE CASCADE,
                company_uuid    UUID,
                claim_type_id   INTEGER REFERENCES claim_types(id),
                user_id         INTEGER REFERENCES users(id),
                tanggal         DATE NOT NULL,
                detail          TEXT,
                amount          NUMERIC(15,2),
                status          VARCHAR(30) DEFAULT 'pending',
                bukti_filename  VARCHAR(255),
                bukti_ext       VARCHAR(20),
                bukti_path      TEXT,
                catatan_review  TEXT,
                reviewed_by     INTEGER REFERENCES users(id),
                reviewed_at     TIMESTAMPTZ,
                created_at      TIMESTAMPTZ DEFAULT NOW(),
                updated_at      TIMESTAMPTZ DEFAULT NOW()
            )
        `);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_claims_company_uuid ON claims(company_uuid)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_claims_user_id ON claims(user_id)`);
        console.log(`  ✓ ${'claim_types'.padEnd(36)} — table created/verified`);
        console.log(`  ✓ ${'claims'.padEnd(36)} — table created/verified`);

        // ── 9. External Tables (branches, chart_of_accounts) ───────────────
        console.log('\n[ 9/10 ] External Tables (branches, chart_of_accounts)');
        await migrateTable(client, 'branches');
        await migrateTable(client, 'chart_of_accounts');

        // ── 10. Verify ─────────────────────────────────────────────────────
        console.log('\n[ 10/10 ] Verification — checking NULL company_uuid counts...');
        const verifyTables = [
            'employees', 'roles', 'shift_types',
            'leave_types', 'leave_balances', 'leave_requests',
            'hr_config', 'hr_holiday_cache', 'hr_custom_holidays',
            'payroll_periods', 'payroll_slips',
            'special_disbursement_batches', 'special_disbursement_slips',
            'salary_advances', 'branches', 'chart_of_accounts',
        ];
        for (const t of verifyTables) {
            const r = await client.query(
                `SELECT COUNT(*) AS total,
                        COUNT(*) FILTER (WHERE company_uuid IS NULL) AS nulls
                 FROM ${t}`
            );
            const { total, nulls } = r.rows[0];
            const status = parseInt(nulls) === 0 ? '✓' : '⚠ NULLS REMAIN';
            console.log(`  ${status} ${t.padEnd(36)} total=${total} nulls=${nulls}`);
        }

        await client.query('COMMIT');
        console.log('\n══════════════════════════════════════════');
        console.log('  Migration completed successfully!');
        console.log('══════════════════════════════════════════\n');

    } catch (e) {
        await client.query('ROLLBACK');
        console.error('\n❌ Migration failed:', e.message);
        console.error(e.stack);
        process.exit(1);
    } finally {
        client.release();
        pool.end();
    }
}

run();
