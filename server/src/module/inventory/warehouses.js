const router = require('express').Router();
const { query } = require('../../config/db');
const { authenticateToken, requirePermission } = require('../../middleware/auth');
const { validateUUID } = require('../../middleware/validate');
const { asyncHandler } = require('../../utils/helpers');

router.use(authenticateToken);

// Warehouses
router.get('/', requirePermission('inventory:view', 'pos:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const result = await query(
        `SELECT w.uuid, w.code, w.name, w.address, w.is_active, b.name as branch_name, b.uuid as branch_id
     FROM warehouses w LEFT JOIN branches b ON w.branch_id = b.id
     WHERE b.company_id = $1 ORDER BY w.id`, [companyId]
    );
    res.json(result.rows);
}));

router.post('/', requirePermission('inventory:create'), asyncHandler(async (req, res) => {
    const { code, name, branch_id, address } = req.body;
    if (!code || !name) return res.status(400).json({ error: 'Kode dan nama wajib diisi' });

    // branch_id from frontend may be a UUID -- resolve it to the integer PK
    let resolvedBranchId = null;
    if (branch_id) {
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(branch_id);
        if (isUUID) {
            const branch = await query(`SELECT id FROM branches WHERE uuid = $1`, [branch_id]);
            if (branch.rows.length === 0) return res.status(400).json({ error: 'Branch tidak ditemukan' });
            resolvedBranchId = branch.rows[0].id;
        } else {
            resolvedBranchId = branch_id; // already an integer
        }
    }

    const result = await query(`INSERT INTO warehouses (code, name, branch_id, address) VALUES ($1,$2,$3,$4) RETURNING uuid, code, name`, [code.trim(), name.trim(), resolvedBranchId, address?.trim()]);
    await query(`INSERT INTO audit_trail (action, module, description, user_id, user_name) VALUES ('create','inventory',$1,$2,$3)`, [`Tambah gudang: ${result.rows[0].code} - ${result.rows[0].name}`, req.user.id, req.user.name]);
    res.status(201).json(result.rows[0]);
}));

router.put('/:uuid', requirePermission('inventory:edit'), validateUUID(), asyncHandler(async (req, res) => {
    const { name, address, branch_id, is_active } = req.body;

    // branch_id from frontend may be a UUID -- resolve it to the integer PK
    let resolvedBranchId = undefined;
    if (branch_id !== undefined && branch_id !== null) {
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(branch_id);
        if (isUUID) {
            const branch = await query(`SELECT id FROM branches WHERE uuid = $1`, [branch_id]);
            if (branch.rows.length === 0) return res.status(400).json({ error: 'Branch tidak ditemukan' });
            resolvedBranchId = branch.rows[0].id;
        } else {
            resolvedBranchId = branch_id; // already an integer
        }
    }

    const result = await query(`UPDATE warehouses SET name=COALESCE($1,name), address=COALESCE($2,address), branch_id=COALESCE($3,branch_id), is_active=COALESCE($4,is_active), updated_at=NOW() WHERE uuid=$5 RETURNING uuid, code, name`, [name?.trim(), address?.trim(), resolvedBranchId, is_active, req.params.uuid]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Gudang tidak ditemukan' });
    await query(`INSERT INTO audit_trail (action, module, description, user_id, user_name) VALUES ('update','inventory',$1,$2,$3)`, [`Update gudang: ${result.rows[0].code} - ${result.rows[0].name}`, req.user.id, req.user.name]);
    res.json({ message: 'Gudang berhasil diupdate' });
}));

// Deactivate warehouse (with stock check)
router.put('/:uuid/deactivate', requirePermission('inventory:edit'), validateUUID(), asyncHandler(async (req, res) => {
    const wh = await query(`SELECT id, code, name FROM warehouses WHERE uuid = $1`, [req.params.uuid]);
    if (wh.rows.length === 0) return res.status(404).json({ error: 'Gudang tidak ditemukan' });
    // Check if warehouse has stock
    const stockCheck = await query(`SELECT COALESCE(SUM(qty), 0) as total_stock FROM inventory WHERE warehouse_id = $1 AND qty > 0`, [wh.rows[0].id]);
    if (parseInt(stockCheck.rows[0].total_stock) > 0) {
        return res.status(400).json({ error: `Tidak bisa menonaktifkan gudang. Masih ada stok sebanyak ${stockCheck.rows[0].total_stock} unit di gudang ini. Pindahkan stok terlebih dahulu.` });
    }
    await query(`UPDATE warehouses SET is_active = false, updated_at = NOW() WHERE id = $1`, [wh.rows[0].id]);
    await query(`INSERT INTO audit_trail (action, module, description, user_id, user_name) VALUES ('update','inventory',$1,$2,$3)`, [`Nonaktifkan gudang: ${wh.rows[0].code} - ${wh.rows[0].name}`, req.user.id, req.user.name]);
    res.json({ message: 'Gudang berhasil dinonaktifkan' });
}));

// Reactivate warehouse
router.put('/:uuid/activate', requirePermission('inventory:edit'), validateUUID(), asyncHandler(async (req, res) => {
    const result = await query(`UPDATE warehouses SET is_active = true, updated_at = NOW() WHERE uuid = $1 RETURNING uuid, code, name`, [req.params.uuid]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Gudang tidak ditemukan' });
    await query(`INSERT INTO audit_trail (action, module, description, user_id, user_name) VALUES ('update','inventory',$1,$2,$3)`, [`Aktifkan kembali gudang: ${result.rows[0].code} - ${result.rows[0].name}`, req.user.id, req.user.name]);
    res.json({ message: 'Gudang berhasil diaktifkan kembali' });
}));

// Zones
router.get('/:uuid/zones', requirePermission('inventory:view'), validateUUID(), asyncHandler(async (req, res) => {
    const wh = await query(`SELECT id FROM warehouses WHERE uuid = $1`, [req.params.uuid]);
    if (wh.rows.length === 0) return res.status(404).json({ error: 'Gudang tidak ditemukan' });
    const result = await query(`SELECT uuid, code, name, category FROM warehouse_zones WHERE warehouse_id = $1 ORDER BY code`, [wh.rows[0].id]);
    res.json(result.rows);
}));

router.post('/:uuid/zones', requirePermission('inventory:create'), validateUUID(), asyncHandler(async (req, res) => {
    const wh = await query(`SELECT id FROM warehouses WHERE uuid = $1`, [req.params.uuid]);
    if (wh.rows.length === 0) return res.status(404).json({ error: 'Gudang tidak ditemukan' });
    const { code, name, category } = req.body;
    const result = await query(`INSERT INTO warehouse_zones (warehouse_id, code, name, category) VALUES ($1,$2,$3,$4) RETURNING uuid, code, name`, [wh.rows[0].id, code, name, category]);
    res.status(201).json(result.rows[0]);
}));

module.exports = router;
