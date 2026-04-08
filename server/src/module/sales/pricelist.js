const router = require('express').Router();
const { query, getClient } = require('../../config/db');
const { authenticateToken, requirePermission } = require('../../middleware/auth');
const { validateUUID } = require('../../middleware/validate');
const { asyncHandler, resolveUUID } = require('../../utils/helpers');

router.use(authenticateToken);

// GET /sales/pricelist — list all items with sell_price, hpp, price_tiers
router.get('/', requirePermission('sales:view', 'sales:edit', 'sales:manage'), asyncHandler(async (req, res) => {
    const { search, category_id } = req.query;
    const companyId = req.user.company_id;
    let where = ['i.company_id = $1'];
    let values = [companyId];
    let idx = 2;
    if (search) { where.push(`(i.name ILIKE $${idx} OR i.code ILIKE $${idx})`); values.push(`%${search}%`); idx++; }
    if (category_id) { where.push(`i.category_id = $${idx++}`); values.push(category_id); }
    const wc = 'WHERE ' + where.join(' AND ');

    const result = await query(
        `SELECT i.uuid, i.code, i.name, i.sell_price, i.hpp, i.buy_price,
                su.name as uom, c.name as category,
                COALESCE(
                  (SELECT json_agg(json_build_object('uuid', pt.uuid, 'min_qty', pt.min_qty, 'price', pt.price, 'label', pt.label)
                   ORDER BY pt.min_qty)
                   FROM item_price_tiers pt WHERE pt.item_id = i.id), '[]'::json
                ) as price_tiers
         FROM items i
         LEFT JOIN units su ON i.small_uom_id = su.id
         LEFT JOIN categories c ON i.category_id = c.id
         ${wc}
         AND i.is_active = true
         ORDER BY i.code`, values
    );
    res.json(result.rows);
}));

// GET /sales/pricelist/:uuid — detail 1 item
router.get('/:uuid', requirePermission('sales:view', 'sales:edit', 'sales:manage'), validateUUID(), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const result = await query(
        `SELECT i.uuid, i.code, i.name, i.sell_price, i.hpp, i.buy_price,
                su.name as uom, c.name as category,
                COALESCE(
                  (SELECT json_agg(json_build_object('uuid', pt.uuid, 'min_qty', pt.min_qty, 'price', pt.price, 'label', pt.label)
                   ORDER BY pt.min_qty)
                   FROM item_price_tiers pt WHERE pt.item_id = i.id), '[]'::json
                ) as price_tiers
         FROM items i
         LEFT JOIN units su ON i.small_uom_id = su.id
         LEFT JOIN categories c ON i.category_id = c.id
         WHERE i.uuid = $1 AND i.company_id = $2`, [req.params.uuid, companyId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Item tidak ditemukan' });
    res.json(result.rows[0]);
}));

// PUT /sales/pricelist/:uuid — update price_tiers (sell_price auto-synced from base tier)
router.put('/:uuid', requirePermission('sales:edit', 'sales:manage'), validateUUID(), asyncHandler(async (req, res) => {
    const { price_tiers } = req.body;
    const companyId = req.user.company_id;

    // Security: ensure item belongs to this company
    const itemResult = await query(`SELECT id, name FROM items WHERE uuid = $1 AND company_id = $2`, [req.params.uuid, companyId]);
    if (!itemResult.rows.length) return res.status(404).json({ error: 'Item tidak ditemukan' });
    const itemId = itemResult.rows[0].id;
    const itemName = itemResult.rows[0].name;

    if (!Array.isArray(price_tiers) || price_tiers.length === 0) {
        return res.status(400).json({ error: 'price_tiers harus berisi minimal 1 entry' });
    }

    const client = await getClient();
    try {
        await client.query('BEGIN');

        // Replace all tiers for this item
        await client.query(`DELETE FROM item_price_tiers WHERE item_id = $1`, [itemId]);
        let baseTierPrice = null;
        for (const tier of price_tiers) {
            if (!tier.min_qty || tier.price === undefined) continue;
            const minQty = parseInt(tier.min_qty);
            const price = parseFloat(tier.price);
            if (isNaN(minQty) || minQty < 1) return res.status(400).json({ error: 'min_qty harus >= 1' });
            if (isNaN(price) || price < 0) return res.status(400).json({ error: 'Harga tier tidak valid' });
            await client.query(
                `INSERT INTO item_price_tiers (item_id, min_qty, price, label) VALUES ($1, $2, $3, $4)`,
                [itemId, minQty, price, tier.label || null]
            );
            // Track base tier (min_qty=1) to sync sell_price cache
            if (minQty === 1) baseTierPrice = price;
        }

        // Sync items.sell_price cache from base tier (if min_qty=1 tier exists)
        if (baseTierPrice !== null) {
            await client.query(
                `UPDATE items SET sell_price = $1, updated_at = NOW() WHERE id = $2`,
                [baseTierPrice, itemId]
            );
        }

        await client.query('COMMIT');
        await query(
            `INSERT INTO audit_trail (action, module, description, user_id, user_name)
             VALUES ('update', 'sales', $1, $2, $3)`,
            [`Update pricelist ${itemName}`, req.user.id, req.user.name]
        ).catch(() => { });

        res.json({ message: 'Harga berhasil diupdate' });
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}));

module.exports = router;

