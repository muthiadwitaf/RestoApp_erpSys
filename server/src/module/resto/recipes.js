const router = require('express').Router();
const { query } = require('../../config/db');
const { authenticateToken, requirePermission } = require('../../middleware/auth');
const { asyncHandler, resolveUUID } = require('../../utils/helpers');

router.use(authenticateToken);

// Helper function to recalculate and update recipe_cost and cogs for a menu item
async function updateMenuRecipeCost(menuId) {
    // recipe_cost (BBB) is sum of (qty * buy_price) of all ingredients
    const result = await query(
        `SELECT SUM(r.qty * i.buy_price) as bbb
         FROM menu_recipes r
         JOIN items i ON r.item_id = i.id
         WHERE r.menu_item_id = $1`,
        [menuId]
    );
    const bbb = parseFloat(result.rows[0].bbb) || 0;
    
    // Update resto_menu_items
    await query(
        `UPDATE resto_menu_items
         SET recipe_cost = $1, cogs = $1 + COALESCE(labor_cost,0) + COALESCE(overhead_cost,0), updated_at = NOW()
         WHERE id = $2`,
        [bbb, menuId]
    );
}

// GET /api/resto/menu/:menu_uuid/recipes
router.get('/:menu_uuid/recipes', requirePermission('pos:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const menuRes = await query(`SELECT id FROM resto_menu_items WHERE uuid=$1 AND company_id=$2`, [req.params.menu_uuid, companyId]);
    if (!menuRes.rows.length) return res.status(404).json({ error: 'Menu tidak ditemukan' });
    const menuId = menuRes.rows[0].id;

    const result = await query(
        `SELECT r.uuid, r.qty,
                i.uuid as item_uuid, i.name as item_name, i.code as item_code, i.buy_price,
                u.uuid as unit_uuid, u.name as unit_name,
                (r.qty * i.buy_price) as subtotal
         FROM menu_recipes r
         JOIN items i ON r.item_id = i.id
         LEFT JOIN units u ON r.unit_id = u.id
         WHERE r.menu_item_id = $1
         ORDER BY i.name`,
        [menuId]
    );
    res.json(result.rows);
}));

// POST /api/resto/menu/:menu_uuid/recipes
router.post('/:menu_uuid/recipes', requirePermission('pos:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const { item_uuid, qty, unit_uuid } = req.body;
    
    if (!item_uuid || !qty) return res.status(400).json({ error: 'Bahan baku dan kuantitas wajib diisi' });

    const menuRes = await query(`SELECT id FROM resto_menu_items WHERE uuid=$1 AND company_id=$2`, [req.params.menu_uuid, companyId]);
    if (!menuRes.rows.length) return res.status(404).json({ error: 'Menu tidak ditemukan' });
    const menuId = menuRes.rows[0].id;

    const itemIntId = await resolveUUID(item_uuid, 'items', query);
    const unitIntId = unit_uuid ? await resolveUUID(unit_uuid, 'units', query) : null;

    // Check if item exists in this company
    const itemCheck = await query(`SELECT id FROM items WHERE id=$1 AND company_id=$2`, [itemIntId, companyId]);
    if (!itemCheck.rows.length) return res.status(404).json({ error: 'Bahan baku tidak ditemukan di perusahaan ini' });

    // Insert recipe item
    const result = await query(
        `INSERT INTO menu_recipes (menu_item_id, item_id, qty, unit_id)
         VALUES ($1, $2, $3, $4)
         RETURNING uuid, qty`,
        [menuId, itemIntId, qty, unitIntId]
    );

    await updateMenuRecipeCost(menuId);

    res.status(201).json(result.rows[0]);
}));

// PUT /api/resto/menu/:menu_uuid/recipes/:uuid
router.put('/:menu_uuid/recipes/:uuid', requirePermission('pos:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const { qty, unit_uuid } = req.body;
    
    if (!qty) return res.status(400).json({ error: 'Kuantitas wajib diisi' });

    const menuRes = await query(`SELECT id FROM resto_menu_items WHERE uuid=$1 AND company_id=$2`, [req.params.menu_uuid, companyId]);
    if (!menuRes.rows.length) return res.status(404).json({ error: 'Menu tidak ditemukan' });
    const menuId = menuRes.rows[0].id;

    const unitIntId = unit_uuid ? await resolveUUID(unit_uuid, 'units', query) : null;

    const result = await query(
        `UPDATE menu_recipes SET qty=$1, unit_id=$2, updated_at=NOW()
         WHERE uuid=$3 AND menu_item_id=$4
         RETURNING uuid, qty`,
        [qty, unitIntId, req.params.uuid, menuId]
    );
    
    if (!result.rows.length) return res.status(404).json({ error: 'Komposisi resep tidak ditemukan' });

    await updateMenuRecipeCost(menuId);

    res.json(result.rows[0]);
}));

// DELETE /api/resto/menu/:menu_uuid/recipes/:uuid
router.delete('/:menu_uuid/recipes/:uuid', requirePermission('pos:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const menuRes = await query(`SELECT id FROM resto_menu_items WHERE uuid=$1 AND company_id=$2`, [req.params.menu_uuid, companyId]);
    if (!menuRes.rows.length) return res.status(404).json({ error: 'Menu tidak ditemukan' });
    const menuId = menuRes.rows[0].id;

    const result = await query(
        `DELETE FROM menu_recipes WHERE uuid=$1 AND menu_item_id=$2 RETURNING uuid`,
        [req.params.uuid, menuId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Komposisi resep tidak ditemukan' });

    await updateMenuRecipeCost(menuId);

    res.json({ message: 'Komposisi dihapus' });
}));

module.exports = router;
