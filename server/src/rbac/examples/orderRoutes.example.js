/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * RestoERP — Example: Order Routes with RBAC
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Demonstrates how to use authMiddleware + authorize() on real restaurant routes.
 * Each route is protected by a specific permission — NO hardcoded role checks.
 *
 * Permission mapping:
 *   POST   /orders           → create_order      (cashier, admin)
 *   GET    /orders           → view_orders        (cashier, kitchen, manager, admin)
 *   PUT    /orders/:id       → update_order       (cashier, admin)
 *   PATCH  /orders/:id/status→ update_order_status(kitchen_staff, admin)
 *   POST   /orders/:id/pay  → process_payment    (cashier, admin)
 *   DELETE /orders/:id       → manage_orders      (admin only)
 */

const router = require('express').Router();
const { authMiddleware, authorize } = require('../rbac');
const { asyncHandler } = require('../utils/helpers');

// ── All order routes require authentication ──────────────────────────────────
router.use(authMiddleware);

// ── POST /api/orders — Create a new order ────────────────────────────────────
// Allowed: cashier, admin (anyone with 'create_order' permission)
router.post('/', authorize('create_order'), asyncHandler(async (req, res) => {
    // TODO: Replace with actual order creation logic
    const { table_id, items, notes } = req.body;

    res.status(201).json({
        message: 'Order created successfully',
        order: {
            table_id,
            items,
            notes,
            status: 'pending',
            created_by: req.user.name,
        },
    });
}));

// ── GET /api/orders — List all orders ────────────────────────────────────────
// Allowed: cashier, kitchen_staff, manager, admin
router.get('/', authorize('view_orders'), asyncHandler(async (req, res) => {
    // TODO: Replace with actual order listing logic
    res.json({
        message: 'Order list retrieved',
        orders: [],
    });
}));

// ── PUT /api/orders/:id — Update an existing order ───────────────────────────
// Allowed: cashier, admin (anyone with 'update_order' permission)
router.put('/:id', authorize('update_order'), asyncHandler(async (req, res) => {
    // TODO: Replace with actual order update logic
    res.json({
        message: `Order ${req.params.id} updated`,
    });
}));

// ── PATCH /api/orders/:id/status — Update order preparation status ───────────
// Allowed: kitchen_staff, admin
router.patch('/:id/status', authorize('update_order_status'), asyncHandler(async (req, res) => {
    const { status } = req.body; // e.g. 'preparing', 'ready', 'served'

    res.json({
        message: `Order ${req.params.id} status updated to ${status}`,
    });
}));

// ── POST /api/orders/:id/pay — Process payment for an order ──────────────────
// Allowed: cashier, admin
router.post('/:id/pay', authorize('process_payment'), asyncHandler(async (req, res) => {
    const { payment_method, amount } = req.body;

    res.json({
        message: `Payment processed for order ${req.params.id}`,
        payment: {
            method: payment_method,
            amount,
            status: 'completed',
        },
    });
}));

// ── DELETE /api/orders/:id — Delete/void an order ────────────────────────────
// Allowed: admin only (requires 'manage_orders' — the full management permission)
router.delete('/:id', authorize('manage_orders'), asyncHandler(async (req, res) => {
    res.json({
        message: `Order ${req.params.id} deleted/voided`,
    });
}));

module.exports = router;
