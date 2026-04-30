const router = require('express').Router();
const { query } = require('../../config/db');
const { requirePermission } = require('../../middleware/auth');
const { asyncHandler } = require('../../utils/helpers');

// SECURITY: Allowlist of tables for resolveId
const ALLOWED_TABLES = new Set(['items', 'warehouses', 'categories', 'branches', 'suppliers', 'units']);

// Helper: resolve UUID to ID
async function resolveId(uuid, table) {
    if (!uuid) return null;
    if (!ALLOWED_TABLES.has(table)) throw new Error(`resolveId: table '${table}' not allowed`);
    if (!isNaN(uuid)) return parseInt(uuid);
    const result = await query(`SELECT id FROM ${table} WHERE uuid = $1`, [uuid]);
    return result.rows[0]?.id || null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. LAPORAN STOK — Stok saat ini per item dengan detail harga pokok
// GET /inventory/reports/stock
// ─────────────────────────────────────────────────────────────────────────────
router.get('/stock', requirePermission('inventory:view', 'inventory:manage'), asyncHandler(async (req, res) => {
    const { warehouse_id, category_id, status } = req.query;
    const companyId = req.user.company_id;

    let where = ['br.company_id = $1']; let values = [companyId]; let idx = 2;
    if (warehouse_id) {
        const whId = await resolveId(warehouse_id, 'warehouses');
        if (whId) { where.push(`inv.warehouse_id = $${idx++}`); values.push(whId); }
    }
    if (category_id) {
        const catId = await resolveId(category_id, 'categories');
        if (catId) { where.push(`i.category_id = $${idx++}`); values.push(catId); }
    }

    const result = await query(
        `SELECT
           i.uuid as item_uuid, i.code as item_code, i.name as item_name,
           COALESCE(i.min_stock, 0) as min_stock,
           u.name as uom_name,
           c.name as category_name,
           w.uuid as warehouse_uuid, w.name as warehouse_name,
           COALESCE(inv.qty, 0) as qty
         FROM inventory inv
         JOIN items i ON inv.item_id = i.id
         LEFT JOIN units u ON i.small_uom_id = u.id
         LEFT JOIN categories c ON i.category_id = c.id
         JOIN warehouses w ON inv.warehouse_id = w.id
         JOIN branches br ON w.branch_id = br.id
         WHERE ${where.join(' AND ')}
         ORDER BY i.name, w.name`,
        values
    );

    let rows = result.rows.map(r => ({
        ...r,
        qty: parseFloat(r.qty) || 0,
        min_stock: parseFloat(r.min_stock) || 0,
        max_stock: 0,
        status: parseFloat(r.qty) === 0 ? 'empty'
            : parseFloat(r.qty) <= parseFloat(r.min_stock) ? 'low'
                : 'normal'
    }));

    if (status) rows = rows.filter(r => r.status === status);
    res.json(rows);
}));

// ─────────────────────────────────────────────────────────────────────────────
// 2. LAPORAN VALUASI — Nilai persediaan per item (average cost via GR)
// GET /inventory/reports/valuation
// ─────────────────────────────────────────────────────────────────────────────
router.get('/valuation', requirePermission('inventory:view', 'inventory:manage'), asyncHandler(async (req, res) => {
    const { warehouse_id, category_id } = req.query;
    const companyId = req.user.company_id;

    let stockWhere = ['br.company_id = $1']; let stockValues = [companyId]; let idx = 2;
    if (warehouse_id) {
        const whId = await resolveId(warehouse_id, 'warehouses');
        if (whId) { stockWhere.push(`inv.warehouse_id = $${idx++}`); stockValues.push(whId); }
    }
    if (category_id) {
        const catId = await resolveId(category_id, 'categories');
        if (catId) { stockWhere.push(`i.category_id = $${idx++}`); stockValues.push(catId); }
    }

    // Current stock
    const stockResult = await query(
        `SELECT i.uuid as item_uuid, i.code as item_code, i.name as item_name,
                u.name as uom_name, c.name as category_name,
                SUM(COALESCE(inv.qty, 0)) as total_qty
         FROM inventory inv
         JOIN items i ON inv.item_id = i.id
         LEFT JOIN units u ON i.small_uom_id = u.id
         LEFT JOIN categories c ON i.category_id = c.id
         JOIN warehouses w ON inv.warehouse_id = w.id
         JOIN branches br ON w.branch_id = br.id
         WHERE ${stockWhere.join(' AND ')}
         GROUP BY i.uuid, i.code, i.name, u.name, c.name
         ORDER BY i.name`,
        stockValues
    );

    // HPP (harga pokok rata-rata tertimbang) tersimpan langsung di kolom items.hpp
    // yang diupdate otomatis setiap ada penerimaan barang (GR)
    let hppWhere = ['br.company_id = $1']; let hppValues = [companyId];
    if (category_id) {
        const catId = await resolveId(category_id, 'categories');
        if (catId) { hppWhere.push(`i.category_id = $2`); hppValues.push(catId); }
    }

    const hppResult = await query(
        `SELECT i.uuid as item_uuid, COALESCE(i.hpp, 0) as avg_price
         FROM items i
         JOIN branches br ON i.company_id = br.company_id
         WHERE ${hppWhere.join(' AND ')}
         GROUP BY i.uuid, i.hpp`,
        hppValues
    ).catch(() => ({ rows: [] }));

    const priceMap = Object.fromEntries(hppResult.rows.map(r => [r.item_uuid, parseFloat(r.avg_price) || 0]));

    const rows = stockResult.rows.map(r => {
        const qty = parseFloat(r.total_qty) || 0;
        const avgPrice = priceMap[r.item_uuid] || 0;
        return {
            ...r,
            total_qty: qty,
            avg_price: avgPrice,
            last_price: avgPrice,
            total_value: qty * avgPrice
        };
    });

    const grand_total = rows.reduce((s, r) => s + r.total_value, 0);
    res.json({ rows, grand_total });
}));

// ─────────────────────────────────────────────────────────────────────────────
// 3. LAPORAN AGING — Umur stok berdasarkan batch
// GET /inventory/reports/aging
// ─────────────────────────────────────────────────────────────────────────────
router.get('/aging', requirePermission('inventory:view', 'inventory:manage'), asyncHandler(async (req, res) => {
    const { warehouse_id, category_id } = req.query;
    const companyId = req.user.company_id;

    let where = ['br.company_id = $1', 'b.qty > 0']; let values = [companyId]; let idx = 2;
    if (warehouse_id) {
        const whId = await resolveId(warehouse_id, 'warehouses');
        if (whId) { where.push(`b.warehouse_id = $${idx++}`); values.push(whId); }
    }
    if (category_id) {
        const catId = await resolveId(category_id, 'categories');
        if (catId) { where.push(`i.category_id = $${idx++}`); values.push(catId); }
    }

    const result = await query(
        `SELECT b.uuid, b.batch_no, b.qty, b.received_date, b.expiry_date,
                i.uuid as item_uuid, i.code as item_code, i.name as item_name,
                u.name as uom_name, c.name as category_name,
                w.name as warehouse_name,
                CURRENT_DATE - b.received_date::date as age_days
         FROM batches b
         JOIN items i ON b.item_id = i.id
         LEFT JOIN units u ON i.small_uom_id = u.id
         LEFT JOIN categories c ON i.category_id = c.id
         JOIN warehouses w ON b.warehouse_id = w.id
         JOIN branches br ON w.branch_id = br.id
         WHERE ${where.join(' AND ')}
         ORDER BY age_days DESC NULLS LAST, i.name`,
        values
    );

    const rows = result.rows.map(r => {
        const ageDays = parseInt(r.age_days) || 0;
        let ageBucket;
        if (ageDays <= 30) ageBucket = '0-30 hari';
        else if (ageDays <= 60) ageBucket = '31-60 hari';
        else if (ageDays <= 90) ageBucket = '61-90 hari';
        else if (ageDays <= 180) ageBucket = '91-180 hari';
        else ageBucket = '> 180 hari';

        let expiryStatus = 'normal';
        if (r.expiry_date) {
            const daysToExpiry = Math.ceil((new Date(r.expiry_date) - new Date()) / 86400000);
            if (daysToExpiry < 0) expiryStatus = 'expired';
            else if (daysToExpiry <= 30) expiryStatus = 'critical';
            else if (daysToExpiry <= 90) expiryStatus = 'warning';
        }

        return { ...r, age_days: ageDays, age_bucket: ageBucket, expiry_status: expiryStatus };
    });

    // Bucket summary
    const buckets = {};
    for (const r of rows) {
        if (!buckets[r.age_bucket]) buckets[r.age_bucket] = { count: 0, total_qty: 0 };
        buckets[r.age_bucket].count++;
        buckets[r.age_bucket].total_qty += parseFloat(r.qty) || 0;
    }

    res.json({ rows, buckets });
}));

// ─────────────────────────────────────────────────────────────────────────────
// 4. LAPORAN REORDER — Item yang stok di bawah minimum
// GET /inventory/reports/reorder
// ─────────────────────────────────────────────────────────────────────────────
router.get('/reorder', requirePermission('inventory:view', 'inventory:manage'), asyncHandler(async (req, res) => {
    const { warehouse_id, category_id } = req.query;
    const companyId = req.user.company_id;

    let where = ['br.company_id = $1', 'i.min_stock > 0']; let values = [companyId]; let idx = 2;
    if (warehouse_id) {
        const whId = await resolveId(warehouse_id, 'warehouses');
        if (whId) { where.push(`inv.warehouse_id = $${idx++}`); values.push(whId); }
    }
    if (category_id) {
        const catId = await resolveId(category_id, 'categories');
        if (catId) { where.push(`i.category_id = $${idx++}`); values.push(catId); }
    }

    const result = await query(
        `SELECT i.uuid as item_uuid, i.code as item_code, i.name as item_name,
                u.name as uom_name, c.name as category_name,
                w.uuid as warehouse_uuid, w.name as warehouse_name,
                COALESCE(inv.qty, 0) as current_qty,
                COALESCE(i.min_stock, 0) as min_stock,
                0 as max_stock
         FROM inventory inv
         JOIN items i ON inv.item_id = i.id
         LEFT JOIN units u ON i.small_uom_id = u.id
         LEFT JOIN categories c ON i.category_id = c.id
         JOIN warehouses w ON inv.warehouse_id = w.id
         JOIN branches br ON w.branch_id = br.id
         WHERE ${where.join(' AND ')}
           AND COALESCE(inv.qty, 0) <= i.min_stock
         ORDER BY (COALESCE(inv.qty, 0) / NULLIF(i.min_stock, 0)) ASC, i.name`,
        values
    );

    const rows = result.rows.map(r => {
        const qty = parseFloat(r.current_qty) || 0;
        const min = parseFloat(r.min_stock) || 0;
        const max = 0
        return {
            ...r,
            current_qty: qty,
            min_stock: min,
            max_stock: max,
            shortage: Math.max(0, min - qty),
            suggested_order: Math.max(0, min * 2 - qty),
            urgency: qty === 0 ? 'critical' : qty <= min * 0.5 ? 'high' : 'medium'
        };
    });

    res.json(rows);
}));

// ─────────────────────────────────────────────────────────────────────────────
// 5. LAPORAN FAST/SLOW MOVING
// GET /inventory/reports/movement-analysis
// ─────────────────────────────────────────────────────────────────────────────
router.get('/movement-analysis', requirePermission('inventory:view', 'inventory:manage'), asyncHandler(async (req, res) => {
    const { date_from, date_to, warehouse_id, category_id, days = 90 } = req.query;
    const companyId = req.user.company_id;

    const effectiveDateFrom = date_from || new Date(Date.now() - parseInt(days) * 86400000).toISOString().slice(0, 10);
    const effectiveDateTo = date_to || new Date().toISOString().slice(0, 10);

    let where = ['br.company_id = $1', `sm.date >= $2`, `sm.date <= $3`];
    let values = [companyId, effectiveDateFrom, effectiveDateTo]; let idx = 4;

    if (warehouse_id) {
        const whId = await resolveId(warehouse_id, 'warehouses');
        if (whId) { where.push(`sm.warehouse_id = $${idx++}`); values.push(whId); }
    }
    if (category_id) {
        const catId = await resolveId(category_id, 'categories');
        if (catId) { where.push(`i.category_id = $${idx++}`); values.push(catId); }
    }

    const movResult = await query(
        `SELECT i.uuid as item_uuid, i.code as item_code, i.name as item_name,
                u.name as uom_name, c.name as category_name,
                COUNT(*) as trx_count,
                SUM(CASE WHEN sm.type = 'out' THEN sm.qty ELSE 0 END) as total_out,
                SUM(CASE WHEN sm.type = 'in' THEN sm.qty ELSE 0 END) as total_in,
                COUNT(DISTINCT sm.date) as active_days
         FROM stock_movements sm
         JOIN items i ON sm.item_id = i.id
         LEFT JOIN units u ON i.small_uom_id = u.id
         LEFT JOIN categories c ON i.category_id = c.id
         JOIN warehouses w ON sm.warehouse_id = w.id
         JOIN branches br ON w.branch_id = br.id
         WHERE ${where.join(' AND ')}
         GROUP BY i.uuid, i.code, i.name, u.name, c.name
         ORDER BY total_out DESC`,
        values
    );

    // Also fetch items with zero movement in period
    let zeroWhere = ['br.company_id = $1']; let zeroVals = [companyId]; let zidx = 2;
    if (category_id) {
        const catId = await resolveId(category_id, 'categories');
        if (catId) { zeroWhere.push(`i.category_id = $${zidx++}`); zeroVals.push(catId); }
    }
    const movedUuids = movResult.rows.map(r => r.item_uuid);

    const zeroResult = movedUuids.length < 500 ? await query(
        `SELECT i.uuid as item_uuid, i.code as item_code, i.name as item_name,
                u.name as uom_name, c.name as category_name,
                COALESCE(SUM(inv.qty), 0) as current_qty
         FROM items i
         LEFT JOIN units u ON i.small_uom_id = u.id
         LEFT JOIN categories c ON i.category_id = c.id
         LEFT JOIN inventory inv ON inv.item_id = i.id
         LEFT JOIN warehouses w ON inv.warehouse_id = w.id
         LEFT JOIN branches br ON w.branch_id = br.id
         WHERE ${zeroWhere.join(' AND ')}
           AND i.is_active = true
           ${movedUuids.length > 0 ? `AND i.uuid NOT IN (${movedUuids.map((_, i) => `$${i + zidx}`).join(',')})` : ''}
         GROUP BY i.uuid, i.code, i.name, u.name, c.name
         ORDER BY i.name`,
        [...zeroVals, ...movedUuids]
    ).catch(() => ({ rows: [] })) : { rows: [] };

    const allDays = Math.max(1, Math.ceil((new Date(effectiveDateTo) - new Date(effectiveDateFrom)) / 86400000));

    const rows = [
        ...movResult.rows.map(r => {
            const totalOut = parseFloat(r.total_out) || 0;
            const trxCount = parseInt(r.trx_count) || 0;
            const dailyRate = totalOut / allDays;

            let category;
            if (trxCount === 0) category = 'dead';
            else if (dailyRate >= 5 || trxCount >= allDays * 0.7) category = 'fast';
            else if (dailyRate >= 1 || trxCount >= allDays * 0.3) category = 'medium';
            else if (trxCount > 0) category = 'slow';
            else category = 'dead';

            return { ...r, total_out: totalOut, total_in: parseFloat(r.total_in) || 0, trx_count: trxCount, daily_avg: dailyRate, movement_category: category };
        }),
        ...zeroResult.rows.map(r => ({
            ...r, current_qty: parseFloat(r.current_qty) || 0,
            total_out: 0, total_in: 0, trx_count: 0, daily_avg: 0, movement_category: 'dead'
        }))
    ];

    const summary = { fast: 0, medium: 0, slow: 0, dead: 0 };
    rows.forEach(r => { if (summary[r.movement_category] !== undefined) summary[r.movement_category]++; });

    res.json({ rows, summary, period: { from: effectiveDateFrom, to: effectiveDateTo, days: allDays } });
}));

// ─────────────────────────────────────────────────────────────────────────────
// 6. LAPORAN OPNAME SUMMARY — Ringkasan Stok Opname dengan variance
// GET /inventory/reports/opname-summary
// ─────────────────────────────────────────────────────────────────────────────
router.get('/opname-summary', requirePermission('inventory:view', 'inventory:manage'), asyncHandler(async (req, res) => {
    const { date_from, date_to, warehouse_id, status } = req.query;
    const companyId = req.user.company_id;

    let where = ['br.company_id = $1']; let values = [companyId]; let idx = 2;
    if (date_from) { where.push(`o.date >= $${idx++}`); values.push(date_from); }
    if (date_to) { where.push(`o.date <= $${idx++}`); values.push(date_to); }
    if (warehouse_id) {
        const whId = await resolveId(warehouse_id, 'warehouses');
        if (whId) { where.push(`o.warehouse_id = $${idx++}`); values.push(whId); }
    }
    if (status) { where.push(`o.status = $${idx++}`); values.push(status); }

    const result = await query(
        `SELECT o.uuid, o.number, o.date, o.status, o.notes, o.created_by, o.approved_by,
                w.name as warehouse_name,
                COUNT(ol.id) as total_items,
                SUM(CASE WHEN ol.actual_qty != ol.system_qty THEN 1 ELSE 0 END) as items_with_variance,
                SUM(ol.system_qty) as total_system_qty,
                SUM(ol.actual_qty) as total_actual_qty,
                SUM(ol.actual_qty - ol.system_qty) as total_variance
         FROM stock_opnames o
         LEFT JOIN stock_opname_lines ol ON ol.opname_id = o.id
         JOIN warehouses w ON o.warehouse_id = w.id
         JOIN branches br ON w.branch_id = br.id
         WHERE ${where.join(' AND ')}
         GROUP BY o.uuid, o.number, o.date, o.status, o.notes, o.created_by, o.approved_by, w.name
         ORDER BY o.date DESC`,
        values
    ).catch(() => query(
        // fallback table name
        `SELECT o.uuid, o.number, o.date, o.status, o.notes, o.created_by, o.approved_by,
                w.name as warehouse_name,
                COUNT(ol.id) as total_items,
                SUM(CASE WHEN ol.actual_qty != ol.system_qty THEN 1 ELSE 0 END) as items_with_variance,
                SUM(ol.system_qty) as total_system_qty,
                SUM(ol.actual_qty) as total_actual_qty,
                SUM(ol.actual_qty - ol.system_qty) as total_variance
         FROM opnames o
         LEFT JOIN opname_lines ol ON ol.opname_id = o.id
         JOIN warehouses w ON o.warehouse_id = w.id
         JOIN branches br ON w.branch_id = br.id
         WHERE ${where.join(' AND ')}
         GROUP BY o.uuid, o.number, o.date, o.status, o.notes, o.created_by, o.approved_by, w.name
         ORDER BY o.date DESC`,
        values
    ));

    res.json(result.rows.map(r => ({
        ...r,
        total_items: parseInt(r.total_items) || 0,
        items_with_variance: parseInt(r.items_with_variance) || 0,
        total_variance: parseFloat(r.total_variance) || 0
    })));
}));

// ─────────────────────────────────────────────────────────────────────────────
// 7. LAPORAN TRANSFER — Ringkasan transfer antar gudang
// GET /inventory/reports/transfers
// ─────────────────────────────────────────────────────────────────────────────
router.get('/transfers', requirePermission('inventory:view', 'inventory:manage'), asyncHandler(async (req, res) => {
    const { date_from, date_to, warehouse_id, status } = req.query;
    const companyId = req.user.company_id;

    let where = ['br.company_id = $1']; let values = [companyId]; let idx = 2;
    if (date_from) { where.push(`t.date >= $${idx++}`); values.push(date_from); }
    if (date_to) { where.push(`t.date <= $${idx++}`); values.push(date_to); }
    if (warehouse_id) {
        const whId = await resolveId(warehouse_id, 'warehouses');
        if (whId) {
            where.push(`(t.from_warehouse_id = $${idx} OR t.to_warehouse_id = $${idx})`);
            values.push(whId); idx++;
        }
    }
    if (status) { where.push(`t.status = $${idx++}`); values.push(status); }

    const result = await query(
        `SELECT t.uuid, t.number, t.date, t.status, t.notes, t.created_by,
                fw.name as from_warehouse, tw.name as to_warehouse,
                COUNT(tl.id) as total_items,
                SUM(tl.qty) as total_qty
         FROM stock_transfers t
         LEFT JOIN stock_transfer_lines tl ON tl.transfer_id = t.id
         LEFT JOIN warehouses fw ON t.from_warehouse_id = fw.id
         LEFT JOIN warehouses tw ON t.to_warehouse_id = tw.id
         JOIN branches br ON t.branch_id = br.id
         WHERE ${where.join(' AND ')}
         GROUP BY t.uuid, t.number, t.date, t.status, t.notes, t.created_by, fw.name, tw.name
         ORDER BY t.date DESC`,
        values
    );

    const summary = {};
    for (const r of result.rows) {
        if (!summary[r.status]) summary[r.status] = 0;
        summary[r.status]++;
    }

    res.json({
        rows: result.rows.map(r => ({
            ...r,
            total_items: parseInt(r.total_items) || 0,
            total_qty: parseFloat(r.total_qty) || 0
        })),
        summary
    });
}));

module.exports = router;
