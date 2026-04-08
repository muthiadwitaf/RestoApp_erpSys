const router = require('express').Router();
const { query, getClient } = require('../../config/db');
const { authenticateToken, requirePermission } = require('../../middleware/auth');
const { asyncHandler, resolveUUID } = require('../../utils/helpers');
const { generateAutoNumber } = require('../../utils/autoNumber');

router.use(authenticateToken);

// ── Bootstrap ─────────────────────
;(async () => {
    try {
        await query(`ALTER TABLE resto_orders ADD COLUMN IF NOT EXISTS session_id INTEGER`);
    } catch (e) {}
})();

// ─── GET /api/resto/orders ───
router.get('/', requirePermission('pos:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const { status, table_id, from, to } = req.query;
    let where = ['o.company_id = $1'];
    let values = [companyId];
    let idx = 2;
    if (status) {
        if (status.includes(',')) {
            where.push(`o.status = ANY($${idx++}::text[])`);
            values.push(status.split(','));
        } else {
            where.push(`o.status = $${idx++}`);
            values.push(status);
        }
    }
    if (table_id) { where.push(`t.uuid = $${idx++}`); values.push(table_id); }
    if (from) { where.push(`o.ordered_at >= $${idx++}`); values.push(from); }
    if (to) { where.push(`o.ordered_at <= $${idx++}::timestamptz + interval '1 day'`); values.push(to); }

    const result = await query(
        `SELECT o.uuid, o.order_number, o.status, o.customer_name, o.guest_count, o.notes,
                o.subtotal, o.discount_pct, o.tax_pct, o.total, o.payment_method,
                o.cash_paid, o.change, o.ordered_at, o.served_at, o.paid_at,
                t.uuid as table_id, t.number as table_number, t.label as table_label,
                u.name as cashier_name, w.name as waiter_name
         FROM resto_orders o
         LEFT JOIN resto_tables t ON o.table_id = t.id
         LEFT JOIN users u ON o.cashier_id = u.id
         LEFT JOIN users w ON o.waiter_id = w.id
         WHERE ${where.join(' AND ')}
         ORDER BY o.ordered_at DESC LIMIT 200`,
        values
    );
    res.json(result.rows);
}));

