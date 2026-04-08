/**
 * seed.js --- Complete data seed for ERPsys
 * PERINGATAN: Script ini akan MENGHAPUS semua data dan mengisi ulang dari nol.
 * Gunakan hanya untuk development / fresh install.
 *
 * Usage: node seed.js
 */
require('dotenv').config();
const { pool, query: q } = require('./src/config/db');
const bcrypt = require('bcrypt');

// --- Helper ---
function daysFromNow(n) {
    const d = new Date(); d.setDate(d.getDate() + n);
    return d.toISOString().split('T')[0];
}
function daysAgo(n) { return daysFromNow(-n); }

async function truncateAll() {
    console.log(' Membersihkan data lama...');
    const tables = [
        'audit_trail', 'pos_transactions', 'goods_issue_lines', 'goods_issues',
        'sales_order_lines', 'sales_orders', 'goods_receive_lines', 'batches',
        'goods_receives', 'purchase_order_lines', 'purchase_orders', 'inventory',
        'stock_movements', 'stock_opname_lines', 'stock_opnames',
        'purchase_return_lines', 'purchase_returns', 'sales_return_lines', 'sales_returns',
        'invoices', 'purchase_bills', 'stock_transfer_lines', 'stock_transfers',
        'consignments', 'auto_number_counters', 'supplier_prices', 'item_price_tiers',
        'closing_periods', 'margin_defaults',
        'bundle_items', 'bundles', 'customers', 'suppliers', 'items',
        'journal_lines', 'journal_entries', 'chart_of_accounts',
        'tax_configs', 'categories', 'units', 'warehouse_zones', 'warehouses',
        'user_branches', 'user_companies', 'user_roles',
        'refresh_tokens', 'users', 'role_permissions', 'permissions', 'roles',
        'company_settings', 'branches', 'companies', 'error_logs'
    ];
    for (const t of tables) {
        await q(`TRUNCATE TABLE ${t} RESTART IDENTITY CASCADE`).catch(() => { });
    }
    console.log('--- Data lama dihapus\n');
}

