/**
 * migrations/seed_reporting_permission.js
 *
 * Menambahkan permission `reporting:view` ke SEMUA company yang sudah ada,
 * dan assign ke role Manager ke atas.
 *
 * Role yang mendapat `reporting:view`:
 *   - Super Admin  (global)
 *   - Owner
 *   - Direktur
 *   - Finance Manager
 *   - Sales Manager
 *   - Sales Supervisor
 *   - Purchasing Manager
 *   - Warehouse Manager
 *
 * Idempotent: aman dijalankan berulang (ON CONFLICT DO NOTHING).
 * Usage: node migrations/seed_reporting_permission.js
 */
require('dotenv').config();
const { Pool } = require('pg');

const DB_CONFIG = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'erpsys',
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
};

// Role yang mendapat reporting:view
const TARGET_ROLES = [
    'Super Admin',
    'Owner',
    'Direktur',
    'Sales Manager',
    'Sales Supervisor',
];

async function run() {
    const pool = new Pool(DB_CONFIG);
    const client = await pool.connect();

    try {
        console.log('=== seed_reporting_permission.js ===\n');

        // Step 1: Pastikan permission reporting:view ada
        console.log('Step 1: Memastikan permission reporting:view ada...');
        const permInsert = await client.query(
            `INSERT INTO permissions (name) VALUES ('reportingsales:view')
             ON CONFLICT (name) DO NOTHING
             RETURNING id, name`
        );
        if (permInsert.rows.length > 0) {
            console.log(`  + Ditambahkan: reportingsales:view (id=${permInsert.rows[0].id})`);
        } else {
            console.log(`  ✓ Sudah ada  : reportingsales:view`);
        }

        // Ambil ID permission
        const permRes = await client.query(
            `SELECT id FROM permissions WHERE name = 'reportingsales:view'`
        );
        const permId = permRes.rows[0].id;
        console.log(`  → permission_id = ${permId}\n`);

        // Step 2: Cari semua roles yang cocok (lintas company)
        console.log('Step 2: Mencari roles target...');
        const rolesRes = await client.query(
            `SELECT id, name, company_id FROM roles
             WHERE name = ANY($1)
             ORDER BY company_id NULLS FIRST, name`,
            [TARGET_ROLES]
        );

        if (rolesRes.rows.length === 0) {
            console.log('  ⚠️  Tidak ada roles yang cocok. Pastikan seed utama sudah dijalankan.');
            return;
        }
        console.log(`  → Ditemukan ${rolesRes.rows.length} roles\n`);

        // Step 3: Assign permission ke setiap role
        console.log('Step 3: Assign reporting:view ke roles...');
        let added = 0, skipped = 0;

        for (const role of rolesRes.rows) {
            const r = await client.query(
                `INSERT INTO role_permissions (role_id, permission_id)
                 VALUES ($1, $2)
                 ON CONFLICT (role_id, permission_id) DO NOTHING
                 RETURNING role_id`,
                [role.id, permId]
            );
            const companyLabel = role.company_id ? `company=${role.company_id}` : 'global';
            if (r.rows.length > 0) {
                console.log(`  + [${companyLabel}] ${role.name} ← reporting:view`);
                added++;
            } else {
                console.log(`  ✓ [${companyLabel}] ${role.name} (sudah ada)`);
                skipped++;
            }
        }

        console.log(`\n  📊 ${added} di-assign baru, ${skipped} sudah ada sebelumnya.`);

        // Step 4: Verifikasi akhir
        console.log('\nStep 4: Verifikasi hasil akhir:\n');
        const summary = await client.query(
            `SELECT r.name as role_name, r.company_id,
                    array_agg(p.name ORDER BY p.name) as permissions
             FROM roles r
             JOIN role_permissions rp ON rp.role_id = r.id
             JOIN permissions p ON p.id = rp.permission_id
             WHERE p.name = 'reportingsales:view'
             GROUP BY r.id, r.name, r.company_id
             ORDER BY r.company_id NULLS FIRST, r.name`
        );
        for (const row of summary.rows) {
            const companyLabel = row.company_id ? `company=${row.company_id}` : 'global';
            console.log(`  ✓ [${companyLabel}] ${row.role_name}`);
        }

        console.log('\n✅ Selesai!');
        console.log('⚠️  User harus LOGOUT dan LOGIN ulang agar permission baru aktif di JWT.\n');

    } catch (err) {
        console.error('❌ Error:', err.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

run().catch(err => {
    console.error('Fatal:', err.message);
    process.exit(1);
});
