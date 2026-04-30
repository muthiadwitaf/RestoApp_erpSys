/**
 * company/index.js - Platform Admin Company & Super Admin Management API
 * All endpoints require Super Admin access.
 *
 * GET    /api/company                       - list all companies
 * GET    /api/company/stats                 - cross-company summary stats
 * GET    /api/company/:uuid                 - detail + branches + users count
 * GET    /api/company/:uuid/users           - users assigned to company
 * POST   /api/company                       - create new company
 * PUT    /api/company/:uuid                 - update company
 * PUT    /api/company/:uuid/users           - assign/unassign users
 * DELETE /api/company/:uuid                 - soft delete (is_active=false)
 * GET    /api/company/super-admins/list     - list all super admins
 * POST   /api/company/super-admins/create   - create new super admin
 * PUT    /api/company/super-admins/:uuid    - update super admin
 * DELETE /api/company/super-admins/:uuid    - deactivate super admin
 */
const router = require('express').Router();
const bcrypt = require('bcrypt');
const { query, getClient } = require('../../config/db');
const { requireSuperAdmin } = require('../../middleware/auth');
const { asyncHandler } = require('../../utils/helpers');
const { bcryptRounds } = require('../../config/auth');

router.use(requireSuperAdmin);

// ========================= PLATFORM AUDIT TRAIL =========================

// GET /api/company/audit - cross-company audit trail (Super Admin only)
router.get('/audit', asyncHandler(async (req, res) => {
    const { company_id, module: mod, action, search, from, to, preset } = req.query;
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 25, 5), 100);
    const offset = (page - 1) * limit;

    // Default: empty view, user must select a filter
    const hasFilter = company_id || from || to || preset || search;
    if (!hasFilter) {
        // Return company list for filter dropdown + empty data
        const compList = await query(`SELECT uuid, code, name FROM companies ORDER BY name`);
        return res.json({ data: [], total: 0, page, limit, companies: compList.rows });
    }

    let where = [];
    let values = [];
    let idx = 1;

    // Company filter (via branch join)
    if (company_id) {
        where.push(`b.company_id = (SELECT id FROM companies WHERE uuid = $${idx++})`);
        values.push(company_id);
    }

    // Date presets
    if (preset === 'today') {
        where.push(`a.timestamp >= CURRENT_DATE`);
    } else if (preset === 'week') {
        where.push(`a.timestamp >= CURRENT_DATE - INTERVAL '7 days'`);
    } else if (preset === 'month') {
        where.push(`a.timestamp >= DATE_TRUNC('month', CURRENT_DATE)`);
    }

    // Custom date range
    if (from) { where.push(`a.timestamp >= $${idx++}`); values.push(from); }
    if (to) { where.push(`a.timestamp <= $${idx++}::timestamptz + interval '1 day'`); values.push(to); }

    if (mod) { where.push(`a.module = $${idx++}`); values.push(mod); }
    if (action) { where.push(`a.action = $${idx++}`); values.push(action); }
    if (search) { where.push(`(a.description ILIKE $${idx} OR u.name ILIKE $${idx} OR u.email ILIKE $${idx})`); values.push(`%${search}%`); idx++; }

    const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

    const countResult = await query(
        `SELECT COUNT(*) FROM audit_trail a
         LEFT JOIN branches b ON a.branch_id = b.id
         LEFT JOIN users u ON a.user_id = u.id
         ${whereClause}`, values
    );
    const total = parseInt(countResult.rows[0].count);

    const result = await query(
        `SELECT a.id, a.action, a.module, a.description,
                a.user_name as user_name_stored,
                a.timestamp, a.details_json,
                b.name as branch_name, b.uuid as branch_id,
                c.name as company_name, c.uuid as company_id, c.code as company_code,
                u.name  as user_name,
                u.email as user_email
         FROM audit_trail a
         LEFT JOIN branches b ON a.branch_id = b.id
         LEFT JOIN companies c ON b.company_id = c.id
         LEFT JOIN users u ON a.user_id = u.id
         ${whereClause} ORDER BY a.timestamp DESC LIMIT $${idx++} OFFSET $${idx++}`,
        [...values, limit, offset]
    );

    // Also return company list for filter
    const compList = await query(`SELECT uuid, code, name FROM companies ORDER BY name`);

    res.json({ data: result.rows, total, page, limit, companies: compList.rows });
}));

// ========================= COMPANY MANAGEMENT =========================

// GET list all companies with branch/user counts
router.get('/', asyncHandler(async (req, res) => {
    const result = await query(`
        SELECT c.uuid, c.code, c.short_name, c.name, c.npwp, c.address, c.phone,
               c.is_active, c.created_at, c.updated_at,
               COUNT(DISTINCT b.id) as branch_count,
               COUNT(DISTINCT uc.user_id) as user_count
        FROM companies c
        LEFT JOIN branches b ON b.company_id = c.id
        LEFT JOIN user_companies uc ON uc.company_id = c.id
        GROUP BY c.id
        ORDER BY c.name
    `);
    res.json(result.rows);
}));