// ─── POST /api/resto/orders ───
router.post('/', requirePermission('pos:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const { table_id, customer_name, guest_count, notes, branch_id, items } = req.body;
    if (!table_id) return res.status(400).json({ error: 'Meja wajib dipilih' });

    const tableRes = await query(`SELECT id, number FROM resto_tables WHERE uuid=$1 AND company_id=$2`, [table_id, companyId]);
    if (!tableRes.rows.length) return res.status(404).json({ error: 'Meja tidak ditemukan' });
    const tableIntId = tableRes.rows[0].id;

    let branchIntId = null;
    if (branch_id) { branchIntId = await resolveUUID(branch_id, 'branches', query); }

    const branchRes = branchIntId
        ? await query(`SELECT code FROM branches WHERE id=$1`, [branchIntId])
        : { rows: [{ code: 'RST' }] };
    const orderNumber = await generateAutoNumber(branchRes.rows[0]?.code || 'RST', 'RO');

    const client = await getClient();
    try {
        await client.query('BEGIN');

        const orderRes = await client.query(
            `INSERT INTO resto_orders (company_id, branch_id, table_id, order_number, customer_name, guest_count, notes, cashier_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, uuid, order_number, status, ordered_at`,
            [companyId, branchIntId, tableIntId, orderNumber, customer_name || null, guest_count || 1, notes || null, req.user.id]
        );
        const orderId = orderRes.rows[0].id;

        if (items && items.length > 0) {
            // Batch-resolve all menu item UUIDs in one query
            const menuUuids = items.map(i => i.item_id).filter(Boolean);
            const uuidMap = {};
            if (menuUuids.length > 0) {
                const menuRes = await query(
                    `SELECT id, uuid FROM resto_menu_items WHERE uuid = ANY($1::uuid[])`,
                    [menuUuids]
                );
                menuRes.rows.forEach(r => { uuidMap[r.uuid] = r.id; });
            }

            for (const item of items) {
                const itemIntId = item.item_id ? (uuidMap[item.item_id] || null) : null;
                const itemSubtotal = (parseFloat(item.price) || 0) * (parseFloat(item.qty) || 1);
                await client.query(
                    `INSERT INTO resto_order_items (order_id, item_id, item_name, qty, price, subtotal, notes)
                     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
                    [orderId, itemIntId, item.item_name || item.name, item.qty || 1, item.price || 0, itemSubtotal, item.notes || null]
                );
            }
            await recalcOrderTotal(client, orderId);
        }

        // Mark table as occupied
        await client.query(`UPDATE resto_tables SET status='occupied', updated_at=NOW() WHERE id=$1`, [tableIntId]);

        await client.query('COMMIT');
        res.status(201).json(orderRes.rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}));

// ─── GET /api/resto/orders/:uuid ───
router.get('/:uuid', requirePermission('pos:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const orderRes = await query(
        `SELECT o.uuid, o.order_number, o.status, o.customer_name, o.guest_count, o.notes,
                o.subtotal, o.discount_pct, o.tax_pct, o.total, o.payment_method,
                o.cash_paid, o.change, o.ordered_at, o.served_at, o.paid_at,
                t.uuid as table_id, t.number as table_number, t.label as table_label,
                u.name as cashier_name, w.name as waiter_name
         FROM resto_orders o
         LEFT JOIN resto_tables t ON o.table_id = t.id
         LEFT JOIN users u ON o.cashier_id = u.id
         LEFT JOIN users w ON o.waiter_id = w.id
         WHERE o.uuid=$1 AND o.company_id=$2`,
        [req.params.uuid, companyId]
    );
    if (!orderRes.rows.length) return res.status(404).json({ error: 'Pesanan tidak ditemukan' });

    const itemsRes = await query(
        `SELECT oi.uuid, oi.item_name, oi.qty, oi.price, oi.subtotal, oi.notes, oi.status,
                m.uuid as item_id, m.image_url
         FROM resto_order_items oi
         LEFT JOIN resto_menu_items m ON oi.item_id = m.id
         LEFT JOIN resto_orders o ON oi.order_id = o.id
         WHERE o.uuid=$1 AND o.company_id=$2
         ORDER BY oi.created_at`,
        [req.params.uuid, companyId]
    );

    res.json({ ...orderRes.rows[0], items: itemsRes.rows });
}));

// ─── PUT /api/resto/orders/:uuid/items ───
router.put('/:uuid/items', requirePermission('pos:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const { items } = req.body;
    if (!items?.length) return res.status(400).json({ error: 'Items wajib diisi' });

    const orderRes = await query(`SELECT id, status FROM resto_orders WHERE uuid=$1 AND company_id=$2`, [req.params.uuid, companyId]);
    if (!orderRes.rows.length) return res.status(404).json({ error: 'Pesanan tidak ditemukan' });
    if (['paid', 'cancelled'].includes(orderRes.rows[0].status)) return res.status(400).json({ error: 'Pesanan sudah selesai/dibatalkan' });
    const orderId = orderRes.rows[0].id;

    const client = await getClient();
    try {
        await client.query('BEGIN');

        // Batch-resolve all menu item UUIDs in one query
        const menuUuids = items.map(i => i.item_id).filter(Boolean);
        const uuidMap = {};
        if (menuUuids.length > 0) {
            const menuRes = await query(
                `SELECT id, uuid FROM resto_menu_items WHERE uuid = ANY($1::uuid[])`,
                [menuUuids]
            );
            menuRes.rows.forEach(r => { uuidMap[r.uuid] = r.id; });
        }

        for (const item of items) {
            const itemIntId = item.item_id ? (uuidMap[item.item_id] || null) : null;
            const itemSubtotal = (parseFloat(item.price) || 0) * (parseFloat(item.qty) || 1);
            if (item.uuid) {
                await client.query(
                    `UPDATE resto_order_items SET qty=$1, price=$2, subtotal=$3, notes=$4, status=COALESCE($5,status), updated_at=NOW()
                     WHERE uuid=$6 AND order_id=$7`,
                    [item.qty, item.price, itemSubtotal, item.notes || null, item.status, item.uuid, orderId]
                );
            } else {
                await client.query(
                    `INSERT INTO resto_order_items (order_id, item_id, item_name, qty, price, subtotal, notes)
                     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
                    [orderId, itemIntId, item.item_name || item.name, item.qty || 1, item.price || 0, itemSubtotal, item.notes || null]
                );
            }
        }
        await recalcOrderTotal(client, orderId);
        await client.query('COMMIT');

        const updated = await query(
            `SELECT uuid, item_id, item_name, qty, price, subtotal, notes, status FROM resto_order_items WHERE order_id=$1 ORDER BY created_at`,
            [orderId]
        );
        res.json({ items: updated.rows });
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}));

