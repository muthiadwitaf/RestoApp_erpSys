const router = require('express').Router();
const { query } = require('../../config/db');
const { authenticateToken, requirePermission } = require('../../middleware/auth');
const { validateUUID } = require('../../middleware/validate');
const { asyncHandler, resolveUUID } = require('../../utils/helpers');

router.use(authenticateToken);

router.get('/', requirePermission('inventory:view', 'pos:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const result = await query(
        `SELECT b.uuid, b.code, b.name, b.price, b.is_active,
       COALESCE(json_agg(json_build_object('item_id',i.uuid,'qty',bi.qty,'item_name',i.name,'uom_name',su.name,'sell_price',i.sell_price) ORDER BY i.name) FILTER (WHERE bi.id IS NOT NULL), '[]') as items
     FROM bundles b
     JOIN bundle_items bi ON b.id = bi.bundle_id
     JOIN items i ON bi.item_id = i.id AND i.company_id = $1
     LEFT JOIN units su ON i.small_uom_id = su.id
     GROUP BY b.id ORDER BY b.id`, [companyId]
    );
    res.json(result.rows);
}));

router.post('/', requirePermission('inventory:create'), asyncHandler(async (req, res) => {
    const { code, name, price, items: bundleItems } = req.body;
    if (!code || !name) return res.status(400).json({ error: 'Kode dan nama wajib diisi' });
    const result = await query(`INSERT INTO bundles (code, name, price) VALUES ($1,$2,$3) RETURNING id, uuid, code, name`, [code.trim(), name.trim(), price || 0]);
    for (const item of (bundleItems || [])) {
        const rItem = await resolveUUID(item.item_id, 'items', query);
        await query(`INSERT INTO bundle_items (bundle_id, item_id, qty) VALUES ($1,$2,$3)`, [result.rows[0].id, rItem, item.qty]);
    }
    await query(`INSERT INTO audit_trail (action, module, description, user_id, user_name) VALUES ('create','inventory',$1,$2,$3)`, [`Tambah bundle: ${result.rows[0].code} - ${result.rows[0].name}`, req.user.id, req.user.name]).catch(() => { });
    res.status(201).json({ uuid: result.rows[0].uuid });
}));

router.put('/:uuid', requirePermission('inventory:edit'), validateUUID(), asyncHandler(async (req, res) => {
    const { name, price, is_active, items: bundleItems } = req.body;
    const b = await query(`SELECT id FROM bundles WHERE uuid = $1`, [req.params.uuid]);
    if (b.rows.length === 0) return res.status(404).json({ error: 'Bundle tidak ditemukan' });
    await query(`UPDATE bundles SET name=COALESCE($1,name), price=COALESCE($2,price), is_active=COALESCE($3,is_active), updated_at=NOW() WHERE id=$4`, [name?.trim(), price, is_active, b.rows[0].id]);
    if (bundleItems !== undefined) {
        await query(`DELETE FROM bundle_items WHERE bundle_id = $1`, [b.rows[0].id]);
        for (const item of (bundleItems || [])) {
            const rItem = await resolveUUID(item.item_id, 'items', query);
            await query(`INSERT INTO bundle_items (bundle_id, item_id, qty) VALUES ($1,$2,$3)`, [b.rows[0].id, rItem, item.qty]);
        }
    }
    await query(`INSERT INTO audit_trail (action, module, description, user_id, user_name) VALUES ('update','inventory',$1,$2,$3)`, [`Update bundle: ${req.params.uuid}`, req.user.id, req.user.name]).catch(() => { });
    res.json({ message: 'Bundle berhasil diupdate' });
}));

router.delete('/:uuid', requirePermission('inventory:delete'), validateUUID(), asyncHandler(async (req, res) => {
    const b = await query(`SELECT id FROM bundles WHERE uuid = $1`, [req.params.uuid]);
    if (b.rows.length === 0) return res.status(404).json({ error: 'Bundle tidak ditemukan' });
    await query(`DELETE FROM bundle_items WHERE bundle_id = $1`, [b.rows[0].id]);
    await query(`DELETE FROM bundles WHERE id = $1`, [b.rows[0].id]);
    await query(`INSERT INTO audit_trail (action, module, description, user_id, user_name) VALUES ('delete','inventory',$1,$2,$3)`, [`Hapus bundle: ${req.params.uuid}`, req.user.id, req.user.name]).catch(() => { });
    res.json({ message: 'Bundle berhasil dihapus' });
}));

module.exports = router;
