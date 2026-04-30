const { query } = require('./src/config/db');
query(`SELECT p.name FROM role_permissions rp JOIN roles r ON rp.role_id = r.id JOIN permissions p ON rp.permission_id = p.id WHERE r.name = 'inventory_staff'`)
.then(res => { console.log(res.rows); process.exit(0); });
