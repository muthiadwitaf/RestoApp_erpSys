const router = require('express').Router();
const { query } = require('../../config/db');
const { authenticateToken, requirePermission } = require('../../middleware/auth');
const { validateUUID } = require('../../middleware/validate');
const { asyncHandler } = require('../../utils/helpers');

router.use(authenticateToken);

router.get('/', requirePermission('inventory:view', 'purchasing:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const result = await query(`SELECT uuid, code, name, description, created_at FROM categories WHERE company_id = $1 ORDER BY id`, [companyId]);
    res.json(result.rows);
}));

router.post('/', requirePermission('inventory:create', 'purchasing:create'), asyncHandler(async (req, res) => {
    const { code, name, description } = req.body;
    if (!code || !name) return res.status(400).json({ error: 'Kode dan nama wajib diisi' });
    const existing = await query(`SELECT id FROM categories WHERE code = $1 AND company_id = $2`, [code, req.user.company_id]);
    if (existing.rows.length > 0) return res.status(409).json({ error: 'Kode kategori sudah digunakan' });
    const result = await query(`INSERT INTO categories (code, name, description, company_id) VALUES ($1,$2,$3,$4) RETURNING uuid, code, name`, [code.trim(), name.trim(), description?.trim(), req.user.company_id]);
    res.status(201).json(result.rows[0]);
}));

router.put('/:uuid', requirePermission('inventory:edit', 'purchasing:edit'), validateUUID(), asyncHandler(async (req, res) => {
    const { name, description } = req.body;
    const result = await query(`UPDATE categories SET name=COALESCE($1,name), description=COALESCE($2,description), updated_at=NOW() WHERE uuid=$3 RETURNING uuid`, [name?.trim(), description?.trim(), req.params.uuid]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Kategori tidak ditemukan' });
    res.json({ message: 'Kategori berhasil diupdate' });
}));

router.delete('/:uuid', requirePermission('inventory:delete', 'purchasing:delete'), validateUUID(), asyncHandler(async (req, res) => {
    const result = await query(`DELETE FROM categories WHERE uuid = $1 RETURNING uuid`, [req.params.uuid]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Kategori tidak ditemukan' });
    res.json({ message: 'Kategori berhasil dihapus' });
}));

module.exports = router;
