const router = require('express').Router();
const { query } = require('../../config/db');
const { authenticateToken, requirePermission } = require('../../middleware/auth');
const { asyncHandler } = require('../../utils/helpers');

router.use(authenticateToken);

// SECURITY: Allowlist of tables for resolveId
const ALLOWED_TABLES = new Set(['items', 'warehouses', 'categories', 'branches', 'suppliers', 'units']);

// Helper: resolve UUID to internal ID
async function resolveId(uuid, table) {
    if (!uuid) return null;
    if (!ALLOWED_TABLES.has(table)) throw new Error(`resolveId: table '${table}' not allowed`);
    // If it's already a number, return as-is
    if (!isNaN(uuid)) return parseInt(uuid);
    const result = await query(`SELECT id FROM ${table} WHERE uuid = $1`, [uuid]);
    return result.rows[0]?.id || null;
}

// GET inventory stock per item per warehouse
router.get('/', requirePermission('inventory:view', 'pos:view'), asyncHandler(async (req, res) => {
    const { warehouse_id, item_id } = req.query;
    const companyId = req.user.company_id;
    let where = ['br.company_id = $1']; let values = [companyId]; let idx = 2;
    if (warehouse_id) {
        const whId = await resolveId(warehouse_id, 'warehouses');
        if (whId) { where.push(`inv.warehouse_id = $${idx++}`); values.push(whId); }
    }
    if (item_id) {
        const iId = await resolveId(item_id, 'items');
        if (iId) { where.push(`inv.item_id = $${idx++}`); values.push(iId); }
    }
    const wc = 'WHERE ' + where.join(' AND ');

    const result = await query(
        `SELECT i.uuid as item_uuid, i.code, i.name, w.name as warehouse_name, w.uuid as warehouse_uuid, inv.qty
     FROM inventory inv JOIN items i ON inv.item_id = i.id JOIN warehouses w ON inv.warehouse_id = w.id
     JOIN branches br ON w.branch_id = br.id
     ${wc}
     ORDER BY i.name, w.name`, values
    );
    res.json(result.rows);
}));

// GET stock movements for an item
router.get('/movements', requirePermission('inventory:view'), asyncHandler(async (req, res) => {
    const { item_id, warehouse_id } = req.query;
    const companyId = req.user.company_id;
    let where = ['br.company_id = $1']; let values = [companyId]; let idx = 2;
    if (item_id) {
        const iId = await resolveId(item_id, 'items');
        if (iId) { where.push(`sm.item_id = $${idx++}`); values.push(iId); }
    }
    if (warehouse_id) {
        const whId = await resolveId(warehouse_id, 'warehouses');
        if (whId) { where.push(`sm.warehouse_id = $${idx++}`); values.push(whId); }
    }
    const wc = 'WHERE ' + where.join(' AND ');

    const result = await query(
        `SELECT sm.date, sm.type, sm.qty, sm.ref, sm.description, sm.balance,
       i.name as item_name, w.name as warehouse_name
     FROM stock_movements sm JOIN items i ON sm.item_id = i.id JOIN warehouses w ON sm.warehouse_id = w.id
     JOIN branches br ON w.branch_id = br.id
     ${wc}
     ORDER BY sm.date, sm.id`, values
    );
    res.json(result.rows);
}));

