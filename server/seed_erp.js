require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'erpsys',
});

async function runSeeder() {
    console.log('--- Memulai Seeding Data ERP berdasarkan POS Resto ---');
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        console.log('1. Seeding HR (Karyawan) dari Users...');
        // Cari Users
        const { rows: users } = await client.query(`SELECT * FROM users`);
        const { rows: comps } = await client.query(`SELECT id FROM companies LIMIT 1`);
        const compId = comps.length > 0 ? comps[0].id : 1;
        const { rows: br } = await client.query(`SELECT id FROM branches LIMIT 1`);
        const branchId = br.length > 0 ? br[0].id : 1;

        let hrCount = 0;
        for (const [idx, u] of users.entries()) {
            // Check if exist
            const { rowCount } = await client.query(`SELECT uuid FROM employees WHERE nama_lengkap = $1`, [u.name || u.username]);
            if (rowCount === 0) {
                const nik = 'EMP-' + Math.floor(1000 + Math.random() * 9000) + '-' + idx;
                await client.query(`
                    INSERT INTO employees (uuid, user_id, nik, nama_lengkap, status, company_id, branch_id)
                    VALUES (gen_random_uuid(), $1, $2, $3, 'aktif', $4, $5)
                `, [u.id, nik, u.name || u.username, compId, branchId]);
                hrCount++;
            }
        }
        console.log(` > Dibuat ${hrCount} profil Karyawan HR.`);

        // Tambahkan COA standar
        console.log('2. Seeding Accounting (Chart of Accounts)...');
        const coaData = [
            { code: '1101', name: 'Kas Di Tangan', type: 'asset' },
            { code: '1102', name: 'Kas Kasir POS', type: 'asset' },
            { code: '1103', name: 'Bank BCA', type: 'asset' },
            { code: '1104', name: 'Persediaan Bahan Baku', type: 'asset' },
            { code: '2101', name: 'Hutang Pemasok (AP)', type: 'liability' },
            { code: '3101', name: 'Modal Utama', type: 'equity' },
            { code: '4101', name: 'Pendapatan Resto (Sales)', type: 'revenue' },
            { code: '5101', name: 'Harga Pokok Penjualan (HPP)', type: 'expense' },
            { code: '6101', name: 'Beban Gaji Karyawan', type: 'expense' }
        ];
        let coaCount = 0;
        for (const c of coaData) {
            const { rowCount } = await client.query(`SELECT uuid FROM chart_of_accounts WHERE code = $1`, [c.code]);
            if (rowCount === 0) {
                await client.query(`INSERT INTO chart_of_accounts (uuid, code, name, type, company_id) VALUES (gen_random_uuid(), $1, $2, $3, $4)`, [c.code, c.name, c.type, compId]);
                coaCount++;
            }
        }
        console.log(` > Dibuat ${coaCount} Akun COA.`);

        // Default Warehouse
        console.log('3. Seeding Inventory (Gudang & Items)...');
        const { rows: whRows } = await client.query(`SELECT id, uuid FROM warehouses WHERE code = 'PUST'`);
        let warehouseId, warehouseUuid;
        if (whRows.length === 0) {
            const res = await client.query(`INSERT INTO warehouses (uuid, name, code, is_active, branch_id) VALUES (gen_random_uuid(), 'Gudang Pusat Resto', 'PUST', true, $1) RETURNING id, uuid`, [branchId]);
            warehouseId = res.rows[0].id;
            warehouseUuid = res.rows[0].uuid;
            console.log(' > Dibuat 1 Gudang Default.');
        } else {
            warehouseId = whRows[0].id;
            warehouseUuid = whRows[0].uuid;
        }

        // Kategori Menu ke Inventory
        const { rows: menuItems } = await client.query(`SELECT * FROM resto_menu_items`);
        let invCount = 0;
        for (const [index, m] of menuItems.entries()) {
            const { rowCount } = await client.query(`SELECT uuid FROM items WHERE name = $1`, [m.name]);
            if (rowCount === 0) {
                const itemCode = 'INV-' + (1000 + index);
                const invItem = await client.query(`
                    INSERT INTO items (uuid, code, name, buy_price, sell_price, is_active, company_id)
                    VALUES (gen_random_uuid(), $1, $2, $3, $4, true, $5) RETURNING id
                `, [itemCode, m.name, (m.price || 0) * 0.4, (m.price || 0), compId]);
                invCount++;
            }
        }
        console.log(` > Dibuat ${invCount} Item Inventory.`);

        // Seeding Purchasing Supplier Dummy
        console.log('4. Seeding Purchasing (Supplier Dummy)...');
        const { rowCount: supRows } = await client.query(`SELECT uuid FROM suppliers WHERE code = 'SUP-A'`);
        if (supRows === 0) {
            await client.query(`INSERT INTO suppliers (uuid, code, name, phone, address, company_id, branch_id) VALUES (gen_random_uuid(), 'SUP-A', 'PT Bahan Resto Makmur', '081234567890', 'Jl. Sudirman No 1', $1, $2)`, [compId, branchId]);
            console.log(' > Dibuat 1 Supplier Dummy.');
        }

        await client.query('COMMIT');
        console.log('--- SEEDING SELESAI SUCCESS ---');
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('ERROR SEEDING:', e);
    } finally {
        client.release();
        pool.end();
    }
}
runSeeder();
