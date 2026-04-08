/**
 * migrations/seed_add_role_HR.js
 * Menambahkan role HR Staff dan HR Manager ke SEMUA company yang sudah ada.
 * Idempotent: aman dijalankan berulang, tidak akan duplikasi data.
 *
 * Usage: node migrations/seed_add_role_HR.js
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

const HR_ROLES = [
    {
        name: 'HR Staff',
        description: 'Akses operasional HR: lihat, tambah, dan edit data karyawan',
        permissions: ['hr:view', 'hr:create', 'hr:edit'],
    },
    {
        name: 'HR Manager',
        description: 'Akses penuh HR: lihat, tambah, edit, dan hapus data karyawan',
        permissions: ['hr:view', 'hr:create', 'hr:edit', 'hr:delete'],
    },
];

const HR_PERMISSIONS = ['hr:view', 'hr:create', 'hr:edit', 'hr:delete'];

// Ambil daftar company + setup permissions dengan koneksi baru
async function getCompanies() {
    const pool = new Pool(DB_CONFIG);
    const client = await pool.connect();
    try {
        // Pastikan permissions hr:* ada
        for (const perm of HR_PERMISSIONS) {
            await client.query(
                `INSERT INTO permissions (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`,
                [perm]
            );
        }
        const result = await client.query(
            `SELECT id, name FROM companies WHERE is_active = TRUE ORDER BY id`
        );
        return result.rows;
    } finally {
        client.release();
        await pool.end();
    }
}

// Proses 1 company dengan koneksi baru (avoid idle timeout)
async function seedOneCompany(company) {
    const pool = new Pool(DB_CONFIG);
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (const roleDef of HR_ROLES) {
            const existing = await client.query(
                `SELECT id FROM roles WHERE name = $1 AND company_id = $2`,
                [roleDef.name, company.id]
            );
            let roleId;
            if (existing.rows.length > 0) {
                roleId = existing.rows[0].id;
                console.log(`    - "${roleDef.name}" sudah ada (id=${roleId}), skip`);
            } else {
                const res = await client.query(
                    `INSERT INTO roles (name, description, company_id) VALUES ($1, $2, $3) RETURNING id`,
                    [roleDef.name, roleDef.description, company.id]
                );
                roleId = res.rows[0].id;
                console.log(`    - "${roleDef.name}" dibuat (id=${roleId})`);
            }
            for (const perm of roleDef.permissions) {
                await client.query(
                    `INSERT INTO role_permissions (role_id, permission_id)
                     SELECT $1, id FROM permissions WHERE name = $2
                     ON CONFLICT DO NOTHING`,
                    [roleId, perm]
                );
            }
        }
        await client.query('COMMIT');
        console.log(`    OK`);
    } catch (e) {
        await client.query('ROLLBACK').catch(() => { });
        throw e;
    } finally {
        client.release();
        await pool.end();
    }
}

async function run() {
    console.log('Mulai seed_add_role_HR...\n');

    console.log('  [1] Memastikan permissions hr:* tersedia...');
    const companies = await getCompanies();
    console.log('      Permissions hr:* OK');
    console.log(`\n  [2] Ditemukan ${companies.length} company aktif\n`);

    let success = 0;
    let skipped = 0;
    let errors = 0;

    for (const company of companies) {
        console.log(`  Company [${company.id}]: ${company.name}`);
        try {
            await seedOneCompany(company);
            success++;
        } catch (e) {
            console.error(`    ERROR: ${e.message}`);
            errors++;
        }
    }

    console.log(`\nSeed role HR selesai.`);
    if (success > 0) console.log(`  Sukses : ${success} company`);
    if (errors > 0) console.log(`  Error  : ${errors} company`);
}

run().catch(e => {
    console.error('Fatal:', e.message);
    process.exit(1);
});