// GET /next-code?name=... -- generate kode & singkatan otomatis dari nama company
// HARUS sebelum /:uuid agar tidak bentrok dengan route parameterized
router.get('/next-code', asyncHandler(async (req, res) => {
    const { name } = req.query;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Parameter name diperlukan' });

    // Ekstrak entity type (PT, CV, UD, Tbk, Firma, dll) dari awal nama
    const entityRegex = /^(PT\.?|CV\.?|UD\.?|TBK\.?|FIRMA\.?|KOPERASI\.?|YAYASAN\.?)/i;
    const entityMatch = name.trim().match(entityRegex);
    const entityRaw = entityMatch ? entityMatch[1].replace(/\./g, '') : '';
    const entity = entityRaw.toUpperCase();

    // Ambil kata-kata sisanya (hilangkan entity dari depan)
    const rest = name.trim().replace(entityRegex, '').trim();
    const words = rest.split(/\s+/).filter(w => w.length > 0);
    const initials = words.map(w => w[0].toUpperCase()).join('');

    // short_name: PT-SSP, CV-BSL, dll
    const short_name = entity ? `${entity}-${initials}` : initials;

    // code base: PTSSP, CVBSL -- tanpa dash, tanpa spasi
    const codeBase = `${entity}${initials}`.replace(/[^A-Z0-9]/g, '');

    // Cek keunikan & tambah suffix jika collision
    let finalCode = codeBase;
    const exists = await query(`SELECT code FROM companies WHERE code = $1`, [finalCode]);
    if (exists.rows.length > 0) {
        let suffix = 2;
        while (true) {
            finalCode = `${codeBase}-${String(suffix).padStart(2, '0')}`;
            const check = await query(`SELECT code FROM companies WHERE code = $1`, [finalCode]);
            if (check.rows.length === 0) break;
            suffix++;
            if (suffix > 99) break;
        }
    }

    res.json({ code: finalCode, short_name });
}));

// GET cross-company stats - aggregated data for reporting
router.get('/stats', asyncHandler(async (req, res) => {
    const period = req.query.period || 'month';
    let dateFilter;
    const now = new Date();
    if (period === 'year') {
        dateFilter = `${now.getFullYear()}-01-01`;
    } else if (period === 'quarter') {
        const q = Math.floor(now.getMonth() / 3) * 3;
        dateFilter = `${now.getFullYear()}-${String(q + 1).padStart(2, '0')}-01`;
    } else {
        dateFilter = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    }

    const salesByCompany = await query(`
        SELECT c.uuid, c.code, c.name,
               COALESCE(SUM(CASE WHEN i.status = 'paid' AND i.date >= $1 THEN i.total ELSE 0 END), 0) as invoice_revenue,
               COUNT(CASE WHEN i.date >= $1 THEN i.id END) as invoice_count
        FROM companies c
        LEFT JOIN branches b ON b.company_id = c.id
        LEFT JOIN invoices i ON i.branch_id = b.id
        WHERE c.is_active = true
        GROUP BY c.id ORDER BY c.name
    `, [dateFilter]);

    const posByCompany = await query(`
        SELECT c.uuid,
               COALESCE(SUM(CASE WHEN pt.date >= $1 THEN pt.total ELSE 0 END), 0) as pos_revenue,
               COUNT(CASE WHEN pt.date >= $1 THEN pt.id END) as pos_count
        FROM companies c
        LEFT JOIN branches b ON b.company_id = c.id
        LEFT JOIN pos_transactions pt ON pt.branch_id = b.id
        WHERE c.is_active = true
        GROUP BY c.id ORDER BY c.uuid
    `, [dateFilter]);

    const purchasesByCompany = await query(`
        SELECT c.uuid,
               COALESCE(SUM(CASE WHEN pb.status = 'paid' AND pb.date >= $1 THEN pb.total ELSE 0 END), 0) as purchase_cost,
               COUNT(CASE WHEN po.date >= $1 THEN po.id END) as po_count
        FROM companies c
        LEFT JOIN branches b ON b.company_id = c.id
        LEFT JOIN purchase_bills pb ON pb.branch_id = b.id
        LEFT JOIN purchase_orders po ON po.branch_id = b.id
        WHERE c.is_active = true
        GROUP BY c.id ORDER BY c.uuid
    `, [dateFilter]);

    const totals = await query(`
        SELECT
            (SELECT COUNT(*) FROM companies WHERE is_active = true) as total_companies,
            (SELECT COUNT(*) FROM branches) as total_branches,
            (SELECT COUNT(*) FROM users WHERE is_active = true) as total_users,
            (SELECT COUNT(*) FROM warehouses) as total_warehouses
    `);

    // Per-company detail counts
    const detailCounts = await query(`
        SELECT c.uuid,
               COUNT(DISTINCT b.id) as branch_count,
               COUNT(DISTINCT uc.user_id) as user_count,
               COUNT(DISTINCT w.id) as warehouse_count
        FROM companies c
        LEFT JOIN branches b ON b.company_id = c.id
        LEFT JOIN user_companies uc ON uc.company_id = c.id
        LEFT JOIN warehouses w ON w.branch_id = b.id
        WHERE c.is_active = true
        GROUP BY c.id
    `);

    const companies = salesByCompany.rows.map(s => {
        const pos = posByCompany.rows.find(p => p.uuid === s.uuid) || {};
        const pur = purchasesByCompany.rows.find(p => p.uuid === s.uuid) || {};
        const totalRevenue = parseFloat(s.invoice_revenue || 0) + parseFloat(pos.pos_revenue || 0);
        const totalCost = parseFloat(pur.purchase_cost || 0);
        const det = detailCounts.rows.find(d => d.uuid === s.uuid) || {};
        return {
            uuid: s.uuid, code: s.code, name: s.name,
            user_count: parseInt(det.user_count || 0),
            branch_count: parseInt(det.branch_count || 0),
            warehouse_count: parseInt(det.warehouse_count || 0),
            invoice_revenue: parseFloat(s.invoice_revenue || 0),
            pos_revenue: parseFloat(pos.pos_revenue || 0),
            total_revenue: totalRevenue,
            purchase_cost: totalCost,
            gross_profit: totalRevenue - totalCost,
            invoice_count: parseInt(s.invoice_count || 0),
            pos_count: parseInt(pos.pos_count || 0),
            po_count: parseInt(pur.po_count || 0),
            total_transactions: parseInt(s.invoice_count || 0) + parseInt(pos.pos_count || 0),
        };
    });

    res.json({ period, date_from: dateFilter, totals: totals.rows[0], companies });
}));