// GET stock in/out report grouped by item with smallest unit
router.get('/report', requirePermission('inventory:view', 'inventory:manage'), asyncHandler(async (req, res) => {
    const { date_from, date_to, warehouse_id, category_id } = req.query;
    const companyId = req.user.company_id;

    let movWhere = ['br.company_id = $1']; let movValues = [companyId]; let idx = 2;
    let invWhere = ['br.company_id = $1']; let invValues = [companyId]; let invIdx = 2;

    // sm.date is type DATE — compare directly with date strings (no timestamp suffix)
    if (date_from) { movWhere.push(`sm.date >= $${idx++}`); movValues.push(date_from); }
    if (date_to)   { movWhere.push(`sm.date <= $${idx++}`); movValues.push(date_to); }

    if (warehouse_id) {
        const whId = await resolveId(warehouse_id, 'warehouses');
        if (whId) {
            movWhere.push(`sm.warehouse_id = $${idx++}`); movValues.push(whId);
            invWhere.push(`inv.warehouse_id = $${invIdx++}`); invValues.push(whId);
        }
    }

    if (category_id) {
        // Table name is 'categories' (not item_categories) per schema
        const catId = await resolveId(category_id, 'categories');
        if (catId) {
            movWhere.push(`i.category_id = $${idx++}`); movValues.push(catId);
            invWhere.push(`i.category_id = $${invIdx++}`); invValues.push(catId);
        }
    }

    // Movements aggregated per item — join 'categories' table
    const movResult = await query(
        `SELECT
           i.uuid as item_uuid, i.code as item_code, i.name as item_name,
           u.name as uom_name,
           c.name as category_name,
           SUM(CASE WHEN sm.type = 'in'  THEN sm.qty ELSE 0 END) as total_in,
           SUM(CASE WHEN sm.type = 'out' THEN sm.qty ELSE 0 END) as total_out,
           COUNT(*) as total_trx
         FROM stock_movements sm
         JOIN items i ON sm.item_id = i.id
         LEFT JOIN units u ON i.small_uom_id = u.id
         LEFT JOIN categories c ON i.category_id = c.id
         JOIN warehouses w ON sm.warehouse_id = w.id
         JOIN branches br ON w.branch_id = br.id
         WHERE ${movWhere.join(' AND ')}
         GROUP BY i.uuid, i.code, i.name, u.name, c.name
         ORDER BY i.name`,
        movValues
    );

    // Current stock per item (for reference)
    const stockResult = await query(
        `SELECT i.uuid as item_uuid, COALESCE(SUM(inv.qty), 0) as current_stock
         FROM inventory inv
         JOIN items i ON inv.item_id = i.id
         JOIN warehouses w ON inv.warehouse_id = w.id
         JOIN branches br ON w.branch_id = br.id
         WHERE ${invWhere.join(' AND ')}
         GROUP BY i.uuid`,
        invValues
    );
    const stockMap = Object.fromEntries(stockResult.rows.map(r => [r.item_uuid, r.current_stock]));

    const rows = movResult.rows.map(r => ({
        ...r,
        total_in: parseInt(r.total_in) || 0,
        total_out: parseInt(r.total_out) || 0,
        total_trx: parseInt(r.total_trx) || 0,
        current_stock: parseInt(stockMap[r.item_uuid] || 0),
        net: (parseInt(r.total_in) || 0) - (parseInt(r.total_out) || 0)
    }));

    res.json(rows);
}));

// GET monthly in/out report per item (for dashboard charts)
router.get('/report/monthly', requirePermission('inventory:view', 'inventory:manage'), asyncHandler(async (req, res) => {
    const { date_from, date_to, warehouse_id, category_id } = req.query;
    const companyId = req.user.company_id;

    let where = ['br.company_id = $1']; let values = [companyId]; let idx = 2;

    if (date_from) { where.push(`sm.date >= $${idx++}`); values.push(date_from); }
    if (date_to)   { where.push(`sm.date <= $${idx++}`); values.push(date_to); }

    if (warehouse_id) {
        const whId = await resolveId(warehouse_id, 'warehouses');
        if (whId) { where.push(`sm.warehouse_id = $${idx++}`); values.push(whId); }
    }
    if (category_id) {
        const catId = await resolveId(category_id, 'categories');
        if (catId) { where.push(`i.category_id = $${idx++}`); values.push(catId); }
    }

    const result = await query(
        `SELECT
           TO_CHAR(DATE_TRUNC('month', sm.date), 'YYYY-MM') AS month,
           i.uuid  AS item_uuid,
           i.code  AS item_code,
           i.name  AS item_name,
           u.name  AS uom_name,
           c.name  AS category_name,
           SUM(CASE WHEN sm.type = 'in'  THEN sm.qty ELSE 0 END) AS total_in,
           SUM(CASE WHEN sm.type = 'out' THEN sm.qty ELSE 0 END) AS total_out,
           COUNT(*) AS total_trx
         FROM stock_movements sm
         JOIN items i ON sm.item_id = i.id
         LEFT JOIN units u ON i.small_uom_id = u.id
         LEFT JOIN categories c ON i.category_id = c.id
         JOIN warehouses w ON sm.warehouse_id = w.id
         JOIN branches br ON w.branch_id = br.id
         WHERE ${where.join(' AND ')}
         GROUP BY DATE_TRUNC('month', sm.date), i.uuid, i.code, i.name, u.name, c.name
         ORDER BY i.name, DATE_TRUNC('month', sm.date)`,
        values
    );

    // Pivot: { item_uuid -> { item_code, item_name, uom_name, category_name, months: { 'YYYY-MM': { in, out, trx } } } }
    const itemMap = {};
    const monthSet = new Set();
    for (const row of result.rows) {
        monthSet.add(row.month);
        if (!itemMap[row.item_uuid]) {
            itemMap[row.item_uuid] = {
                item_uuid: row.item_uuid,
                item_code: row.item_code,
                item_name: row.item_name,
                uom_name: row.uom_name,
                category_name: row.category_name,
                months: {}
            };
        }
        itemMap[row.item_uuid].months[row.month] = {
            total_in:  parseInt(row.total_in)  || 0,
            total_out: parseInt(row.total_out) || 0,
            total_trx: parseInt(row.total_trx) || 0,
        };
    }

    const months = [...monthSet].sort();
    const items  = Object.values(itemMap);

    res.json({ months, items });
}));

