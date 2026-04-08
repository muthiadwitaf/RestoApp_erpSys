const router = require('express').Router();
const { query } = require('../../config/db');
const { authenticateToken, requirePermission } = require('../../middleware/auth');
const { asyncHandler } = require('../../utils/helpers');

router.use(authenticateToken);

// GET /api/resto/kitchen — all active orders for kitchen display
router.get('/', requirePermission('pos:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const result = await query(
        `SELECT o.uuid, o.order_number, o.status, o.customer_name, o.guest_count, o.notes, o.ordered_at,
                t.number as table_number, t.label as table_label,
                json_agg(json_build_object(
                    'uuid', oi.uuid, 'item_name', oi.item_name, 'qty', oi.qty,
                    'notes', oi.notes, 'status', oi.status
                ) ORDER BY oi.created_at) as items
         FROM resto_orders o
         LEFT JOIN resto_tables t ON o.table_id = t.id
         LEFT JOIN resto_order_items oi ON oi.order_id = o.id
         WHERE o.company_id=$1 AND o.status IN ('new','cooking','ready')
         GROUP BY o.id, o.uuid, o.order_number, o.status, o.customer_name,
                  o.guest_count, o.notes, o.ordered_at, t.number, t.label
         ORDER BY o.ordered_at ASC`,
        [companyId]
    );
    res.json(result.rows);
}));

// PUT /api/resto/kitchen/:itemUuid/status — update single item status
router.put('/:itemUuid/status', requirePermission('pos:view'), asyncHandler(async (req, res) => {
    const { status } = req.body;
    const validStatuses = ['cooking', 'ready', 'served', 'cancelled'];
    if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Status tidak valid' });

    const result = await query(
        `UPDATE resto_order_items SET status=$1, updated_at=NOW() WHERE uuid=$2 RETURNING uuid, status, item_name`,
        [status, req.params.itemUuid]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Item tidak ditemukan' });

    // Check if all items in order are ready => auto-update order status
    const orderItemRes = await query(`SELECT order_id FROM resto_order_items WHERE uuid=$1`, [req.params.itemUuid]);
    if (orderItemRes.rows.length) {
        const orderId = orderItemRes.rows[0].order_id;
        const pendingItems = await query(
            `SELECT COUNT(*) as cnt FROM resto_order_items WHERE order_id=$1 AND status NOT IN ('ready','served','cancelled')`,
            [orderId]
        );
        if (parseInt(pendingItems.rows[0].cnt) === 0) {
            await query(`UPDATE resto_orders SET status='ready', updated_at=NOW() WHERE id=$1 AND status IN ('new','cooking')`, [orderId]);
        }
    }

    res.json(result.rows[0]);
}));

module.exports = router;
