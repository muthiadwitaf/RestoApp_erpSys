// src/module/sales/kitchen.js
const router = require('express').Router();
const { query } = require('../../config/db');
const { authenticateToken, requirePermission } = require('../../middleware/auth');
const { asyncHandler } = require('../../utils/helpers');

router.use(authenticateToken);

// Get pending orders for kitchen display
router.get('/pending', requirePermission('kitchen:view'), asyncHandler(async (req, res) => {
  const companyId = req.user.company_id;
  const result = await query(
    `SELECT so.uuid, so.number, so.status, so.kitchen_status, so.created_at,
            json_agg(json_build_object(
                'item_id', i.uuid,
                'name', i.name,
                'qty', sol.qty,
                'notes', sol.notes
            )) AS items
     FROM sales_orders so
     JOIN sales_order_lines sol ON sol.so_id = so.id
     JOIN items i ON i.id = sol.item_id
     WHERE so.company_id = $1 AND so.kitchen_status = 'PENDING'
     GROUP BY so.id`
    , [companyId]
  );
  res.json(result.rows);
}));

// Update kitchen status: START_COOKING or DONE
router.patch('/:uuid/status', requirePermission('kitchen:update'), asyncHandler(async (req, res) => {
  const { status } = req.body; // expected: 'COOKING' or 'READY'
  if (!['COOKING', 'READY'].includes(status)) {
    return res.status(400).json({ error: 'Invalid kitchen status' });
  }
  const result = await query(
    `UPDATE sales_orders SET kitchen_status = $1, updated_at = NOW() WHERE uuid = $2 RETURNING *`,
    [status, req.params.uuid]
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Order not found' });
  res.json(result.rows[0]);
}));

module.exports = router;
