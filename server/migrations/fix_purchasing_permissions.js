/**
 * fix_purchasing_permissions.js
 * 
 * One-time migration: ensure all Purchasing roles have purchasing:* permissions
 * AND that the purchasing:* permissions exist in the permissions table.
 * 
 * Safe to run multiple times (uses ON CONFLICT DO NOTHING).
 * Usage: node fix_purchasing_permissions.js
 */
require('dotenv').config();
const { pool, query } = require('../src/config/db');

async function run() {
    console.log('Fixing purchasing permissions...\n');

    // 1. Ensure all required permissions exist in permissions table
    const permsToAdd = [
        'purchasing:view',
        'purchasing:create',
        'purchasing:edit',
        'purchasing:delete',
        'purchasing:approve',
        'purchasing:export',
    ];
    console.log('Step 1: Ensuring permissions exist in permissions table...');
    for (const p of permsToAdd) {
        const r = await query(`INSERT INTO permissions (name) VALUES ($1) ON CONFLICT DO NOTHING RETURNING id, name`, [p]);
        if (r.rows.length > 0) console.log(`  + Added permission: ${p}`);
        else console.log(`  ✓ Already exists: ${p}`);
    }

    // 2. Get all permission IDs we need
    const permRes = await query(`SELECT id, name FROM permissions WHERE name = ANY($1)`, [permsToAdd]);
    const permMap = Object.fromEntries(permRes.rows.map(r => [r.name, r.id]));
    console.log('\nPermission IDs:', permMap);

    // 3. Get all Purchasing roles (any company)
    const roleNames = ['Purchasing Manager', 'Purchasing Supervisor', 'Purchasing Staff'];
    const rolesRes = await query(
        `SELECT id, name, company_id FROM roles WHERE name = ANY($1) ORDER BY company_id, name`,
        [roleNames]
    );
    console.log(`\nStep 2: Found ${rolesRes.rows.length} purchasing roles across companies:`);
    for (const r of rolesRes.rows) {
        console.log(`  - [company_id=${r.company_id}] ${r.name} (id=${r.id})`);
    }

    // 4. Define which permissions each role gets
    const rolePermMapping = {
        'Purchasing Manager': permsToAdd,  // full purchasing access
        'Purchasing Supervisor': ['purchasing:view', 'purchasing:create', 'purchasing:edit', 'purchasing:approve', 'purchasing:export'],
        'Purchasing Staff': ['purchasing:view', 'purchasing:create', 'purchasing:edit'],
    };

    // 5. Insert missing role_permissions
    console.log('\nStep 3: Ensuring role_permissions are assigned...');
    let added = 0, skipped = 0;
    for (const role of rolesRes.rows) {
        const permsForRole = rolePermMapping[role.name] || [];
        for (const permName of permsForRole) {
            const permId = permMap[permName];
            if (!permId) { console.log(`  ! Permission not found: ${permName}`); continue; }
            const r = await query(
                `INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING role_id`,
                [role.id, permId]
            );
            if (r.rows.length > 0) {
                console.log(`  + ${role.name} (id=${role.id}) ← ${permName}`);
                added++;
            } else {
                skipped++;
            }
        }
    }

    console.log(`\n✅ Done! ${added} permissions added, ${skipped} already existed.`);
    console.log('\n⚠️  User must LOGOUT and LOGIN again for new permissions to take effect in JWT.\n');
    await pool.end();
}

run().catch(err => { console.error('Error:', err); process.exit(1); });
