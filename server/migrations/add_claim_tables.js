/**
 * migrations/add_claim_tables.js
 * Create claim_types + claims tables with company_uuid support
 */
require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
    host: process.env.DB_HOST, port: process.env.DB_PORT,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

async function run() {
    const c = await pool.connect();
    try {
        await c.query('BEGIN');

        // claim_types
        await c.query(`
            CREATE TABLE IF NOT EXISTS claim_types (
                id          SERIAL PRIMARY KEY,
                company_id  INTEGER REFERENCES companies(id) ON DELETE CASCADE,
                company_uuid UUID,
                nama        VARCHAR(120) NOT NULL,
                kode        VARCHAR(30),
                deskripsi   TEXT,
                max_amount  NUMERIC(15,2),
                is_deleted  BOOLEAN DEFAULT FALSE,
                created_by  VARCHAR(120),
                created_at  TIMESTAMPTZ DEFAULT NOW(),
                updated_at  TIMESTAMPTZ DEFAULT NOW()
            )
        `);
        await c.query('CREATE INDEX IF NOT EXISTS idx_claim_types_company_uuid ON claim_types(company_uuid)');
        console.log('claim_types created');

        // claims
        await c.query(`
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
        await c.query('CREATE INDEX IF NOT EXISTS idx_claims_company_uuid ON claims(company_uuid)');
        await c.query('CREATE INDEX IF NOT EXISTS idx_claims_user_id ON claims(user_id)');
        console.log('claims created');

        await c.query('COMMIT');
        console.log('All done!');
    } catch (e) {
        await c.query('ROLLBACK');
        console.error(e.message);
    } finally {
        c.release();
        pool.end();
    }
}
run();