// ─── PUT /api/resto/orders/:uuid/status ───
router.put('/:uuid/status', requirePermission('pos:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const { status } = req.body;
    const validStatuses = ['new', 'cooking', 'ready', 'served', 'paid', 'cancelled'];
    if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Status tidak valid' });

    let extraSets = '';
    if (status === 'served') extraSets = ', served_at=NOW()';
    if (status === 'paid') extraSets = ', paid_at=NOW()';

    const result = await query(
        `UPDATE resto_orders SET status=$1${extraSets}, updated_at=NOW()
         WHERE uuid=$2 AND company_id=$3 RETURNING uuid, status, order_number`,
        [status, req.params.uuid, companyId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Pesanan tidak ditemukan' });

    // Update item statuses in bulk
    const orderIdRes = await query(`SELECT id, table_id FROM resto_orders WHERE uuid=$1`, [req.params.uuid]);
    const orderId = orderIdRes.rows[0].id;
    if (['cooking', 'ready', 'served'].includes(status)) {
        const itemStatus = status === 'cooking' ? 'cooking' : status === 'ready' ? 'ready' : 'served';
        await query(`UPDATE resto_order_items SET status=$1, updated_at=NOW() WHERE order_id=$2 AND status != 'cancelled'`, [itemStatus, orderId]);
    }

    // Release table if paid/cancelled
    if (['paid', 'cancelled'].includes(status) && orderIdRes.rows[0]?.table_id) {
        const otherOrders = await query(
            `SELECT id FROM resto_orders WHERE table_id=$1 AND status NOT IN ('paid','cancelled') AND uuid != $2`,
            [orderIdRes.rows[0].table_id, req.params.uuid]
        );
        if (!otherOrders.rows.length) {
            await query(`UPDATE resto_tables SET status='available', updated_at=NOW() WHERE id=$1`, [orderIdRes.rows[0].table_id]);
        }
    }

    res.json(result.rows[0]);
}));

// ─── PUT /api/resto/orders/:uuid/checkout ───
router.put('/:uuid/checkout', requirePermission('pos:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const cashierId = req.user.id;
    const cashierName = req.user.name || 'Kasir';
    const { payment_method, cash_paid, discount_pct } = req.body;

    const orderRes = await query(
        `SELECT o.id, o.order_number, o.subtotal, o.total, o.table_id, o.branch_id
         FROM resto_orders o WHERE o.uuid=$1 AND o.company_id=$2 AND o.status != 'paid'`,
        [req.params.uuid, companyId]
    );
    if (!orderRes.rows.length) return res.status(404).json({ error: 'Pesanan tidak ditemukan atau sudah dibayar.' });
    const order = orderRes.rows[0];

    const disc = parseFloat(discount_pct) || 0;
    const subtotal = parseFloat(order.subtotal) || 0;
    const total = subtotal - (subtotal * disc / 100);
    const amountPaid = parseFloat(cash_paid) || 0;
    const change = Math.max(0, amountPaid - total);

    const payMethod = payment_method || 'cash';

    const client = await getClient();
    try {
        await client.query('BEGIN');

        // 1. Update Order
        const result = await client.query(
            `UPDATE resto_orders SET status='paid', payment_method=$1, cash_paid=$2, change=$3,
                    discount_pct=$4, total=$5, paid_at=NOW(), cashier_id=$6, updated_at=NOW()
             WHERE id=$7 RETURNING uuid, order_number, total, payment_method, cash_paid, change`,
            [payMethod, amountPaid, change, disc, total, cashierId, order.id]
        );

        await client.query(`UPDATE resto_order_items SET status='served', updated_at=NOW() WHERE order_id=$1`, [order.id]);

        // 2. Audit Trail
        await client.query(
            `INSERT INTO audit_trail (action, module, description, user_id, user_name)
             VALUES ('SALE','pos', $1, $2, $3)`,
            [JSON.stringify({
                order_id: order.order_number,
                payment_method: payMethod,
                amount_paid: amountPaid,
                change: change,
                net_sales: total
            }), cashierId, cashierName]
        );

        // 3. Release table
        if (order.table_id) {
            const otherOrders = await client.query(
                `SELECT id FROM resto_orders WHERE table_id=$1 AND status NOT IN ('paid','cancelled') AND id != $2`,
                [order.table_id, order.id]
            );
            if (!otherOrders.rows.length) {
                await client.query(`UPDATE resto_tables SET status='available', updated_at=NOW() WHERE id=$1`, [order.table_id]);
            }
        }

        await client.query('COMMIT');
        res.json(result.rows[0]);
    } catch (e) {
        await client.query('ROLLBACK');
        console.error("Checkout Error:", e);
        res.status(500).json({ error: 'Gagal memproses pembayaran: ' + e.message });
    } finally {
        client.release();
    }
}));

