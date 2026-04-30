const fs = require('fs');
const { query, getClient } = require('./src/config/db');

(async () => {
    const sql = fs.readFileSync('./migrations/020_rbac_resto_redesign.sql', 'utf8');
    const client = await getClient();
    try {
        await client.query(sql);
        console.log('✅ Migration completed successfully!\n');

        const roles = await client.query('SELECT name, description FROM roles ORDER BY id');
        console.log('=== ROLES ===');
        roles.rows.forEach(r => console.log('  ' + r.name + ': ' + r.description));

        const perms = await client.query('SELECT COUNT(*) as cnt FROM permissions');
        console.log('\n=== PERMISSIONS: ' + perms.rows[0].cnt + ' total ===');

        const mapping = await client.query(
            'SELECT r.name as role, COUNT(rp.permission_id) as perm_count ' +
            'FROM roles r LEFT JOIN role_permissions rp ON r.id = rp.role_id ' +
            'GROUP BY r.name, r.id ORDER BY r.id'
        );
        console.log('\n=== ROLE → PERMISSION COUNT ===');
        mapping.rows.forEach(m => console.log('  ' + m.role + ': ' + m.perm_count + ' permissions'));

        const users = await client.query(
            'SELECT u.username, u.name, array_agg(r.name ORDER BY r.name) as roles ' +
            'FROM users u LEFT JOIN user_roles ur ON u.id = ur.user_id ' +
            'LEFT JOIN roles r ON ur.role_id = r.id ' +
            'GROUP BY u.username, u.name ORDER BY u.username'
        );
        console.log('\n=== USER → ROLE ASSIGNMENTS ===');
        users.rows.forEach(u => console.log('  ' + u.username + ' (' + u.name + '): [' + u.roles + ']'));

    } catch (err) {
        console.error('❌ Migration FAILED:', err.message);
    } finally {
        client.release();
        process.exit();
    }
})();