// GET daily in/out report per item (for daily dashboard charts)
router.get('/report/daily', requirePermission('inventory:view', 'inventory:manage'), asyncHandler(async (req, res) => {
    const { date_from, date_to, warehouse_id, category_id } = req.query;
    const companyId = req.user.company_id;

    let where = ['br.company_id = $1']; let values = [companyId]; let idx = 2;

    if (date_from) { where.push(`sm.date >= $${idx++}`); values.push(date_from); }
    if (date_to)   { where.push(`sm.date <= $${idx++}`); values.push(date_to); }

    if (warehouse_id) {
        const whId = await resolveId(warehouse_id, 'warehouses');
        if (whId) { where.push(`sm.warehouse_id = $${idx++}`); values.push(whId); }
    }
    if (category_id) {
        const catId = await resolveId(category_id, 'categories');
        if (catId) { where.push(`i.category_id = $${idx++}`); values.push(catId); }
    }

    const result = await query(
        `SELECT
           TO_CHAR(sm.date, 'YYYY-MM-DD') AS date,
           i.uuid  AS item_uuid,
           i.code  AS item_code,
           i.name  AS item_name,
           u.name  AS uom_name,
           c.name  AS category_name,
           SUM(CASE WHEN sm.type = 'in'  THEN sm.qty ELSE 0 END) AS total_in,
           SUM(CASE WHEN sm.type = 'out' THEN sm.qty ELSE 0 END) AS total_out,
           COUNT(*) AS total_trx
         FROM stock_movements sm
         JOIN items i ON sm.item_id = i.id
         LEFT JOIN units u ON i.small_uom_id = u.id
         LEFT JOIN categories c ON i.category_id = c.id
         JOIN warehouses w ON sm.warehouse_id = w.id
         JOIN branches br ON w.branch_id = br.id
         WHERE ${where.join(' AND ')}
         GROUP BY sm.date, i.uuid, i.code, i.name, u.name, c.name
         ORDER BY i.name, sm.date`,
        values
    );

    // Pivot: { item_uuid -> { ..., dates: { 'YYYY-MM-DD': { total_in, total_out, total_trx } } } }
    const itemMap = {};
    const dateSet = new Set();
    for (const row of result.rows) {
        dateSet.add(row.date);
        if (!itemMap[row.item_uuid]) {
            itemMap[row.item_uuid] = {
                item_uuid: row.item_uuid,
                item_code: row.item_code,
                item_name: row.item_name,
                uom_name:  row.uom_name,
                category_name: row.category_name,
                dates: {}
            };
        }
        itemMap[row.item_uuid].dates[row.date] = {
            total_in:  parseInt(row.total_in)  || 0,
            total_out: parseInt(row.total_out) || 0,
            total_trx: parseInt(row.total_trx) || 0,
        };
    }

    const dates = [...dateSet].sort();
    const items = Object.values(itemMap);

    res.json({ dates, items });
}));