// ─── DELETE /api/resto/orders/:uuid ───
router.delete('/:uuid', requirePermission('pos:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const cashierId  = req.user.id;
    const cashierName = req.user.name || 'Kasir';

    const orderRes = await query(
        `SELECT id, order_number, table_id, status, total, payment_method, cash_paid, change 
         FROM resto_orders WHERE uuid=$1 AND company_id=$2`, 
        [req.params.uuid, companyId]
    );
    if (!orderRes.rows.length) return res.status(404).json({ error: 'Pesanan tidak ditemukan' });
    const order = orderRes.rows[0];

    const client = await getClient();
    try {
        await client.query('BEGIN');

        if (order.status === 'paid') {
            const refundTotal = parseFloat(order.total) || 0;
            await client.query(
                `INSERT INTO audit_trail (action, module, description, user_id, user_name)
                 VALUES ('REFUND','pos', $1, $2, $3)`,
                [JSON.stringify({
                    order_id: order.order_number,
                    payment_method: order.payment_method, amount: refundTotal
                }), cashierId, cashierName]
            );
        }

        // Void the order
        await client.query(`UPDATE resto_orders SET status='cancelled', updated_at=NOW() WHERE id=$1`, [order.id]);
        await client.query(`UPDATE resto_order_items SET status='cancelled', updated_at=NOW() WHERE order_id=$1`, [order.id]);

        if (order.table_id) {
            const otherOrders = await client.query(
                `SELECT id FROM resto_orders WHERE table_id=$1 AND status NOT IN ('paid','cancelled') AND id != $2`,
                [order.table_id, order.id]
            );
            if (!otherOrders.rows.length) {
                await client.query(`UPDATE resto_tables SET status='available', updated_at=NOW() WHERE id=$1`, [order.table_id]);
            }
        }

        await client.query('COMMIT');
        res.json({ message: order.status === 'paid' ? 'Pesanan berhasil di-refund dan dibatalkan' : 'Pesanan dibatalkan' });
    } catch (e) {
        await client.query('ROLLBACK');
        console.error("Refund/Void Error:", e);
        res.status(500).json({ error: 'Gagal membatalkan pesanan: ' + e.message });
    } finally {
        client.release();
    }
}));

// ─── Helper ───
async function recalcOrderTotal(client, orderId) {
    const sumRes = await client.query(
        `SELECT COALESCE(SUM(subtotal), 0) as subtotal FROM resto_order_items WHERE order_id=$1 AND status != 'cancelled'`,
        [orderId]
    );
    const subtotal = parseFloat(sumRes.rows[0].subtotal) || 0;
    await client.query(
        `UPDATE resto_orders SET subtotal=$1, total=$1 - ($1 * COALESCE(discount_pct,0) / 100), updated_at=NOW() WHERE id=$2`,
        [subtotal, orderId]
    );
}

module.exports = router;
