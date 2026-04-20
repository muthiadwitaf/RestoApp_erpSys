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
        `SELECT uuid, category, name, description, price, image_url, is_available, sort_order,
                labor_cost, overhead_cost, recipe_cost, cogs, created_at
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
    const { name, description, category, price, image_url, is_available, sort_order, labor_cost, overhead_cost } = req.body;
    if (!name) return res.status(400).json({ error: 'Nama menu wajib diisi' });
    if (!price && price !== 0) return res.status(400).json({ error: 'Harga wajib diisi' });

    const l_cost = parseFloat(labor_cost) || 0;
    const o_cost = parseFloat(overhead_cost) || 0;

    const result = await query(
        `INSERT INTO resto_menu_items (company_id, name, description, category, price, image_url, is_available, sort_order, labor_cost, overhead_cost, cogs)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING uuid, name, description, category, price, image_url, is_available, sort_order, labor_cost, overhead_cost, recipe_cost, cogs`,
        [companyId, name, description || null, category || 'Umum', price, image_url || null,
         is_available !== undefined ? is_available : true, sort_order || 0, l_cost, o_cost, (l_cost + o_cost)]
    );
    res.status(201).json(result.rows[0]);
}));

// PUT /api/resto/menu/:uuid — update menu item
router.put('/:uuid', requirePermission('pos:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const { name, description, category, price, image_url, is_available, sort_order, labor_cost, overhead_cost } = req.body;

    const sets = [];
    const values = [];
    let idx = 1;

    if (name !== undefined) { sets.push(`name=$${idx++}`); values.push(name); }
    if (description !== undefined) { sets.push(`description=$${idx++}`); values.push(description); }
    if (category !== undefined) { sets.push(`category=$${idx++}`); values.push(category); }
    if (price !== undefined) { sets.push(`price=$${idx++}`); values.push(price); }
    if (image_url !== undefined) { sets.push(`image_url=$${idx++}`); values.push(image_url); }
    if (is_available !== undefined) { sets.push(`is_available=$${idx++}`); values.push(is_available); }
    if (sort_order !== undefined) { sets.push(`sort_order=$${idx++}`); values.push(sort_order); }
    
    if (labor_cost !== undefined || overhead_cost !== undefined) {
        if (labor_cost !== undefined) { sets.push(`labor_cost=$${idx++}`); values.push(parseFloat(labor_cost) || 0); }
        if (overhead_cost !== undefined) { sets.push(`overhead_cost=$${idx++}`); values.push(parseFloat(overhead_cost) || 0); }
        // Update COGS (formula: BBB + BTK + BOP)
        sets.push(`cogs = recipe_cost + COALESCE(labor_cost,0) + COALESCE(overhead_cost,0)`);
    }

    if (sets.length === 0) return res.json({ message: 'Tidak ada perubahan' });

    sets.push(`updated_at=NOW()`);
    values.push(req.params.uuid, companyId);
    
    const result = await query(
        `UPDATE resto_menu_items SET ${sets.join(', ')}
         WHERE uuid=$${idx++} AND company_id=$${idx}
         RETURNING uuid, name, description, category, price, image_url, is_available, sort_order, labor_cost, overhead_cost, recipe_cost, cogs`,
        values
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
