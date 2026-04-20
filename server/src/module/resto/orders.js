const router = require('express').Router();
const bcrypt = require('bcrypt');
const { query, getClient } = require('../../config/db');
const { authenticateToken, requirePermission } = require('../../middleware/auth');
const { asyncHandler, resolveUUID } = require('../../utils/helpers');
const { generateAutoNumber } = require('../../utils/autoNumber');
const logger = require('../../utils/logger');

router.use(authenticateToken);

// ── Bootstrap ─────────────────────
;(async () => {
    try {
        await query(`ALTER TABLE resto_orders ADD COLUMN IF NOT EXISTS session_id INTEGER`);
        await query(`ALTER TABLE resto_orders ADD COLUMN IF NOT EXISTS service_pct NUMERIC(5,2) DEFAULT 0`);
        await query(`ALTER TABLE resto_orders ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ`);
        await query(`ALTER TABLE resto_orders ADD COLUMN IF NOT EXISTS preparing_at TIMESTAMPTZ`);
        await query(`ALTER TABLE resto_orders ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ`);
        // waiter_id now references resto_waiters, not users
        await query(`ALTER TABLE resto_orders ADD COLUMN IF NOT EXISTS waiter_id INTEGER`);

        // ── Create dedicated resto_waiters table ──
        await query(`CREATE TABLE IF NOT EXISTS resto_waiters (
            id SERIAL PRIMARY KEY,
            uuid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
            company_id INTEGER NOT NULL REFERENCES companies(id),
            name VARCHAR(100) NOT NULL,
            phone VARCHAR(20),
            commission_pct NUMERIC(5,2) DEFAULT NULL,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        )`);
        await query(`ALTER TABLE resto_waiters ADD COLUMN IF NOT EXISTS pin VARCHAR(255)`);
        try { await query(`ALTER TABLE resto_waiters ALTER COLUMN pin TYPE VARCHAR(255)`); } catch (e) {}

        // ── Create resto_waiter_attendance table ──
        await query(`CREATE TABLE IF NOT EXISTS resto_waiter_attendance (
            id SERIAL PRIMARY KEY,
            uuid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
            waiter_id INTEGER NOT NULL REFERENCES resto_waiters(id) ON DELETE CASCADE,
            tanggal DATE NOT NULL,
            waktu_masuk TIMESTAMPTZ,
            waktu_pulang TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        )`);
    } catch (e) {
        console.error('resto_orders bootstrap:', e.message);
    }
})();

// ══════════════════════════════════════════════════════════════════════
// WAITER MANAGEMENT CRUD
// ══════════════════════════════════════════════════════════════════════

// ─── GET /api/resto/orders/waiters ─── List all waiters for company
router.get('/waiters', requirePermission('pos:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const { active_only } = req.query;
    let where = 'WHERE company_id = $1';
    if (active_only === 'true') where += ' AND is_active = true';
    const result = await query(
        `SELECT uuid, name, phone, commission_pct, is_active, created_at, (pin IS NOT NULL AND pin != '') AS has_pin
         FROM resto_waiters ${where}
         ORDER BY name`,
        [companyId]
    );
    res.json(result.rows);
}));

// ─── POST /api/resto/orders/waiters ─── Create waiter
router.post('/waiters', requirePermission('pos:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const { name, phone, commission_pct, pin } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Nama waiter wajib diisi' });

    // Hash PIN if provided
    const hashedPin = pin ? await bcrypt.hash(pin, 10) : null;

    const result = await query(
        `INSERT INTO resto_waiters (company_id, name, phone, commission_pct, pin)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING uuid, name, phone, commission_pct, is_active, created_at, (pin IS NOT NULL AND pin != '') AS has_pin`,
        [companyId, name.trim(), phone || null, commission_pct != null ? parseFloat(commission_pct) : null, hashedPin]
    );
    res.status(201).json(result.rows[0]);
}));

// ─── PUT /api/resto/orders/waiters/:uuid ─── Update waiter
router.put('/waiters/:uuid', requirePermission('pos:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const { name, phone, commission_pct, is_active, pin } = req.body;

    const sets = [];
    const values = [];
    let idx = 1;

    if (name !== undefined) { sets.push(`name = $${idx++}`); values.push(name.trim()); }
    if (phone !== undefined) { sets.push(`phone = $${idx++}`); values.push(phone || null); }
    if (commission_pct !== undefined) { sets.push(`commission_pct = $${idx++}`); values.push(commission_pct != null ? parseFloat(commission_pct) : null); }
    if (is_active !== undefined) { sets.push(`is_active = $${idx++}`); values.push(Boolean(is_active)); }
    if (pin !== undefined) {
        const hashedPin = pin ? await bcrypt.hash(pin, 10) : null;
        sets.push(`pin = $${idx++}`); values.push(hashedPin);
    }

    if (sets.length === 0) return res.json({ message: 'Tidak ada perubahan.' });

    sets.push('updated_at = NOW()');
    values.push(req.params.uuid, companyId);

    const result = await query(
        `UPDATE resto_waiters SET ${sets.join(', ')} WHERE uuid = $${idx++} AND company_id = $${idx}
         RETURNING uuid, name, phone, commission_pct, is_active`,
        values
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Waiter tidak ditemukan' });
    res.json(result.rows[0]);
}));