// GET yearly in/out report per item (for yearly dashboard charts and PDF)
router.get('/report/yearly', requirePermission('inventory:view', 'inventory:manage'), asyncHandler(async (req, res) => {
    const { date_from, date_to, warehouse_id, category_id } = req.query;
    const companyId = req.user.company_id;

    let where = ['br.company_id = $1']; let values = [companyId]; let idx = 2;

    if (date_from) { where.push(`sm.date >= $${idx++}`); values.push(date_from); }
    if (date_to)   { where.push(`sm.date <= $${idx++}`); values.push(date_to); }

    if (warehouse_id) {
        const whId = await resolveId(warehouse_id, 'warehouses');
        if (whId) { where.push(`sm.warehouse_id = $${idx++}`); values.push(whId); }
    }
    if (category_id) {
        const catId = await resolveId(category_id, 'categories');
        if (catId) { where.push(`i.category_id = $${idx++}`); values.push(catId); }
    }

    const result = await query(
        `SELECT
           TO_CHAR(DATE_TRUNC('year', sm.date), 'YYYY') AS year,
           i.uuid  AS item_uuid,
           i.code  AS item_code,
           i.name  AS item_name,
           u.name  AS uom_name,
           c.name  AS category_name,
           SUM(CASE WHEN sm.type = 'in'  THEN sm.qty ELSE 0 END) AS total_in,
           SUM(CASE WHEN sm.type = 'out' THEN sm.qty ELSE 0 END) AS total_out,
           COUNT(*) AS total_trx
         FROM stock_movements sm
         JOIN items i ON sm.item_id = i.id
         LEFT JOIN units u ON i.small_uom_id = u.id
         LEFT JOIN categories c ON i.category_id = c.id
         JOIN warehouses w ON sm.warehouse_id = w.id
         JOIN branches br ON w.branch_id = br.id
         WHERE ${where.join(' AND ')}
         GROUP BY DATE_TRUNC('year', sm.date), i.uuid, i.code, i.name, u.name, c.name
         ORDER BY i.name, DATE_TRUNC('year', sm.date)`,
        values
    );

    // Pivot: { item_uuid -> { ..., years: { 'YYYY': { total_in, total_out, total_trx } } } }
    const itemMap = {};
    const yearSet = new Set();
    for (const row of result.rows) {
        yearSet.add(row.year);
        if (!itemMap[row.item_uuid]) {
            itemMap[row.item_uuid] = {
                item_uuid: row.item_uuid,
                item_code: row.item_code,
                item_name: row.item_name,
                uom_name:  row.uom_name,
                category_name: row.category_name,
                years: {}
            };
        }
        itemMap[row.item_uuid].years[row.year] = {
            total_in:  parseInt(row.total_in)  || 0,
            total_out: parseInt(row.total_out) || 0,
            total_trx: parseInt(row.total_trx) || 0,
        };
    }

    const years = [...yearSet].sort();
    const items = Object.values(itemMap);

    res.json({ years, items });
}));

// GET batches
router.get('/batches', requirePermission('inventory:view'), asyncHandler(async (req, res) => {
    const { item_id, warehouse_id, expiring_days } = req.query;
    const companyId = req.user.company_id;
    let where = ['b.qty > 0', 'br.company_id = $1']; let values = [companyId]; let idx = 2;
    if (item_id) {
        const iId = await resolveId(item_id, 'items');
        if (iId) { where.push(`b.item_id = $${idx++}`); values.push(iId); }
    }
    if (warehouse_id) {
        const whId = await resolveId(warehouse_id, 'warehouses');
        if (whId) { where.push(`b.warehouse_id = $${idx++}`); values.push(whId); }
    }
    if (expiring_days) {
        where.push(`b.expiry_date <= NOW() + $${idx++}::interval`);
        values.push(`${expiring_days} days`);
        where.push(`b.expiry_date >= NOW()`);
    }

    const result = await query(
        `SELECT b.uuid, b.batch_no, b.qty, b.expiry_date, b.received_date,
       i.name as item_name, i.code as item_code, w.name as warehouse_name,
       s.name as supplier_name
     FROM batches b JOIN items i ON b.item_id = i.id JOIN warehouses w ON b.warehouse_id = w.id
     LEFT JOIN suppliers s ON b.supplier_id = s.id
     JOIN branches br ON w.branch_id = br.id
     WHERE ${where.join(' AND ')} ORDER BY b.expiry_date`, values
    );
    res.json(result.rows);
}));

module.exports = router;