// GET single company detail
router.get('/:uuid', asyncHandler(async (req, res) => {
    const result = await query(`
        SELECT c.id, c.uuid, c.code, c.short_name, c.name, c.npwp, c.address, c.phone,
               c.is_pkp, c.pkp_since, c.is_active, c.created_at, c.updated_at
        FROM companies c WHERE c.uuid = $1
    `, [req.params.uuid]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Company tidak ditemukan' });
    const company = result.rows[0];
    const companyIntId = company.id;

    const branches = await query(`
        SELECT uuid, code, name, address, phone,
               (SELECT COUNT(*) FROM warehouses w WHERE w.branch_id = b.id) as warehouse_count
        FROM branches b WHERE b.company_id = $1 ORDER BY b.name
    `, [companyIntId]);

    const userCount = await query(`SELECT COUNT(*) FROM user_companies WHERE company_id = $1`, [companyIntId]);

    const { id, ...safeCompany } = company;
    res.json({ ...safeCompany, branches: branches.rows, user_count: parseInt(userCount.rows[0].count) });
}));

// GET users assigned to company
router.get('/:uuid/users', asyncHandler(async (req, res) => {
    const comp = await query(`SELECT id FROM companies WHERE uuid = $1`, [req.params.uuid]);
    if (comp.rows.length === 0) return res.status(404).json({ error: 'Company tidak ditemukan' });
    const companyId = comp.rows[0].id;

    const assigned = await query(`
        SELECT u.uuid, u.username, u.name, u.email, u.is_active, u.is_super_admin,
               r.name as role_name
        FROM users u
        JOIN user_companies uc ON uc.user_id = u.id AND uc.company_id = $1
        LEFT JOIN user_roles ur ON ur.user_id = u.id
        LEFT JOIN roles r ON r.id = ur.role_id
        WHERE u.is_super_admin = false
        ORDER BY u.name
    `, [companyId]);

    const unassigned = await query(`
        SELECT u.uuid, u.username, u.name, u.email, u.is_active,
               r.name as role_name
        FROM users u
        LEFT JOIN user_roles ur ON ur.user_id = u.id
        LEFT JOIN roles r ON r.id = ur.role_id
        WHERE u.is_super_admin = false
          AND u.id NOT IN (SELECT user_id FROM user_companies WHERE company_id = $1)
        ORDER BY u.name
    `, [companyId]);

    res.json({ assigned: assigned.rows, unassigned: unassigned.rows });
}));

// POST create company (with full auto-setup: Admin IT, roles, COA, taxes, categories, units)
router.post('/', asyncHandler(async (req, res) => {
    const { code, short_name, name, npwp, address, phone, is_pkp, pkp_since, admin_username, admin_password, admin_name, admin_email } = req.body;
    if (!code || !name) return res.status(400).json({ error: 'Code dan Name wajib diisi' });

    const exists = await query(`SELECT 1 FROM companies WHERE code = $1`, [code]);
    if (exists.rows.length > 0) return res.status(400).json({ error: `Code "${code}" sudah digunakan` });

    // Validate admin credentials if provided
    if (admin_username) {
        if (!admin_password || admin_password.length < 6) return res.status(400).json({ error: 'Password Admin IT minimal 6 karakter' });
        const existUser = await query(`SELECT 1 FROM users WHERE username = $1`, [admin_username]);
        if (existUser.rows.length > 0) return res.status(400).json({ error: `Username "${admin_username}" sudah digunakan` });
    }

    const client = await getClient();
    try {
        await client.query('BEGIN');

        // 1. Create company
        const compRes = await client.query(
            `INSERT INTO companies (code, short_name, name, npwp, address, phone, is_pkp, pkp_since) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, uuid, code, short_name, name`,
            [code, short_name || null, name, npwp || null, address || null, phone || null, is_pkp ?? false, pkp_since || null]
        );
        const company = compRes.rows[0];
        const companyId = company.id;

        // 2. Clone role templates for new company
        const roleTemplates = [
            ['Owner', 'Pemilik company'],
            ['Admin IT', 'IT sysadmin --- kelola users, roles, audit'],
            ['Direktur', 'Eksekutif operasional'],
            ['Finance Manager', 'Manager departemen keuangan'],
            ['Finance Staff', 'Staff keuangan'],
            ['Sales Manager', 'Manager sales'],
            ['Sales Supervisor', 'Supervisor sales'],
            ['Sales Staff', 'Staff sales'],
            ['Purchasing Manager', 'Manager purchasing'],
            ['Purchasing Supervisor', 'Supervisor purchasing'],
            ['Purchasing Staff', 'Staff purchasing'],
            ['Warehouse Manager', 'Manager gudang'],
            ['Warehouse Supervisor', 'Supervisor gudang'],
            ['Warehouse Staff', 'Staff gudang'],
            ['Kasir', 'Operator POS kasir'],
            ['HR Manager', 'Manager HR -- full access data karyawan'],
            ['HR Staff', 'Staff HR -- kelola data karyawan'],
        ];
        const rolePermMap = {
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
            'HR Manager': ['dashboard:view', 'hr:view', 'hr:create', 'hr:edit', 'hr:delete'],
            'HR Staff':   ['dashboard:view', 'hr:view', 'hr:create', 'hr:edit'],
        };

        // Pastikan hr:* permissions tersedia di tabel global permissions
        for (const hrPerm of ['hr:view', 'hr:create', 'hr:edit', 'hr:delete']) {
            await client.query(`INSERT INTO permissions (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`, [hrPerm]);
        }

        const permRes = await client.query(`SELECT id, name FROM permissions`);

        const permMap = Object.fromEntries(permRes.rows.map(r => [r.name, r.id]));
        let adminItRoleId = null;

        for (const [rName, rDesc] of roleTemplates) {
            const rr = await client.query(
                `INSERT INTO roles (name, description, company_id) VALUES ($1,$2,$3) RETURNING id`,
                [rName, rDesc, companyId]
            );
            const roleId = rr.rows[0].id;
            if (rName === 'Admin IT') adminItRoleId = roleId;

            // Assign permissions
            const perms = rolePermMap[rName] || [];
            for (const perm of perms) {
                if (permMap[perm]) {
                    await client.query(`INSERT INTO role_permissions (role_id, permission_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [roleId, permMap[perm]]);
                }
            }
        }

        // 3. Clone COA for new company (SAK EMKM + Pajak Indonesia)
        const coaTemplates = [
            ['1-0001', 'Kas Tunai', 'Aset', 'Kas & Setara Kas', 'IDR', 0],
            ['1-0002', 'Kas Tunai Cabang 2', 'Aset', 'Kas & Setara Kas', 'IDR', 0],
            ['1-0003', 'Bank BCA', 'Aset', 'Kas & Setara Kas', 'IDR', 0],
            ['1-0004', 'Bank BRI', 'Aset', 'Kas & Setara Kas', 'IDR', 0],
            ['1-1001', 'Piutang Dagang', 'Aset', 'Piutang', 'IDR', 0],
            ['1-2001', 'Persediaan Barang', 'Aset', 'Persediaan', 'IDR', 0],
            ['1-3001', 'Peralatan', 'Aset', 'Aset Tetap', 'IDR', 0],
            ['1-3002', 'Akumulasi Penyusutan', 'Aset', 'Aset Tetap', 'IDR', 0],
            ['1-4001', 'PPN Masukan', 'Aset', 'Pajak Dibayar Dimuka', 'IDR', 0],
            ['2-0001', 'Utang Dagang', 'Liabilitas', 'Utang Jangka Pendek', 'IDR', 0],
            ['2-0002', 'Utang Gaji', 'Liabilitas', 'Utang Jangka Pendek', 'IDR', 0],
            ['2-1001', 'Utang Bank', 'Liabilitas', 'Utang Jangka Panjang', 'IDR', 0],
            ['2-2200', 'PPN Keluaran', 'Liabilitas', 'Utang Pajak', 'IDR', 0],
            ['2-2002', 'Utang PPh', 'Liabilitas', 'Utang Pajak', 'IDR', 0],
            ['3-0001', 'Modal Disetor', 'Ekuitas', 'Modal', 'IDR', 0],
            ['3-0002', 'Laba Ditahan', 'Ekuitas', 'Laba Ditahan', 'IDR', 0],
            ['4-0001', 'Pendapatan Penjualan', 'Pendapatan', 'Penjualan', 'IDR', 0],
            ['4-0002', 'Pendapatan Konsinyasi', 'Pendapatan', 'Penjualan', 'IDR', 0],
            ['4-9001', 'Pendapatan Lain-lain', 'Pendapatan', 'Lain-lain', 'IDR', 0],
            ['5-0001', 'Harga Pokok Penjualan', 'Beban', 'HPP', 'IDR', 0],
            ['5-1001', 'Beban Gaji', 'Beban', 'Beban Operasional', 'IDR', 0],
            ['5-1002', 'Beban Sewa', 'Beban', 'Beban Operasional', 'IDR', 0],
            ['5-1003', 'Beban Listrik & Air', 'Beban', 'Beban Operasional', 'IDR', 0],
            ['5-1004', 'Beban Penyusutan', 'Beban', 'Beban Operasional', 'IDR', 0],
            ['5-2001', 'Beban Administrasi', 'Beban', 'Beban Operasional', 'IDR', 0],
            ['5-3001', 'Beban Bunga', 'Beban', 'Beban Lain-lain', 'IDR', 0],
            ['8-0001', 'Beban Pajak Penghasilan', 'Beban', 'Pajak', 'IDR', 0],
            // ── Beban Reimburse Karyawan ────────────────────────────────────
            ['6-1100', 'Beban Perjalanan Dinas', 'Beban', 'Beban Reimburse', 'IDR', 0],
            ['6-1200', 'Beban Konsumsi & Representasi', 'Beban', 'Beban Reimburse', 'IDR', 0],
            ['6-1300', 'Beban ATK & Perlengkapan', 'Beban', 'Beban Reimburse', 'IDR', 0],
            ['6-1400', 'Beban Komunikasi & Internet', 'Beban', 'Beban Reimburse', 'IDR', 0],
            ['6-1500', 'Beban Kesehatan Karyawan', 'Beban', 'Beban Reimburse', 'IDR', 0],
            ['6-1600', 'Beban Jasa Profesional', 'Beban', 'Beban Reimburse', 'IDR', 0],
            ['6-1700', 'Beban Pemeliharaan & Perbaikan', 'Beban', 'Beban Reimburse', 'IDR', 0],
            ['6-1900', 'Beban Reimburse Lain-lain', 'Beban', 'Beban Reimburse', 'IDR', 0],
            // -- Aset Tetap: Nilai Perolehan (Aktiva) -------------------------
            ['1-2100', 'Kendaraan', 'Aset', 'Aset Tetap', 'IDR', 0],
            ['1-2110', 'Akumulasi Penyusutan Kendaraan', 'Aset', 'Aset Tetap', 'IDR', 0],
            ['1-2200', 'Peralatan & Mesin', 'Aset', 'Aset Tetap', 'IDR', 0],
            ['1-2210', 'Akumulasi Penyusutan Peralatan & Mesin', 'Aset', 'Aset Tetap', 'IDR', 0],
            ['1-2300', 'Bangunan & Renovasi', 'Aset', 'Aset Tetap', 'IDR', 0],
            ['1-2310', 'Akumulasi Penyusutan Bangunan', 'Aset', 'Aset Tetap', 'IDR', 0],
            ['1-2400', 'Furnitur & Inventaris', 'Aset', 'Aset Tetap', 'IDR', 0],
            ['1-2410', 'Akumulasi Penyusutan Furnitur & Inventaris', 'Aset', 'Aset Tetap', 'IDR', 0],
            ['1-2500', 'Peralatan IT & Komputer', 'Aset', 'Aset Tetap', 'IDR', 0],
            ['1-2510', 'Akumulasi Penyusutan Peralatan IT', 'Aset', 'Aset Tetap', 'IDR', 0],
            // -- Beban Penyusutan (Beban) -------------------------------------
            ['6-2100', 'Beban Penyusutan Kendaraan', 'Beban', 'Beban Penyusutan Aset', 'IDR', 0],
            ['6-2200', 'Beban Penyusutan Peralatan & Mesin', 'Beban', 'Beban Penyusutan Aset', 'IDR', 0],
            ['6-2300', 'Beban Penyusutan Bangunan', 'Beban', 'Beban Penyusutan Aset', 'IDR', 0],
            ['6-2400', 'Beban Penyusutan Furnitur & Inventaris', 'Beban', 'Beban Penyusutan Aset', 'IDR', 0],
            ['6-2500', 'Beban Penyusutan Peralatan IT', 'Beban', 'Beban Penyusutan Aset', 'IDR', 0],
            // -- Beban Pemeliharaan (Beban) ------------------------------------
            ['6-2600', 'Beban Pemeliharaan Kendaraan', 'Beban', 'Beban Pemeliharaan Aset', 'IDR', 0],
            ['6-2700', 'Beban Pemeliharaan Peralatan & Mesin', 'Beban', 'Beban Pemeliharaan Aset', 'IDR', 0],
            ['6-2800', 'Beban Pemeliharaan Bangunan', 'Beban', 'Beban Pemeliharaan Aset', 'IDR', 0],
            ['6-2900', 'Beban Pemeliharaan Furnitur & IT', 'Beban', 'Beban Pemeliharaan Aset', 'IDR', 0],
            // -- Disposal & Revaluasi (shared semua kategori) -----------------
            ['8-1100', 'Keuntungan Pelepasan Aset', 'Pendapatan', 'Pendapatan Lain-lain', 'IDR', 0],
            ['6-3000', 'Kerugian Pelepasan Aset', 'Beban', 'Beban Lain-lain', 'IDR', 0],
            ['6-3100', 'Kerugian Revaluasi Aset', 'Beban', 'Beban Lain-lain', 'IDR', 0],
            ['3-2100', 'Surplus Revaluasi Aset', 'Ekuitas', 'Ekuitas', 'IDR', 0],
        ];
        for (const [c, n, t, cat, cur, bal] of coaTemplates) {
            await client.query(`INSERT INTO chart_of_accounts (code,name,type,category,currency,balance,company_id) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
                [c, n, t, cat, cur, bal, companyId]);
        }

        // 4. Clone tax configs for new company
        const taxTemplates = [
            ['Non-PKP (Bebas PPN)', 0, false, '2022-01-01'],
            ['PPN 11%', 11, false, '2022-04-01'],
            ['PPN 12%', 12, true, '2025-01-01'],
        ];
        for (const [tn, tr, ta, td] of taxTemplates) {
            await client.query(`INSERT INTO tax_configs (name,rate,is_active,effective_date,company_id) VALUES ($1,$2,$3,$4,$5)`,
                [tn, tr, ta, td, companyId]);
        }

        // 4.5. Seed 5 kategori aset default (linked ke COA yang baru di-insert)
        const assetCategoryTemplates = [
            // [name, method, life_months, residual_pct, coa_asset, coa_accum, coa_dep, coa_maint, coa_gain, coa_loss]
            ['Kendaraan',              'straight-line',  60,  0, '1-2100', '1-2110', '6-2100', '6-2600', '8-1100', '6-3000'],
            ['Peralatan & Mesin',      'straight-line',  96,  0, '1-2200', '1-2210', '6-2200', '6-2700', '8-1100', '6-3000'],
            ['Bangunan & Renovasi',    'straight-line', 240,  0, '1-2300', '1-2310', '6-2300', '6-2800', '8-1100', '6-3000'],
            ['Furnitur & Inventaris',  'straight-line',  60,  0, '1-2400', '1-2410', '6-2400', '6-2900', '8-1100', '6-3000'],
            ['Peralatan IT & Komputer','straight-line',  36,  0, '1-2500', '1-2510', '6-2500', '6-2900', '8-1100', '6-3000'],
        ];
        // Lookup ID COA by code untuk company ini
        const catCodes = [...new Set(assetCategoryTemplates.flatMap(r => [r[4],r[5],r[6],r[7],r[8],r[9]]))];
        const catCoaRes = await client.query(
            `SELECT id, code FROM chart_of_accounts WHERE company_id = $1 AND code = ANY($2)`,
            [companyId, catCodes]
        );
        const catCoaMap = Object.fromEntries(catCoaRes.rows.map(r => [r.code, r.id]));
        let catCount = 0;
        for (const [nm, meth, life, residual, ac, aa, ad, am, ag, al] of assetCategoryTemplates) {
            await client.query(
                `INSERT INTO asset_categories
                 (company_id, name, depreciation_method, useful_life_months, residual_value_pct,
                  is_depreciable,
                  coa_asset_id, coa_accum_depreciation_id, coa_depreciation_id,
                  coa_maintenance_id, coa_disposal_gain_id, coa_disposal_loss_id)
                 VALUES ($1,$2,$3,$4,$5,true,$6,$7,$8,$9,$10,$11)`,
                [companyId, nm, meth, life, residual,
                 catCoaMap[ac]||null, catCoaMap[aa]||null, catCoaMap[ad]||null,
                 catCoaMap[am]||null, catCoaMap[ag]||null, catCoaMap[al]||null]
            );
            catCount++;
        }
        // Units: buat default units (diperlukan untuk input barang)
        const unitTemplates = [
            { code: 'PCS', name: 'Pcs', description: 'Piece / Satuan' },
            { code: 'BOX', name: 'Box', description: 'Kardus / Kotak' },
            { code: 'KG', name: 'Kg', description: 'Kilogram' },
            { code: 'GR', name: 'Gram', description: 'Gram' },
            { code: 'LTR', name: 'Liter', description: 'Liter' },
            { code: 'DZN', name: 'Lusin', description: '12 Pcs' },
        ];
        let unitCount = 0;
        for (const u of unitTemplates) {
            await client.query(
                `INSERT INTO units (code, name, description, company_id) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
                [u.code, u.name, u.description, companyId]
            );
            unitCount++;
        }

        // 5. Auto-create Admin IT user if credentials provided (email required, username auto-generated)
        let adminUser = null;
        if (admin_email && admin_password) {
            // Auto-generate username dari email prefix
            const baseUn = admin_email.trim().split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '_');
            let adminUn = baseUn; let unSuffix = 1;
            while ((await client.query(`SELECT id FROM users WHERE username = $1`, [adminUn])).rows.length > 0) {
                adminUn = `${baseUn}_${unSuffix++}`;
            }
            const hash = await bcrypt.hash(admin_password, bcryptRounds);
            const aRes = await client.query(
                `INSERT INTO users (username, password_hash, name, email, is_active) VALUES ($1,$2,$3,$4,true) RETURNING id, uuid, name, email`,
                [adminUn, hash, (admin_name || `Admin IT ${name}`).trim(), admin_email.trim()]
            );
            adminUser = aRes.rows[0];
            const adminUserId = adminUser.id;

            // Assign Admin IT role
            if (adminItRoleId) {
                await client.query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1,$2)`, [adminUserId, adminItRoleId]);
            }
            // Assign to company
            await client.query(`INSERT INTO user_companies (user_id, company_id) VALUES ($1,$2)`, [adminUserId, companyId]);
        }

        // 5.5 Auto-create default branch "Kantor Pusat"
        // Format kode: {COMPANYCODE}-00001
        const sanitizedCode = code.toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9\-]/g, '');
        const defaultBranchCode = `${sanitizedCode}-00001`;
        const branchRes = await client.query(
            `INSERT INTO branches (code, name, address, phone, company_id)
             VALUES ($1, 'Kantor Pusat', $2, $3, $4)
             RETURNING id, uuid, name, code`,
            [defaultBranchCode, address || null, phone || null, companyId]
        );
        const defaultBranch = branchRes.rows[0];

        // Assign Admin IT ke branch default jika user dibuat
        if (adminUser && defaultBranch) {
            await client.query(
                `INSERT INTO user_branches (user_id, branch_id) VALUES ($1, $2)`,
                [adminUser.id, defaultBranch.id]
            );
        }

        await client.query('COMMIT');

        // Audit trail
        await query(`INSERT INTO audit_trail (action, module, description, user_id, user_name)
            VALUES ('create','company',$1,$2,$3)`,
            [`Super Admin buat company baru: ${name} (${code})${adminUser ? ` + Admin IT: ${adminUser.email}` : ''} + Cabang: ${defaultBranch.name}`, req.user.id, req.user.name]);

        const { id: _cid, ...safeCompany } = company;
        res.status(201).json({
            ...safeCompany,
            admin_user: adminUser ? { uuid: adminUser.uuid, name: adminUser.name, email: adminUser.email } : null,
            default_branch: { uuid: defaultBranch.uuid, code: defaultBranch.code, name: defaultBranch.name },
            setup: { roles: roleTemplates.length, coa: coaTemplates.length, taxes: taxTemplates.length, units: unitCount, asset_categories: catCount, branches: 1 }
        });
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}));

// PUT update company
router.put('/:uuid', asyncHandler(async (req, res) => {
    const { short_name, name, npwp, address, phone, is_active, is_pkp, pkp_since } = req.body;
    const result = await query(
        `UPDATE companies SET short_name=COALESCE($1,short_name), name=COALESCE($2,name),
                npwp=$3, address=$4, phone=$5, is_active=COALESCE($6,is_active),
                is_pkp=COALESCE($7,is_pkp), pkp_since=$8, updated_at=NOW()
         WHERE uuid=$9 RETURNING uuid, code, short_name, name, is_active`,
        [short_name, name, npwp, address, phone, is_active, is_pkp, pkp_since || null, req.params.uuid]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Company tidak ditemukan' });

    await query(`INSERT INTO audit_trail (action, module, description, user_id, user_name)
        VALUES ('update','company',$1,$2,$3)`,
        [`Super Admin update company: ${result.rows[0].name}`, req.user.id, req.user.name]);

    res.json(result.rows[0]);
}));

// PUT assign/unassign users to company
router.put('/:uuid/users', asyncHandler(async (req, res) => {
    const { user_ids } = req.body;
    if (!Array.isArray(user_ids)) return res.status(400).json({ error: 'user_ids harus berupa array' });

    const comp = await query(`SELECT id, name FROM companies WHERE uuid = $1`, [req.params.uuid]);
    if (comp.rows.length === 0) return res.status(404).json({ error: 'Company tidak ditemukan' });
    const companyId = comp.rows[0].id;

    const client = await getClient();
    try {
        await client.query('BEGIN');
        await client.query(`
            DELETE FROM user_companies
            WHERE company_id = $1
              AND user_id IN (SELECT id FROM users WHERE is_super_admin = false)
        `, [companyId]);

        for (const userUuid of user_ids) {
            const u = await client.query(`SELECT id FROM users WHERE uuid = $1 AND is_super_admin = false`, [userUuid]);
            if (u.rows.length > 0) {
                await client.query(
                    `INSERT INTO user_companies (user_id, company_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                    [u.rows[0].id, companyId]
                );
            }
        }
        await client.query('COMMIT');

        await query(`INSERT INTO audit_trail (action, module, description, user_id, user_name)
            VALUES ('update','company',$1,$2,$3)`,
            [`Super Admin update user assignments company ${comp.rows[0].name}: ${user_ids.length} users`, req.user.id, req.user.name]);

        res.json({ message: `${user_ids.length} user assigned ke ${comp.rows[0].name}` });
    } catch (err) { await client.query('ROLLBACK'); throw err; }
    finally { client.release(); }
}));

// DELETE (soft) company
router.delete('/:uuid', asyncHandler(async (req, res) => {
    const result = await query(
        `UPDATE companies SET is_active = false, updated_at = NOW() WHERE uuid = $1 RETURNING uuid, name`,
        [req.params.uuid]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Company tidak ditemukan' });

    await query(`INSERT INTO audit_trail (action, module, description, user_id, user_name)
        VALUES ('delete','company',$1,$2,$3)`,
        [`Super Admin nonaktifkan company: ${result.rows[0].name}`, req.user.id, req.user.name]);

    res.json({ message: `Company ${result.rows[0].name} dinonaktifkan` });
}));

// ========================= SUPER ADMIN MANAGEMENT =========================

// GET /api/company/super-admins/list
router.get('/super-admins/list', asyncHandler(async (req, res) => {
    const result = await query(`
        SELECT u.uuid, u.username, u.name, u.email, u.is_active, u.created_at
        FROM users u
        WHERE u.is_super_admin = true
        ORDER BY u.name
    `);
    res.json(result.rows);
}));

// POST /api/company/super-admins/create
router.post('/super-admins/create', asyncHandler(async (req, res) => {
    const { username, password, name, email } = req.body;
    if (!username || !password || !name)
        return res.status(400).json({ error: 'Username, password, dan nama wajib diisi' });
    if (password.length < 6)
        return res.status(400).json({ error: 'Password minimal 6 karakter' });

    const existing = await query(`SELECT id FROM users WHERE username = $1`, [username]);
    if (existing.rows.length > 0) return res.status(409).json({ error: 'Username sudah digunakan' });

    const hash = await bcrypt.hash(password, bcryptRounds);
    const result = await query(
        `INSERT INTO users (username, password_hash, name, email, is_active, is_super_admin)
         VALUES ($1,$2,$3,$4,true,true) RETURNING uuid, username, name, email`,
        [username.trim(), hash, name.trim(), email?.trim() || null]
    );
    const user = result.rows[0];
    const userId = (await query(`SELECT id FROM users WHERE uuid = $1`, [user.uuid])).rows[0].id;

    // Assign Super Admin role
    const saRole = await query(`SELECT id FROM roles WHERE name = 'Super Admin'`);
    if (saRole.rows.length > 0) {
        await query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
            [userId, saRole.rows[0].id]);
    }

    await query(`INSERT INTO audit_trail (action, module, description, user_id, user_name)
        VALUES ('create','company',$1,$2,$3)`,
        [`Super Admin buat super admin baru: ${name} (${username})`, req.user.id, req.user.name]);

    res.status(201).json(user);
}));

// PUT /api/company/super-admins/:uuid
router.put('/super-admins/:uuid', asyncHandler(async (req, res) => {
    const { name, email, password, is_active } = req.body;
    const userResult = await query(`SELECT id FROM users WHERE uuid = $1 AND is_super_admin = true`, [req.params.uuid]);
    if (userResult.rows.length === 0) return res.status(404).json({ error: 'Super Admin tidak ditemukan' });

    let updates = [], values = [], idx = 1;
    if (name !== undefined) { updates.push(`name = $${idx++}`); values.push(name.trim()); }
    if (email !== undefined) { updates.push(`email = $${idx++}`); values.push(email?.trim() || null); }
    if (is_active !== undefined) { updates.push(`is_active = $${idx++}`); values.push(is_active); }
    if (password) {
        if (password.length < 6) return res.status(400).json({ error: 'Password minimal 6 karakter' });
        const hash = await bcrypt.hash(password, bcryptRounds);
        updates.push(`password_hash = $${idx++}`); values.push(hash);
    }
    if (updates.length > 0) {
        updates.push(`updated_at = NOW()`);
        values.push(req.params.uuid);
        await query(`UPDATE users SET ${updates.join(', ')} WHERE uuid = $${idx}`, values);
    }

    await query(`INSERT INTO audit_trail (action, module, description, user_id, user_name)
        VALUES ('update','company',$1,$2,$3)`,
        [`Super Admin update super admin: ${req.params.uuid}`, req.user.id, req.user.name]);

    res.json({ message: 'Super Admin berhasil diupdate' });
}));

// DELETE /api/company/super-admins/:uuid (soft delete)
router.delete('/super-admins/:uuid', asyncHandler(async (req, res) => {
    if (req.params.uuid === req.user.uuid) {
        return res.status(400).json({ error: 'Tidak bisa menonaktifkan akun sendiri' });
    }
    const result = await query(
        `UPDATE users SET is_active = false, updated_at = NOW() WHERE uuid = $1 AND is_super_admin = true RETURNING uuid, name`,
        [req.params.uuid]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Super Admin tidak ditemukan' });

    await query(`INSERT INTO audit_trail (action, module, description, user_id, user_name)
        VALUES ('delete','company',$1,$2,$3)`,
        [`Super Admin nonaktifkan super admin: ${result.rows[0].name}`, req.user.id, req.user.name]);

    res.json({ message: `Super Admin ${result.rows[0].name} dinonaktifkan` });
}));

module.exports = router;