async function run() {
    console.log('Memulai seed ERPsys...\n');
    await truncateAll();

    // ============================================================
    // 1. COMPANIES (2 perusahaan demo)
    // ============================================================
    console.log(' Companies (2 perusahaan demo)...');
    const compRes = await q(`INSERT INTO companies (code, short_name, name, npwp, address, phone, is_pkp, pkp_since, efaktur_series_prefix, efaktur_last_number) VALUES
 ('PTSSP','PT-SSP','PT Sumber Sejahtera Pangan','72.123.456.7-421.000','Jl. Merdeka No.1, Jakarta Pusat','021-12345678', TRUE, '2020-01-01', '010', 2),
 ('PTCEN','PT-CEN','PT Cahaya Elektrik Nusantara','73.234.567.8-051.000','Jl. Gatot Subroto No.55, Jakarta Selatan','021-98765432', TRUE, '2019-06-01', '010', 5)
 RETURNING id, code`);
    const comp = Object.fromEntries(compRes.rows.map(r => [r.code, r.id]));
    const [cssp, ccen] = [comp['PTSSP'], comp['PTCEN']];
    const companyIds = [cssp, ccen];
    console.log(' --- PT Sumber Sejahtera Pangan (Sembako) | PT Cahaya Elektrik Nusantara (Listrik)');

    // ============================================================
    // 2. BRANCHES (4 cabang --- 2 per company)
    // ============================================================
    console.log(' Branches (2 per company = 4 total)...');
    const brRes = await q(`INSERT INTO branches (code, name, address, phone, company_id) VALUES
 ('SSP-JKT','SSP Jakarta Pusat','Jl. Merdeka No.1, Jakarta Pusat','021-12345678',$1),
 ('SSP-BDG','SSP Bandung','Jl. Asia Afrika No.25, Bandung','022-87654321',$1),
 ('CEN-JKT','CEN Jakarta Selatan','Jl. Gatot Subroto No.55, Jakarta','021-98765432',$2),
 ('CEN-SBY','CEN Surabaya','Jl. Pemuda No.10, Surabaya','031-44443333',$2)
 RETURNING id, code`, [cssp, ccen]);
    const br = Object.fromEntries(brRes.rows.map(r => [r.code, r.id]));
    const [sjkt, sbdg] = [br['SSP-JKT'], br['SSP-BDG']];
    const [cjkt, csby] = [br['CEN-JKT'], br['CEN-SBY']];
    console.log(' --- SSP: Jakarta+Bandung | CEN: Jakarta+Surabaya');


    // ============================================================
    // 3. ROLES (per company --- each company gets its own set)
    // ============================================================
    console.log(' Roles & Permissions (per company)...');
    const saRes = await q(`INSERT INTO roles (name, description, company_id) VALUES
 ('Super Admin', 'Full system access --- platform owner level, lintas semua company', NULL)
 RETURNING id, name`);
    const superAdminRoleId = saRes.rows[0].id;

    const roleTemplates = [
        ['Owner', 'Pemilik company --- monitoring strategis semua modul, read-only bisnis'],
        ['Admin IT', 'IT sysadmin --- kelola users, roles, audit. Bukan pemilik bisnis'],
        ['Direktur', 'Eksekutif operasional --- scope per branch assignment, bisa approve'],
        ['Finance Manager', 'Manager departemen keuangan --- full access Finance'],
        ['Finance Staff', 'Staff keuangan --- create & edit Invoice/Bill'],
        ['Sales Manager', 'Manager sales --- full access Sales, bisa delete & export'],
        ['Sales Supervisor', 'Supervisor sales --- approve SO'],
        ['Sales Staff', 'Staff sales --- create & edit SO'],
        ['Purchasing Manager', 'Manager purchasing --- full access PO/Supplier'],
        ['Purchasing Supervisor', 'Supervisor purchasing --- approve PO'],
        ['Purchasing Staff', 'Staff purchasing --- create & edit PO'],
        ['Warehouse Manager', 'Manager gudang --- full Inventory access'],
        ['Warehouse Supervisor', 'Supervisor gudang --- manage receive/issue/opname'],
        ['Warehouse Staff', 'Staff gudang --- receive & issue barang'],
        ['Kasir', 'Operator POS kasir'],
    ];

    const roles = { 'Super Admin': superAdminRoleId };
    const rolesByName = {};
    for (const cid of companyIds) {
        for (const [rName, rDesc] of roleTemplates) {
            const rr = await q(`INSERT INTO roles (name, description, company_id) VALUES ($1,$2,$3) RETURNING id`, [rName, rDesc, cid]);
            roles[`${rName}_${cid}`] = rr.rows[0].id;
            roles[rName] = rr.rows[0].id;
        }
    }
    for (const [rName] of roleTemplates) {
        rolesByName[rName] = companyIds.map(cid => roles[`${rName}_${cid}`]);
    }

    // ============================================================
    // 4. PERMISSIONS
    // ============================================================
    const perms = [
        'dashboard:view',
        'accounting:view', 'accounting:create', 'accounting:edit', 'accounting:delete', 'accounting:approve', 'accounting:export',
        'sales:view', 'sales:create', 'sales:edit', 'sales:delete', 'sales:approve', 'sales:export',
        'purchasing:view', 'purchasing:create', 'purchasing:edit', 'purchasing:delete', 'purchasing:approve', 'purchasing:export',
        'inventory:view', 'inventory:manage', 'inventory:create', 'inventory:edit', 'inventory:delete', 'inventory:approve', 'inventory:export',
        'pos:view', 'pos:create',
        'settings:view', 'settings:create', 'settings:edit', 'settings:delete',
        'branch:view', 'branch:create', 'branch:edit', 'branch:delete',
        'company:view',
    ];
    for (const p of perms) await q(`INSERT INTO permissions (name) VALUES ($1) ON CONFLICT DO NOTHING`, [p]);
    const permRes = await q(`SELECT id, name FROM permissions`);
    const permMap = Object.fromEntries(permRes.rows.map(r => [r.name, r.id]));

    // ============================================================
    // 5. ROLE-PERMISSION MAPPING (RBAC matrix)
    // ============================================================
    const rolePermMap = {
        'Super Admin': perms,
        'Owner': ['dashboard:view', 'company:view', 'accounting:view', 'accounting:export', 'sales:view', 'sales:export', 'purchasing:view', 'purchasing:export', 'inventory:view', 'inventory:export'],
        'Admin IT': ['dashboard:view', 'settings:view', 'settings:create', 'settings:edit', 'branch:view', 'branch:create', 'branch:edit'],
        'Direktur': ['dashboard:view', 'accounting:view', 'accounting:export', 'sales:view', 'sales:approve', 'sales:export', 'purchasing:view', 'purchasing:approve', 'purchasing:export', 'inventory:view', 'inventory:export'],
        'Finance Manager': ['dashboard:view', 'accounting:view', 'accounting:create', 'accounting:edit', 'accounting:delete', 'accounting:approve', 'accounting:export'],
        'Finance Staff': ['dashboard:view', 'accounting:view', 'accounting:create', 'accounting:edit'],
        'Sales Manager': ['dashboard:view', 'sales:view', 'sales:create', 'sales:edit', 'sales:delete', 'sales:approve', 'sales:export', 'pos:view', 'pos:create', 'inventory:view'],
        'Sales Supervisor': ['dashboard:view', 'sales:view', 'sales:create', 'sales:edit', 'sales:approve', 'sales:export', 'pos:view', 'inventory:view'],
        'Sales Staff': ['dashboard:view', 'sales:view', 'sales:create', 'sales:edit', 'inventory:view'],
        'Purchasing Manager': ['dashboard:view', 'purchasing:view', 'purchasing:create', 'purchasing:edit', 'purchasing:delete', 'purchasing:approve', 'purchasing:export', 'inventory:view'],
        'Purchasing Supervisor': ['dashboard:view', 'purchasing:view', 'purchasing:create', 'purchasing:edit', 'purchasing:approve', 'purchasing:export', 'inventory:view'],
        'Purchasing Staff': ['dashboard:view', 'purchasing:view', 'purchasing:create', 'purchasing:edit', 'inventory:view'],
        'Warehouse Manager': ['dashboard:view', 'inventory:view', 'inventory:manage', 'inventory:create', 'inventory:edit', 'inventory:delete', 'inventory:approve', 'inventory:export'],
        'Warehouse Supervisor': ['dashboard:view', 'inventory:view', 'inventory:manage', 'inventory:create', 'inventory:edit', 'inventory:approve'],
        'Warehouse Staff': ['dashboard:view', 'inventory:view', 'inventory:manage', 'inventory:create'],
        'Kasir': ['dashboard:view', 'pos:view', 'pos:create'],
    };
    for (const [roleName, rPerms] of Object.entries(rolePermMap)) {
        const roleIdList = roleName === 'Super Admin' ? [superAdminRoleId] : (rolesByName[roleName] || []);
        for (const roleId of roleIdList) {
            for (const perm of rPerms) {
                if (permMap[perm] && roleId) {
                    await q(`INSERT INTO role_permissions (role_id, permission_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [roleId, permMap[perm]]);
                }
            }
        }
    }
    console.log(' --- 16 roles x 2 companies seeded dengan RBAC matrix lengkap');

    // ============================================================
    // 6. USERS (MTX Super Admin + demo users per company)
    // ============================================================
    console.log(' Users (MTX Super Admin + demo users per company)...');
    const hash = await bcrypt.hash('password123', 12);

    // MTX Super Admins --- lintas semua company, is_super_admin = TRUE
    const mtxNames = [
        ['gorby', 'gorby@mtx.web.id', 'Gorby'],
        ['adil', 'adil@mtx.web.id', 'Adilson'],
        ['faris', 'faris@mtx.web.id', 'Faris'],
        ['husein', 'husein@mtx.web.id', 'Husein'],
        ['muthiah', 'muthiah@mtx.web.id', 'Muthiah'],
        ['yusuf', 'yusuf@mtx.web.id', 'Yusuf'],
        ['zakaria', 'zakaria@mtx.web.id', 'Zakaria'],
        ['pita', 'pita@mtx.web.id', 'Pita'],
        ['wafi', 'wafi@mtx.web.id', 'Wafi'],
        ['hamzah', 'hamzah@mtx.web.id', 'Hamzah'],
        ['hanif', 'hanif@mtx.web.id', 'Hanif'],
        ['imron', 'imron@mtx.web.id', 'Imron'],
        ['untung', 'untung@mtx.web.id', 'Untung'],
        ['anis', 'anis@mtx.web.id', 'Anis'],
    ];
    for (const [uname, email, name] of mtxNames) {
        const r = await q(`INSERT INTO users (username, email, name, password_hash, is_active, is_super_admin) VALUES ($1,$2,$3,$4,true,true) RETURNING id`,
            [uname, email, name, hash]);
        const uid = r.rows[0].id;
        await q(`INSERT INTO user_roles (user_id, role_id) VALUES ($1,$2)`, [uid, roles['Super Admin']]);
    }

    // Helper: buat user dan assign ke company + branch
    async function addUser(uname, email, name, roleName, companyId, branchIds) {
        const r = await q(`INSERT INTO users (username, email, name, password_hash, is_active) VALUES ($1,$2,$3,$4,true) RETURNING id`,
            [uname, email, name, hash]);
        const uid = r.rows[0].id;
        const roleId = roles[`${roleName}_${companyId}`] || roles[roleName];
        await q(`INSERT INTO user_roles (user_id, role_id) VALUES ($1,$2)`, [uid, roleId]);
        await q(`INSERT INTO user_companies (user_id, company_id) VALUES ($1,$2)`, [uid, companyId]);
        for (const bid of branchIds)
            await q(`INSERT INTO user_branches (user_id, branch_id) VALUES ($1,$2)`, [uid, bid]);
        return uid;
    }

    // PT Sumber Sejahtera Pangan (cssp) --- cabang SSP-JKT & SSP-BDG
    await addUser('ssp_owner', 'owner@ssp.co.id', 'Hendra Prabowo (Owner SSP)', 'Owner', cssp, [sjkt, sbdg]);
    await addUser('ssp_admin', 'admin@ssp.co.id', 'Dito Admin SSP', 'Admin IT', cssp, [sjkt, sbdg]);
    await addUser('ssp_dir', 'dir@ssp.co.id', 'Dr. Suharto Direktur SSP', 'Direktur', cssp, [sjkt, sbdg]);
    await addUser('ssp_fin_mgr', 'fin.mgr@ssp.co.id', 'Dewi Lestari FM SSP', 'Finance Manager', cssp, [sjkt, sbdg]);
    await addUser('ssp_fin', 'fin@ssp.co.id', 'Indah Keuangan SSP', 'Finance Staff', cssp, [sjkt]);
    await addUser('ssp_sls_mgr', 'sls.mgr@ssp.co.id', 'Budi Sales Manager SSP', 'Sales Manager', cssp, [sjkt, sbdg]);
    await addUser('ssp_sls_sup', 'sls.sup@ssp.co.id', 'Eko Supervisor Sales SSP', 'Sales Supervisor', cssp, [sjkt]);
    await addUser('ssp_sls', 'sls@ssp.co.id', 'Fitri Sales Staff SSP', 'Sales Staff', cssp, [sjkt]);
    await addUser('ssp_pur_mgr', 'pur.mgr@ssp.co.id', 'Agus Purchasing Manager SSP', 'Purchasing Manager', cssp, [sjkt, sbdg]);
    await addUser('ssp_pur', 'pur@ssp.co.id', 'Rini Purchasing Staff SSP', 'Purchasing Staff', cssp, [sjkt]);
    await addUser('ssp_wh_mgr', 'wh.mgr@ssp.co.id', 'Tono Warehouse Manager SSP', 'Warehouse Manager', cssp, [sjkt, sbdg]);
    await addUser('ssp_wh_sup', 'wh.sup@ssp.co.id', 'Sita Supervisor Gudang SSP', 'Warehouse Supervisor', cssp, [sjkt]);
    await addUser('ssp_wh', 'wh@ssp.co.id', 'Joko Staff Gudang SSP', 'Warehouse Staff', cssp, [sjkt]);
    await addUser('ssp_kasir', 'kasir@ssp.co.id', 'Sri Kasir SSP', 'Kasir', cssp, [sjkt]);
    console.log(' --- 14 users PT Sumber Sejahtera Pangan');

    // PT Cahaya Elektrik Nusantara (ccen) --- cabang CEN-JKT & CEN-SBY
    await addUser('cen_owner', 'owner@cen.co.id', 'Gunawan Owner CEN', 'Owner', ccen, [cjkt, csby]);
    await addUser('cen_admin', 'admin@cen.co.id', 'Ratna Admin CEN', 'Admin IT', ccen, [cjkt, csby]);
    await addUser('cen_dir', 'dir@cen.co.id', 'Bambang Direktur CEN', 'Direktur', ccen, [cjkt, csby]);
    await addUser('cen_fin_mgr', 'fin.mgr@cen.co.id', 'Lestari Finance Mgr CEN', 'Finance Manager', ccen, [cjkt, csby]);
    await addUser('cen_fin', 'fin@cen.co.id', 'Tanti Finance CEN', 'Finance Staff', ccen, [cjkt]);
    await addUser('cen_sls_mgr', 'sls.mgr@cen.co.id', 'Haryanto Sales Mgr CEN', 'Sales Manager', ccen, [cjkt, csby]);
    await addUser('cen_sls_sup', 'sls.sup@cen.co.id', 'Putra Supervisor Sales CEN', 'Sales Supervisor', ccen, [cjkt]);
    await addUser('cen_sls', 'sls@cen.co.id', 'Yanti Sales CEN', 'Sales Staff', ccen, [cjkt]);
    await addUser('cen_pur_mgr', 'pur.mgr@cen.co.id', 'Wahyu Purchasing Mgr CEN', 'Purchasing Manager', ccen, [cjkt, csby]);
    await addUser('cen_pur', 'pur@cen.co.id', 'Bambang Purchasing CEN', 'Purchasing Staff', ccen, [cjkt]);
    await addUser('cen_wh_mgr', 'wh.mgr@cen.co.id', 'Suparno WH Mgr CEN', 'Warehouse Manager', ccen, [cjkt, csby]);
    await addUser('cen_wh_sup', 'wh.sup@cen.co.id', 'Dewi Supervisor Gudang CEN', 'Warehouse Supervisor', ccen, [cjkt]);
    await addUser('cen_wh', 'wh@cen.co.id', 'Imam Gudang CEN', 'Warehouse Staff', ccen, [cjkt]);
    await addUser('cen_kasir', 'kasir@cen.co.id', 'Mira Kasir CEN', 'Kasir', ccen, [cjkt]);
    console.log(' --- 14 users PT Cahaya Elektrik Nusantara');

    const usersRes = await q(`SELECT id, username FROM users`);
    const users = Object.fromEntries(usersRes.rows.map(r => [r.username, r.id]));


    // ============================================================
    // 7. TAX CONFIGS (per company)
    // ============================================================
    console.log(' Tax Configs (per company)...');
    const taxTemplates = [
        ['Non-PKP (Bebas PPN)', 0.00, false, '2022-01-01', 'Untuk supplier yang tidak berstatus PKP'],
        ['PPN 11%', 11.00, false, '2022-04-01', 'Tarif PPN 11% sesuai UU HPP No.7/2021 berlaku Apr 2022'],
        ['PPN 12%', 12.00, true, '2025-01-01', 'Tarif PPN 12% sesuai PMK 131/2024 berlaku 1 Jan 2025 - AKTIF'],
    ];
    for (const cid of companyIds) {
        for (const [tname, trate, tactive, tdate, tnotes] of taxTemplates) {
            await q(`INSERT INTO tax_configs (name, rate, is_active, effective_date, notes, company_id) VALUES ($1,$2,$3,$4,$5,$6)`,
                [tname, trate, tactive, tdate, tnotes, cid]);
        }
    }

    // (company_settings removed -- PKP/eFaktur data now in companies table)

    // ============================================================
    // 9. CHART OF ACCOUNTS (per company)
    // ============================================================
    console.log(' Chart of Accounts (per company)...');
    const coaTemplates = [
        ['1-0001', 'Kas Tunai', 'Aset', 'Kas & Setara Kas', 'IDR', 15000000],
        ['1-0002', 'Kas Tunai Cabang 2', 'Aset', 'Kas & Setara Kas', 'IDR', 8000000],
        ['1-0003', 'Bank BCA', 'Aset', 'Kas & Setara Kas', 'IDR', 125000000],
        ['1-0004', 'Bank BRI', 'Aset', 'Kas & Setara Kas', 'IDR', 75000000],
        ['1-1001', 'Piutang Dagang', 'Aset', 'Piutang', 'IDR', 32000000],
        ['1-2001', 'Persediaan Barang', 'Aset', 'Persediaan', 'IDR', 85000000],
        ['1-3001', 'Peralatan', 'Aset', 'Aset Tetap', 'IDR', 45000000],
        ['1-3002', 'Akumulasi Penyusutan', 'Aset', 'Aset Tetap', 'IDR', -12000000],
        ['2-0001', 'Utang Dagang', 'Liabilitas', 'Utang Jangka Pendek', 'IDR', 28000000],
        ['2-0002', 'Utang Gaji', 'Liabilitas', 'Utang Jangka Pendek', 'IDR', 12000000],
        ['2-1001', 'Utang Bank BCA', 'Liabilitas', 'Utang Jangka Panjang', 'IDR', 50000000],
        ['3-0001', 'Modal Disetor', 'Ekuitas', 'Modal', 'IDR', 200000000],
        ['3-0002', 'Laba Ditahan', 'Ekuitas', 'Laba Ditahan', 'IDR', 83000000],
        ['4-0001', 'Pendapatan Penjualan', 'Pendapatan', 'Penjualan', 'IDR', 320000000],
        ['4-0002', 'Pendapatan Konsinyasi', 'Pendapatan', 'Penjualan', 'IDR', 15000000],
        ['5-0001', 'Harga Pokok Penjualan', 'Beban', 'HPP', 'IDR', 195000000],
        ['5-1001', 'Beban Gaji', 'Beban', 'Beban Operasional', 'IDR', 32000000],
        ['5-1002', 'Beban Sewa', 'Beban', 'Beban Operasional', 'IDR', 18000000],
        ['5-1003', 'Beban Listrik & Air', 'Beban', 'Beban Operasional', 'IDR', 4500000],
        ['5-1004', 'Beban Penyusutan', 'Beban', 'Beban Operasional', 'IDR', 3000000],
    ];
    for (const cid of companyIds) {
        for (const [code, name, type, cat, curr, bal] of coaTemplates) {
            await q(`INSERT INTO chart_of_accounts (code, name, type, category, currency, balance, company_id) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
                [code, name, type, cat, curr, bal, cid]);
        }
    }

    // ============================================================
    // 10. CATEGORIES (per company)
    // ============================================================
    console.log(' Categories (per company)...');
    const catTemplates = [
        ['SBK', 'Sembako', 'Bahan pokok: beras, gula, minyak, tepung'],
        ['MKN', 'Makanan & Minuman', 'Produk makanan dan minuman kemasan'],
        ['KBR', 'Kebutuhan Rumah', 'Sabun, deterjen, perlengkapan rumah'],
        ['HGN', 'Higienitas', 'Produk kebersihan diri dan rumah'],
    ];
    const catCEN = [
        ['ELT', 'Elektronik', 'Peralatan elektronik rumah tangga'],
        ['KBL', 'Kabel & Instalasi', 'Kabel listrik, instalasi, konektor'],
        ['LAM', 'Lampu & Pencahayaan', 'Lampu LED, bohlam, fitting'],
        ['AKS', 'Aksesori Listrik', 'Steker, colokan, MCB, saklar'],
    ];
    const cats = {};
    // SSP categories
    for (const [code, name, desc] of catTemplates) {
        const r = await q(`INSERT INTO categories (code, name, description, company_id) VALUES ($1,$2,$3,$4) RETURNING id, code`, [code, name, desc, cssp]);
        cats[`${code}_${cssp}`] = r.rows[0].id;
    }
    // CEN categories
    for (const [code, name, desc] of catCEN) {
        const r = await q(`INSERT INTO categories (code, name, description, company_id) VALUES ($1,$2,$3,$4) RETURNING id, code`, [code, name, desc, ccen]);
        cats[`${code}_${ccen}`] = r.rows[0].id;
    }

    // ============================================================
    // 11. UNITS (per company)
    // ============================================================
    console.log(' Units (per company)...');
    const unitTemplates = [
        ['PCS', 'Pcs'], ['BOX', 'Box'], ['DOS', 'Dus'], ['KG', 'Kilogram'], ['LITER', 'Liter'], ['SAK', 'Sak'], ['ROLL', 'Roll'], ['MTR', 'Meter'],
    ];
    const units = {};
    for (const cid of companyIds) {
        for (const [code, name] of unitTemplates) {
            const r = await q(`INSERT INTO units (code, name, company_id) VALUES ($1,$2,$3) RETURNING id, code`, [code, name, cid]);
            units[`${code}_${cid}`] = r.rows[0].id;
        }
    }

    // ============================================================
    // 12. WAREHOUSES (8 gudang --- 2 per branch)
    // ============================================================
    console.log(' Warehouses (2 per branch = 8 total)...');
    const whRes = await q(`INSERT INTO warehouses (code, name, branch_id, address) VALUES
 ('WH-SSP-JKT-01','Gudang Utama SSP Jakarta', $1, 'Jl. Pramuka No.5, Jakarta'),
 ('WH-SSP-JKT-02','Gudang Cadangan SSP Jakarta', $1, 'Jl. Cempaka Putih No.10, Jakarta'),
 ('WH-SSP-BDG-01','Gudang Utama SSP Bandung', $2, 'Jl. Soekarno Hatta No.15, Bandung'),
 ('WH-SSP-BDG-02','Gudang Cadangan SSP Bandung', $2, 'Jl. Dago No.20, Bandung'),
 ('WH-CEN-JKT-01','Gudang Utama CEN Jakarta', $3, 'Jl. Gatot Subroto No.61, Jakarta'),
 ('WH-CEN-JKT-02','Gudang Cadangan CEN Jakarta', $3, 'Jl. Rasuna Said No.8, Jakarta'),
 ('WH-CEN-SBY-01','Gudang Utama CEN Surabaya', $4, 'Jl. Basuki Rahmat No.10, Surabaya'),
 ('WH-CEN-SBY-02','Gudang Cadangan CEN Surabaya', $4, 'Jl. Tunjungan No.3, Surabaya')
 RETURNING id, code`, [sjkt, sbdg, cjkt, csby]);
    const wh = Object.fromEntries(whRes.rows.map(r => [r.code, r.id]));



    // ============================================================
    // 13. SUPPLIERS (per company --- each has own suppliers)
    // ============================================================
    console.log(' Suppliers...');
    // --- SSP Suppliers (Toko Sembako) ---
    const sspSupRes = await q(`INSERT INTO suppliers (code, name, address, phone, branch_id, company_id, is_pkp, npwp) VALUES
 ('SUP-001','PT Indofood Sukses Makmur','Jl. Jend. Sudirman Kav 76-78, Jakarta','021-5795-8822', $1, $3, TRUE, '01.002.583.2-051.000'),
 ('SUP-002','PT Wings Food Indonesia','Jl. Rangkah Baru 5, Surabaya','031-374-0600', $1, $3, TRUE, '01.081.171.0-542.000'),
 ('SUP-003','PT Unilever Indonesia','Jl. BSD Boulevard Barat, Tangerang','021-5422-0000', $1, $3, TRUE, '01.001.483.1-051.000'),
 ('SUP-004','PT Mayora Indah','Jl. Tomang Raya No.21, Jakarta','021-565-5555', $1, $3, TRUE, '01.001.584.3-051.000'),
 ('SUP-005','CV Sumber Makmur Pangan','Jl. Kwitang No.7, Jakarta','021-3103-456', $2, $3, FALSE, NULL)
 RETURNING id, code`, [sjkt, sbdg, cssp]);
    const sup = Object.fromEntries(sspSupRes.rows.map(r => [r.code, r.id]));
    const supIsPKP = { 'SUP-001': true, 'SUP-002': true, 'SUP-003': true, 'SUP-004': true, 'SUP-005': false };
    const PPN_RATE = 12.00;

    // --- CEN Suppliers (Toko Listrik) ---
    const cenSupRes = await q(`INSERT INTO suppliers (code, name, address, phone, branch_id, company_id, is_pkp, npwp) VALUES
 ('SUP-CEN-001','PT Philips Indonesia','Jl. Gatot Subroto No.1, Jakarta','021-5790-0000', $1, $3, TRUE, '01.111.222.3-051.000'),
 ('SUP-CEN-002','PT Schneider Electric Indonesia','Jl. Raya Pasar Minggu No.18, Jakarta','021-7982-2222', $1, $3, TRUE, '01.222.333.4-051.000'),
 ('SUP-CEN-003','PT Legrand Indonesia','Jl. Puri Kencana No.1, Jakarta','021-5821-0000', $1, $3, TRUE, '01.333.444.5-051.000'),
 ('SUP-CEN-004','CV Berkah Elektrik','Jl. Raya Darmo No.30, Surabaya','031-5678-123', $2, $3, FALSE, NULL)
 RETURNING id, code`, [cjkt, csby, ccen]);
    const cenSup = Object.fromEntries(cenSupRes.rows.map(r => [r.code, r.id]));

    // ============================================================
    // 14. CUSTOMERS (per company)
    // ============================================================
    console.log(' Customers...');
    // --- SSP Customers (Toko Sembako) ---
    const sspCustRes = await q(`INSERT INTO customers (code, name, address, phone, branch_id, company_id, is_pkp, npwp, customer_type) VALUES
 ('CST-001','Toko Bahagia Jaya','Jl. Pasar Minggu No.5, Jakarta','0812-3456-7890', $1, $3, FALSE, NULL, 'regular'),
 ('CST-002','Minimarket Ceria','Jl. Kebayoran Baru No.12, Jakarta','0813-6543-2100', $1, $3, FALSE, NULL, 'regular'),
 ('CST-003','UD Maju Bersama','Jl. Fatmawati No.8, Jakarta','0821-9876-5432', $1, $3, TRUE, '71.234.567.8-001.000', 'regular'),
 ('CST-004','SDN 05 Jakarta','Jl. Merdeka No.3, Jakarta','0819-1234-5678', $1, $3, FALSE, NULL, 'bendaharawan'),
 ('CST-005','Toko Bu Sari','Jl. Veteran No.15, Bandung','0857-2345-6789', $2, $3, FALSE, NULL, 'regular'),
 ('CST-006','Warung Pak Joko','Jl. Dipatiukur No.20, Bandung','0878-8765-4321', $2, $3, FALSE, NULL, 'regular'),
 ('CST-007','Restoran Sari Rasa','Jl. Braga No.30, Bandung','0896-5432-1098', $2, $3, TRUE, '73.456.789.0-429.000', 'regular'),
 ('CST-008','Supermarket Duta','Jl. Buah Batu No.45, Bandung','0877-1234-5678', $2, $3, TRUE, '73.567.890.1-429.000', 'regular')
 RETURNING id, code`, [sjkt, sbdg, cssp]);
    const cust = Object.fromEntries(sspCustRes.rows.map(r => [r.code, r.id]));
    const custNPWP = { 'CST-001': null, 'CST-002': null, 'CST-003': '71.234.567.8-001.000', 'CST-004': null, 'CST-005': null, 'CST-006': null, 'CST-007': '73.456.789.0-429.000', 'CST-008': '73.567.890.1-429.000' };
    const KODE_TX = { regular: '01', bendaharawan: '02', wapu: '03', luar_negeri: '07' };
    const custType = { 'CST-001': 'regular', 'CST-002': 'regular', 'CST-003': 'regular', 'CST-004': 'bendaharawan', 'CST-005': 'regular', 'CST-006': 'regular', 'CST-007': 'regular', 'CST-008': 'regular' };
    const custKodeTx = Object.fromEntries(Object.entries(custType).map(([k, v]) => [k, KODE_TX[v]]));

    // --- CEN Customers (Toko Listrik) ---
    const cenCustRes = await q(`INSERT INTO customers (code, name, address, phone, branch_id, company_id, is_pkp, npwp, customer_type) VALUES
 ('CST-CEN-001','Toko Elektrik Maju','Jl. Gatot Subroto No.60, Jakarta','0812-1111-2222', $1, $3, FALSE, NULL, 'regular'),
 ('CST-CEN-002','CV Listrik Sejahtera','Jl. MT Haryono No.15, Jakarta','0813-3333-4444', $1, $3, TRUE, '74.111.222.3-001.000', 'regular'),
 ('CST-CEN-003','Kontraktor Pak Budi','Jl. Pemuda No.25, Surabaya','0857-5555-6666', $2, $3, FALSE, NULL, 'regular'),
 ('CST-CEN-004','Dinas PU Surabaya','Jl. Pattimura No.12, Surabaya','0831-7777-8888', $2, $3, FALSE, NULL, 'bendaharawan'),
 ('CST-CEN-005','Toko Bangunan Mandiri','Jl. Diponegoro No.50, Surabaya','0856-9999-0000', $2, $3, TRUE, '74.222.333.4-001.000', 'regular')
 RETURNING id, code`, [cjkt, csby, ccen]);
    const cenCust = Object.fromEntries(cenCustRes.rows.map(r => [r.code, r.id]));

    // ============================================================
    // 15. ITEMS (per company --- each gets own products)
    // ============================================================
    console.log(' Items (15 items per company)...');
    // Helper for company-specific category/unit
    const cCat = (code, cid) => cats[`${code}_${cid}`];
    const cUnit = (code, cid) => units[`${code}_${cid}`];

    // --- SSP Items (Toko Sembako) ---
    const sspItemsData = [
        ['ITM-001', 'Beras Premium 5kg', '8998988810056', cCat('SBK', cssp), 58000, 70000, 20, cUnit('SAK', cssp), null, 1, false],
        ['ITM-002', 'Beras Medium 5kg', '8998988810057', cCat('SBK', cssp), 52000, 63000, 30, cUnit('SAK', cssp), null, 1, false],
        ['ITM-003', 'Gula Pasir 1kg', '8998866800112', cCat('SBK', cssp), 12000, 16000, 50, cUnit('KG', cssp), cUnit('SAK', cssp), 50, false],
        ['ITM-004', 'Minyak Goreng 1L', '8991102521233', cCat('SBK', cssp), 14000, 18500, 40, cUnit('LITER', cssp), cUnit('DOS', cssp), 12, true],
        ['ITM-005', 'Tepung Terigu 1kg', '8991001201001', cCat('SBK', cssp), 9000, 12000, 40, cUnit('KG', cssp), cUnit('SAK', cssp), 25, false],
        ['ITM-006', 'Mie Instan Goreng', '8991002101104', cCat('MKN', cssp), 2500, 3500, 100, cUnit('PCS', cssp), cUnit('DOS', cssp), 40, true],
        ['ITM-007', 'Mie Instan Kuah', '8991002101203', cCat('MKN', cssp), 2500, 3500, 100, cUnit('PCS', cssp), cUnit('DOS', cssp), 40, true],
        ['ITM-008', 'Kopi Sachet 3in1', '8991002201101', cCat('MKN', cssp), 1200, 2000, 150, cUnit('PCS', cssp), cUnit('BOX', cssp), 20, true],
        ['ITM-009', 'Teh Celup Box 25pcs', '8991102311233', cCat('MKN', cssp), 5000, 7500, 40, cUnit('BOX', cssp), cUnit('DOS', cssp), 12, true],
        ['ITM-010', 'Aqua Gelas 240ml 48pcs', '8991002601014', cCat('MKN', cssp), 18000, 25000, 30, cUnit('BOX', cssp), cUnit('DOS', cssp), 8, true],
        ['ITM-011', 'Sabun Mandi Batang', '8991038301010', cCat('KBR', cssp), 3000, 5000, 60, cUnit('PCS', cssp), cUnit('DOS', cssp), 48, true],
        ['ITM-012', 'Deterjen Bubuk 1kg', '8991038201013', cCat('KBR', cssp), 15000, 22000, 30, cUnit('PCS', cssp), cUnit('DOS', cssp), 12, true],
        ['ITM-013', 'Sabun Cuci Piring 800ml', '8991038911016', cCat('KBR', cssp), 8000, 12000, 30, cUnit('PCS', cssp), cUnit('DOS', cssp), 12, true],
        ['ITM-014', 'Shampoo Sachet', '8991038321018', cCat('HGN', cssp), 1500, 2500, 100, cUnit('PCS', cssp), cUnit('BOX', cssp), 12, true],
        ['ITM-015', 'Pembalut Wanita Box', '8991100900015', cCat('HGN', cssp), 18000, 28000, 20, cUnit('BOX', cssp), cUnit('DOS', cssp), 6, true],
    ];
    const sspItemRes = await q(`INSERT INTO items (code,name,barcode,category_id,buy_price,sell_price,min_stock,small_uom_id,big_uom_id,conversion_factor,is_active,is_taxable,company_id) VALUES ${sspItemsData.map((_, i) => `($${i * 13 + 1},$${i * 13 + 2},$${i * 13 + 3},$${i * 13 + 4},$${i * 13 + 5},$${i * 13 + 6},$${i * 13 + 7},$${i * 13 + 8},$${i * 13 + 9},$${i * 13 + 10},$${i * 13 + 11},$${i * 13 + 12},$${i * 13 + 13})`).join(',')} RETURNING id, code`, sspItemsData.flatMap(d => [d[0], d[1], d[2], d[3], d[4], d[5], d[6], d[7], d[8], d[9], true, d[10], cssp]));
    const itm = Object.fromEntries(sspItemRes.rows.map(r => [r.code, r.id]));

    // --- CEN Items (Toko Listrik) ---
    const cenItemsData = [
        ['CEN-001', 'Lampu LED 9W', '8991100100001', cCat('LAM', ccen), 12000, 18000, 50, cUnit('PCS', ccen), cUnit('DOS', ccen), 20, true],
        ['CEN-002', 'Lampu LED 14W', '8991100100002', cCat('LAM', ccen), 18000, 27000, 40, cUnit('PCS', ccen), cUnit('DOS', ccen), 10, true],
        ['CEN-003', 'Fitting Lampu E27', '8991100100003', cCat('LAM', ccen), 5000, 8500, 60, cUnit('PCS', ccen), cUnit('BOX', ccen), 20, true],
        ['CEN-004', 'Kabel NYA 1.5mm 50m', '8991100100004', cCat('KBL', ccen), 85000, 120000, 10, cUnit('ROLL', ccen), null, 1, true],
        ['CEN-005', 'Kabel NYM 3x1.5mm 50m', '8991100100005', cCat('KBL', ccen), 155000, 220000, 10, cUnit('ROLL', ccen), null, 1, true],
        ['CEN-006', 'Kabel NYAF 2.5mm 100m', '8991100100006', cCat('KBL', ccen), 280000, 385000, 5, cUnit('ROLL', ccen), null, 1, true],
        ['CEN-007', 'MCB 10A Single Pole', '8991100100007', cCat('AKS', ccen), 35000, 55000, 20, cUnit('PCS', ccen), cUnit('BOX', ccen), 10, true],
        ['CEN-008', 'MCB 16A Single Pole', '8991100100008', cCat('AKS', ccen), 40000, 62000, 20, cUnit('PCS', ccen), cUnit('BOX', ccen), 10, true],
        ['CEN-009', 'Steker Colokan 3 Lubang', '8991100100009', cCat('AKS', ccen), 12000, 20000, 30, cUnit('PCS', ccen), cUnit('BOX', ccen), 20, true],
        ['CEN-010', 'Saklar Tunggal', '8991100100010', cCat('AKS', ccen), 8000, 14000, 40, cUnit('PCS', ccen), cUnit('BOX', ccen), 20, true],
        ['CEN-011', 'Stop Kontak 3 Lubang', '8991100100011', cCat('AKS', ccen), 15000, 25000, 30, cUnit('PCS', ccen), cUnit('BOX', ccen), 20, true],
        ['CEN-012', 'Baterai AA 2pcs', '8991100100012', cCat('ELT', ccen), 8000, 13000, 50, cUnit('PCS', ccen), cUnit('BOX', ccen), 24, true],
        ['CEN-013', 'Baterai AAA 2pcs', '8991100100013', cCat('ELT', ccen), 7000, 12000, 50, cUnit('PCS', ccen), cUnit('BOX', ccen), 24, true],
        ['CEN-014', 'Kabel USB Type-C 1m', '8991100100014', cCat('ELT', ccen), 15000, 25000, 30, cUnit('PCS', ccen), cUnit('BOX', ccen), 12, true],
        ['CEN-015', 'Isolasi Listrik Hitam', '8991100100015', cCat('KBL', ccen), 3500, 6000, 50, cUnit('PCS', ccen), cUnit('BOX', ccen), 36, true],
    ];
    const cenItemRes = await q(`INSERT INTO items (code,name,barcode,category_id,buy_price,sell_price,min_stock,small_uom_id,big_uom_id,conversion_factor,is_active,is_taxable,company_id) VALUES ${cenItemsData.map((_, i) => `($${i * 13 + 1},$${i * 13 + 2},$${i * 13 + 3},$${i * 13 + 4},$${i * 13 + 5},$${i * 13 + 6},$${i * 13 + 7},$${i * 13 + 8},$${i * 13 + 9},$${i * 13 + 10},$${i * 13 + 11},$${i * 13 + 12},$${i * 13 + 13})`).join(',')} RETURNING id, code`, cenItemsData.flatMap(d => [d[0], d[1], d[2], d[3], d[4], d[5], d[6], d[7], d[8], d[9], true, d[10], ccen]));
    const cenItm = Object.fromEntries(cenItemRes.rows.map(r => [r.code, r.id]));

    // ============================================================
    // 15a. SUPPLIER PRICES (MBS)
    // ============================================================
    console.log(' Supplier Price Lists...');
    const spData = [
        [sup['SUP-001'], itm['ITM-006'], cUnit('PCS', cssp), 2500],
        [sup['SUP-001'], itm['ITM-007'], cUnit('PCS', cssp), 2500],
        [sup['SUP-001'], itm['ITM-008'], cUnit('PCS', cssp), 1200],
        [sup['SUP-001'], itm['ITM-009'], cUnit('BOX', cssp), 5000],
        [sup['SUP-001'], itm['ITM-010'], cUnit('BOX', cssp), 18000],
        [sup['SUP-002'], itm['ITM-011'], cUnit('PCS', cssp), 3000],
        [sup['SUP-002'], itm['ITM-012'], cUnit('PCS', cssp), 15000],
        [sup['SUP-002'], itm['ITM-013'], cUnit('PCS', cssp), 8000],
        [sup['SUP-003'], itm['ITM-001'], cUnit('SAK', cssp), 58000],
        [sup['SUP-003'], itm['ITM-002'], cUnit('SAK', cssp), 52000],
        [sup['SUP-003'], itm['ITM-003'], cUnit('KG', cssp), 12000],
        [sup['SUP-004'], itm['ITM-004'], cUnit('LITER', cssp), 14000],
        [sup['SUP-004'], itm['ITM-005'], cUnit('KG', cssp), 9000],
        [sup['SUP-004'], itm['ITM-014'], cUnit('PCS', cssp), 1500],
        [sup['SUP-005'], itm['ITM-001'], cUnit('SAK', cssp), 57000],
        [sup['SUP-005'], itm['ITM-006'], cUnit('PCS', cssp), 2400],
        [sup['SUP-005'], itm['ITM-003'], cUnit('KG', cssp), 11800],
    ];
    for (const [suppId, itemId, uomId, price] of spData) {
        await q(`INSERT INTO supplier_prices (supplier_id, item_id, uom_id, price, effective_date) VALUES ($1,$2,$3,$4, CURRENT_DATE - INTERVAL '30 days')`,
            [suppId, itemId, uomId, price]);
    }
    // CEN supplier prices
    const cenSpData = [
        [cenSup['SUP-CEN-001'], cenItm['CEN-001'], cUnit('PCS', ccen), 12000],
        [cenSup['SUP-CEN-001'], cenItm['CEN-002'], cUnit('PCS', ccen), 18000],
        [cenSup['SUP-CEN-001'], cenItm['CEN-003'], cUnit('PCS', ccen), 5000],
        [cenSup['SUP-CEN-002'], cenItm['CEN-007'], cUnit('PCS', ccen), 35000],
        [cenSup['SUP-CEN-002'], cenItm['CEN-008'], cUnit('PCS', ccen), 40000],
        [cenSup['SUP-CEN-002'], cenItm['CEN-009'], cUnit('PCS', ccen), 12000],
        [cenSup['SUP-CEN-002'], cenItm['CEN-010'], cUnit('PCS', ccen), 8000],
        [cenSup['SUP-CEN-002'], cenItm['CEN-011'], cUnit('PCS', ccen), 15000],
        [cenSup['SUP-CEN-003'], cenItm['CEN-004'], cUnit('ROLL', ccen), 85000],
        [cenSup['SUP-CEN-003'], cenItm['CEN-005'], cUnit('ROLL', ccen), 155000],
        [cenSup['SUP-CEN-003'], cenItm['CEN-006'], cUnit('ROLL', ccen), 280000],
        [cenSup['SUP-CEN-003'], cenItm['CEN-015'], cUnit('PCS', ccen), 3500],
        [cenSup['SUP-CEN-004'], cenItm['CEN-012'], cUnit('PCS', ccen), 8000],
        [cenSup['SUP-CEN-004'], cenItm['CEN-013'], cUnit('PCS', ccen), 7000],
        [cenSup['SUP-CEN-004'], cenItm['CEN-014'], cUnit('PCS', ccen), 15000],
    ];
    for (const [suppId, itemId, uomId, price] of cenSpData) {
        await q(`INSERT INTO supplier_prices (supplier_id, item_id, uom_id, price, effective_date) VALUES ($1,$2,$3,$4, CURRENT_DATE - INTERVAL '30 days')`,
            [suppId, itemId, uomId, price]);
    }

    // ============================================================
    // 15b. BUNDLES (MBS only --- SAJ doesn't have bundles for demo variety)
    // ============================================================
    console.log(' Paket Bundling (SSP - Sembako)...');
    const bundlesData = [
        { code: 'BDL-001', name: 'Paket Sembako Hemat', price: 150000, is_active: true, items: [{ item: itm['ITM-001'], qty: 1 }, { item: itm['ITM-003'], qty: 1 }, { item: itm['ITM-004'], qty: 1 }] },
        { code: 'BDL-002', name: 'Paket Mie & Kopi', price: 45000, is_active: true, items: [{ item: itm['ITM-006'], qty: 5 }, { item: itm['ITM-007'], qty: 3 }, { item: itm['ITM-008'], qty: 5 }] },
        { code: 'BDL-003', name: 'Paket Kebersihan Rumah', price: 55000, is_active: true, items: [{ item: itm['ITM-012'], qty: 1 }, { item: itm['ITM-013'], qty: 1 }, { item: itm['ITM-011'], qty: 1 }] },
    ];
    for (const b of bundlesData) {
        const bRes = await q(`INSERT INTO bundles (code, name, price, is_active) VALUES ($1,$2,$3,$4) RETURNING id`, [b.code, b.name, b.price, b.is_active]);
        for (const item of b.items) {
            await q(`INSERT INTO bundle_items (bundle_id, item_id, qty) VALUES ($1,$2,$3)`, [bRes.rows[0].id, item.item, item.qty]);
        }
    }
    // ============================================================
    // 15c.i. MARGIN DEFAULTS (per company)
    // ============================================================
    console.log(' Margin Defaults (auto-pricelist dari GR)...');
    await q(`INSERT INTO margin_defaults (company_id, margin_pct, updated_by) VALUES ($1, 20.00, 'seed') ON CONFLICT (company_id) DO UPDATE SET margin_pct = $2, updated_by = 'seed'`, [cssp, 20.00]);
    await q(`INSERT INTO margin_defaults (company_id, margin_pct, updated_by) VALUES ($1, 25.00, 'seed') ON CONFLICT (company_id) DO UPDATE SET margin_pct = $2, updated_by = 'seed'`, [ccen, 25.00]);
    console.log(' --- SSP: 20% | CEN: 25%');

    // ============================================================
    // 15c.ii. BASE PRICE TIERS (min_qty=1, eceran) - WAJIB agar POS/SO bisa jalan
    // ============================================================
    console.log(' Base Price Tiers (eceran, min_qty=1 per item)...');
    // SSP base tiers (sell_price dari sspItemsData kolom index 5)
    const sspBaseTiers = [
        [itm['ITM-001'], 1, 70000, 'Eceran'],
        [itm['ITM-002'], 1, 63000, 'Eceran'],
        [itm['ITM-003'], 1, 16000, 'Eceran'],
        [itm['ITM-004'], 1, 18500, 'Eceran'],
        [itm['ITM-005'], 1, 12000, 'Eceran'],
        [itm['ITM-006'], 1, 3500, 'Eceran'],
        [itm['ITM-007'], 1, 3500, 'Eceran'],
        [itm['ITM-008'], 1, 2000, 'Eceran'],
        [itm['ITM-009'], 1, 7500, 'Eceran'],
        [itm['ITM-010'], 1, 25000, 'Eceran'],
        [itm['ITM-011'], 1, 5000, 'Eceran'],
        [itm['ITM-012'], 1, 22000, 'Eceran'],
        [itm['ITM-013'], 1, 12000, 'Eceran'],
        [itm['ITM-014'], 1, 2500, 'Eceran'],
        [itm['ITM-015'], 1, 28000, 'Eceran'],
    ];
    for (const [itemId, minQty, price, label] of sspBaseTiers) {
        await q(`INSERT INTO item_price_tiers (item_id, min_qty, price, label) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`, [itemId, minQty, price, label]);
        await q(`UPDATE items SET sell_price = $1 WHERE id = $2`, [price, itemId]);
    }
    // CEN base tiers (sell_price dari cenItemsData kolom index 5)
    const cenBaseTiers = [
        [cenItm['CEN-001'], 1, 18000, 'Eceran'],
        [cenItm['CEN-002'], 1, 27000, 'Eceran'],
        [cenItm['CEN-003'], 1, 8500, 'Eceran'],
        [cenItm['CEN-004'], 1, 120000, 'Eceran'],
        [cenItm['CEN-005'], 1, 220000, 'Eceran'],
        [cenItm['CEN-006'], 1, 385000, 'Eceran'],
        [cenItm['CEN-007'], 1, 55000, 'Eceran'],
        [cenItm['CEN-008'], 1, 62000, 'Eceran'],
        [cenItm['CEN-009'], 1, 20000, 'Eceran'],
        [cenItm['CEN-010'], 1, 14000, 'Eceran'],
        [cenItm['CEN-011'], 1, 25000, 'Eceran'],
        [cenItm['CEN-012'], 1, 13000, 'Eceran'],
        [cenItm['CEN-013'], 1, 12000, 'Eceran'],
        [cenItm['CEN-014'], 1, 25000, 'Eceran'],
        [cenItm['CEN-015'], 1, 6000, 'Eceran'],
    ];
    for (const [itemId, minQty, price, label] of cenBaseTiers) {
        await q(`INSERT INTO item_price_tiers (item_id, min_qty, price, label) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`, [itemId, minQty, price, label]);
        await q(`UPDATE items SET sell_price = $1 WHERE id = $2`, [price, itemId]);
    }
    console.log(' --- 30 base tiers seeded, items.sell_price synced');

    // ============================================================
    // 15c. ITEM PRICE TIERS (MBS)
    // ============================================================
    console.log(' Tiered Pricing (SSP)...');
    const tierData = [
        [itm['ITM-001'], 5, 67000, 'Grosir 5 Sak'], [itm['ITM-001'], 20, 64000, 'Grosir 20 Sak'],
        [itm['ITM-003'], 10, 15000, 'Grosir 10kg'], [itm['ITM-003'], 50, 14500, 'Grosir Sak'],
        [itm['ITM-006'], 10, 3200, 'Grosir Kecil'], [itm['ITM-006'], 40, 2900, 'Grosir Dus'],
        [itm['ITM-007'], 10, 3200, 'Grosir Kecil'], [itm['ITM-007'], 40, 2900, 'Grosir Dus'],
        [itm['ITM-008'], 20, 1800, 'Grosir Kecil'], [itm['ITM-008'], 100, 1500, 'Grosir Box'],
        [itm['ITM-012'], 6, 20000, 'Grosir Deterjen'], [itm['ITM-012'], 24, 18500, 'Grosir Karton'],
    ];
    for (const [itemId, minQty, price, label] of tierData) {
        await q(`INSERT INTO item_price_tiers (item_id, min_qty, price, label) VALUES ($1,$2,$3,$4)`, [itemId, minQty, price, label]);
    }


    // ============================================================
    // 16. MBS: PURCHASE ORDERS -> GOODS RECEIVES -> BATCHES
    // ============================================================
    console.log(' SSP Purchase Orders & GR dengan Batch...');
    const grData = [
        {
            poNum: 'SSP-JKT-PO-2025-A-00000001', grNum: 'SSP-JKT-GR-2025-A-00000001', date: daysAgo(90), sup: sup['SUP-001'], wh: wh['WH-SSP-JKT-01'], br: sjkt,
            lines: [{ item: itm['ITM-006'], qty: 200, batch_no: 'IF-MG-240901', expiry: daysFromNow(90), price: 2500 },
            { item: itm['ITM-007'], qty: 150, batch_no: 'IF-MK-240901', expiry: daysFromNow(90), price: 2500 },
            { item: itm['ITM-008'], qty: 200, batch_no: 'IF-KP-240901', expiry: daysFromNow(180), price: 1200 }]
        },
        {
            poNum: 'SSP-JKT-PO-2025-A-00000002', grNum: 'SSP-JKT-GR-2025-A-00000002', date: daysAgo(75), sup: sup['SUP-003'], wh: wh['WH-SSP-JKT-01'], br: sjkt,
            lines: [{ item: itm['ITM-001'], qty: 40, batch_no: null, expiry: null, price: 58000 },
            { item: itm['ITM-002'], qty: 30, batch_no: null, expiry: null, price: 52000 },
            { item: itm['ITM-003'], qty: 100, batch_no: null, expiry: null, price: 12000 }]
        },
        {
            poNum: 'SSP-JKT-PO-2025-A-00000003', grNum: 'SSP-JKT-GR-2025-A-00000003', date: daysAgo(60), sup: sup['SUP-004'], wh: wh['WH-SSP-JKT-01'], br: sjkt,
            lines: [{ item: itm['ITM-004'], qty: 80, batch_no: 'MG-1L-241101', expiry: daysFromNow(180), price: 14000 },
            { item: itm['ITM-005'], qty: 60, batch_no: null, expiry: null, price: 9000 },
            { item: itm['ITM-009'], qty: 60, batch_no: 'TCB-241101', expiry: daysFromNow(7), price: 5000 }]
        },
        {
            poNum: 'SSP-JKT-PO-2025-A-00000004', grNum: 'SSP-JKT-GR-2025-A-00000004', date: daysAgo(45), sup: sup['SUP-002'], wh: wh['WH-SSP-JKT-02'], br: sjkt,
            lines: [{ item: itm['ITM-011'], qty: 60, batch_no: null, expiry: null, price: 3000 },
            { item: itm['ITM-012'], qty: 40, batch_no: 'DTJ-241201', expiry: daysAgo(5), price: 15000 },
            { item: itm['ITM-013'], qty: 40, batch_no: 'SCP-241201', expiry: daysFromNow(30), price: 8000 }]
        },
        {
            poNum: 'SSP-JKT-PO-2025-A-00000005', grNum: 'SSP-JKT-GR-2025-A-00000005', date: daysAgo(30), sup: sup['SUP-001'], wh: wh['WH-SSP-JKT-01'], br: sjkt,
            lines: [{ item: itm['ITM-006'], qty: 300, batch_no: 'IF-MG-250101', expiry: daysFromNow(365), price: 2500 },
            { item: itm['ITM-010'], qty: 40, batch_no: 'AQ-250101', expiry: daysFromNow(12), price: 18000 },
            { item: itm['ITM-014'], qty: 150, batch_no: 'SH-250101', expiry: daysFromNow(14), price: 1500 }]
        },
        {
            poNum: 'SSP-BDG-PO-2025-A-00000001', grNum: 'SSP-BDG-GR-2025-A-00000001', date: daysAgo(20), sup: sup['SUP-003'], wh: wh['WH-SSP-BDG-01'], br: sbdg,
            lines: [{ item: itm['ITM-001'], qty: 20, batch_no: null, expiry: null, price: 58000 },
            { item: itm['ITM-003'], qty: 50, batch_no: null, expiry: null, price: 12000 },
            { item: itm['ITM-004'], qty: 40, batch_no: 'MG-1L-250110', expiry: daysFromNow(60), price: 14000 }]
        },
        {
            poNum: 'SSP-BDG-PO-2025-A-00000002', grNum: 'SSP-BDG-GR-2025-A-00000002', date: daysAgo(15), sup: sup['SUP-001'], wh: wh['WH-SSP-BDG-01'], br: sbdg,
            lines: [{ item: itm['ITM-006'], qty: 100, batch_no: 'IF-MG-250115', expiry: daysFromNow(180), price: 2500 },
            { item: itm['ITM-008'], qty: 100, batch_no: 'IF-KP-250115', expiry: daysFromNow(21), price: 1200 },
            { item: itm['ITM-009'], qty: 50, batch_no: 'TCB-250115', expiry: daysFromNow(90), price: 5000 }]
        },
        {
            poNum: 'SSP-JKT-PO-2025-A-00000006', grNum: 'SSP-JKT-GR-2025-A-00000006', date: daysAgo(5), sup: sup['SUP-005'], wh: wh['WH-SSP-JKT-01'], br: sjkt,
            lines: [{ item: itm['ITM-006'], qty: 200, batch_no: 'SM-MG-250220', expiry: daysFromNow(365), price: 2400 },
            { item: itm['ITM-003'], qty: 100, batch_no: null, expiry: null, price: 11800 },
            { item: itm['ITM-001'], qty: 15, batch_no: null, expiry: null, price: 57000 }]
        },
    ];

    const poPaymentData = [
        { method: 'transfer', term: 30, extra_disc: 0 }, { method: 'kredit', term: 45, extra_disc: 2 },
        { method: 'transfer', term: 14, extra_disc: 0 }, { method: 'cash', term: 0, extra_disc: 3 },
        { method: 'transfer', term: 30, extra_disc: 0 }, { method: 'kredit', term: 60, extra_disc: 1.5 },
        { method: 'transfer', term: 30, extra_disc: 0 }, { method: 'cash', term: 0, extra_disc: 5 },
    ];

    const inventoryMap = {};
    function addInv(itemId, whId, qty) {
        if (!inventoryMap[itemId]) inventoryMap[itemId] = {};
        inventoryMap[itemId][whId] = (inventoryMap[itemId][whId] || 0) + qty;
    }

    for (let gi = 0; gi < grData.length; gi++) {
        const gr = grData[gi];
        const pay = poPaymentData[gi] || { method: 'transfer', term: 30, extra_disc: 0 };
        const supCode = Object.keys(sup).find(k => sup[k] === gr.sup);
        const taxRate = supIsPKP[supCode] ? PPN_RATE : 0;
        const subtotal = gr.lines.reduce((s, l) => s + (l.qty * l.price), 0);
        const afterDisc = subtotal * (1 - pay.extra_disc / 100);
        const taxAmt = Math.round(afterDisc * taxRate / 100);

        const poRes = await q(`INSERT INTO purchase_orders (number, date, supplier_id, branch_id, warehouse_id, status, created_by,
 payment_method, payment_term_days, extra_discount, tax_rate, tax_amount)
 VALUES ($1,$2,$3,$4,$5,'processed','mbs_pur',$6,$7,$8,$9,$10) RETURNING id`,
            [gr.poNum, gr.date, gr.sup, gr.br, gr.wh, pay.method, pay.term, pay.extra_disc, taxRate, taxAmt]);
        const poId = poRes.rows[0].id;
        for (const l of gr.lines) await q(`INSERT INTO purchase_order_lines (po_id, item_id, qty, uom, price) VALUES ($1,$2,$3,'PCS',$4)`, [poId, l.item, l.qty, l.price]);

        const grRes = await q(`INSERT INTO goods_receives (number, date, po_id, warehouse_id, branch_id, status, created_by)
 VALUES ($1,$2,$3,$4,$5,'completed','mbs_wh') RETURNING id`, [gr.grNum, gr.date, poId, gr.wh, gr.br]);
        const grId = grRes.rows[0].id;

        for (const l of gr.lines) {
            let batchId = null;
            if (l.batch_no || l.expiry) {
                let bStatus = 'active';
                if (l.expiry) {
                    const daysLeft = Math.ceil((new Date(l.expiry) - new Date()) / 86400000);
                    if (daysLeft < 0) bStatus = 'expired';
                    else if (daysLeft <= 30) bStatus = 'expiring';
                }
                const bRes = await q(`INSERT INTO batches (item_id, warehouse_id, batch_no, expiry_date, received_date, qty, status, gr_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
                    [l.item, gr.wh, l.batch_no, l.expiry, gr.date, l.qty, bStatus, grId]);
                batchId = bRes.rows[0].id;
            }
            await q(`INSERT INTO goods_receive_lines (gr_id, item_id, qty, uom, batch_id) VALUES ($1,$2,$3,'PCS',$4)`, [grId, l.item, l.qty, batchId]);
            addInv(l.item, gr.wh, l.qty);
            await q(`INSERT INTO stock_movements (item_id, date, type, qty, ref, warehouse_id, description) VALUES ($1,$2,'in',$3,$4,$5,$6)`,
                [l.item, gr.date, l.qty, gr.grNum, gr.wh, `Penerimaan barang - ${gr.grNum}`]);
        }
    }

    // Save MBS inventory
    for (const [itemId, whMap] of Object.entries(inventoryMap)) {
        for (const [whId, qty] of Object.entries(whMap)) {
            await q(`INSERT INTO inventory (item_id, warehouse_id, qty) VALUES ($1,$2,$3) ON CONFLICT (item_id, warehouse_id) DO UPDATE SET qty = inventory.qty + $3`, [itemId, whId, qty]);
        }
    }
    await q(`UPDATE batches SET status = 'depleted', qty = 0, notes = 'Habis fisik setelah opname' WHERE batch_no = 'DTJ-241201' AND item_id = $1`, [itm['ITM-012']]);
    console.log('--- SSP Purchase Orders, GR, Batches, Inventory done');

    // ============================================================
    // 16b. SAJ: PURCHASE ORDERS -> GOODS RECEIVES -> INVENTORY
    // ============================================================
    console.log(' CEN Purchase Orders & GR...');
    const cenGRData = [
        {
            poNum: 'CEN-JKT-PO-2025-A-00000001', grNum: 'CEN-JKT-GR-2025-A-00000001', date: daysAgo(60), sup: cenSup['SUP-CEN-001'], wh: wh['WH-CEN-JKT-01'], br: cjkt,
            lines: [{ item: cenItm['CEN-001'], qty: 150, price: 12000 }, { item: cenItm['CEN-002'], qty: 80, price: 18000 }, { item: cenItm['CEN-003'], qty: 100, price: 5000 }]
        },
        {
            poNum: 'CEN-JKT-PO-2025-A-00000002', grNum: 'CEN-JKT-GR-2025-A-00000002', date: daysAgo(45), sup: cenSup['SUP-CEN-002'], wh: wh['WH-CEN-JKT-01'], br: cjkt,
            lines: [{ item: cenItm['CEN-007'], qty: 50, price: 35000 }, { item: cenItm['CEN-008'], qty: 30, price: 40000 }, { item: cenItm['CEN-009'], qty: 80, price: 12000 }, { item: cenItm['CEN-010'], qty: 100, price: 8000 }]
        },
        {
            poNum: 'CEN-JKT-PO-2025-A-00000003', grNum: 'CEN-JKT-GR-2025-A-00000003', date: daysAgo(30), sup: cenSup['SUP-CEN-003'], wh: wh['WH-CEN-JKT-01'], br: cjkt,
            lines: [{ item: cenItm['CEN-004'], qty: 20, price: 85000 }, { item: cenItm['CEN-005'], qty: 10, price: 155000 }, { item: cenItm['CEN-015'], qty: 100, price: 3500 }]
        },
        {
            poNum: 'CEN-SBY-PO-2025-A-00000001', grNum: 'CEN-SBY-GR-2025-A-00000001', date: daysAgo(20), sup: cenSup['SUP-CEN-004'], wh: wh['WH-CEN-SBY-01'], br: csby,
            lines: [{ item: cenItm['CEN-012'], qty: 100, price: 8000 }, { item: cenItm['CEN-013'], qty: 100, price: 7000 }, { item: cenItm['CEN-014'], qty: 50, price: 15000 }]
        },
    ];
    const cenInvMap = {};
    const addCenInv = (itemId, whId, qty) => {
        if (!cenInvMap[itemId]) cenInvMap[itemId] = {};
        cenInvMap[itemId][whId] = (cenInvMap[itemId][whId] || 0) + qty;
    };
    for (const gr of cenGRData) {
        const poRes2 = await q(`INSERT INTO purchase_orders (number, date, supplier_id, branch_id, warehouse_id, status, created_by, tax_rate, tax_amount)
 VALUES ($1,$2,$3,$4,$5,'processed','cen_pur',$6,$7) RETURNING id`,
            [gr.poNum, gr.date, gr.sup, gr.br, gr.wh, PPN_RATE, Math.round(gr.lines.reduce((s, l) => s + l.qty * l.price, 0) * PPN_RATE / 100)]);
        const poId2 = poRes2.rows[0].id;
        for (const l of gr.lines) await q(`INSERT INTO purchase_order_lines (po_id, item_id, qty, uom, price) VALUES ($1,$2,$3,'PCS',$4)`, [poId2, l.item, l.qty, l.price]);
        const grRes2 = await q(`INSERT INTO goods_receives (number, date, po_id, warehouse_id, branch_id, status, created_by) VALUES ($1,$2,$3,$4,$5,'completed','cen_wh') RETURNING id`, [gr.grNum, gr.date, poId2, gr.wh, gr.br]);
        for (const l of gr.lines) {
            await q(`INSERT INTO goods_receive_lines (gr_id, item_id, qty, uom) VALUES ($1,$2,$3,'PCS')`, [grRes2.rows[0].id, l.item, l.qty]);
            addCenInv(l.item, gr.wh, l.qty);
            await q(`INSERT INTO stock_movements (item_id, date, type, qty, ref, warehouse_id, description) VALUES ($1,$2,'in',$3,$4,$5,$6)`, [l.item, gr.date, l.qty, gr.grNum, gr.wh, `Penerimaan barang - ${gr.grNum}`]);
        }
    }
    for (const [itemId, whMap] of Object.entries(cenInvMap)) {
        for (const [whId, qty] of Object.entries(whMap)) {
            await q(`INSERT INTO inventory (item_id, warehouse_id, qty) VALUES ($1,$2,$3) ON CONFLICT (item_id, warehouse_id) DO UPDATE SET qty = inventory.qty + $3`, [itemId, whId, qty]);
        }
    }
    console.log('--- CEN Purchase Orders, GR, Inventory done');



    // ============================================================
    // 17. MBS PURCHASE BILLS
    // ============================================================
    console.log(' SSP Tagihan Pembelian...');
    const poListRes = await q(`SELECT po.id, po.number, po.date, po.branch_id, COALESCE(SUM(pol.qty * pol.price), 0) as total
 FROM purchase_orders po LEFT JOIN purchase_order_lines pol ON pol.po_id = po.id
 WHERE po.number LIKE 'SSP%'
 GROUP BY po.id ORDER BY po.id`);
    const poList = poListRes.rows;

    if (poList.length >= 6) {
        const billsData = [
            { po: poList[0], num: 'SSP-JKT-BILL-2025-A-00000001', status: 'paid', daysDue: 30, daysAgo: 85 },
            { po: poList[1], num: 'SSP-JKT-BILL-2025-A-00000002', status: 'paid', daysDue: 30, daysAgo: 70 },
            { po: poList[2], num: 'SSP-JKT-BILL-2025-A-00000003', status: 'paid', daysDue: 30, daysAgo: 55 },
            { po: poList[3], num: 'SSP-JKT-BILL-2025-A-00000004', status: 'unpaid', daysDue: 45, daysAgo: 40 },
            { po: poList[4], num: 'SSP-JKT-BILL-2025-A-00000005', status: 'unpaid', daysDue: 14, daysAgo: 25 },
            { po: poList[5], num: 'SSP-BDG-BILL-2025-A-00000001', status: 'unpaid', daysDue: 60, daysAgo: 15 },
        ];
        for (const b of billsData) {
            const billDate = daysAgo(b.daysAgo);
            const dueDate = daysAgo(b.daysAgo - b.daysDue);
            await q(`INSERT INTO purchase_bills (number, po_id, date, due_date, branch_id, total, currency, status, created_by)
 VALUES ($1,$2,$3,$4,$5,$6,'IDR',$7,'ssp_fin')`, [b.num, b.po.id, billDate, dueDate, b.po.branch_id, b.po.total, b.status]);
            if (b.status === 'paid') await q(`UPDATE purchase_orders SET status='paid', updated_at=NOW() WHERE id = $1`, [b.po.id]);
            else await q(`UPDATE purchase_orders SET status='billed', updated_at=NOW() WHERE id = $1`, [b.po.id]);
        }
    }

    // SAJ Bills
    const sajPoListRes = await q(`SELECT po.id, po.number, po.date, po.branch_id, COALESCE(SUM(pol.qty * pol.price), 0) as total
 FROM purchase_orders po LEFT JOIN purchase_order_lines pol ON pol.po_id = po.id
 WHERE po.number LIKE 'SAJ-PO%' OR po.number LIKE 'SBY-PO%'
 GROUP BY po.id ORDER BY po.id`);
    const sajPoList = sajPoListRes.rows;
    if (sajPoList.length >= 4) {
        const sajBills = [
            { po: sajPoList[0], num: 'SAJ-BILL-2025-A-00000001', status: 'paid', daysDue: 30, daysAgo: 55 },
            { po: sajPoList[1], num: 'SAJ-BILL-2025-A-00000002', status: 'paid', daysDue: 30, daysAgo: 40 },
            { po: sajPoList[2], num: 'SAJ-BILL-2025-A-00000003', status: 'unpaid', daysDue: 45, daysAgo: 25 },
            { po: sajPoList[3], num: 'SBY-BILL-2025-A-00000001', status: 'unpaid', daysDue: 30, daysAgo: 15 },
        ];
        for (const b of sajBills) {
            const billDate = daysAgo(b.daysAgo);
            const dueDate = daysAgo(b.daysAgo - b.daysDue);
            await q(`INSERT INTO purchase_bills (number, po_id, date, due_date, branch_id, total, currency, status, created_by)
 VALUES ($1,$2,$3,$4,$5,$6,'IDR',$7,'saj_fin')`, [b.num, b.po.id, billDate, dueDate, b.po.branch_id, b.po.total, b.status]);
            if (b.status === 'paid') await q(`UPDATE purchase_orders SET status='paid', updated_at=NOW() WHERE id = $1`, [b.po.id]);
            else await q(`UPDATE purchase_orders SET status='billed', updated_at=NOW() WHERE id = $1`, [b.po.id]);
        }
    }
    console.log('--- Tagihan Pembelian done');

    // ============================================================
    // 18. MBS STOCK TRANSFERS
    // ============================================================
    console.log(' Stock Transfers...');
    const transfersData = [
        {
            num: 'SSP-JKT-TF-2025-A-00000001', date: daysAgo(35), from: wh['WH-SSP-JKT-01'], to: wh['WH-SSP-JKT-02'], branch: sjkt, notes: 'Distribusi stok ke gudang toko', status: 'received', by: 'ssp_wh',
            lines: [{ item: itm['ITM-001'], qty: 10, uom: 'SAK' }, { item: itm['ITM-006'], qty: 100, uom: 'PCS' }, { item: itm['ITM-008'], qty: 50, uom: 'PCS' }]
        },
        {
            num: 'SSP-JKT-TF-2025-A-00000002', date: daysAgo(20), from: wh['WH-SSP-JKT-01'], to: wh['WH-SSP-BDG-01'], branch: sjkt, notes: 'Supply cabang Bandung', status: 'shipping', by: 'ssp_wh',
            lines: [{ item: itm['ITM-006'], qty: 100, uom: 'PCS' }, { item: itm['ITM-007'], qty: 80, uom: 'PCS' }, { item: itm['ITM-003'], qty: 20, uom: 'KG' }, { item: itm['ITM-009'], qty: 30, uom: 'BOX' }]
        },
        {
            num: 'SSP-BDG-TF-2025-A-00000001', date: daysAgo(10), from: wh['WH-SSP-BDG-01'], to: wh['WH-SSP-JKT-01'], branch: sbdg, notes: 'Return kelebihan stok Bandung', status: 'pending', by: 'ssp_wh_mgr',
            lines: [{ item: itm['ITM-006'], qty: 20, uom: 'PCS' }, { item: itm['ITM-008'], qty: 40, uom: 'PCS' }]
        },
    ];
    // SAJ Transfers
    const cenTransfers = [
        {
            num: 'CEN-JKT-TF-2025-A-00000001', date: daysAgo(15), from: wh['WH-CEN-JKT-01'], to: wh['WH-CEN-JKT-02'], branch: cjkt, notes: 'Distribusi stok gudang cadangan', status: 'received', by: 'cen_wh',
            lines: [{ item: cenItm['CEN-001'], qty: 20, uom: 'PCS' }, { item: cenItm['CEN-007'], qty: 10, uom: 'PCS' }]
        },
        {
            num: 'CEN-JKT-TF-2025-A-00000002', date: daysAgo(5), from: wh['WH-CEN-JKT-01'], to: wh['WH-CEN-SBY-01'], branch: cjkt, notes: 'Supply cabang Surabaya', status: 'shipping', by: 'cen_wh',
            lines: [{ item: cenItm['CEN-012'], qty: 20, uom: 'PCS' }, { item: cenItm['CEN-009'], qty: 15, uom: 'PCS' }]
        },
    ];
    const allTransfers = [...transfersData, ...cenTransfers];
    for (const tf of allTransfers) {
        const tfRes = await q(`INSERT INTO stock_transfers (number, date, from_warehouse_id, to_warehouse_id, branch_id, notes, status, created_by)
 VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`, [tf.num, tf.date, tf.from, tf.to, tf.branch, tf.notes, tf.status, tf.by]);
        const tfId = tfRes.rows[0].id;
        for (const l of tf.lines) {
            await q(`INSERT INTO stock_transfer_lines (transfer_id, item_id, qty, uom) VALUES ($1,$2,$3,$4)`, [tfId, l.item, l.qty, l.uom]);
            if (tf.status === 'shipping' || tf.status === 'received') {
                await q(`UPDATE inventory SET qty = GREATEST(0, qty - $1) WHERE item_id = $2 AND warehouse_id = $3`, [l.qty, l.item, tf.from]);
                await q(`INSERT INTO stock_movements (item_id, date, type, qty, ref, warehouse_id, description) VALUES ($1,$2,'out',$3,$4,$5,'Transfer keluar')`, [l.item, tf.date, l.qty, tf.num, tf.from]);
            }
            if (tf.status === 'received') {
                await q(`INSERT INTO inventory (item_id, warehouse_id, qty) VALUES ($1,$2,$3) ON CONFLICT (item_id, warehouse_id) DO UPDATE SET qty = inventory.qty + $3`, [l.item, tf.to, l.qty]);
                await q(`INSERT INTO stock_movements (item_id, date, type, qty, ref, warehouse_id, description) VALUES ($1,$2,'in',$3,$4,$5,'Transfer masuk')`, [l.item, tf.date, l.qty, tf.num, tf.to]);
            }
        }
    }
    console.log('--- Stock Transfers done');


    // ============================================================
    // 19. MBS SALES ORDERS -> GOODS ISSUES -> INVOICES
    // ============================================================
    console.log(' SSP Sales Orders...');
    const TAX_RATE = 12;
    let eFakturCounter = 0;
    function nextFakturNo() { eFakturCounter++; const y2 = String(new Date().getFullYear()).slice(-2); return `010-${y2}.${String(eFakturCounter).padStart(8, '0')}`; }

    const soData = [
        {
            soNum: 'SSP-JKT-SO-2025-A-00000001', giNum: 'SSP-JKT-GI-2025-A-00000001', invNum: 'SSP-JKT-INV-2025-A-00000001',
            date: daysAgo(50), cust: cust['CST-001'], custCode: 'CST-001', status: 'paid',
            lines: [{ item: itm['ITM-001'], qty: 5, price: 70000 }, { item: itm['ITM-003'], qty: 20, price: 16000 }]
        },
        {
            soNum: 'SSP-JKT-SO-2025-A-00000002', giNum: 'SSP-JKT-GI-2025-A-00000002',
            date: daysAgo(40), cust: cust['CST-002'], custCode: 'CST-002', status: 'processed',
            lines: [{ item: itm['ITM-006'], qty: 80, price: 3500 }, { item: itm['ITM-007'], qty: 60, price: 3500 }]
        },
        {
            soNum: 'SSP-JKT-SO-2025-A-00000003',
            date: daysAgo(25), cust: cust['CST-003'], custCode: 'CST-003', status: 'approved',
            lines: [{ item: itm['ITM-012'], qty: 10, price: 22000 }, { item: itm['ITM-011'], qty: 20, price: 5000 }]
        },
        {
            soNum: 'SSP-JKT-SO-2025-A-00000004',
            date: daysAgo(10), cust: cust['CST-004'], custCode: 'CST-004', status: 'draft',
            lines: [{ item: itm['ITM-003'], qty: 50, price: 16000 }, { item: itm['ITM-004'], qty: 24, price: 18500 }]
        },
        {
            soNum: 'SSP-JKT-SO-2025-A-00000005', giNum: 'SSP-JKT-GI-2025-A-00000003', invNum: 'SSP-JKT-INV-2025-A-00000002',
            date: daysAgo(5), cust: cust['CST-001'], custCode: 'CST-001', status: 'paid',
            lines: [{ item: itm['ITM-008'], qty: 100, price: 2000 }, { item: itm['ITM-009'], qty: 30, price: 7500 }]
        },
    ];
    const nonTaxableItems = ['ITM-001', 'ITM-002', 'ITM-003', 'ITM-005'];
    for (const so of soData) {
        let subtotal = 0;
        for (const l of so.lines) { const ic = Object.keys(itm).find(k => itm[k] === l.item); if (!nonTaxableItems.includes(ic)) subtotal += l.qty * l.price; }
        const taxAmount = Math.round(subtotal * TAX_RATE / 100);
        const kodeTx = custKodeTx[so.custCode] || '01';
        const soRes = await q(`INSERT INTO sales_orders (number, date, customer_id, branch_id, status, created_by, approved_by, tax_rate, tax_amount)
 VALUES ($1,$2,$3,$4,$5,'ssp_sls',$6,$7,$8) RETURNING id`,
            [so.soNum, so.date, so.cust, sjkt, so.status, ['paid', 'processed', 'approved'].includes(so.status) ? 'ssp_sls_mgr' : null, TAX_RATE, taxAmount]);
        const soId = soRes.rows[0].id;
        for (const l of so.lines) await q(`INSERT INTO sales_order_lines (so_id, item_id, qty, uom, price) VALUES ($1,$2,$3,'PCS',$4)`, [soId, l.item, l.qty, l.price]);
        if (['processed', 'paid'].includes(so.status) && so.giNum) {
            const giRes = await q(`INSERT INTO goods_issues (number, date, so_id, warehouse_id, branch_id, status, created_by) VALUES ($1,$2,$3,$4,$5,'completed','ssp_wh') RETURNING id`, [so.giNum, so.date, soId, wh['WH-SSP-JKT-01'], sjkt]);
            for (const l of so.lines) {
                await q(`INSERT INTO goods_issue_lines (gi_id, item_id, qty, uom) VALUES ($1,$2,$3,'PCS')`, [giRes.rows[0].id, l.item, l.qty]);
                await q(`UPDATE inventory SET qty = GREATEST(0, qty - $1) WHERE item_id = $2 AND warehouse_id = $3`, [l.qty, l.item, wh['WH-SSP-JKT-01']]);
                await q(`INSERT INTO stock_movements (item_id, date, type, qty, ref, warehouse_id, description) VALUES ($1,$2,'out',$3,$4,$5,$6)`, [l.item, so.date, l.qty, so.giNum, wh['WH-SSP-JKT-01'], `Pengeluaran barang - ${so.giNum}`]);
            }
        }
        if (so.status === 'paid' && so.invNum) {
            const total = so.lines.reduce((s, l) => s + l.qty * l.price, 0);
            const npwpPembeli = custNPWP[so.custCode] || '000000000000000';
            const namaPembeli = { 'CST-001': 'Toko Bahagia Jaya', 'CST-003': 'UD Maju Bersama' }[so.custCode] || 'Pelanggan';
            const fakturNo = nextFakturNo();
            await q(`INSERT INTO invoices (number, so_id, branch_id, date, due_date, subtotal, tax_rate, tax_amount, total, faktur_pajak_number, kode_transaksi, npwp_pembeli, nama_pembeli, status, created_by)
 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'paid','ssp_fin')`,
                [so.invNum, soId, sjkt, so.date, daysFromNow(30), subtotal, TAX_RATE, taxAmount, total + taxAmount, fakturNo, kodeTx, npwpPembeli, namaPembeli]);
        }
    }
    console.log('--- SSP Sales Orders done');

    // ============================================================
    // 19b. SAJ SALES ORDERS -> GI -> INVOICES
    // ============================================================
    console.log(' CEN Sales Orders...');
    const cenSOData = [
        {
            soNum: 'CEN-JKT-SO-2025-A-00000001', giNum: 'CEN-JKT-GI-2025-A-00000001', invNum: 'CEN-JKT-INV-2025-A-00000001',
            date: daysAgo(35), cust: cenCust['CST-CEN-001'], status: 'paid', br: cjkt, whKey: 'WH-CEN-JKT-01',
            lines: [{ item: cenItm['CEN-001'], qty: 20, price: 18000 }, { item: cenItm['CEN-007'], qty: 5, price: 55000 }]
        },
        {
            soNum: 'CEN-JKT-SO-2025-A-00000002', giNum: 'CEN-JKT-GI-2025-A-00000002',
            date: daysAgo(20), cust: cenCust['CST-CEN-002'], status: 'processed', br: cjkt, whKey: 'WH-CEN-JKT-01',
            lines: [{ item: cenItm['CEN-004'], qty: 5, price: 120000 }, { item: cenItm['CEN-015'], qty: 30, price: 6000 }]
        },
        {
            soNum: 'CEN-SBY-SO-2025-A-00000001',
            date: daysAgo(10), cust: cenCust['CST-CEN-003'], status: 'approved', br: csby, whKey: 'WH-CEN-SBY-01',
            lines: [{ item: cenItm['CEN-012'], qty: 20, price: 13000 }, { item: cenItm['CEN-013'], qty: 20, price: 12000 }]
        },
        {
            soNum: 'CEN-SBY-SO-2025-A-00000002',
            date: daysAgo(3), cust: cenCust['CST-CEN-004'], status: 'draft', br: csby, whKey: 'WH-CEN-SBY-01',
            lines: [{ item: cenItm['CEN-010'], qty: 30, price: 14000 }, { item: cenItm['CEN-011'], qty: 20, price: 25000 }]
        },
        {
            soNum: 'CEN-JKT-SO-2025-A-00000003', giNum: 'CEN-JKT-GI-2025-A-00000003', invNum: 'CEN-JKT-INV-2025-A-00000002',
            date: daysAgo(7), cust: cenCust['CST-CEN-005'], status: 'paid', br: cjkt, whKey: 'WH-CEN-JKT-01',
            lines: [{ item: cenItm['CEN-005'], qty: 3, price: 220000 }, { item: cenItm['CEN-009'], qty: 10, price: 20000 }]
        },
    ];
    for (const so of cenSOData) {
        const subtotal = so.lines.reduce((s, l) => s + l.qty * l.price, 0);
        const taxAmt = Math.round(subtotal * TAX_RATE / 100);
        const soRes = await q(`INSERT INTO sales_orders (number, date, customer_id, branch_id, status, created_by, approved_by, tax_rate, tax_amount)
 VALUES ($1,$2,$3,$4,$5,'cen_sls',$6,$7,$8) RETURNING id`,
            [so.soNum, so.date, so.cust, so.br, so.status, ['paid', 'processed', 'approved'].includes(so.status) ? 'cen_sls_mgr' : null, TAX_RATE, taxAmt]);
        const soId = soRes.rows[0].id;
        for (const l of so.lines) await q(`INSERT INTO sales_order_lines (so_id, item_id, qty, uom, price) VALUES ($1,$2,$3,'PCS',$4)`, [soId, l.item, l.qty, l.price]);
        if (['processed', 'paid'].includes(so.status) && so.giNum) {
            const giRes = await q(`INSERT INTO goods_issues (number, date, so_id, warehouse_id, branch_id, status, created_by) VALUES ($1,$2,$3,$4,$5,'completed','cen_wh') RETURNING id`, [so.giNum, so.date, soId, wh[so.whKey], so.br]);
            for (const l of so.lines) {
                await q(`INSERT INTO goods_issue_lines (gi_id, item_id, qty, uom) VALUES ($1,$2,$3,'PCS')`, [giRes.rows[0].id, l.item, l.qty]);
                await q(`UPDATE inventory SET qty = GREATEST(0, qty - $1) WHERE item_id = $2 AND warehouse_id = $3`, [l.qty, l.item, wh[so.whKey]]);
                await q(`INSERT INTO stock_movements (item_id, date, type, qty, ref, warehouse_id, description) VALUES ($1,$2,'out',$3,$4,$5,$6)`, [l.item, so.date, l.qty, so.giNum, wh[so.whKey], `Pengeluaran barang - ${so.giNum}`]);
            }
        }
        if (so.status === 'paid' && so.invNum) {
            const total = so.lines.reduce((s, l) => s + l.qty * l.price, 0);
            await q(`INSERT INTO invoices (number, so_id, branch_id, date, due_date, subtotal, tax_rate, tax_amount, total, status, created_by)
 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'paid','cen_fin')`, [so.invNum, soId, so.br, so.date, daysFromNow(30), subtotal, TAX_RATE, taxAmt, total + taxAmt]);
        }
    }
    console.log('--- CEN Sales Orders done');


    // ============================================================
    // 20. SALES RETURNS (MBS)
    // ============================================================
    console.log(' Sales Returns...');
    const salesReturnData = [
        {
            num: 'SSP-JKT-RET-2025-A-00000001', date: daysAgo(30), cust: cust['CST-001'], status: 'completed', reason: 'Mie instan kemasan bocor', soNum: 'SSP-JKT-SO-2025-A-00000001',
            approved_by: 'ssp_sls_mgr', received_by: 'ssp_wh', received_at: daysAgo(28), resolution_type: 'refund_transfer', resolution_note: 'Transfer ke BCA 123456', resolved_by: 'ssp_fin', resolved_at: daysAgo(25),
            lines: [{ item: itm['ITM-006'], qty: 5, price: 3500 }]
        },
        {
            num: 'SSP-JKT-RET-2025-A-00000002', date: daysAgo(10), cust: cust['CST-002'], status: 'received', reason: 'Deterjen tumpah dalam kemasan', soNum: 'SSP-JKT-SO-2025-A-00000002',
            approved_by: 'ssp_sls_mgr', received_by: 'ssp_wh', received_at: daysAgo(7),
            lines: [{ item: itm['ITM-012'], qty: 2, price: 22000 }, { item: itm['ITM-011'], qty: 3, price: 5000 }]
        },
        {
            num: 'SSP-JKT-RET-2025-A-00000003', date: daysAgo(3), cust: cust['CST-003'], status: 'approved', reason: 'Jumlah tidak sesuai pesanan', soNum: 'SSP-JKT-SO-2025-A-00000003',
            approved_by: 'ssp_sls_mgr', lines: [{ item: itm['ITM-012'], qty: 1, price: 22000 }]
        },
        {
            num: 'SSP-JKT-RET-2025-A-00000004', date: daysAgo(1), cust: cust['CST-001'], status: 'draft', reason: 'Teh celup kadaluarsa', soNum: 'SSP-JKT-SO-2025-A-00000005',
            lines: [{ item: itm['ITM-009'], qty: 5, price: 7500 }]
        },
    ];
    for (const sr of salesReturnData) {
        const soRow = await q(`SELECT id FROM sales_orders WHERE number = $1`, [sr.soNum]);
        const soId = soRow.rows[0]?.id || null;
        const total = sr.lines.reduce((s, l) => s + l.qty * l.price, 0);
        const retRes = await q(`INSERT INTO sales_returns (number, date, so_id, customer_id, branch_id, reason, total, status, created_by, approved_by, received_by, received_at, resolution_type, resolution_note, resolved_by, resolved_at)
 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'ssp_sls',$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
            [sr.num, sr.date, soId, sr.cust, sjkt, sr.reason, total, sr.status, sr.approved_by || null, sr.received_by || null, sr.received_at || null, sr.resolution_type || null, sr.resolution_note || null, sr.resolved_by || null, sr.resolved_at || null]);
        for (const l of sr.lines) await q(`INSERT INTO sales_return_lines (return_id, item_id, qty, uom, price) VALUES ($1,$2,$3,'PCS',$4)`, [retRes.rows[0].id, l.item, l.qty, l.price]);
    }

    // ============================================================
    // 21. PURCHASE RETURNS (MBS)
    // ============================================================
    console.log(' Purchase Returns...');
    const purchaseReturnData = [
        {
            num: 'SSP-JKT-PRET-2025-A-00000001', date: daysAgo(30), sup: sup['SUP-001'], status: 'completed', reason: 'Kualitas tidak sesuai spesifikasi', poNum: 'SSP-JKT-PO-2025-A-00000001',
            approved_by: 'ssp_sls_mgr', shipped_by: 'ssp_wh', shipped_at: daysAgo(28), resolution_type: 'refund_transfer', resolution_note: 'Supplier transfer refund', resolved_by: 'ssp_fin', resolved_at: daysAgo(25),
            lines: [{ item: itm['ITM-007'], qty: 10, price: 3200 }]
        },
        {
            num: 'SSP-JKT-PRET-2025-A-00000002', date: daysAgo(10), sup: sup['SUP-002'], status: 'shipped', reason: 'Minyak goreng bocor saat diterima', poNum: 'SSP-JKT-PO-2025-A-00000002',
            approved_by: 'ssp_sls_mgr', shipped_by: 'ssp_wh', shipped_at: daysAgo(7),
            lines: [{ item: itm['ITM-004'], qty: 5, price: 17000 }]
        },
        {
            num: 'SSP-JKT-PRET-2025-A-00000003', date: daysAgo(3), sup: sup['SUP-003'], status: 'approved', reason: 'Gula pasir menggumpal', poNum: 'SSP-JKT-PO-2025-A-00000003',
            approved_by: 'ssp_sls_mgr', lines: [{ item: itm['ITM-003'], qty: 5, price: 14000 }]
        },
        {
            num: 'SSP-JKT-PRET-2025-A-00000004', date: daysAgo(1), sup: sup['SUP-004'], status: 'draft', reason: 'Kemasan penyok, tidak layak jual', poNum: 'SSP-JKT-PO-2025-A-00000004',
            lines: [{ item: itm['ITM-008'], qty: 8, price: 4500 }]
        },
    ];
    for (const pr of purchaseReturnData) {
        const poRow = await q(`SELECT id FROM purchase_orders WHERE number = $1`, [pr.poNum]);
        const poId = poRow.rows[0]?.id || null;
        const total = pr.lines.reduce((s, l) => s + l.qty * l.price, 0);
        const retRes = await q(`INSERT INTO purchase_returns (number, date, po_id, supplier_id, branch_id, reason, total, status, created_by, approved_by, shipped_by, shipped_at, resolution_type, resolution_note, resolved_by, resolved_at)
 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'ssp_pur',$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
            [pr.num, pr.date, poId, pr.sup, sjkt, pr.reason, total, pr.status, pr.approved_by || null, pr.shipped_by || null, pr.shipped_at || null, pr.resolution_type || null, pr.resolution_note || null, pr.resolved_by || null, pr.resolved_at || null]);
        for (const l of pr.lines) await q(`INSERT INTO purchase_return_lines (return_id, item_id, qty, uom, price) VALUES ($1,$2,$3,'PCS',$4)`, [retRes.rows[0].id, l.item, l.qty, l.price]);
    }
    console.log('--- Returns done');

    // ============================================================
    // 22. RETURN-LINKED GR/GI & JOURNALS (MBS)
    // ============================================================
    console.log(' Return-linked GR/GI & Journals...');
    const grRetRes = await q(`INSERT INTO goods_receives (number, date, warehouse_id, branch_id, status, notes, created_by) VALUES ('SSP-JKT-GR-RET-2025-A-00000001', $1, $2, $3, 'completed', 'Penerimaan retur penjualan: SSP-JKT-RET-2025-A-00000001', 'ssp_wh') RETURNING id`, [daysAgo(28), wh['WH-SSP-JKT-01'], sjkt]);
    await q(`INSERT INTO goods_receive_lines (gr_id, item_id, qty, uom) VALUES ($1,$2,5,'PCS')`, [grRetRes.rows[0].id, itm['ITM-006']]);

    const grRet2Res = await q(`INSERT INTO goods_receives (number, date, warehouse_id, branch_id, status, notes, created_by) VALUES ('SSP-JKT-GR-RET-2025-A-00000002', $1, $2, $3, 'completed', 'Penerimaan retur penjualan: SSP-JKT-RET-2025-A-00000002', 'ssp_wh') RETURNING id`, [daysAgo(7), wh['WH-SSP-JKT-01'], sjkt]);
    await q(`INSERT INTO goods_receive_lines (gr_id, item_id, qty, uom) VALUES ($1,$2,2,'PCS')`, [grRet2Res.rows[0].id, itm['ITM-012']]);
    await q(`INSERT INTO goods_receive_lines (gr_id, item_id, qty, uom) VALUES ($1,$2,3,'PCS')`, [grRet2Res.rows[0].id, itm['ITM-011']]);

    const giRetRes = await q(`INSERT INTO goods_issues (number, date, warehouse_id, branch_id, status, notes, created_by) VALUES ('SSP-JKT-GI-PRET-2025-A-00000001', $1, $2, $3, 'completed', 'Pengeluaran retur pembelian: SSP-JKT-PRET-2025-A-00000001', 'ssp_wh') RETURNING id`, [daysAgo(28), wh['WH-SSP-JKT-01'], sjkt]);
    await q(`INSERT INTO goods_issue_lines (gi_id, item_id, qty, uom) VALUES ($1,$2,10,'PCS')`, [giRetRes.rows[0].id, itm['ITM-007']]);

    const giRet2Res = await q(`INSERT INTO goods_issues (number, date, warehouse_id, branch_id, status, notes, created_by) VALUES ('SSP-JKT-GI-PRET-2025-A-00000002', $1, $2, $3, 'completed', 'Pengeluaran retur pembelian: SSP-JKT-PRET-2025-A-00000002', 'ssp_wh') RETURNING id`, [daysAgo(7), wh['WH-SSP-JKT-01'], sjkt]);
    await q(`INSERT INTO goods_issue_lines (gi_id, item_id, qty, uom) VALUES ($1,$2,5,'PCS')`, [giRet2Res.rows[0].id, itm['ITM-009']]);

    // Journals
    const coaRes = await q(`SELECT id, code FROM chart_of_accounts WHERE code IN ('4-0001','1-0003','1-0001','2-0001') AND company_id = $1`, [cssp]);
    const coa = Object.fromEntries(coaRes.rows.map(r => [r.code, r.id]));
    const je1Res = await q(`INSERT INTO journal_entries (number, date, description, branch_id, created_by, status) VALUES ('SSP-JKT-JU-2025-A-00000001',$1,'Refund Transfer - Retur Penjualan SSP-JKT-RET-2025-A-00000001',$2,'ssp_fin','posted') RETURNING id`, [daysAgo(25), sjkt]);
    await q(`INSERT INTO journal_lines (journal_id, account_id, debit, credit, description) VALUES ($1,$2,17500,0,'Retur penjualan SSP-JKT-RET-2025-A-00000001')`, [je1Res.rows[0].id, coa['4-0001']]);
    await q(`INSERT INTO journal_lines (journal_id, account_id, debit, credit, description) VALUES ($1,$2,0,17500,'Refund Transfer ke customer')`, [je1Res.rows[0].id, coa['1-0003']]);

    const je2Res = await q(`INSERT INTO journal_entries (number, date, description, branch_id, created_by, status) VALUES ('SSP-JKT-JU-2025-A-00000002',$1,'Refund Transfer - Retur Pembelian SSP-JKT-PRET-2025-A-00000001',$2,'ssp_fin','posted') RETURNING id`, [daysAgo(25), sjkt]);
    await q(`INSERT INTO journal_lines (journal_id, account_id, debit, credit, description) VALUES ($1,$2,25000,0,'Refund dari supplier - SSP-JKT-PRET-2025-A-00000001')`, [je2Res.rows[0].id, coa['1-0003']]);
    await q(`INSERT INTO journal_lines (journal_id, account_id, debit, credit, description) VALUES ($1,$2,0,25000,'Pengurangan utang dagang - SSP-JKT-PRET-2025-A-00000001')`, [je2Res.rows[0].id, coa['2-0001']]);

    // Auto-journal dari pembayaran Invoice (demonstrasi fitur Terima Pembayaran)
    const coaArRes = await q(`SELECT id, code FROM chart_of_accounts WHERE code IN ('1-1001','1-0003','1-0001') AND company_id = $1`, [cssp]);
    const coaAr = Object.fromEntries(coaArRes.rows.map(r => [r.code, r.id]));

    // JU-3: Pembayaran Invoice SSP-JKT-INV-2025-A-00000001 (Bank BCA)
    const je3Res = await q(`INSERT INTO journal_entries (number, date, description, branch_id, created_by, status) VALUES ('SSP-JKT-JU-2025-A-00000003',$1,'Penerimaan Pembayaran Invoice SSP-JKT-INV-2025-A-00000001',$2,'ssp_fin','posted') RETURNING id`, [daysAgo(49), sjkt]);
    await q(`INSERT INTO journal_lines (journal_id, account_id, debit, credit, description) VALUES ($1,$2,530000,0,'Penerimaan Pembayaran Invoice SSP-JKT-INV-2025-A-00000001')`, [je3Res.rows[0].id, coaAr['1-0003']]);  // Debit Bank BCA
    await q(`INSERT INTO journal_lines (journal_id, account_id, debit, credit, description) VALUES ($1,$2,0,530000,'Pelunasan Piutang Invoice SSP-JKT-INV-2025-A-00000001')`, [je3Res.rows[0].id, coaAr['1-1001']]);  // Kredit Piutang Dagang

    // JU-4: Pembayaran Invoice SSP-JKT-INV-2025-A-00000002 (Kas Tunai)
    const je4Res = await q(`INSERT INTO journal_entries (number, date, description, branch_id, created_by, status) VALUES ('SSP-JKT-JU-2025-A-00000004',$1,'Penerimaan Pembayaran Invoice SSP-JKT-INV-2025-A-00000002',$2,'ssp_fin','posted') RETURNING id`, [daysAgo(4), sjkt]);
    await q(`INSERT INTO journal_lines (journal_id, account_id, debit, credit, description) VALUES ($1,$2,225000,0,'Penerimaan Pembayaran Invoice SSP-JKT-INV-2025-A-00000002')`, [je4Res.rows[0].id, coaAr['1-0001']]);  // Debit Kas Tunai
    await q(`INSERT INTO journal_lines (journal_id, account_id, debit, credit, description) VALUES ($1,$2,0,225000,'Pelunasan Piutang Invoice SSP-JKT-INV-2025-A-00000002')`, [je4Res.rows[0].id, coaAr['1-1001']]);  // Kredit Piutang Dagang

    // CEN: JU demo payment
    const coaCenArRes = await q(`SELECT id, code FROM chart_of_accounts WHERE code IN ('1-1001','1-0003') AND company_id = $1`, [ccen]);
    const coaCenAr = Object.fromEntries(coaCenArRes.rows.map(r => [r.code, r.id]));
    const je5Res = await q(`INSERT INTO journal_entries (number, date, description, branch_id, created_by, status) VALUES ('CEN-JKT-JU-2025-A-00000001',$1,'Penerimaan Pembayaran Invoice CEN-JKT-INV-2025-A-00000001',$2,'cen_fin','posted') RETURNING id`, [daysAgo(34), cjkt]);
    await q(`INSERT INTO journal_lines (journal_id, account_id, debit, credit, description) VALUES ($1,$2,635600,0,'Penerimaan Pembayaran Invoice CEN-JKT-INV-2025-A-00000001')`, [je5Res.rows[0].id, coaCenAr['1-0003']]);  // Debit Bank BCA
    await q(`INSERT INTO journal_lines (journal_id, account_id, debit, credit, description) VALUES ($1,$2,0,635600,'Pelunasan Piutang Invoice CEN-JKT-INV-2025-A-00000001')`, [je5Res.rows[0].id, coaCenAr['1-1001']]);  // Kredit Piutang Dagang

    console.log('--- Return-linked GR/GI & Journals done');


    // ============================================================
    // 23. POS TRANSACTIONS (MBS + SAJ)
    // ============================================================
    console.log(' POS Transactions...');
    const posTransactions = [
        {
            num: 'SSP-JKT-POS-2025-A-00000001', date: daysAgo(25), pm: 'cash', br: sjkt, whKey: 'WH-SSP-JKT-01', cashier: users['ssp_kasir'],
            items: [{ id: itm['ITM-006'], name: 'Mie Instan Goreng', qty: 5, price: 3500 }, { id: itm['ITM-008'], name: 'Kopi Sachet 3in1', qty: 3, price: 2000 }]
        },
        {
            num: 'SSP-JKT-POS-2025-A-00000002', date: daysAgo(20), pm: 'qris', br: sjkt, whKey: 'WH-SSP-JKT-01', cashier: users['ssp_kasir'],
            items: [{ id: itm['ITM-001'], name: 'Beras Premium 5kg', qty: 1, price: 70000 }, { id: itm['ITM-003'], name: 'Gula Pasir 1kg', qty: 2, price: 16000 }]
        },
        {
            num: 'SSP-JKT-POS-2025-A-00000003', date: daysAgo(15), pm: 'cash', br: sjkt, whKey: 'WH-SSP-JKT-01', cashier: users['ssp_kasir'],
            items: [{ id: itm['ITM-004'], name: 'Minyak Goreng 1L', qty: 2, price: 18500 }, { id: itm['ITM-009'], name: 'Teh Celup Box 25pcs', qty: 1, price: 7500 }]
        },
        {
            num: 'SSP-JKT-POS-2025-A-00000004', date: daysAgo(7), pm: 'transfer', br: sjkt, whKey: 'WH-SSP-JKT-01', cashier: users['ssp_kasir'],
            items: [{ id: itm['ITM-012'], name: 'Deterjen Bubuk 1kg', qty: 2, price: 22000 }, { id: itm['ITM-011'], name: 'Sabun Mandi Batang', qty: 3, price: 5000 }]
        },
        {
            num: 'SSP-JKT-POS-2025-A-00000005', date: daysAgo(2), pm: 'cash', br: sjkt, whKey: 'WH-SSP-JKT-01', cashier: users['ssp_kasir'],
            items: [{ id: itm['ITM-003'], name: 'Gula Pasir 1kg', qty: 5, price: 16000 }, { id: itm['ITM-006'], name: 'Mie Instan Goreng', qty: 10, price: 3500 }]
        },
        // CEN POS
        {
            num: 'CEN-JKT-POS-2025-A-00000001', date: daysAgo(12), pm: 'cash', br: cjkt, whKey: 'WH-CEN-JKT-01', cashier: users['cen_kasir'],
            items: [{ id: cenItm['CEN-001'], name: 'Lampu LED 9W', qty: 3, price: 18000 }, { id: cenItm['CEN-012'], name: 'Baterai AA 2pcs', qty: 4, price: 13000 }]
        },
        {
            num: 'CEN-JKT-POS-2025-A-00000002', date: daysAgo(5), pm: 'qris', br: cjkt, whKey: 'WH-CEN-JKT-01', cashier: users['cen_kasir'],
            items: [{ id: cenItm['CEN-007'], name: 'MCB 10A Single Pole', qty: 2, price: 55000 }, { id: cenItm['CEN-015'], name: 'Isolasi Listrik Hitam', qty: 5, price: 6000 }]
        },
        {
            num: 'CEN-JKT-POS-2025-A-00000003', date: daysAgo(1), pm: 'transfer', br: cjkt, whKey: 'WH-CEN-JKT-01', cashier: users['cen_kasir'],
            items: [{ id: cenItm['CEN-009'], name: 'Steker Colokan 3 Lubang', qty: 3, price: 20000 }, { id: cenItm['CEN-010'], name: 'Saklar Tunggal', qty: 5, price: 14000 }]
        },
    ];
    for (const tx of posTransactions) {
        const txItems = tx.items.map(it => ({ item_id: it.id, item_name: it.name, qty: it.qty, price: it.price, subtotal: it.price * it.qty }));
        const subtotal = txItems.reduce((s, it) => s + it.subtotal, 0);
        const cashPaid = tx.pm === 'cash' ? Math.ceil(subtotal / 5000) * 5000 : subtotal;
        await q(`INSERT INTO pos_transactions (number, date, branch_id, items_json, subtotal, total, payment_method, cash_paid, change, cashier_id)
 VALUES ($1,$2,$3,$4,$5,$5,$6,$7,$8,$9)`, [tx.num, tx.date, tx.br, JSON.stringify(txItems), subtotal, tx.pm, cashPaid, cashPaid - subtotal, tx.cashier]);
        for (const it of txItems) {
            await q(`UPDATE inventory SET qty = GREATEST(0, qty - $1) WHERE item_id = $2 AND warehouse_id = $3`, [it.qty, it.item_id, wh[tx.whKey]]);
            await q(`INSERT INTO stock_movements (item_id, date, type, qty, ref, warehouse_id, description) VALUES ($1,$2,'out',$3,$4,$5,$6)`, [it.item_id, tx.date, it.qty, tx.num, wh[tx.whKey], `POS - ${tx.num}`]);
        }
    }
    console.log('--- POS Transactions done');

    // ============================================================
    // 24. STOCK OPNAMES (MBS + SAJ)
    // ============================================================
    console.log(' Stock Opnames...');
    const opnameData = [
        {
            num: 'SSP-JKT-OPN-2025-A-00000001', date: daysAgo(45), wh: wh['WH-SSP-JKT-01'], branch: sjkt, status: 'approved', approved_by: 'ssp_sls_mgr', submitted_by: 'ssp_wh', notes: 'Opname bulanan gudang utama Jakarta',
            lines: [{ item: itm['ITM-001'], system_qty: 85, actual_qty: 82 }, { item: itm['ITM-003'], system_qty: 200, actual_qty: 200 }, { item: itm['ITM-006'], system_qty: 500, actual_qty: 495 }, { item: itm['ITM-012'], system_qty: 60, actual_qty: 58 }]
        },
        {
            num: 'SSP-BDG-OPN-2025-A-00000001', date: daysAgo(20), wh: wh['WH-SSP-BDG-01'], branch: sbdg, status: 'pending', submitted_by: 'ssp_wh_mgr', notes: 'Opname awal gudang Bandung -- menunggu approval',
            lines: [{ item: itm['ITM-001'], system_qty: 30, actual_qty: 30 }, { item: itm['ITM-003'], system_qty: 70, actual_qty: 68 }, { item: itm['ITM-006'], system_qty: 80, actual_qty: 79 }]
        },
        {
            num: 'SSP-JKT-OPN-2025-A-00000002', date: daysAgo(3), wh: wh['WH-SSP-JKT-02'], branch: sjkt, status: 'draft', notes: 'Opname baru -- belum diajukan',
            lines: [{ item: itm['ITM-006'], system_qty: 50, actual_qty: 48 }, { item: itm['ITM-008'], system_qty: 40, actual_qty: 40 }]
        },
        // CEN Opname
        {
            num: 'CEN-JKT-OPN-2025-A-00000001', date: daysAgo(15), wh: wh['WH-CEN-JKT-01'], branch: cjkt, status: 'approved', approved_by: 'cen_sls_mgr', submitted_by: 'cen_wh', notes: 'Opname bulanan CEN Jakarta',
            lines: [{ item: cenItm['CEN-001'], system_qty: 130, actual_qty: 128 }, { item: cenItm['CEN-007'], system_qty: 45, actual_qty: 45 }, { item: cenItm['CEN-015'], system_qty: 100, actual_qty: 97 }]
        },
    ];
    for (const op of opnameData) {
        const opRes = await q(`INSERT INTO stock_opnames (number, date, warehouse_id, branch_id, status, approved_by, submitted_by, rejected_by, notes, created_by)
 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
            [op.num, op.date, op.wh, op.branch, op.status, op.approved_by || null, op.submitted_by || null, null, op.notes, op.submitted_by || 'system']);
        for (const l of op.lines) await q(`INSERT INTO stock_opname_lines (opname_id, item_id, system_qty, actual_qty, uom) VALUES ($1,$2,$3,$4,'PCS')`, [opRes.rows[0].id, l.item, l.system_qty, l.actual_qty]);
    }
    console.log('--- Stock Opnames done');

    // ============================================================
    // 25. CONSIGNMENTS (MBS)
    // ============================================================
    console.log(' Konsinyasi / Titip Jual...');
    const consignData = [
        { sup: sup['SUP-001'], item: itm['ITM-006'], qty: 200, sold: 45, comm: 15, wh: wh['WH-SSP-JKT-01'], status: 'active', date: daysAgo(60), notes: 'Titip jual Mie Gordeng batch promo' },
        { sup: sup['SUP-001'], item: itm['ITM-007'], qty: 100, sold: 100, comm: 15, wh: wh['WH-SSP-JKT-01'], status: 'completed', date: daysAgo(90), notes: 'Mie Kuah promo -- sudah habis terjual' },
        { sup: sup['SUP-002'], item: itm['ITM-011'], qty: 200, sold: 87, comm: 18, wh: wh['WH-SSP-JKT-02'], status: 'active', date: daysAgo(45), notes: 'Sabun mandi titip jual semester 1' },
        { sup: sup['SUP-004'], item: itm['ITM-009'], qty: 60, sold: 0, comm: 12, wh: wh['WH-SSP-BDG-01'], status: 'active', date: daysAgo(10), notes: 'Teh celup baru masuk, belum ada penjualan' },
        { sup: sup['SUP-004'], item: itm['ITM-005'], qty: 50, sold: 12, comm: 10, wh: wh['WH-SSP-BDG-01'], status: 'active', date: daysAgo(30), notes: 'Tepung terigu titip jual Bandung' },
        { sup: sup['SUP-003'], item: itm['ITM-001'], qty: 30, sold: 0, comm: 8, wh: wh['WH-SSP-JKT-01'], status: 'active', date: daysAgo(5), notes: 'Beras premium batch baru -- baru masuk minggu ini' },
    ];
    for (const c of consignData) {
        await q(`INSERT INTO consignments (supplier_id, item_id, qty, sold_qty, commission_pct, warehouse_id, status, start_date, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [c.sup, c.item, c.qty, c.sold, c.comm, c.wh, c.status, c.date, c.notes]);
    }
    console.log('--- Konsinyasi done');

    // ============================================================
    // 26. AUDIT TRAIL (MBS + SAJ)
    // ============================================================
    console.log(' Audit Trail...');
    const auditEntries = [
        // SSP Setup
        ['create', 'settings', 'Tambah cabang: SSP Jakarta Pusat', users['ssp_admin'], 'ssp_admin', sjkt],
        ['create', 'settings', 'Tambah cabang: SSP Bandung', users['ssp_admin'], 'ssp_admin', sbdg],
        ['create', 'settings', 'Tambah user: kasir SSP (role: Kasir)', users['ssp_admin'], 'ssp_admin', sjkt],
        ['create', 'accounting', 'Set tarif pajak aktif: PPN 12%', users['ssp_fin'], 'ssp_fin', sjkt],
        // SSP Purchasing
        ['create', 'purchasing', 'Buat PO: SSP-JKT-PO-2025-A-00000001 (PT Indofood)', users['ssp_pur'], 'ssp_pur', sjkt],
        ['approve', 'purchasing', 'Approve PO: SSP-JKT-PO-2025-A-00000001', users['ssp_pur_mgr'], 'ssp_pur_mgr', sjkt],
        ['create', 'purchasing', 'Buat PO: SSP-JKT-PO-2025-A-00000002 (PT Garudafood)', users['ssp_pur'], 'ssp_pur', sjkt],
        ['create', 'purchasing', 'Buat PO: SSP-JKT-PO-2025-A-00000005 (PT Mayora)', users['ssp_pur'], 'ssp_pur', sjkt],
        ['approve', 'purchasing', 'Approve PO: SSP-JKT-PO-2025-A-00000005', users['ssp_pur_mgr'], 'ssp_pur_mgr', sjkt],
        // SSP GR
        ['create', 'inventory', 'Penerimaan Barang: SSP-JKT-GR-2025-A-00000001', users['ssp_wh'], 'ssp_wh', sjkt],
        ['create', 'inventory', 'Penerimaan Barang: SSP-JKT-GR-2025-A-00000002', users['ssp_wh'], 'ssp_wh', sjkt],
        ['create', 'inventory', 'Penerimaan Barang: SSP-JKT-GR-2025-A-00000005', users['ssp_wh'], 'ssp_wh', sjkt],
        // SSP Bills
        ['create', 'accounting', 'Buat Tagihan: SSP-JKT-BILL-2025-A-00000001', users['ssp_fin'], 'ssp_fin', sjkt],
        ['pay', 'accounting', 'Bayar Tagihan: SSP-JKT-BILL-2025-A-00000001 -- LUNAS', users['ssp_fin'], 'ssp_fin', sjkt],
        ['create', 'accounting', 'Buat Tagihan: SSP-JKT-BILL-2025-A-00000004 -- belum lunas', users['ssp_fin'], 'ssp_fin', sjkt],
        // SSP Sales
        ['create', 'sales', 'Buat SO: SSP-JKT-SO-2025-A-00000001 (Toko Bahagia Jaya)', users['ssp_sls'], 'ssp_sls', sjkt],
        ['approve', 'sales', 'Approve SO: SSP-JKT-SO-2025-A-00000001', users['ssp_sls_mgr'], 'ssp_sls_mgr', sjkt],
        ['create', 'sales', 'Buat SO: SSP-JKT-SO-2025-A-00000005 (Toko Bahagia Jaya)', users['ssp_sls'], 'ssp_sls', sjkt],
        // SSP GI
        ['create', 'inventory', 'Pengeluaran Barang: SSP-JKT-GI-2025-A-00000001', users['ssp_wh'], 'ssp_wh', sjkt],
        ['create', 'inventory', 'Pengeluaran Barang: SSP-JKT-GI-2025-A-00000003', users['ssp_wh'], 'ssp_wh', sjkt],
        // SSP Invoice
        ['create', 'accounting', 'Buat Invoice: SSP-JKT-INV-2025-A-00000001', users['ssp_fin'], 'ssp_fin', sjkt],
        ['pay', 'accounting', 'Bayar Invoice: SSP-JKT-INV-2025-A-00000001 -- LUNAS', users['ssp_fin'], 'ssp_fin', sjkt],
        // SSP POS
        ['create', 'pos', 'POS: SSP-JKT-POS-2025-A-00000001 (Tunai)', users['ssp_kasir'], 'ssp_kasir', sjkt],
        ['create', 'pos', 'POS: SSP-JKT-POS-2025-A-00000002 (QRIS)', users['ssp_kasir'], 'ssp_kasir', sjkt],
        ['create', 'pos', 'POS: SSP-JKT-POS-2025-A-00000003 (Tunai)', users['ssp_kasir'], 'ssp_kasir', sjkt],
        // SSP Returns
        ['create', 'sales', 'Retur Penjualan: SSP-JKT-RET-2025-A-00000001 (mie kemasan bocor)', users['ssp_sls'], 'ssp_sls', sjkt],
        ['approve', 'sales', 'Approve Retur: SSP-JKT-RET-2025-A-00000001', users['ssp_sls_mgr'], 'ssp_sls_mgr', sjkt],
        ['create', 'purchasing', 'Retur Pembelian: SSP-JKT-PRET-2025-A-00000001', users['ssp_pur'], 'ssp_pur', sjkt],
        ['approve', 'purchasing', 'Approve Retur: SSP-JKT-PRET-2025-A-00000001', users['ssp_pur_mgr'], 'ssp_pur_mgr', sjkt],
        // SSP Transfer & Opname
        ['create', 'inventory', 'Transfer: SSP-JKT-TF-2025-A-00000001 (JKT-01 -> JKT-02)', users['ssp_wh'], 'ssp_wh', sjkt],
        ['create', 'inventory', 'Opname: SSP-JKT-OPN-2025-A-00000001', users['ssp_wh'], 'ssp_wh', sjkt],
        ['approve', 'inventory', 'Approve Opname: SSP-JKT-OPN-2025-A-00000001', users['ssp_sls_mgr'], 'ssp_sls_mgr', sjkt],
        // SSP Konsinyasi & Jurnal
        ['create', 'sales', 'Konsinyasi: Mie Goreng x200 (PT Indofood, 15%)', users['ssp_sls'], 'ssp_sls', sjkt],
        ['create', 'accounting', 'Jurnal: SSP-JKT-JU-2025-A-00000001 (Refund retur penjualan)', users['ssp_fin'], 'ssp_fin', sjkt],
        // CEN Setup
        ['create', 'settings', 'Tambah cabang: CEN Jakarta Selatan', users['cen_admin'], 'cen_admin', cjkt],
        ['create', 'settings', 'Tambah cabang: CEN Surabaya', users['cen_admin'], 'cen_admin', csby],
        ['create', 'settings', 'Tambah user: kasir CEN (role: Kasir)', users['cen_admin'], 'cen_admin', cjkt],
        ['create', 'accounting', 'Set tarif pajak aktif: PPN 12%', users['cen_fin'], 'cen_fin', cjkt],
        // CEN Purchasing
        ['create', 'purchasing', 'Buat PO: CEN-JKT-PO-2025-A-00000001 (PT Philips)', users['cen_pur'], 'cen_pur', cjkt],
        ['approve', 'purchasing', 'Approve PO: CEN-JKT-PO-2025-A-00000001', users['cen_pur_mgr'], 'cen_pur_mgr', cjkt],
        ['create', 'purchasing', 'Buat PO: CEN-JKT-PO-2025-A-00000002 (PT Schneider)', users['cen_pur'], 'cen_pur', cjkt],
        ['approve', 'purchasing', 'Approve PO: CEN-JKT-PO-2025-A-00000002', users['cen_pur_mgr'], 'cen_pur_mgr', cjkt],
        // CEN GR
        ['create', 'inventory', 'Penerimaan Barang: CEN-JKT-GR-2025-A-00000001', users['cen_wh'], 'cen_wh', cjkt],
        ['create', 'inventory', 'Penerimaan Barang: CEN-JKT-GR-2025-A-00000002', users['cen_wh'], 'cen_wh', cjkt],
        // CEN Sales
        ['create', 'sales', 'Buat SO: CEN-JKT-SO-2025-A-00000001 (Toko Elektrik Maju)', users['cen_sls'], 'cen_sls', cjkt],
        ['approve', 'sales', 'Approve SO: CEN-JKT-SO-2025-A-00000001', users['cen_sls_mgr'], 'cen_sls_mgr', cjkt],
        ['create', 'sales', 'Buat SO: CEN-JKT-SO-2025-A-00000003 (Toko Bangunan Mandiri)', users['cen_sls'], 'cen_sls', cjkt],
        // CEN GI & Invoice
        ['create', 'inventory', 'Pengeluaran Barang: CEN-JKT-GI-2025-A-00000001', users['cen_wh'], 'cen_wh', cjkt],
        ['create', 'accounting', 'Buat Invoice: CEN-JKT-INV-2025-A-00000001', users['cen_fin'], 'cen_fin', cjkt],
        ['pay', 'accounting', 'Bayar Invoice: CEN-JKT-INV-2025-A-00000001 -- LUNAS', users['cen_fin'], 'cen_fin', cjkt],
        // CEN POS
        ['create', 'pos', 'POS: CEN-JKT-POS-2025-A-00000001 (Tunai)', users['cen_kasir'], 'cen_kasir', cjkt],
        ['create', 'pos', 'POS: CEN-JKT-POS-2025-A-00000002 (QRIS)', users['cen_kasir'], 'cen_kasir', cjkt],
        // CEN Transfer & Opname
        ['create', 'inventory', 'Transfer: CEN-JKT-TF-2025-A-00000001 (JKT-01 -> JKT-02)', users['cen_wh'], 'cen_wh', cjkt],
        ['create', 'inventory', 'Opname: CEN-JKT-OPN-2025-A-00000001', users['cen_wh'], 'cen_wh', cjkt],
        ['approve', 'inventory', 'Approve Opname: CEN-JKT-OPN-2025-A-00000001', users['cen_sls_mgr'], 'cen_sls_mgr', cjkt],
        // CEN Bills
        ['create', 'accounting', 'Buat Tagihan: CEN-JKT-BILL-2025-A-00000001', users['cen_fin'], 'cen_fin', cjkt],
        ['pay', 'accounting', 'Bayar Tagihan: CEN-JKT-BILL-2025-A-00000001 -- LUNAS', users['cen_fin'], 'cen_fin', cjkt],
    ];
    for (const [action, module, desc, userId, userName, branchId] of auditEntries) {
        await q(`INSERT INTO audit_trail (action, module, description, user_id, user_name, branch_id) VALUES ($1,$2,$3,$4,$5,$6)`, [action, module, desc, userId, userName, branchId]);
    }
    console.log('--- Audit Trail done');

    // ============================================================
    // 27. CLOSING PERIODS (MBS)
    // ============================================================
    console.log(' Closing Periods (tutup buku)...');
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    if (currentMonth >= 2) {
        await q(`INSERT INTO closing_periods (period_type, period_start, period_end, branch_id, status, closed_by, closed_at, created_by, notes) VALUES
            ('monthly', $1, $2, $3, 'closed', 'Dewi Lestari FM', NOW() - INTERVAL '40 days', 'Dewi Lestari FM', 'Tutup buku bulan sebelumnya')`,
            [`${currentYear}-${String(currentMonth - 1).padStart(2, '0')}-01`, new Date(currentYear, currentMonth - 1, 0).toISOString().split('T')[0], sjkt]);
        await q(`INSERT INTO closing_periods (period_type, period_start, period_end, branch_id, status, closed_by, closed_at, created_by, notes) VALUES
            ('monthly', $1, $2, $3, 'closed', 'Dewi Lestari FM', NOW() - INTERVAL '10 days', 'Dewi Lestari FM', 'Tutup buku bulan lalu')`,
            [`${currentYear}-${String(currentMonth).padStart(2, '0')}-01`, new Date(currentYear, currentMonth, 0).toISOString().split('T')[0], sjkt]);
    }
    await q(`INSERT INTO closing_periods (period_type, period_start, period_end, branch_id, status, created_by, notes) VALUES
        ('monthly', $1, $2, $3, 'open', 'Dewi Lestari FM', 'Periode berjalan')`,
        [`${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`, new Date(currentYear, currentMonth + 1, 0).toISOString().split('T')[0], sjkt]);
    console.log('--- Closing periods done');

    // ============================================================
    // SUMMARY
    // ============================================================
    console.log('\n Summary:\n');
    const summaryTables = {
        companies: 'Companies', branches: 'Branches', users: 'Users', roles: 'Roles',
        items: 'Items', bundles: 'Bundles', warehouses: 'Gudang', suppliers: 'Supplier',
        customers: 'Pelanggan', supplier_prices: 'Harga Supplier',
        purchase_orders: 'Purchase Orders', goods_receives: 'Goods Receives',
        purchase_bills: 'Tagihan Pembelian', stock_transfers: 'Stock Transfers',
        stock_opnames: 'Stok Opname', batches: 'Batches', inventory: 'Inventory Records',
        sales_orders: 'Sales Orders', goods_issues: 'Goods Issues',
        invoices: 'Invoices', sales_returns: 'Retur Penjualan',
        purchase_returns: 'Retur Pembelian',
        pos_transactions: 'POS Transactions', consignments: 'Konsinyasi',
        chart_of_accounts: 'Chart of Accounts',
        journal_entries: 'Journal Entries', audit_trail: 'Audit Trail',
        item_price_tiers: 'Item Price Tiers', margin_defaults: 'Margin Defaults',
        closing_periods: 'Closing Periods',
    };
    for (const [t, label] of Object.entries(summaryTables)) {
        const r = await q(`SELECT COUNT(*) FROM ${t}`);
        console.log(` ${label}: ${r.rows[0].count}`);
    }

    const bs = await q(`SELECT status, COUNT(*) FROM batches GROUP BY status ORDER BY status`);
    console.log('\n Batch Status:');
    bs.rows.forEach(r => console.log(` ${r.status}: ${r.count}`));

    console.log('\n--- Seed selesai! Password semua user: password123\n');
    await pool.end();
}

run().catch(e => { console.error('--- Seed gagal:', e.message, e.stack); pool.end(); process.exit(1); });
