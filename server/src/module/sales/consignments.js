const router = require('express').Router();
const { query } = require('../../config/db');
const { authenticateToken, requirePermission } = require('../../middleware/auth');
const { validateUUID } = require('../../middleware/validate');
const { asyncHandler, resolveUUID } = require('../../utils/helpers');

router.use(authenticateToken);

router.get('/', requirePermission('inventory:view', 'pos:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const result = await query(
        `SELECT c.uuid, c.qty, c.sold_qty, c.start_date, c.commission_pct, c.status, c.notes,
       s.uuid as supplier_id, s.name as supplier_name,
       i.uuid as item_id, i.name as item_name, i.code as item_code, i.sell_price,
       w.uuid as warehouse_id, w.name as warehouse_name
     FROM consignments c JOIN suppliers s ON c.supplier_id = s.id JOIN items i ON c.item_id = i.id
     LEFT JOIN warehouses w ON c.warehouse_id = w.id
     LEFT JOIN branches br ON w.branch_id = br.id
     WHERE br.company_id = $1 ORDER BY c.id`, [companyId]
    );
    res.json(result.rows);
}));

router.post('/', requirePermission('inventory:create'), asyncHandler(async (req, res) => {
    const { supplier_id, item_id, qty, commission_pct, warehouse_id, notes } = req.body;
    const rSupplier = await resolveUUID(supplier_id, 'suppliers', query);
    const rItem = await resolveUUID(item_id, 'items', query);
    const rWarehouse = warehouse_id ? await resolveUUID(warehouse_id, 'warehouses', query) : null;
    const result = await query(
        `INSERT INTO consignments (supplier_id, item_id, qty, start_date, commission_pct, warehouse_id, notes)
     VALUES ($1,$2,$3,CURRENT_DATE,$4,$5,$6) RETURNING uuid`,
        [rSupplier, rItem, qty, commission_pct || 0, rWarehouse, notes]
    );
    const itemInfo = await query(`SELECT name, code FROM items WHERE id = $1`, [rItem]);
    await query(`INSERT INTO audit_trail (action, module, description, user_id, user_name) VALUES ('create','inventory',$1,$2,$3)`,
        [`Tambah Konsinyasi: ${itemInfo.rows[0]?.code} - ${itemInfo.rows[0]?.name} (${qty} unit)`, req.user.id, req.user.name]);
    res.status(201).json(result.rows[0]);
}));

router.put('/:uuid/sell', requirePermission('inventory:edit'), validateUUID(), asyncHandler(async (req, res) => {
    const { qty_sold } = req.body;
    if (!qty_sold || qty_sold <= 0) return res.status(400).json({ error: 'Qty terjual harus lebih dari 0' });

    // Check remaining stock to prevent negative
    const check = await query(`SELECT qty, sold_qty FROM consignments WHERE uuid = $1 AND status = 'active'`, [req.params.uuid]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Konsinyasi tidak ditemukan atau sudah selesai' });
    const remaining = check.rows[0].qty - check.rows[0].sold_qty;
    if (qty_sold > remaining) return res.status(400).json({ error: `Qty melebihi sisa stok konsinyasi (sisa: ${remaining})` });

    const result = await query(
        `UPDATE consignments SET sold_qty = sold_qty + $1, status = CASE WHEN sold_qty + $1 >= qty THEN 'completed' ELSE status END, updated_at=NOW()
     WHERE uuid = $2 AND status = 'active' RETURNING uuid, sold_qty, qty, status`,
        [qty_sold, req.params.uuid]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Konsinyasi tidak ditemukan' });
    await query(`INSERT INTO audit_trail (action, module, description, user_id, user_name) VALUES ('update','inventory',$1,$2,$3)`,
        [`Catat Penjualan Konsinyasi: ${qty_sold} unit`, req.user.id, req.user.name]);
    res.json(result.rows[0]);
}));

router.put('/:uuid', requirePermission('inventory:edit'), validateUUID(), asyncHandler(async (req, res) => {
    const { supplier_id, item_id, qty, commission_pct, warehouse_id, notes } = req.body;
    const c = await query(`SELECT id FROM consignments WHERE uuid = $1`, [req.params.uuid]);
    if (c.rows.length === 0) return res.status(404).json({ error: 'Konsinyasi tidak ditemukan' });
    const rSupplier = supplier_id ? await resolveUUID(supplier_id, 'suppliers', query) : null;
    const rItem = item_id ? await resolveUUID(item_id, 'items', query) : null;
    const rWarehouse = warehouse_id ? await resolveUUID(warehouse_id, 'warehouses', query) : null;
    await query(
        `UPDATE consignments SET supplier_id=COALESCE($1,supplier_id), item_id=COALESCE($2,item_id), qty=COALESCE($3,qty), commission_pct=COALESCE($4,commission_pct), warehouse_id=COALESCE($5,warehouse_id), notes=COALESCE($6,notes), updated_at=NOW() WHERE id=$7`,
        [rSupplier, rItem, qty, commission_pct, rWarehouse, notes, c.rows[0].id]
    );
    await query(`INSERT INTO audit_trail (action, module, description, user_id, user_name) VALUES ('update','inventory',$1,$2,$3)`,
        [`Update Konsinyasi: ${req.params.uuid}`, req.user.id, req.user.name]);
    res.json({ message: 'Konsinyasi berhasil diupdate' });
}));

router.delete('/:uuid', requirePermission('inventory:delete'), validateUUID(), asyncHandler(async (req, res) => {
    const result = await query(`DELETE FROM consignments WHERE uuid = $1 RETURNING uuid`, [req.params.uuid]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Konsinyasi tidak ditemukan' });
    await query(`INSERT INTO audit_trail (action, module, description, user_id, user_name) VALUES ('delete','inventory',$1,$2,$3)`,
        [`Hapus Konsinyasi: ${req.params.uuid}`, req.user.id, req.user.name]);
    res.json({ message: 'Konsinyasi berhasil dihapus' });
}));

module.exports = router;
