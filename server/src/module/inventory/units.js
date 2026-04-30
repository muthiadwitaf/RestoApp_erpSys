const router = require('express').Router();
const { query } = require('../../config/db');
const { requirePermission } = require('../../middleware/auth');
const { validateUUID } = require('../../middleware/validate');
const { asyncHandler } = require('../../utils/helpers');

router.get('/', requirePermission('inventory:view', 'purchasing:view'), asyncHandler(async (req, res) => {
    const result = await query(`SELECT uuid, code, name, description, is_active FROM units WHERE company_id = $1 ORDER BY id`, [req.user.company_id]);
    res.json(result.rows);
}));

router.post('/', requirePermission('inventory:create', 'purchasing:create'), asyncHandler(async (req, res) => {
    const { code, name, description } = req.body;
    if (!code || !name) return res.status(400).json({ error: 'Kode dan nama wajib diisi' });
    const result = await query(`INSERT INTO units (code, name, description, company_id) VALUES ($1,$2,$3,$4) RETURNING uuid, code, name`, [code.trim(), name.trim(), description?.trim(), req.user.company_id]);
    res.status(201).json(result.rows[0]);
}));

router.put('/:uuid', requirePermission('inventory:edit', 'purchasing:edit'), validateUUID(), asyncHandler(async (req, res) => {
    const { name, description, is_active } = req.body;
    const result = await query(`UPDATE units SET name=COALESCE($1,name), description=COALESCE($2,description), is_active=COALESCE($3,is_active), updated_at=NOW() WHERE uuid=$4 RETURNING uuid`, [name?.trim(), description?.trim(), is_active, req.params.uuid]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Unit tidak ditemukan' });
    res.json({ message: 'Unit berhasil diupdate' });
}));

module.exports = router;
