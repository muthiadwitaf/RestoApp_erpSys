/**
 * migrations/seed_hr_org_initial.js
 * Seed initial data:
 * - departments
 * - divisions
 * - positions
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'erpsys',
});

async function run() {
    const client = await pool.connect();

    try {
        console.log('Seeding HR Organization...\n');

        await client.query('BEGIN');

        // Ambil semua company aktif
        const { rows: companies } = await client.query(`
            SELECT uuid, name
            FROM companies
            WHERE is_active = TRUE
        `);

        for (const company of companies) {

            console.log(`Company: ${company.name}`);

            // ─────────────────────────────
            // 1. Departments
            // ─────────────────────────────
            const departments = [
                { nama: 'Human Resources', kode: 'HR' },
                { nama: 'Finance', kode: 'FIN' },
                { nama: 'Information Technology', kode: 'IT' },
                { nama: 'Operations', kode: 'OPS' },
                { nama: 'Sales & Marketing', kode: 'SAL' },
            ];

            for (const dept of departments) {
                await client.query(`
                    INSERT INTO departments (company_uuid, nama, kode, created_by)
                    VALUES ($1,$2,$3,'seed')
                    ON CONFLICT (company_uuid, kode) DO NOTHING
                `, [company.uuid, dept.nama, dept.kode]);
            }

            // ambil department uuid
            const { rows: deptRows } = await client.query(`
                SELECT uuid, kode
                FROM departments
                WHERE company_uuid = $1
            `, [company.uuid]);

            const deptMap = {};
            deptRows.forEach(d => deptMap[d.kode] = d.uuid);

            // ─────────────────────────────
            // 2. Divisions
            // ─────────────────────────────
            const divisions = [

                // HR
                { dept: 'HR', nama: 'Recruitment', kode: 'HR-REC' },
                { dept: 'HR', nama: 'Payroll', kode: 'HR-PAY' },
                { dept: 'HR', nama: 'Training', kode: 'HR-TRN' },

                // FIN
                { dept: 'FIN', nama: 'Accounting', kode: 'FIN-ACC' },
                { dept: 'FIN', nama: 'Tax', kode: 'FIN-TAX' },
                { dept: 'FIN', nama: 'Treasury', kode: 'FIN-TRS' },

                // IT
                { dept: 'IT', nama: 'Software Development', kode: 'IT-DEV' },
                { dept: 'IT', nama: 'Infrastructure', kode: 'IT-INF' },
                { dept: 'IT', nama: 'IT Support', kode: 'IT-SUP' },

                // OPS
                { dept: 'OPS', nama: 'Warehouse', kode: 'OPS-WHS' },
                { dept: 'OPS', nama: 'Logistics', kode: 'OPS-LOG' },

                // SAL
                { dept: 'SAL', nama: 'Sales', kode: 'SAL-SALES' },
                { dept: 'SAL', nama: 'Marketing', kode: 'SAL-MKT' },
            ];

            for (const div of divisions) {
                const departmentUuid = deptMap[div.dept];
                if (!departmentUuid) continue;

                await client.query(`
                    INSERT INTO divisions 
                    (company_uuid, department_uuid, nama, kode, created_by)
                    VALUES ($1,$2,$3,$4,'seed')
                    ON CONFLICT (company_uuid, kode) DO NOTHING
                `, [
                    company.uuid,
                    departmentUuid,
                    div.nama,
                    div.kode
                ]);
            }

            // ─────────────────────────────
            // 3. Positions
            // ─────────────────────────────
            const positions = [
                { nama: 'Director', kode: 'DIR', level: 1 },
                { nama: 'General Manager', kode: 'GM', level: 2 },
                { nama: 'Manager', kode: 'MGR', level: 3 },
                { nama: 'Assistant Manager', kode: 'AM', level: 4 },
                { nama: 'Supervisor', kode: 'SPV', level: 5 },
                { nama: 'Senior Staff', kode: 'SR', level: 6 },
                { nama: 'Staff', kode: 'STF', level: 7 },
                { nama: 'Junior Staff', kode: 'JR', level: 8 },
                { nama: 'Intern', kode: 'INT', level: 9 },
            ];

            for (const pos of positions) {
                await client.query(`
                    INSERT INTO positions 
                    (company_uuid, nama, kode, level, created_by)
                    VALUES ($1,$2,$3,$4,'seed')
                    ON CONFLICT (company_uuid, kode) DO NOTHING
                `, [
                    company.uuid,
                    pos.nama,
                    pos.kode,
                    pos.level
                ]);
            }

            console.log('  ✔ Seeded');
        }

        await client.query('COMMIT');

        console.log('\nSeed HR Organization selesai!');

    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Error:', e.message);
    } finally {
        client.release();
        await pool.end();
    }
}

run();
