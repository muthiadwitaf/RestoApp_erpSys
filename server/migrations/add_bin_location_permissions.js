/**
 * add_bin_location_permissions.js
 *
 * Migration: Tambahkan permissions untuk operasi Bin Location ke tabel permissions
 * dan assign ke warehouse roles yang sesuai.
 *
 * Permissions yang dicakup (sesuai bins.js):
 *   inventory:view   — GET bins, GET bin detail, GET racks
 *   inventory:create — POST /bins, POST /bins/bulk
 *   inventory:edit   — PUT /bins/:uuid, PUT /bins/racks/:uuid,
 *                      DELETE /bins/:uuid, DELETE /bins/rack/:warehouse/:rack,
 *                      POST/PUT/DELETE /bins/:uuid/items (bin item operations)
 *   inventory:delete — reserved untuk delete granular (future use)
 *   inventory:manage — akses penuh modul inventory (bins termasuk di dalamnya)
 *
 * Safe to run multiple times — semua INSERT pakai ON CONFLICT DO NOTHING.
 * Usage: node migrations/add_bin_location_permissions.js
 */
require('dotenv').config();
const { pool, query } = require('../src/config/db');

async function run() {
    console.log('=== Bin Location Permissions Migration ===\n');

    // ── 1. Daftar permissions yang dibutuhkan modul bins ──────────────────────
    const permsToEnsure = [
        { name: 'inventory:view', desc: 'Lihat bin location, rak, dan isi barang' },
        { name: 'inventory:create', desc: 'Buat bin baru / bulk rak baru' },
        { name: 'inventory:edit', desc: 'Edit bin/rak, masukkan/update/keluarkan barang dari bin' },
        { name: 'inventory:delete', desc: 'Hapus bin kosong atau seluruh rak' },
        { name: 'inventory:manage', desc: 'Akses penuh modul inventory termasuk bin location' },
        { name: 'inventory:approve', desc: 'Approve stock opname & transfer' },
        { name: 'inventory:export', desc: 'Export data inventory' },
    ];

    console.log('Step 1: Memastikan permissions ada di tabel permissions...');
    for (const p of permsToEnsure) {
        const r = await query(
            `INSERT INTO permissions (name) VALUES ($1) ON CONFLICT (name) DO NOTHING RETURNING id, name`,
            [p.name]
        );
        if (r.rows.length > 0) {
            console.log(`  + Ditambahkan: ${p.name} (id=${r.rows[0].id}) — ${p.desc}`);
        } else {
            console.log(`  ✓ Sudah ada: ${p.name}`);
        }
    }

    // ── 2. Ambil ID semua permissions yang diperlukan ─────────────────────────
    const permNames = permsToEnsure.map(p => p.name);
    const permRes = await query(
        `SELECT id, name FROM permissions WHERE name = ANY($1)`,
        [permNames]
    );
    const permMap = Object.fromEntries(permRes.rows.map(r => [r.name, r.id]));
    console.log('\nPermission IDs yang aktif:', permMap);

    // ── 3. Mapping: Warehouse roles → permissions yang boleh dimiliki ─────────
    //
    // Warehouse Manager  : full access bin location (view, create, edit, delete, manage, approve, export)
    // Warehouse Supervisor: view, create, edit, manage, approve (tidak delete)
    // Warehouse Staff     : view, create, manage (hanya bisa lihat & input barang ke bin)
    //
    const warehouseRolePermMapping = {
        'Warehouse Manager': ['inventory:view', 'inventory:create', 'inventory:edit', 'inventory:delete', 'inventory:manage', 'inventory:approve', 'inventory:export'],
        'Warehouse Supervisor': ['inventory:view', 'inventory:create', 'inventory:edit', 'inventory:manage', 'inventory:approve'],
        'Warehouse Staff': ['inventory:view', 'inventory:create', 'inventory:manage'],
    };

    // ── 4. Cari semua Warehouse roles (lintas company) ────────────────────────
    const roleNames = Object.keys(warehouseRolePermMapping);
    const rolesRes = await query(
        `SELECT id, name, company_id FROM roles WHERE name = ANY($1) ORDER BY company_id NULLS FIRST, name`,
        [roleNames]
    );

    if (rolesRes.rows.length === 0) {
        console.log('\n⚠️  Tidak ada warehouse roles ditemukan. Jalankan seed.js terlebih dahulu.');
    } else {
        console.log(`\nStep 2: Ditemukan ${rolesRes.rows.length} warehouse roles:`);
        for (const r of rolesRes.rows) {
            console.log(`  - [company_id=${r.company_id ?? 'NULL'}] ${r.name} (id=${r.id})`);
        }

        // ── 5. Assign permissions ke setiap role ──────────────────────────────
        console.log('\nStep 3: Assign permissions ke roles...');
        let added = 0, skipped = 0;
        for (const role of rolesRes.rows) {
            const permsForRole = warehouseRolePermMapping[role.name] || [];
            for (const permName of permsForRole) {
                const permId = permMap[permName];
                if (!permId) {
                    console.log(`  ! Permission tidak ditemukan: ${permName}`);
                    continue;
                }
                const r = await query(
                    `INSERT INTO role_permissions (role_id, permission_id)
                     VALUES ($1, $2)
                     ON CONFLICT (role_id, permission_id) DO NOTHING
                     RETURNING role_id`,
                    [role.id, permId]
                );
                if (r.rows.length > 0) {
                    console.log(`  + ${role.name} (company=${role.company_id ?? 'NULL'}, id=${role.id}) ← ${permName}`);
                    added++;
                } else {
                    skipped++;
                }
            }
        }
        console.log(`\n  📊 ${added} permissions assigned, ${skipped} sudah ada.`);
    }

    // ── 6. Verifikasi akhir: tampilkan summary per role ───────────────────────
    console.log('\nStep 4: Verifikasi — permissions aktif per Warehouse role:\n');
    for (const roleName of roleNames) {
        const summary = await query(
            `SELECT r.name as role_name, r.company_id,
                    array_agg(p.name ORDER BY p.name) as permissions
             FROM roles r
             JOIN role_permissions rp ON rp.role_id = r.id
             JOIN permissions p ON p.id = rp.permission_id
             WHERE r.name = $1 AND p.name LIKE 'inventory%'
             GROUP BY r.id, r.name, r.company_id
             ORDER BY r.company_id NULLS FIRST`,
            [roleName]
        );
        if (summary.rows.length === 0) {
            console.log(`  ${roleName}: (tidak ada data)`);
        }
        for (const row of summary.rows) {
            console.log(`  ${row.role_name} [company=${row.company_id ?? 'NULL'}]:`);
            for (const perm of row.permissions) {
                console.log(`    ✓ ${perm}`);
            }
        }
    }

    console.log('\n✅ Migration selesai!');
    console.log('⚠️  User Warehouse harus LOGOUT dan LOGIN ulang agar permissions baru aktif di JWT.\n');

    await pool.end();
}

run().catch(err => {
    console.error('❌ Migration gagal:', err.message);
    pool.end().catch(() => { });
    process.exit(1);
});
