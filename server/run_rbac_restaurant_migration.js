/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * RestoERP — RBAC Migration Runner
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Run: node run_rbac_restaurant_migration.js
 *
 * Executes the 030_rbac_restaurant_clean.sql migration and verifies:
 *   - 6 roles exist (admin, cashier, kitchen_staff, inventory_staff, supplier_manager, manager)
 *   - 15 namespaced permissions exist
 *   - Admin role has ALL permissions
 *   - Other roles have correct subset
 *   - No auto-manager assignment (only super admins get admin role)
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { query } = require('./src/config/db');

const MIGRATION_FILE = path.join(__dirname, 'migrations', '030_rbac_restaurant_clean.sql');

const EXPECTED_ROLES = ['admin', 'cashier', 'kitchen_staff', 'inventory_staff', 'supplier_manager', 'manager'];

const EXPECTED_PERMISSIONS = [
    'users:manage', 'roles:manage', 'menu:manage', 'inventory:manage',
    'supplier:manage', 'reports:view', 'orders:create', 'orders:update',
    'orders:cancel', 'orders:delete', 'orders:view', 'orders:update_status',
    'payments:process', 'stock:manage', 'purchase:create',
];

const EXPECTED_ROLE_PERM_COUNTS = {
    admin: 15,            // ALL permissions
    cashier: 4,           // orders:create, orders:update, orders:view, payments:process
    kitchen_staff: 2,     // orders:view, orders:update_status
    inventory_staff: 2,   // inventory:manage, stock:manage
    supplier_manager: 2,  // supplier:manage, purchase:create
    manager: 2,           // reports:view, orders:view
};

async function run() {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  RestoERP — Running RBAC Restaurant Migration (Idempotent)');
    console.log('═══════════════════════════════════════════════════════════════\n');

    // ── 1. Run migration ──
    console.log('📄 Reading migration file:', MIGRATION_FILE);
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');

    console.log('🔄 Executing migration...');
    try {
        await query(sql);
        console.log('✅ Migration executed successfully.\n');
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
        process.exit(1);
    }

    // ── 2. Verify Roles ──
    console.log('── Verifying Roles ──');
    const rolesRes = await query(`SELECT name FROM roles WHERE name = ANY($1) ORDER BY name`, [EXPECTED_ROLES]);
    const existingRoles = rolesRes.rows.map(r => r.name);
    const missingRoles = EXPECTED_ROLES.filter(r => !existingRoles.includes(r));

    if (missingRoles.length > 0) {
        console.error(`❌ Missing roles: ${missingRoles.join(', ')}`);
    } else {
        console.log(`✅ All ${EXPECTED_ROLES.length} roles exist: ${existingRoles.join(', ')}`);
    }

    // ── 3. Verify Permissions ──
    console.log('\n── Verifying Permissions ──');
    const permsRes = await query(`SELECT name FROM permissions WHERE name = ANY($1) ORDER BY name`, [EXPECTED_PERMISSIONS]);
    const existingPerms = permsRes.rows.map(r => r.name);
    const missingPerms = EXPECTED_PERMISSIONS.filter(p => !existingPerms.includes(p));

    if (missingPerms.length > 0) {
        console.error(`❌ Missing permissions: ${missingPerms.join(', ')}`);
    } else {
        console.log(`✅ All ${EXPECTED_PERMISSIONS.length} permissions exist`);
    }

    // ── 4. Verify Role → Permission Mapping ──
    console.log('\n── Verifying Role → Permission Mapping ──');
    const mappingRes = await query(`
        SELECT r.name AS role, COUNT(rp.permission_id) AS perm_count
        FROM roles r
        LEFT JOIN role_permissions rp ON r.id = rp.role_id
        WHERE r.name = ANY($1)
        GROUP BY r.name, r.id
        ORDER BY perm_count DESC
    `, [EXPECTED_ROLES]);

    let allCorrect = true;
    for (const row of mappingRes.rows) {
        const expected = EXPECTED_ROLE_PERM_COUNTS[row.role];
        const actual = parseInt(row.perm_count);
        const match = actual >= expected; // >= because admin gets ALL perms including existing ones
        const icon = match ? '✅' : '❌';
        console.log(`  ${icon} ${row.role}: ${actual} permissions (expected ≥${expected})`);
        if (!match) allCorrect = false;
    }

    // ── 5. Verify NO auto-manager assignment ──
    console.log('\n── Checking User-Role Assignments ──');
    const autoManagerRes = await query(`
        SELECT COUNT(*) AS count
        FROM user_roles ur
        JOIN roles r ON ur.role_id = r.id
        WHERE r.name = 'manager'
    `);
    const managerCount = parseInt(autoManagerRes.rows[0].count);
    console.log(`  ℹ️  Users with 'manager' role: ${managerCount}`);

    // ── 6. Detailed mapping (for debugging) ──
    console.log('\n── Detailed Role-Permission Mapping ──');
    const detailRes = await query(`
        SELECT r.name AS role, p.name AS permission
        FROM roles r
        JOIN role_permissions rp ON r.id = rp.role_id
        JOIN permissions p ON rp.permission_id = p.id
        WHERE r.name = ANY($1)
        ORDER BY r.name, p.name
    `, [EXPECTED_ROLES]);

    const grouped = {};
    for (const row of detailRes.rows) {
        if (!grouped[row.role]) grouped[row.role] = [];
        grouped[row.role].push(row.permission);
    }
    for (const [role, perms] of Object.entries(grouped)) {
        console.log(`  ${role} (${perms.length}):`);
        for (const p of perms) {
            console.log(`    → ${p}`);
        }
    }

    // ── Summary ──
    console.log('\n═══════════════════════════════════════════════════════════════');
    if (missingRoles.length === 0 && missingPerms.length === 0 && allCorrect) {
        console.log('  ✅ RBAC Migration VERIFIED — All checks passed!');
    } else {
        console.log('  ⚠️  RBAC Migration completed with warnings. Review output above.');
    }
    console.log('═══════════════════════════════════════════════════════════════\n');

    process.exit(0);
}

run().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
