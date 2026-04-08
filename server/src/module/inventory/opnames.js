const router = require('express').Router();
const { query } = require('../../config/db');
const { authenticateToken, requirePermission } = require('../../middleware/auth');
const { asyncHandler, resolveUUID } = require('../../utils/helpers');
const { generateAutoNumber } = require('../../utils/autoNumber');

router.use(authenticateToken);

// ---- LIST -----
router.get('/', requirePermission('inventory:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const result = await query(
        `SELECT o.uuid, o.number, o.date, o.status, o.notes,
                o.created_by, o.submitted_by, o.approved_by, o.rejected_by,
                w.uuid as warehouse_id, w.name as warehouse_name,
                b.name as branch_name, b.uuid as branch_id
         FROM stock_opnames o
         LEFT JOIN warehouses w ON o.warehouse_id = w.id
         LEFT JOIN branches b ON o.branch_id = b.id
         WHERE b.company_id = $1
         ORDER BY o.date DESC`, [companyId]
    );
    res.json(result.rows);
}));

// ── DETAIL ───────────────────────────────────────────────────────────────────
router.get('/:uuid', requirePermission('inventory:view'), asyncHandler(async (req, res) => {
    const result = await query(
        `SELECT o.*, w.uuid as warehouse_uuid, w.name as warehouse_name,
                b.uuid as branch_uuid, b.name as branch_name
         FROM stock_opnames o
         LEFT JOIN warehouses w ON o.warehouse_id = w.id
         LEFT JOIN branches b ON o.branch_id = b.id
         WHERE o.uuid = $1`, [req.params.uuid]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Opname tidak ditemukan' });
    const op = result.rows[0];
    const lines = await query(
        `SELECT ol.system_qty, ol.actual_qty, (ol.actual_qty - ol.system_qty) as diff, ol.uom,
                i.uuid as item_id, i.name as item_name, i.code as item_code
         FROM stock_opname_lines ol
         JOIN items i ON ol.item_id = i.id
         WHERE ol.opname_id = $1`, [op.id]
    );
    res.json({ ...op, warehouse_id: op.warehouse_uuid, branch_id: op.branch_uuid, lines: lines.rows });
}));

// ── CREATE (status = draft) ──────────────────────────────────────────────────
router.post('/', requirePermission('inventory:create'), asyncHandler(async (req, res) => {
    const { warehouse_id, branch_id, lines, notes } = req.body;
    const rBranch = await resolveUUID(branch_id, 'branches', query);
    const rWh = await resolveUUID(warehouse_id, 'warehouses', query);
    const branchResult = await query(`SELECT code FROM branches WHERE id = $1`, [rBranch]);
    const number = await generateAutoNumber(branchResult.rows[0]?.code || 'JKT', 'OPN');
    const result = await query(
        `INSERT INTO stock_opnames (number, date, warehouse_id, branch_id, notes, created_by)
         VALUES ($1,CURRENT_DATE,$2,$3,$4,$5) RETURNING id, uuid, number`,
        [number, rWh, rBranch, notes, req.user.name]
    );
    for (const line of (lines || [])) {
        const rItem = await resolveUUID(line.item_id, 'items', query);
        await query(
            `INSERT INTO stock_opname_lines (opname_id, item_id, system_qty, actual_qty, uom)
             VALUES ($1,$2,$3,$4,$5)`,
            [result.rows[0].id, rItem, line.system_qty, line.actual_qty, line.uom]
        );
    }
    await query(
        `INSERT INTO audit_trail (action, module, description, user_id, user_name, branch_id)
         VALUES ('create','inventory',$1,$2,$3,$4)`,
        [`Buat Opname ${result.rows[0].number}`, req.user.id, req.user.name, rBranch]
    );
    res.status(201).json(result.rows[0]);
}));

// ── SUBMIT (draft → pending) ─────────────────────────────────────────────────
router.put('/:uuid/submit', requirePermission('inventory:create'), asyncHandler(async (req, res) => {
    const result = await query(
        `UPDATE stock_opnames SET status='pending', submitted_by=$1, updated_at=NOW()
         WHERE uuid=$2 AND status='draft' RETURNING id, uuid, number, branch_id`,
        [req.user.name, req.params.uuid]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Opname tidak ditemukan atau sudah disubmit' });
    const op = result.rows[0];
    await query(
        `INSERT INTO audit_trail (action, module, description, user_id, user_name, branch_id)
         VALUES ('submit','inventory',$1,$2,$3,$4)`,
        [`Submit Opname ${op.number} -- menunggu approval`, req.user.id, req.user.name, op.branch_id]
    );
    res.json({ message: 'Opname submitted, menunggu approval' });
}));

// ── APPROVE (pending → approved, stok berubah) ──────────────────────────────
router.put('/:uuid/approve', requirePermission('sales:approve'), asyncHandler(async (req, res) => {
    const result = await query(
        `UPDATE stock_opnames SET status='approved', approved_by=$1, updated_at=NOW()
         WHERE uuid=$2 AND status='pending' RETURNING id, uuid`,
        [req.user.name, req.params.uuid]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Opname tidak ditemukan atau belum disubmit' });

    // ── Adjust inventory based on actual qty ─────────────────────────────
    const lines = await query(
        `SELECT item_id, system_qty, actual_qty, (actual_qty - system_qty) as diff
         FROM stock_opname_lines WHERE opname_id = $1`, [result.rows[0].id]
    );
    const opname = await query(`SELECT warehouse_id, number FROM stock_opnames WHERE id = $1`, [result.rows[0].id]);
    const warehouseId = opname.rows[0].warehouse_id;
    const opNumber = opname.rows[0].number;
    for (const line of lines.rows) {
        const diff = parseFloat(line.diff) || 0;
        if (diff !== 0) {
            await query(
                `UPDATE inventory SET qty = $1, updated_at=NOW()
                 WHERE item_id = $2 AND warehouse_id = $3`,
                [line.actual_qty, line.item_id, warehouseId]
            );
            // Catat di stock_movements untuk audit trail
            await query(
                `INSERT INTO stock_movements (item_id, date, type, qty, ref, warehouse_id, description)
                 VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6)`,
                [line.item_id, diff > 0 ? 'in' : 'out', Math.abs(diff), opNumber, warehouseId,
                `Penyesuaian stok opname ${opNumber} (sistem: ${line.system_qty}, aktual: ${line.actual_qty})`]
            );
        }
    }

    const opnameInfo = await query(`SELECT number, branch_id FROM stock_opnames WHERE id = $1`, [result.rows[0].id]);
    await query(
        `INSERT INTO audit_trail (action, module, description, user_id, user_name, branch_id)
         VALUES ('approve','inventory',$1,$2,$3,$4)`,
        [`Approve Opname ${opnameInfo.rows[0]?.number} -- stok disesuaikan`, req.user.id, req.user.name, opnameInfo.rows[0]?.branch_id]
    );
    res.json({ message: 'Opname approved, stok disesuaikan' });
}));

// ── REJECT (pending → rejected) ─────────────────────────────────────────────
router.put('/:uuid/reject', requirePermission('sales:approve'), asyncHandler(async (req, res) => {
    const result = await query(
        `UPDATE stock_opnames SET status='rejected', rejected_by=$1, updated_at=NOW()
         WHERE uuid=$2 AND status='pending' RETURNING id, uuid`,
        [req.user.name, req.params.uuid]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Opname tidak ditemukan atau belum disubmit' });
    const opnameInfo = await query(`SELECT number, branch_id FROM stock_opnames WHERE id = $1`, [result.rows[0].id]);
    await query(
        `INSERT INTO audit_trail (action, module, description, user_id, user_name, branch_id)
         VALUES ('reject','inventory',$1,$2,$3,$4)`,
        [`Tolak Opname ${opnameInfo.rows[0]?.number}`, req.user.id, req.user.name, opnameInfo.rows[0]?.branch_id]
    );
    res.json({ message: 'Opname ditolak' });
}));

module.exports = router;
