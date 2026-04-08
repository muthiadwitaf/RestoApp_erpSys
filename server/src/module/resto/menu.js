const router = require('express').Router();
const { query } = require('../../config/db');
const { authenticateToken, requirePermission } = require('../../middleware/auth');
const { asyncHandler } = require('../../utils/helpers');

router.use(authenticateToken);

// GET /api/resto/menu — list all menu items
router.get('/', requirePermission('pos:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const { category, available } = req.query;
    let where = ['company_id = $1'];
    let values = [companyId];
    let idx = 2;
    if (category) { where.push(`category = $${idx++}`); values.push(category); }
    if (available !== undefined) { where.push(`is_available = $${idx++}`); values.push(available === 'true'); }

    const result = await query(
        `SELECT uuid, category, name, description, price, image_url, is_available, sort_order, created_at
         FROM resto_menu_items WHERE ${where.join(' AND ')}
         ORDER BY sort_order, category, name`,
        values
    );
    res.json(result.rows);
}));

// GET /api/resto/menu/categories — list distinct categories
router.get('/categories', requirePermission('pos:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const result = await query(
        `SELECT DISTINCT category FROM resto_menu_items WHERE company_id = $1 AND category IS NOT NULL ORDER BY category`,
        [companyId]
    );
    res.json(result.rows.map(r => r.category));
}));

// POST /api/resto/menu — create menu item
router.post('/', requirePermission('pos:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const { name, description, category, price, image_url, is_available, sort_order } = req.body;
    if (!name) return res.status(400).json({ error: 'Nama menu wajib diisi' });
    if (!price && price !== 0) return res.status(400).json({ error: 'Harga wajib diisi' });

    const result = await query(
        `INSERT INTO resto_menu_items (company_id, name, description, category, price, image_url, is_available, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING uuid, name, description, category, price, image_url, is_available, sort_order`,
        [companyId, name, description || null, category || 'Umum', price, image_url || null,
         is_available !== undefined ? is_available : true, sort_order || 0]
    );
    res.status(201).json(result.rows[0]);
}));

// PUT /api/resto/menu/:uuid — update menu item
router.put('/:uuid', requirePermission('pos:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const { name, description, category, price, image_url, is_available, sort_order } = req.body;

    const result = await query(
        `UPDATE resto_menu_items SET
            name=COALESCE($1,name), description=COALESCE($2,description),
            category=COALESCE($3,category), price=COALESCE($4,price),
            image_url=COALESCE($5,image_url), is_available=COALESCE($6,is_available),
            sort_order=COALESCE($7,sort_order), updated_at=NOW()
         WHERE uuid=$8 AND company_id=$9
         RETURNING uuid, name, description, category, price, image_url, is_available, sort_order`,
        [name, description, category, price, image_url, is_available, sort_order, req.params.uuid, companyId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Menu tidak ditemukan' });
    res.json(result.rows[0]);
}));

// DELETE /api/resto/menu/:uuid
router.delete('/:uuid', requirePermission('pos:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const result = await query(
        `DELETE FROM resto_menu_items WHERE uuid=$1 AND company_id=$2 RETURNING uuid`,
        [req.params.uuid, companyId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Menu tidak ditemukan' });
    res.json({ message: 'Menu dihapus' });
}));

module.exports = router;
