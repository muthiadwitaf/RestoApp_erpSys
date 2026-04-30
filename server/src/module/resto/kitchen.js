const router = require('express').Router();
const { query } = require('../../config/db');
const { requirePermission } = require('../../middleware/auth');
const { asyncHandler } = require('../../utils/helpers');

// GET /api/resto/kitchen — all active orders for kitchen display
router.get('/', requirePermission('pos:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const result = await query(
        `SELECT o.uuid, o.order_number, o.status, o.customer_name, o.guest_count, o.notes, o.ordered_at,
                o.total, o.subtotal, o.service_pct, o.tax_pct,
                (SELECT COALESCE(SUM(amount), 0) FROM resto_order_payments WHERE order_id = o.id) as total_paid,
                t.uuid as table_id, t.number as table_number, t.label as table_label,
                json_agg(json_build_object(
                    'uuid', oi.uuid, 'item_name', oi.item_name, 'qty', oi.qty,
                    'notes', oi.notes, 'status', oi.status
                ) ORDER BY oi.created_at) as items
         FROM resto_orders o
         LEFT JOIN resto_tables t ON o.table_id = t.id
         LEFT JOIN resto_order_items oi ON oi.order_id = o.id
         WHERE o.company_id=$1 AND (o.status IN ('new','cooking','ready','served') OR (o.status = 'paid' AND EXISTS (SELECT 1 FROM resto_order_items oi2 WHERE oi2.order_id = o.id AND oi2.status NOT IN ('served','cancelled'))))
         GROUP BY o.id, o.uuid, o.order_number, o.status, o.customer_name,
                  o.guest_count, o.notes, o.ordered_at, t.uuid, t.number, t.label
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

        const unservedItems = await query(
            `SELECT COUNT(*) as cnt FROM resto_order_items WHERE order_id=$1 AND status NOT IN ('served','cancelled')`,
            [orderId]
        );
        if (parseInt(unservedItems.rows[0].cnt) === 0) {
            // All items are served. Check if order is paid. If so, release the table.
            const checkOrder = await query(`SELECT table_id, status FROM resto_orders WHERE id=$1`, [orderId]);
            if (checkOrder.rows.length && checkOrder.rows[0].status === 'paid' && checkOrder.rows[0].table_id) {
                const tableId = checkOrder.rows[0].table_id;
                const otherOrders = await query(
                    `SELECT id FROM resto_orders WHERE table_id=$1 AND status NOT IN ('paid','cancelled') AND id != $2`,
                    [tableId, orderId]
                );
                // check if any other paid orders on same table still have unserved items
                const otherPaidUnserved = await query(
                    `SELECT o.id FROM resto_orders o JOIN resto_order_items oi ON oi.order_id = o.id WHERE o.table_id=$1 AND (o.status='paid' OR o.status='served') AND oi.status NOT IN ('served','cancelled') AND o.id != $2`,
                    [tableId, orderId]
                );
                
                if (!otherOrders.rows.length && !otherPaidUnserved.rows.length) {
                    await query(`UPDATE resto_tables SET status='available', updated_at=NOW() WHERE id=$1`, [tableId]);
                }
            }
        }
    }

    res.json(result.rows[0]);
}));

module.exports = router;
