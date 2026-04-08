/**
 * migrations/add_delivery_self_permissions.js
 *
 * Tambah permissions delivery:view_self dan delivery:edit_self.
 * Permission ini membatasi akses HANYA ke DO yang driver-nya adalah
 * karyawan yang sedang login (berdasarkan link employees.user_id).
 *
 * Typical use case: role "Driver" yang hanya bisa:
 *   - Lihat DO miliknya sendiri (delivery:view_self)
 *   - Input posisi tracking & konfirmasi selesai (delivery:edit_self)
 *
 * Safe to run multiple times (ON CONFLICT DO NOTHING).
 * Usage: node migrations/add_delivery_self_permissions.js
 */
require('dotenv').config();
const { Pool } = require('pg');
const _pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'erpsys',
    connectionTimeoutMillis: 30000,
    idleTimeoutMillis: 60000,
    max: 3,
});
const query = (text, params) => _pool.query(text, params);
const pool = _pool;

const SELF_PERMISSIONS = [
    { name: 'delivery:view_self', desc: 'Lihat Delivery Order yang saya jadikan driver' },
    { name: 'delivery:edit_self', desc: 'Input posisi & konfirmasi selesai untuk DO yang saya jadikan driver' },
];

// Mapping role → permissions yang diberikan
// Sesuaikan dengan kebutuhan company
const ROLE_PERM_MAPPING = {
    'Driver': ['delivery:view_self', 'delivery:edit_self'],
    'Warehouse Staff': ['delivery:view_self', 'delivery:edit_self'],
};

async function run() {
    console.log('=== Add delivery:*_self Permissions ===\n');

    // 1. Seed permissions baru
    console.log('Step 1: Memastikan permissions delivery:*_self ada...');
    for (const p of SELF_PERMISSIONS) {
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

    // 2. Ambil ID permissions
    const permRes = await query(
        `SELECT id, name FROM permissions WHERE name IN ('delivery:view_self', 'delivery:edit_self')`
    );
    const permMap = Object.fromEntries(permRes.rows.map(r => [r.name, r.id]));
    console.log('\nPermission IDs:', permMap);

    // 3. Assign ke roles
    const roleNames = Object.keys(ROLE_PERM_MAPPING);
    const rolesRes = await query(
        `SELECT id, name, company_id FROM roles WHERE name = ANY($1) ORDER BY company_id NULLS FIRST, name`,
        [roleNames]
    );

    if (rolesRes.rows.length === 0) {
        console.log('\n⚠️  Tidak ada roles yang cocok ditemukan.');
        console.log('   Permissions sudah ditambahkan ke tabel — assign manual lewat UI Settings > Roles.');
    } else {
        console.log(`\nStep 2: Assign ke ${rolesRes.rows.length} roles...`);
        let added = 0, skipped = 0;
        for (const role of rolesRes.rows) {
            const permsForRole = ROLE_PERM_MAPPING[role.name] || [];
            for (const permName of permsForRole) {
                const permId = permMap[permName];
                if (!permId) continue;
                const r = await query(
                    `INSERT INTO role_permissions (role_id, permission_id)
                     VALUES ($1, $2)
                     ON CONFLICT (role_id, permission_id) DO NOTHING
                     RETURNING role_id`,
                    [role.id, permId]
                );
                if (r.rows.length > 0) {
                    console.log(`  + [company=${role.company_id ?? 'ALL'}] ${role.name} \u2190 ${permName}`);
                    added++;
                } else {
                    skipped++;
                }
            }
        }
        console.log(`\n  📊 ${added} permissions di-assign, ${skipped} sudah ada.`);
    }

    // 4. Verifikasi
    console.log('\nStep 3: Verifikasi hasil:\n');
    const summary = await query(
        `SELECT r.name as role_name, r.company_id,
                array_agg(p.name ORDER BY p.name) as permissions
         FROM roles r
         JOIN role_permissions rp ON rp.role_id = r.id
         JOIN permissions p ON p.id = rp.permission_id
         WHERE p.name LIKE 'delivery:%_self'
         GROUP BY r.id, r.name, r.company_id
         ORDER BY r.company_id NULLS FIRST, r.name`
    );
    if (summary.rows.length === 0) {
        console.log('  (tidak ada role yang memiliki delivery:*_self — assign manual di UI)');
    }
    for (const row of summary.rows) {
        console.log(`  [company=${row.company_id ?? 'NULL'}] ${row.role_name}:`);
        for (const perm of row.permissions) {
            console.log(`    ✓ ${perm}`);
        }
    }

    console.log('\n✅ Migration selesai!');
    console.log('⚠️  User harus LOGOUT dan LOGIN ulang agar permissions baru aktif.\n');
    console.log('📌 Catatan:');
    console.log('   delivery:view_self → Hanya lihat DO yang user-nya = driver (via employees.user_id)');
    console.log('   delivery:edit_self → Hanya bisa input posisi & complete GI di DO miliknya\n');

    await pool.end();
}

run().catch(err => {
    console.error('❌ Migration gagal:', err.message);
    pool.end().catch(() => { });
    process.exit(1);
});