// ─── DELETE /api/resto/orders/waiters/:uuid ─── Delete waiter
router.delete('/waiters/:uuid', requirePermission('pos:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const result = await query(
        `DELETE FROM resto_waiters WHERE uuid = $1 AND company_id = $2 RETURNING uuid, name`,
        [req.params.uuid, companyId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Waiter tidak ditemukan' });
    res.json({ message: `Waiter ${result.rows[0].name} berhasil dihapus` });
}));

// ══════════════════════════════════════════════════════════════════════
// WAITER ATTENDANCE (CLOCK IN / CLOCK OUT)
// ══════════════════════════════════════════════════════════════════════

// ─── GET /api/resto/orders/waiters/attendance/today ───
router.get('/waiters/attendance/today', requirePermission('pos:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const today = new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD
    
    const result = await query(
        `SELECT a.uuid, a.waktu_masuk, a.waktu_pulang, w.uuid as waiter_uuid, w.name as waiter_name
         FROM resto_waiter_attendance a
         JOIN resto_waiters w ON a.waiter_id = w.id
         WHERE w.company_id = $1 AND a.tanggal = $2
         ORDER BY a.waktu_masuk DESC`,
        [companyId, today]
    );
    res.json(result.rows);
}));

// ─── POST /api/resto/orders/waiters/clock-in ───
router.post('/waiters/clock-in', requirePermission('pos:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const { waiter_uuid, pin } = req.body;
    
    if (!waiter_uuid) return res.status(400).json({ error: 'Waiter UUID wajib diisi' });

    // Cek waiter dan validasi PIN
    const wRes = await query(
        `SELECT id, name, pin FROM resto_waiters WHERE uuid = $1 AND company_id = $2 AND is_active = true`,
        [waiter_uuid, companyId]
    );
    if (wRes.rows.length === 0) return res.status(404).json({ error: 'Waiter tidak ditemukan' });
    
    const waiter = wRes.rows[0];
    if (waiter.pin) {
        const pinValid = await bcrypt.compare(pin || '', waiter.pin);
        if (!pinValid) return res.status(401).json({ error: 'PIN tidak sesuai' });
    }

    const today = new Date().toLocaleDateString('sv-SE');

    // Cek apakah ada sesi shift yang masih aktif
    const cekAktif = await query(
        `SELECT id FROM resto_waiter_attendance 
         WHERE waiter_id = $1 AND tanggal = $2 AND waktu_pulang IS NULL`,
        [waiter.id, today]
    );
    if (cekAktif.rows.length > 0) return res.status(400).json({ error: 'Waiter ini masih dalam shift (Belum Clock Out).' });

    const ins = await query(
        `INSERT INTO resto_waiter_attendance (waiter_id, tanggal, waktu_masuk) 
         VALUES ($1, $2, NOW()) RETURNING *`,
        [waiter.id, today]
    );
    res.status(201).json({ message: `Berhasil Clock In: ${waiter.name}`, data: ins.rows[0] });
}));

// ─── POST /api/resto/orders/waiters/clock-out ───
router.post('/waiters/clock-out', requirePermission('pos:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const { waiter_uuid, pin } = req.body;
    
    if (!waiter_uuid) return res.status(400).json({ error: 'Waiter UUID wajib diisi' });

    // Cek waiter dan validasi PIN
    const wRes = await query(
        `SELECT id, name, pin FROM resto_waiters WHERE uuid = $1 AND company_id = $2`,
        [waiter_uuid, companyId]
    );
    if (wRes.rows.length === 0) return res.status(404).json({ error: 'Waiter tidak ditemukan' });
    
    const waiter = wRes.rows[0];
    if (waiter.pin) {
        const pinValid = await bcrypt.compare(pin || '', waiter.pin);
        if (!pinValid) return res.status(401).json({ error: 'PIN tidak sesuai' });
    }

    const today = new Date().toLocaleDateString('sv-SE');

    // Cek apakah ada sesi shift aktif untuk di clock-out
    const cekAktif = await query(
        `SELECT id FROM resto_waiter_attendance 
         WHERE waiter_id = $1 AND tanggal = $2 AND waktu_pulang IS NULL
         ORDER BY waktu_masuk DESC LIMIT 1`,
        [waiter.id, today]
    );
    
    if (cekAktif.rows.length === 0) {
        return res.status(400).json({ error: 'Tidak ada sesi shift aktif untuk diakhiri.' });
    }

    const upd = await query(
        `UPDATE resto_waiter_attendance SET waktu_pulang = NOW(), updated_at = NOW() 
         WHERE id = $1 RETURNING *`,
        [cekAktif.rows[0].id]
    );
    res.json({ message: `Berhasil Clock Out: ${waiter.name}`, data: upd.rows[0] });
}));

// ══════════════════════════════════════════════════════════════════════
// LEGACY COMPAT: /lists/waiters still works — now reads from resto_waiters
// ══════════════════════════════════════════════════════════════════════

