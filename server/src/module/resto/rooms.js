const router = require('express').Router();
const { query } = require('../../config/db');
const { requirePermission } = require('../../middleware/auth');
const { asyncHandler } = require('../../utils/helpers');

// GET /api/resto/rooms
router.get('/', requirePermission('pos:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const result = await query(
        `SELECT uuid, name, description, sort_order, is_active, created_at
         FROM resto_rooms WHERE company_id = $1 ORDER BY sort_order, name`,
        [companyId]
    );
    res.json(result.rows);
}));

// POST /api/resto/rooms
router.post('/', requirePermission('pos:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const { name, description, sort_order } = req.body;
    if (!name) return res.status(400).json({ error: 'Nama ruangan wajib diisi' });
    const result = await query(
        `INSERT INTO resto_rooms (company_id, name, description, sort_order)
         VALUES ($1,$2,$3,$4) RETURNING uuid, name, description, sort_order`,
        [companyId, name, description || null, sort_order || 0]
    );
    res.status(201).json(result.rows[0]);
}));

// PUT /api/resto/rooms/:uuid
router.put('/:uuid', requirePermission('pos:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const { name, description, sort_order, is_active } = req.body;
    const result = await query(
        `UPDATE resto_rooms SET name=COALESCE($1,name), description=COALESCE($2,description),
                sort_order=COALESCE($3,sort_order), is_active=COALESCE($4,is_active), updated_at=NOW()
         WHERE uuid=$5 AND company_id=$6 RETURNING uuid, name, description, sort_order, is_active`,
        [name, description, sort_order, is_active, req.params.uuid, companyId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Ruangan tidak ditemukan' });
    res.json(result.rows[0]);
}));

// DELETE /api/resto/rooms/:uuid
router.delete('/:uuid', requirePermission('pos:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const result = await query(
        `DELETE FROM resto_rooms WHERE uuid=$1 AND company_id=$2 RETURNING uuid`,
        [req.params.uuid, companyId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Ruangan tidak ditemukan' });
    res.json({ message: 'Ruangan dihapus' });
}));

module.exports = router;
