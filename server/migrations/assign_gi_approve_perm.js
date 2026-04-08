require('dotenv').config({ path: '../.env' });
const { query, pool } = require('../src/config/db');

async function run() {
    // Cek roles yang sudah punya inventory:approve
    const existing = await query(
        `SELECT r.name as role FROM role_permissions rp
         JOIN roles r ON r.id = rp.role_id
         JOIN permissions p ON p.id = rp.permission_id
         WHERE p.name = 'inventory:approve'`
    );
    console.log('Roles dengan inventory:approve:', existing.rows.map(r => r.role).join(', ') || 'TIDAK ADA');

    // Assign ke Warehouse Manager & Supervisor jika belum ada
    const permRes = await query(`SELECT id FROM permissions WHERE name = 'inventory:approve'`);
    const permId = permRes.rows[0]?.id;
    console.log('Permission ID:', permId);

    const targetRoles = await query(
        `SELECT id, name FROM roles WHERE name ILIKE '%warehouse manager%' OR name ILIKE '%supervisor%' OR name ILIKE '%manager%'`
    );
    console.log('Roles ditemukan:', targetRoles.rows.map(r => r.name).join(', '));

    for (const role of targetRoles.rows) {
        await query(
            `INSERT INTO role_permissions (role_id, permission_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
            [role.id, permId]
        );
        console.log('✓ Assign inventory:approve ke', role.name);
    }
    pool.end();
}
run().catch(e => { console.error(e.message); pool.end(); });