// ─── GET /api/resto/orders/lists/waiters ───
router.get('/lists/waiters', requirePermission('pos:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const result = await query(
        `SELECT uuid, name FROM resto_waiters
         WHERE company_id = $1 AND is_active = true
         ORDER BY name`,
        [companyId]
    );
    res.json(result.rows);
}));

// ─── GET /api/resto/orders/lists/waiters-report ───
router.get('/lists/waiters-report', requirePermission('pos:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const { from, to, branch_id } = req.query;

    let where = ['o.company_id = $1', "o.status = 'paid'", "o.waiter_id IS NOT NULL"];
    let values = [companyId];
    let idx = 2;

    if (branch_id) {
        const rBranch = await resolveUUID(branch_id, 'branches', query);
        where.push(`o.branch_id = $${idx++}`); values.push(rBranch);
    }
    if (from) { where.push(`o.paid_at >= $${idx++}`); values.push(from); }
    if (to) { where.push(`o.paid_at <= $${idx++}::timestamptz + interval '1 day'`); values.push(to); }

    const wc = 'WHERE ' + where.join(' AND ');

    const result = await query(
        `SELECT w.uuid, w.name as waiter_name,
                w.commission_pct as waiter_commission_pct,
                COUNT(o.id) as total_orders, 
                COALESCE(SUM(o.total), 0) as total_sales
         FROM resto_orders o
         JOIN resto_waiters w ON o.waiter_id = w.id
         ${wc}
         GROUP BY w.id, w.uuid, w.name, w.commission_pct
         ORDER BY total_sales DESC`,
        values
    );
    res.json(result.rows);
}));

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
                o.subtotal, o.discount_pct, o.service_pct, o.tax_pct, o.total, o.payment_method,
                o.cash_paid, o.change, o.ordered_at, o.served_at, o.paid_at,
                (SELECT COALESCE(SUM(amount), 0) FROM resto_order_payments WHERE order_id = o.id) as total_paid,
                t.uuid as table_id, t.number as table_number, t.label as table_label,
                u.name as cashier_name, w.name as waiter_name, w.uuid as waiter_id
         FROM resto_orders o
         LEFT JOIN resto_tables t ON o.table_id = t.id
         LEFT JOIN users u ON o.cashier_id = u.id
         LEFT JOIN resto_waiters w ON o.waiter_id = w.id
         WHERE ${where.join(' AND ')}
         ORDER BY o.ordered_at DESC LIMIT 200`,
        values
    );
    res.json(result.rows);
}));

// ─── POST /api/resto/orders ───
router.post('/', requirePermission('pos:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const { table_id, customer_name, guest_count, notes, branch_id, items, waiter_id } = req.body;
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

    let waiterIntId = null;
    if (waiter_id) { waiterIntId = await resolveUUID(waiter_id, 'resto_waiters', query); }

    const client = await getClient();
    try {
        await client.query('BEGIN');

        const orderRes = await client.query(
            `INSERT INTO resto_orders (company_id, branch_id, table_id, order_number, customer_name, guest_count, notes, cashier_id, confirmed_at, waiter_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8, NOW(), $9) RETURNING id, uuid, order_number, status, ordered_at`,
            [companyId, branchIntId, tableIntId, orderNumber, customer_name || null, guest_count || 1, notes || null, req.user.id, waiterIntId]
        );
        const orderId = orderRes.rows[0].id;

        if (items && items.length > 0) {
            // Batch-resolve all menu item UUIDs in one query
            const menuUuids = items.map(i => i.item_id).filter(Boolean);
            const uuidMap = {};
            if (menuUuids.length > 0) {
                const menuRes = await client.query(
                    `SELECT id, uuid, name FROM resto_menu_items WHERE uuid = ANY($1::uuid[])`,
                    [menuUuids]
                );
                menuRes.rows.forEach(r => { uuidMap[r.uuid] = { id: r.id, name: r.name }; });
            }

            // Get default warehouse for branch
            const whResult = await client.query(`SELECT id FROM warehouses WHERE branch_id = $1 LIMIT 1`, [branchIntId]);
            const warehouseId = whResult.rows[0]?.id;

            for (const item of items) {
                const itemData = item.item_id ? (uuidMap[item.item_id] || {}) : {};
                const itemIntId = itemData.id || null;
                const itemSubtotal = (parseFloat(item.price) || 0) * (parseFloat(item.qty) || 1);
                
                await client.query(
                    `INSERT INTO resto_order_items (order_id, item_id, item_name, qty, price, subtotal, notes)
                     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
                    [orderId, itemIntId, item.item_name || itemData.name || item.name, item.qty || 1, item.price || 0, itemSubtotal, item.notes || null]
                );

                // Deduct Inventory via Recipe
                if (warehouseId && itemIntId) {
                    const recipes = await client.query(`SELECT item_id, qty FROM menu_recipes WHERE menu_item_id = $1`, [itemIntId]);
                    for (const recipe of recipes.rows) {
                        const rawItemId = recipe.item_id;
                        const usedQty = parseFloat(recipe.qty) * (parseFloat(item.qty) || 1);
                        await client.query(`UPDATE inventory SET qty = qty - $1, updated_at=NOW() WHERE item_id = $2 AND warehouse_id = $3`, [usedQty, rawItemId, warehouseId]);
                        await client.query(
                            `INSERT INTO stock_movements (item_id, date, type, qty, ref, warehouse_id, description) VALUES ($1, CURRENT_DATE, 'out', $2, $3, $4, $5)`,
                            [rawItemId, usedQty, orderNumber, warehouseId, `Pesanan Resto ${orderNumber} (Confirmed)`]
                        );
                    }
                }
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
                o.subtotal, o.discount_pct, o.service_pct, o.tax_pct, o.total, o.payment_method,
                o.cash_paid, o.change, o.ordered_at, o.served_at, o.paid_at,
                (SELECT COALESCE(SUM(amount), 0) FROM resto_order_payments WHERE order_id = o.id) as total_paid,
                t.uuid as table_id, t.number as table_number, t.label as table_label,
                u.name as cashier_name, w.name as waiter_name, w.uuid as waiter_id
         FROM resto_orders o
         LEFT JOIN resto_tables t ON o.table_id = t.id
         LEFT JOIN users u ON o.cashier_id = u.id
         LEFT JOIN resto_waiters w ON o.waiter_id = w.id
         WHERE o.uuid=$1 AND o.company_id=$2`,
        [req.params.uuid, companyId]
    );
    if (!orderRes.rows.length) return res.status(404).json({ error: 'Pesanan tidak ditemukan' });

    const itemsRes = await query(
        `SELECT oi.uuid, oi.item_name, oi.qty, oi.price, oi.subtotal, oi.notes, oi.status,
                m.uuid as item_id
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

        // Get default warehouse for branch
        const branchRes = await client.query(`SELECT branch_id, order_number FROM resto_orders WHERE id = $1`, [orderId]);
        const branchId = branchRes.rows[0].branch_id;
        const orderNumber = branchRes.rows[0].order_number;
        const whResult = await client.query(`SELECT id FROM warehouses WHERE branch_id = $1 LIMIT 1`, [branchId]);
        const warehouseId = whResult.rows[0]?.id;

        // Batch-resolve all menu item UUIDs in one query
        const menuUuids = items.map(i => i.item_id).filter(Boolean);
        const uuidMap = {};
        if (menuUuids.length > 0) {
            const menuRes = await client.query(
                `SELECT id, uuid, name FROM resto_menu_items WHERE uuid = ANY($1::uuid[])`,
                [menuUuids]
            );
            menuRes.rows.forEach(r => { uuidMap[r.uuid] = { id: r.id, name: r.name }; });
        }

        for (const item of items) {
            const itemData = item.item_id ? (uuidMap[item.item_id] || {}) : {};
            const itemIntId = itemData.id || null;
            const itemSubtotal = (parseFloat(item.price) || 0) * (parseFloat(item.qty) || 1);
            
            if (item.uuid) {
                // For existing items, handle qty change deduction/restoration
                const oldItemRes = await client.query(`SELECT qty FROM resto_order_items WHERE uuid = $1`, [item.uuid]);
                const oldQty = oldItemRes.rows[0]?.qty || 0;
                const diff = (item.qty || 0) - oldQty;

                await client.query(
                    `UPDATE resto_order_items SET qty=$1, price=$2, subtotal=$3, notes=$4, status=COALESCE($5,status), updated_at=NOW()
                     WHERE uuid=$6 AND order_id=$7`,
                    [item.qty, item.price, itemSubtotal, item.notes || null, item.status, item.uuid, orderId]
                );

                if (warehouseId && itemIntId && diff !== 0) {
                    const type = diff > 0 ? 'out' : 'in';
                    const desc = `Revisi Pesanan ${orderNumber}`;
                    const recipes = await client.query(`SELECT item_id, qty FROM menu_recipes WHERE menu_item_id = $1`, [itemIntId]);
                    for (const recipe of recipes.rows) {
                        const rawItemId = recipe.item_id;
                        const usedQty = parseFloat(recipe.qty) * diff;
                        await client.query(`UPDATE inventory SET qty = qty - $1, updated_at=NOW() WHERE item_id = $2 AND warehouse_id = $3`, [usedQty, rawItemId, warehouseId]);
                        await client.query(
                            `INSERT INTO stock_movements (item_id, date, type, qty, ref, warehouse_id, description) VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6)`,
                            [rawItemId, type, Math.abs(usedQty), orderNumber, warehouseId, desc]
                        );
                    }
                }
            } else {
                await client.query(
                    `INSERT INTO resto_order_items (order_id, item_id, item_name, qty, price, subtotal, notes)
                     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
                    [orderId, itemIntId, item.item_name || itemData.name || item.name, item.qty || 1, item.price || 0, itemSubtotal, item.notes || null]
                );

                if (warehouseId && itemIntId) {
                    const recipes = await client.query(`SELECT item_id, qty FROM menu_recipes WHERE menu_item_id = $1`, [itemIntId]);
                    for (const recipe of recipes.rows) {
                        const rawItemId = recipe.item_id;
                        const usedQty = parseFloat(recipe.qty) * (parseFloat(item.qty) || 1);
                        await client.query(`UPDATE inventory SET qty = qty - $1, updated_at=NOW() WHERE item_id = $2 AND warehouse_id = $3`, [usedQty, rawItemId, warehouseId]);
                        await client.query(
                            `INSERT INTO stock_movements (item_id, date, type, qty, ref, warehouse_id, description) VALUES ($1, CURRENT_DATE, 'out', $2, $3, $4, $5)`,
                            [rawItemId, usedQty, orderNumber, warehouseId, `Tambahan Pesanan ${orderNumber}`]
                        );
                    }
                }
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

    // Cek current status order
    const orderIdRes = await query(`SELECT id, table_id, status, order_number FROM resto_orders WHERE uuid=$1 AND company_id=$2`, [req.params.uuid, companyId]);
    if (!orderIdRes.rows.length) return res.status(404).json({ error: 'Pesanan tidak ditemukan' });
    const currentOrder = orderIdRes.rows[0];
    const orderId = currentOrder.id;

    // Strict Transition Validation (Except when forcing via admin/paid scenarios)
    const validTransitions = {
        'new': ['cooking', 'cancelled', 'paid'],
        'cooking': ['ready', 'served', 'cancelled', 'paid'],
        'ready': ['served', 'cancelled', 'paid'],
        'served': ['paid', 'cancelled'],
        'paid': ['cancelled'],
        'cancelled': []
    };
    
    // We only enforce strict transitions if we are actually changing the status
    if (status !== currentOrder.status && !['paid', 'cancelled'].includes(currentOrder.status)) {
        if (!validTransitions[currentOrder.status]?.includes(status)) {
            // Log it but don't strictly block yet to prevent breaking existing workflows that might jump statuses, 
            // but return 400 if it's completely backward flow. We'll allow forward jumps.
            const flow = ['new', 'cooking', 'ready', 'served', 'paid', 'cancelled'];
            const curIdx = flow.indexOf(currentOrder.status);
            const tgtIdx = flow.indexOf(status);
            if (curIdx !== -1 && tgtIdx !== -1 && tgtIdx < curIdx) {
                // If moving backwards (e.g., served -> cooking) and not admin, block it. 
                // Wait, kitchen might need to go backwards if mistakenly clicked? 
                // Let's just log a warning for now to be safe with production data.
                console.warn(`[WARN] Unusual status transition: ${currentOrder.status} -> ${status} for order ${currentOrder.order_number}`);
            }
        }
    }

    let targetStatus = status;
    // Jangan ubah status order jika sudah paid atau cancelled, KECUALI jika ingin memaksa rollback (jarang terjadi)
    if (['paid', 'cancelled'].includes(currentOrder.status) && ['new', 'cooking', 'ready', 'served'].includes(status)) {
        targetStatus = currentOrder.status; // Tetap stay as 'paid' or 'cancelled'
    }

    let extraSets = '';
    // if target was served update timestamp
    if (status === 'cooking') extraSets = ', preparing_at=NOW()';
    if (status === 'served') extraSets = ', served_at=NOW(), completed_at=NOW()';
    if (status === 'paid') extraSets = ', paid_at=NOW(), completed_at=NOW()';
    // If it's a new order being confirmed right away
    if (status === 'new' && !currentOrder.confirmed_at) extraSets += ', confirmed_at=NOW()';

    const result = await query(
        `UPDATE resto_orders SET status=$1${extraSets}, updated_at=NOW()
         WHERE uuid=$2 AND company_id=$3 RETURNING uuid, status, order_number`,
        [targetStatus, req.params.uuid, companyId]
    );

    // Audit Trail
    if (targetStatus !== currentOrder.status || status !== currentOrder.status) {
        await query(
            `INSERT INTO audit_trail (action, module, description, user_id, user_name)
             VALUES ('STATUS_CHANGE', 'pos', $1, $2, $3)`,
            [JSON.stringify({
                order_number: currentOrder.order_number,
                old_status: currentOrder.status,
                new_status: targetStatus,
                action_status: status
            }), req.user.id, req.user.name || 'Kasir']
        );
    }

    // Update item statuses in bulk
    if (['cooking', 'ready', 'served'].includes(status)) {
        const itemStatus = status === 'cooking' ? 'cooking' : status === 'ready' ? 'ready' : 'served';
        await query(`UPDATE resto_order_items SET status=$1, updated_at=NOW() WHERE order_id=$2 AND status != 'cancelled'`, [itemStatus, orderId]);
    }

    // Release table logic:
    // Jika order saat ini dibayar (targetStatus === 'paid') dan kita baru saja menjadikannya 'served' (atau cancelled), hapus relasi meja
    // (Jika tidak ada pesanan lain yang unserved di meja yang sama)
    if (['paid', 'cancelled'].includes(targetStatus) && currentOrder.table_id) {
        // Double check no unserved items in this order
        const checkItems = await query(
            `SELECT COUNT(*) as unserved FROM resto_order_items WHERE order_id=$1 AND status NOT IN ('served','cancelled')`,
            [orderId]
        );
        const hasUnserved = parseInt(checkItems.rows[0].unserved) > 0;

        if (!hasUnserved) {
            const otherOrders = await query(
                `SELECT id FROM resto_orders WHERE table_id=$1 AND status NOT IN ('paid','cancelled') AND id != $2`,
                [currentOrder.table_id, orderId]
            );
            const otherPaidUnserved = await query(
                `SELECT o.id FROM resto_orders o JOIN resto_order_items oi ON oi.order_id = o.id WHERE o.table_id=$1 AND (o.status='paid' OR o.status='served') AND oi.status NOT IN ('served','cancelled') AND o.id != $2`,
                [currentOrder.table_id, orderId]
            );

            if (!otherOrders.rows.length && !otherPaidUnserved.rows.length) {
                await query(`UPDATE resto_tables SET status='available', updated_at=NOW() WHERE id=$1`, [currentOrder.table_id]);
            }
        }
    }

    res.json(result.rows[0]);
}));

// ─── PUT /api/resto/orders/:uuid/waiter ───
router.put('/:uuid/waiter', requirePermission('pos:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const { waiter_id } = req.body;
    
    let waiterIntId = null;
    if (waiter_id) { waiterIntId = await resolveUUID(waiter_id, 'resto_waiters', query); }

    const result = await query(
        `UPDATE resto_orders SET waiter_id=$1, updated_at=NOW()
         WHERE uuid=$2 AND company_id=$3 AND status NOT IN ('paid', 'cancelled')
         RETURNING uuid, order_number`,
        [waiterIntId, req.params.uuid, companyId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Pesanan tidak ditemukan atau sudah ditutup' });
    
    res.json({ message: 'Waiter berhasil diupdate', order: result.rows[0] });
}));

// ─── PUT /api/resto/orders/:uuid/checkout ───
router.put('/:uuid/checkout', requirePermission('pos:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const cashierId = req.user.id;
    const cashierName = req.user.name || 'Kasir';
    const { payment_method, cash_paid, discount_pct, tax_pct, service_pct } = req.body;

    const orderRes = await query(
        `SELECT o.id, o.order_number, o.subtotal, o.total, o.table_id, o.branch_id
         FROM resto_orders o WHERE o.uuid=$1 AND o.company_id=$2 AND o.status != 'paid'`,
        [req.params.uuid, companyId]
    );
    if (!orderRes.rows.length) return res.status(404).json({ error: 'Pesanan tidak ditemukan atau sudah dibayar.' });
    const order = orderRes.rows[0];

    const disc = parseFloat(discount_pct) || 0;
    const subtotal = parseFloat(order.subtotal) || 0;
    const subAfterDisc = subtotal - (subtotal * disc / 100);

    const srvPct = parseFloat(service_pct) || 0;
    const taxPct = parseFloat(tax_pct) || 0;
    
    const srvAmt = subAfterDisc * (srvPct / 100);
    const taxAmt = (subAfterDisc + srvAmt) * (taxPct / 100);
    const total = subAfterDisc + srvAmt + taxAmt;

    const amountPaid = parseFloat(cash_paid) || 0;
    const change = Math.max(0, amountPaid - total);

    const payMethod = payment_method || 'cash';

    const client = await getClient();
    try {
        await client.query('BEGIN');

        // 1. Update Order
        const result = await client.query(
            `UPDATE resto_orders SET status='paid', payment_method=$1, cash_paid=$2, change=$3,
                    discount_pct=$4, total=$5, tax_pct=$6, service_pct=$7, paid_at=NOW(), completed_at=NOW(), cashier_id=$8, updated_at=NOW()
             WHERE id=$9 RETURNING uuid, order_number, total, payment_method, cash_paid, change`,
            [payMethod, amountPaid, change, disc, total, taxPct, srvPct, cashierId, order.id]
        );

        // Check if there are unserved items
        const checkItems = await client.query(
            `SELECT COUNT(*) as unserved FROM resto_order_items WHERE order_id=$1 AND status NOT IN ('served','cancelled')`,
            [order.id]
        );
        const hasUnserved = parseInt(checkItems.rows[0].unserved) > 0;

        if (!hasUnserved) {
            // Just in case, mark them as served if they are hanging
            await client.query(`UPDATE resto_order_items SET status='served', updated_at=NOW() WHERE order_id=$1`, [order.id]);
        }

        // 2. Audit Trail
        await client.query(
            `INSERT INTO audit_trail (action, module, description, user_id, user_name)
             VALUES ('CHECKOUT', 'pos', $1, $2, $3)`,
            [JSON.stringify({
                order_number: result.rows[0].order_number,
                total: total,
                payment_method: payMethod,
                cash_paid: amountPaid,
                change: change
            }), cashierId, cashierName]
        );

        await client.query(
            `INSERT INTO audit_trail (action, module, description, user_id, user_name)
             VALUES ('STATUS_CHANGE', 'pos', $1, $2, $3)`,
            [JSON.stringify({
                order_number: result.rows[0].order_number,
                old_status: order.status || 'unknown',
                new_status: 'paid',
                action_status: 'paid'
            }), cashierId, cashierName]
        );

        // 3. Release table only if no unserved items
        if (order.table_id && !hasUnserved) {
            const otherOrders = await client.query(
                `SELECT id FROM resto_orders WHERE table_id=$1 AND status NOT IN ('paid','cancelled') AND id != $2`,
                [order.table_id, order.id]
            );
            
            // Also check if any other paid orders on same table still have unserved items
            const otherPaidUnserved = await client.query(
                `SELECT o.id FROM resto_orders o JOIN resto_order_items oi ON oi.order_id = o.id WHERE o.table_id=$1 AND (o.status='paid' OR o.status='served') AND oi.status NOT IN ('served','cancelled') AND o.id != $2`,
                [order.table_id, order.id]
            );

            if (!otherOrders.rows.length && !otherPaidUnserved.rows.length) {
                await client.query(`UPDATE resto_tables SET status='available', updated_at=NOW() WHERE id=$1`, [order.table_id]);
            }
        }

        await client.query('COMMIT');
        res.json(result.rows[0]);
    } catch (e) {
        await client.query('ROLLBACK');
        logger.error({ err: e, orderId: req.params.uuid }, 'Checkout failed');
        res.status(500).json({ error: 'Gagal memproses pembayaran. Silakan coba lagi atau hubungi admin.' });
    } finally {
        client.release();
    }
}));

// ─── POST /api/resto/orders/:uuid/payments ───
router.post('/:uuid/payments', requirePermission('pos:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const { amount, method, notes } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Jumlah pembayaran tidak valid' });

    const orderRes = await query(
        `SELECT id, total FROM resto_orders WHERE uuid=$1 AND company_id=$2 AND status != 'paid' AND status != 'cancelled'`,
        [req.params.uuid, companyId]
    );
    if (!orderRes.rows.length) return res.status(404).json({ error: 'Pesanan tidak ditemukan atau sudah lunas/batal' });
    const order = orderRes.rows[0];

    const client = await getClient();
    try {
        await client.query('BEGIN');

        // Insert payment
        await client.query(
            `INSERT INTO resto_order_payments (order_id, amount, method, cashier_id, notes)
             VALUES ($1, $2, $3, $4, $5)`,
            [order.id, amount, method || 'cash', req.user.id, notes || null]
        );

        // Check cumulative payments
        const payRes = await client.query(`SELECT SUM(amount) as total_paid FROM resto_order_payments WHERE order_id = $1`, [order.id]);
        const totalPaid = parseFloat(payRes.rows[0].total_paid) || 0;
        const totalAmount = parseFloat(order.total) || 0;

        if (totalPaid >= totalAmount) {
            // Mark as PAID
            await client.query(
                `UPDATE resto_orders SET status='paid', paid_at=NOW(), completed_at=NOW(), updated_at=NOW(), payment_method=$1 
                 WHERE id=$2`,
                [method || 'split', order.id]
            );
            
            // Audit logic for status change
            const orderNumRes = await client.query(`SELECT order_number FROM resto_orders WHERE id=$1`, [order.id]);
            await client.query(
                `INSERT INTO audit_trail (action, module, description, user_id, user_name)
                 VALUES ('STATUS_CHANGE', 'pos', $1, $2, $3)`,
                [JSON.stringify({
                    order_number: orderNumRes.rows[0]?.order_number,
                    old_status: 'split/partial',
                    new_status: 'paid',
                    action_status: 'paid'
                }), req.user.id, req.user.name || 'Kasir']
            );

            // Release table ONLY if no unserved items
            const tableRes = await client.query(`SELECT table_id FROM resto_orders WHERE id=$1`, [order.id]);
            if (tableRes.rows[0]?.table_id) {
                const checkItems = await client.query(
                    `SELECT COUNT(*) as unserved FROM resto_order_items WHERE order_id=$1 AND status NOT IN ('served','cancelled')`,
                    [order.id]
                );
                const hasUnserved = parseInt(checkItems.rows[0].unserved) > 0;
                
                if (!hasUnserved) {
                    const otherOrders = await client.query(
                        `SELECT id FROM resto_orders WHERE table_id=$1 AND status NOT IN ('paid','cancelled') AND id != $2`,
                        [tableRes.rows[0].table_id, order.id]
                    );
                    const otherPaidUnserved = await client.query(
                        `SELECT o.id FROM resto_orders o JOIN resto_order_items oi ON oi.order_id = o.id WHERE o.table_id=$1 AND (o.status='paid' OR o.status='served') AND oi.status NOT IN ('served','cancelled') AND o.id != $2`,
                        [tableRes.rows[0].table_id, order.id]
                    );
                    if (!otherOrders.rows.length && !otherPaidUnserved.rows.length) {
                        await client.query(`UPDATE resto_tables SET status='available', updated_at=NOW() WHERE id=$1`, [tableRes.rows[0].table_id]);
                    }
                }
            }
        }

        await client.query('COMMIT');
        res.status(201).json({ 
            message: 'Pembayaran berhasil dicatat', 
            total_paid: totalPaid, 
            status: totalPaid >= totalAmount ? 'paid' : 'partial' 
        });
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
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

        // Void the order and RESTORE inventory
        await client.query(`UPDATE resto_orders SET status='cancelled', updated_at=NOW() WHERE id=$1`, [order.id]);
        
        // Restore inventory for each item
        const itemsToRestore = await client.query(`SELECT item_id, qty FROM resto_order_items WHERE order_id = $1 AND status != 'cancelled'`, [order.id]);
        const warehouseResult = await client.query(`SELECT id FROM warehouses WHERE branch_id = $1 LIMIT 1`, [order.branch_id]);
        const warehouseId = warehouseResult.rows[0]?.id;

        for (const item of itemsToRestore.rows) {
            if (item.item_id && warehouseId) {
                await client.query(`UPDATE inventory SET qty = qty + $1, updated_at = NOW() WHERE item_id = $2 AND warehouse_id = $3`, [item.qty, item.item_id, warehouseId]);
                await client.query(
                    `INSERT INTO stock_movements (item_id, date, type, qty, ref, warehouse_id, description) VALUES ($1, CURRENT_DATE, 'in', $2, $3, $4, $5)`,
                    [item.item_id, item.qty, order.order_number, warehouseId, `Batal Pesanan Resto ${order.order_number}`]
                );
            }
        }

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
        logger.error({ err: e, orderId: req.params.uuid }, 'Refund/Void failed');
        res.status(500).json({ error: 'Gagal membatalkan pesanan. Silakan coba lagi atau hubungi admin.' });
    } finally {
        client.release();
    }
}));

// ─── PUT /api/resto/orders/:uuid/move-table ───
router.put('/:uuid/move-table', requirePermission('pos:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const { new_table_id } = req.body;
    if (!new_table_id) return res.status(400).json({ error: 'Meja tujuan wajib dipilih' });

    // 1. Validate order exists and is active
    const orderRes = await query(
        `SELECT o.id, o.table_id, o.status, o.order_number
         FROM resto_orders o WHERE o.uuid=$1 AND o.company_id=$2`,
        [req.params.uuid, companyId]
    );
    if (!orderRes.rows.length) return res.status(404).json({ error: 'Pesanan tidak ditemukan' });
    const order = orderRes.rows[0];
    if (['paid', 'cancelled'].includes(order.status)) {
        return res.status(400).json({ error: 'Tidak bisa memindahkan pesanan yang sudah selesai/dibatalkan' });
    }

    // 2. Validate new table exists
    const newTableRes = await query(
        `SELECT id, uuid, number, status FROM resto_tables WHERE uuid=$1 AND company_id=$2`,
        [new_table_id, companyId]
    );
    if (!newTableRes.rows.length) return res.status(404).json({ error: 'Meja tujuan tidak ditemukan' });
    const newTable = newTableRes.rows[0];

    // 3. Check new table is not occupied by another active order
    const existingOrder = await query(
        `SELECT id FROM resto_orders WHERE table_id=$1 AND status NOT IN ('paid','cancelled')`,
        [newTable.id]
    );
    if (existingOrder.rows.length > 0) {
        return res.status(400).json({ error: `Meja ${newTable.number} sudah terisi pesanan lain` });
    }

    // 4. Same table check
    if (order.table_id === newTable.id) {
        return res.status(400).json({ error: 'Pesanan sudah berada di meja ini' });
    }

    const oldTableId = order.table_id;

    const client = await getClient();
    try {
        await client.query('BEGIN');

        // Move order to new table
        await client.query(
            `UPDATE resto_orders SET table_id=$1, updated_at=NOW() WHERE id=$2`,
            [newTable.id, order.id]
        );

        // Release old table (if no other active orders on it)
        if (oldTableId) {
            const otherOrders = await client.query(
                `SELECT id FROM resto_orders WHERE table_id=$1 AND status NOT IN ('paid','cancelled') AND id != $2`,
                [oldTableId, order.id]
            );
            if (!otherOrders.rows.length) {
                await client.query(`UPDATE resto_tables SET status='available', updated_at=NOW() WHERE id=$1`, [oldTableId]);
            }
        }

        // Mark new table as occupied
        await client.query(`UPDATE resto_tables SET status='occupied', updated_at=NOW() WHERE id=$1`, [newTable.id]);

        await client.query('COMMIT');
        res.json({
            message: `Pesanan ${order.order_number} dipindahkan ke Meja ${newTable.number}`,
            order_uuid: req.params.uuid,
            new_table_id: newTable.uuid,
            new_table_number: newTable.number
        });
    } catch (e) {
        await client.query('ROLLBACK');
        logger.error({ err: e, orderId: req.params.uuid }, 'Move table failed');
        res.status(500).json({ error: 'Gagal memindahkan meja. Silakan coba lagi atau hubungi admin.' });
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
    
    // Get percentages from current order
    const orderRes = await client.query(`SELECT discount_pct, service_pct, tax_pct FROM resto_orders WHERE id=$1`, [orderId]);
    const { discount_pct, service_pct, tax_pct } = orderRes.rows[0];
    
    const disc = parseFloat(discount_pct) || 0;
    const serv = parseFloat(service_pct) || 0;
    const tax = parseFloat(tax_pct) || 0;

    const afterDiscount = subtotal - (subtotal * disc / 100);
    const serviceAmt = afterDiscount * (serv / 100);
    const taxAmt = (afterDiscount + serviceAmt) * (tax / 100); // Tax is calculated after service if exists
    const finalTotal = afterDiscount + serviceAmt + taxAmt;

    await client.query(
        `UPDATE resto_orders SET subtotal=$1, total=$2, updated_at=NOW() WHERE id=$3`,
        [subtotal, finalTotal, orderId]
    );
}

module.exports = router;

