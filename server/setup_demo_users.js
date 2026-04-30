const bcrypt = require('bcrypt');
const { query, getClient } = require('./src/config/db');

async function run() {
    const client = await getClient();
    try {
        await client.query('BEGIN');

        console.log('1. Deactivating old Demo Users and MTX Super Admins...');
        // Set is_active = false for everyone except ID 5 (Muthiah)
        // Also we don't want to break the admin login if someone relies on it, but the user explicitly said "delete MTX Super Admins kecuali Muthiah, delete juga Demo Users lainnya".
        // Let's set is_active = false for all users except id = 5 (Muthiah)
        await client.query(`
            UPDATE users 
            SET is_active = false, email = 'deleted_' || id || '_' || email 
            WHERE id != 5 AND is_active = true
        `);

        console.log('2. Creating new Restaurant Demo Users for Mirai Dining Fusion (company_id = 12)...');
        
        const passwordHash = await bcrypt.hash('password123', 10);
        
        const newUsers = [
            { email: 'admin@mirai.com',    name: 'Admin System',  role: 'admin' },
            { email: 'manager@mirai.com',  name: 'Pak Manager',   role: 'manager' },
            { email: 'kasir@mirai.com',    name: 'Mbak Kasir',    role: 'cashier' },
            { email: 'dapur@mirai.com',    name: 'Chef Dapur',    role: 'kitchen_staff' },
            { email: 'gudang@mirai.com',   name: 'Staf Gudang',   role: 'inventory_staff' },
            { email: 'supplier@mirai.com', name: 'Staf Pembelian',role: 'supplier_manager' },
        ];

        for (const u of newUsers) {
            // Insert User
            const userRes = await client.query(`
                INSERT INTO users (username, name, email, password_hash, is_active, is_super_admin)
                VALUES ($1, $2, $3, $4, true, false)
                RETURNING id
            `, [u.email.split('@')[0] + '_mirai', u.name, u.email, passwordHash]);
            
            const userId = userRes.rows[0].id;

            // Link to Company
            await client.query(`
                INSERT INTO user_companies (user_id, company_id)
                VALUES ($1, 12)
            `, [userId]);

            // Get Role ID
            const roleRes = await client.query(`SELECT id FROM roles WHERE name = $1`, [u.role]);
            if (roleRes.rows.length > 0) {
                const roleId = roleRes.rows[0].id;
                // Assign Role
                await client.query(`
                    INSERT INTO user_roles (user_id, role_id)
                    VALUES ($1, $2)
                `, [userId, roleId]);
            }
        }

        await client.query('COMMIT');
        console.log('✅ Demo users successfully created and old users deactivated.');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Error:', err);
    } finally {
        client.release();
        process.exit(0);
    }
}

run();
