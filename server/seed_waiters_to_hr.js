require('dotenv').config();
const { getClient } = require('./src/config/db');

async function seedWaitersToHr() {
    const client = await getClient();
    try {
        await client.query('BEGIN');
        
        const waiters = await client.query('SELECT * FROM resto_waiters WHERE company_id = 12');
        console.log(`Found ${waiters.rows.length} waiters for Company 12`);
        
        let existingEmps = await client.query('SELECT nama_lengkap FROM employees WHERE company_id = 12');
        const existingNames = existingEmps.rows.map(r => r.nama_lengkap.toLowerCase());

        let count = 0;
        for (const w of waiters.rows) {
            if (existingNames.includes(w.name.toLowerCase())) {
                console.log(`Employee ${w.name} already exists. Skipping.`);
                continue;
            }
            
            const randomNik = 'NIK-' + Math.floor(1000 + Math.random() * 9000);
            await client.query(
                `INSERT INTO employees 
                (company_id, branch_id, nik, nama_lengkap, no_hp, status, is_active, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
                [12, 16, randomNik, w.name, w.phone || null, w.is_active ? 'aktif' : 'nonaktif', w.is_active] 
            );
            count++;
        }

        await client.query('COMMIT');
        console.log(`Successfully migrated ${count} waiters into HR Employees.`);
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Error during migration:', e);
    } finally {
        client.release();
        process.exit(0);
    }
}

seedWaitersToHr();
