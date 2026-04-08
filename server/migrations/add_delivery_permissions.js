/**
 * migrations/add_delivery_permissions.js
 *
 * Pisahkan permissions Delivery Order dari modul inventory.
 * Buat permissions delivery:* dan assign ke warehouse roles yang relevan.
 *
 * Permissions baru:
 *   delivery:view    — Lihat daftar & detail Delivery Order
 *   delivery:create  — Buat Delivery Order baru
 *   delivery:edit    — Dispatch, complete, tambah/hapus GI dari DO, input posisi
 *   delivery:manage  — Akses penuh modul Delivery (bypass semua aksi DO)
 *
 * Safe to run multiple times (ON CONFLICT DO NOTHING).
 * Usage: node migrations/add_delivery_permissions.js
 */
require('dotenv').config();
const { pool, query } = require('../src/config/db');

const DELIVERY_PERMISSIONS = [
    { name: 'delivery:view', desc: 'Lihat daftar & detail Delivery Order' },
    { name: 'delivery:create', desc: 'Buat Delivery Order baru' },
    { name: 'delivery:edit', desc: 'Dispatch, complete DO, tambah/hapus GI, input posisi tracking' },
    { name: 'delivery:manage', desc: 'Akses penuh modul Delivery Order' },
];

// Mapping role → permissions yang diberikan
const ROLE_PERM_MAPPING = {
    'Admin': ['delivery:view', 'delivery:create', 'delivery:edit', 'delivery:manage'],
    'Warehouse Manager': ['delivery:view', 'delivery:create', 'delivery:edit', 'delivery:manage'],
    'Warehouse Supervisor': ['delivery:view', 'delivery:create', 'delivery:edit'],
    'Warehouse Staff': ['delivery:view'],
    'Purchasing Manager': ['delivery:view'],
    'Purchasing Supervisor': ['delivery:view'],
};

async function run() {
    console.log('=== Add Delivery Permissions Migration ===\n');

    // 1. Insert permissions baru
    console.log('Step 1: Memastikan permissions delivery:* ada...');
    for (const p of DELIVERY_PERMISSIONS) {
        const r = await query(
            `INSERT INTO permissions (name) VALUES ($1) ON CONFLICT (name) DO NOTHING RETURNING id, name`,
            [p.name]
        );
        if (r.rows.length > 0) {
            console.log(`  + Ditambahkan: ${p.name} (id=${r.rows[0].id}) — ${p.desc}`);
        } else {
            console.log(`  ✓ Sudah ada  : ${p.name}`);
        }
    }

    // 2. Ambil ID semua delivery permissions
    const permRes = await query(
        `SELECT id, name FROM permissions WHERE name LIKE 'delivery:%'`
    );
    const permMap = Object.fromEntries(permRes.rows.map(r => [r.name, r.id]));
    console.log('\nPermission IDs:', permMap);

    // 3. Cari semua roles yang perlu di-assign (lintas company)
    const roleNames = Object.keys(ROLE_PERM_MAPPING);
    const rolesRes = await query(
        `SELECT id, name, company_id FROM roles WHERE name = ANY($1) ORDER BY company_id NULLS FIRST, name`,
        [roleNames]
    );

    if (rolesRes.rows.length === 0) {
        console.log('\n⚠️  Tidak ada roles yang cocok ditemukan. Pastikan seed roles sudah dijalankan.');
    } else {
        console.log(`\nStep 2: Ditemukan ${rolesRes.rows.length} roles:\n`);
        let added = 0, skipped = 0;

        for (const role of rolesRes.rows) {
            const permsForRole = ROLE_PERM_MAPPING[role.name] || [];
            for (const permName of permsForRole) {
                const permId = permMap[permName];
                if (!permId) { console.log(`  ! Permission tidak ditemukan: ${permName}`); continue; }
                const r = await query(
                    `INSERT INTO role_permissions (role_id, permission_id)
                     VALUES ($1, $2)
                     ON CONFLICT (role_id, permission_id) DO NOTHING
                     RETURNING role_id`,
                    [role.id, permId]
                );
                if (r.rows.length > 0) {
                    console.log(`  + [company=${role.company_id ?? 'ALL'}] ${role.name} ← ${permName}`);
                    added++;
                } else {
                    skipped++;
                }
            }
        }
        console.log(`\n  📊 ${added} permissions di-assign, ${skipped} sudah ada.`);
    }

    // 4. Verifikasi akhir
    console.log('\nStep 3: Verifikasi permissions delivery:* per role:\n');
    const summary = await query(
        `SELECT r.name as role_name, r.company_id,
                array_agg(p.name ORDER BY p.name) as permissions
         FROM roles r
         JOIN role_permissions rp ON rp.role_id = r.id
         JOIN permissions p ON p.id = rp.permission_id
         WHERE p.name LIKE 'delivery:%'
         GROUP BY r.id, r.name, r.company_id
         ORDER BY r.company_id NULLS FIRST, r.name`
    );
    for (const row of summary.rows) {
        console.log(`  [company=${row.company_id ?? 'NULL'}] ${row.role_name}:`);
        for (const perm of row.permissions) {
            console.log(`    ✓ ${perm}`);
        }
    }

    console.log('\n✅ Migration selesai!');
    console.log('⚠️  User harus LOGOUT dan LOGIN ulang agar permissions baru aktif di JWT.\n');

    await pool.end();
}

run().catch(err => {
    console.error('❌ Migration gagal:', err.message);
    pool.end().catch(() => { });
    process.exit(1);
});
