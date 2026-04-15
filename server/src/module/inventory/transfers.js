const router = require('express').Router();
const { query, getClient } = require('../../config/db');
const { authenticateToken, requirePermission } = require('../../middleware/auth');
const { asyncHandler, resolveUUID } = require('../../utils/helpers');
const { generateAutoNumber } = require('../../utils/autoNumber');

router.use(authenticateToken);

// GET /api/inventory/transfers
router.get('/', requirePermission('inventory:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const result = await query(
        `SELECT t.uuid, t.number, t.date, t.status, t.notes, t.created_by,
       fw.name as from_warehouse, tw.name as to_warehouse, b.name as branch_name, b.uuid as branch_id
     FROM stock_transfers t LEFT JOIN warehouses fw ON t.from_warehouse_id = fw.id
     LEFT JOIN warehouses tw ON t.to_warehouse_id = tw.id LEFT JOIN branches b ON t.branch_id = b.id
     WHERE b.company_id = $1
     ORDER BY t.date DESC`, [companyId]
    );
    res.json(result.rows);
}));

// GET /api/inventory/transfers/:uuid
router.get('/:uuid', requirePermission('inventory:view'), asyncHandler(async (req, res) => {
    const result = await query(
        `SELECT t.uuid, t.number, t.date, t.status, t.notes, t.created_by,
       fw.name as from_warehouse, tw.name as to_warehouse, b.name as branch_name, b.uuid as branch_id
     FROM stock_transfers t LEFT JOIN warehouses fw ON t.from_warehouse_id = fw.id
     LEFT JOIN warehouses tw ON t.to_warehouse_id = tw.id LEFT JOIN branches b ON t.branch_id = b.id
     WHERE t.uuid = $1`, [req.params.uuid]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Transfer tidak ditemukan' });
    const transfer = result.rows[0];
    const tfId = (await query(`SELECT id FROM stock_transfers WHERE uuid = $1`, [req.params.uuid])).rows[0].id;
    const lines = await query(
        `SELECT tl.qty, tl.uom, i.uuid as item_id, i.code as item_code, i.name as item_name
     FROM stock_transfer_lines tl JOIN items i ON tl.item_id = i.id
     WHERE tl.transfer_id = $1 ORDER BY tl.id`, [tfId]
    );
    transfer.lines = lines.rows;
    res.json(transfer);
}));

// POST /api/inventory/transfers -- create as draft
router.post('/', requirePermission('inventory:create'), asyncHandler(async (req, res) => {
    const { from_warehouse_id, to_warehouse_id, branch_id, lines, notes } = req.body;
    const rBranch = await resolveUUID(branch_id, 'branches', query);
    const rFromWh = await resolveUUID(from_warehouse_id, 'warehouses', query);
    const rToWh = await resolveUUID(to_warehouse_id, 'warehouses', query);
    const branchResult = await query(`SELECT code FROM branches WHERE id = $1`, [rBranch]);
    const number = await generateAutoNumber(branchResult.rows[0]?.code || 'JKT', 'TF');

    const client = await getClient();
    try {
        await client.query('BEGIN');
        const result = await client.query(
            `INSERT INTO stock_transfers (number, date, from_warehouse_id, to_warehouse_id, branch_id, notes, status, created_by)
       VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, 'draft', $6) RETURNING id, uuid, number`,
            [number, rFromWh, rToWh, rBranch, notes, req.user.name]
        );
        for (const line of (lines || [])) {
            const rItem = await resolveUUID(line.item_id, 'items', query);
            await client.query(`INSERT INTO stock_transfer_lines (transfer_id, item_id, qty, uom) VALUES ($1,$2,$3,$4)`, [result.rows[0].id, rItem, line.qty, line.uom]);
        }
        await client.query('COMMIT');
        await query(`INSERT INTO audit_trail (action, module, description, user_id, user_name, branch_id) VALUES ('create','inventory',$1,$2,$3,$4)`, [`Transfer Stok ${result.rows[0].number}`, req.user.id, req.user.name, rBranch]);
        res.status(201).json(result.rows[0]);
    } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
}));

// PUT /api/inventory/transfers/:uuid/submit -- draft → pending
router.put('/:uuid/submit', requirePermission('inventory:edit'), asyncHandler(async (req, res) => {
    const result = await query(`UPDATE stock_transfers SET status='pending', updated_at=NOW() WHERE uuid=$1 AND status='draft' RETURNING uuid, number`, [req.params.uuid]);
    if (result.rows.length === 0) return res.status(400).json({ error: 'Transfer tidak dalam status draft' });
    await query(`INSERT INTO audit_trail (action, module, description, user_id, user_name) VALUES ('submit','inventory',$1,$2,$3)`, [`Submit Transfer ${result.rows[0].number}`, req.user.id, req.user.name]);
    res.json({ message: `${result.rows[0].number} berhasil disubmit` });
}));

// PUT /api/inventory/transfers/:uuid/approve -- pending → approved
router.put('/:uuid/approve', requirePermission('inventory:edit'), asyncHandler(async (req, res) => {
    const result = await query(`UPDATE stock_transfers SET status='approved', updated_at=NOW() WHERE uuid=$1 AND status='pending' RETURNING uuid, number`, [req.params.uuid]);
    if (result.rows.length === 0) return res.status(400).json({ error: 'Transfer tidak dalam status pending' });
    await query(`INSERT INTO audit_trail (action, module, description, user_id, user_name) VALUES ('approve','inventory',$1,$2,$3)`, [`Approve Transfer ${result.rows[0].number}`, req.user.id, req.user.name]);
    res.json({ message: `${result.rows[0].number} berhasil diapprove` });
}));

// PUT /api/inventory/transfers/:uuid/ship -- approved → shipping
router.put('/:uuid/ship', requirePermission('inventory:edit'), asyncHandler(async (req, res) => {
    const tf = await query(`SELECT id, number, from_warehouse_id FROM stock_transfers WHERE uuid=$1 AND status='approved'`, [req.params.uuid]);
    if (tf.rows.length === 0) return res.status(400).json({ error: 'Transfer tidak dalam status approved' });
    const tfId = tf.rows[0].id;
    const fromWh = tf.rows[0].from_warehouse_id;

    // Deduct from source warehouse on shipping
    const client = await getClient();
    try {
        await client.query('BEGIN');
        const lines = await client.query(
            `SELECT tl.item_id, tl.qty, tl.uom, i.name as item_name, i.conversion_factor,
                    su.name as small_uom_name, bu.name as big_uom_name
             FROM stock_transfer_lines tl
             JOIN items i ON tl.item_id = i.id
             LEFT JOIN units su ON i.small_uom_id = su.id
             LEFT JOIN units bu ON i.big_uom_id = bu.id
             WHERE tl.transfer_id=$1`, [tfId]
        );
        // Validate stock availability (convert to base unit)
        for (const l of lines.rows) {
            const convFactor = (l.uom && l.big_uom_name && l.uom === l.big_uom_name) ? (l.conversion_factor || 1) : 1;
            const baseQty = l.qty * convFactor;
            const inv = await client.query(`SELECT COALESCE(qty, 0) as qty FROM inventory WHERE item_id=$1 AND warehouse_id=$2 FOR UPDATE`, [l.item_id, fromWh]);
            const available = inv.rows[0]?.qty || 0;
            if (available < baseQty) {
                await client.query('ROLLBACK');
                const unitLabel = convFactor > 1 ? ` (${l.qty} ${l.uom} = ${baseQty} ${l.small_uom_name || 'Pcs'})` : '';
                return res.status(400).json({ error: `Stok ${l.item_name} tidak cukup. Tersedia: ${available} ${l.small_uom_name || 'Pcs'}, dibutuhkan: ${baseQty} ${l.small_uom_name || 'Pcs'}${unitLabel}` });
            }
        }
        for (const l of lines.rows) {
            const convFactor = (l.uom && l.big_uom_name && l.uom === l.big_uom_name) ? (l.conversion_factor || 1) : 1;
            const baseQty = l.qty * convFactor;
            await client.query(`UPDATE inventory SET qty = qty - $1, updated_at=NOW() WHERE item_id=$2 AND warehouse_id=$3`, [baseQty, l.item_id, fromWh]);
            await client.query(`INSERT INTO stock_movements (item_id, date, type, qty, ref, warehouse_id, description) VALUES ($1, CURRENT_DATE, 'out', $2, $3, $4, $5)`, [l.item_id, baseQty, tf.rows[0].number, fromWh, `Transfer keluar (${l.qty} ${l.uom})`]);
        }
        await client.query(`UPDATE stock_transfers SET status='shipping', updated_at=NOW() WHERE id=$1`, [tfId]);
        await client.query('COMMIT');
        await query(`INSERT INTO audit_trail (action, module, description, user_id, user_name) VALUES ('ship','inventory',$1,$2,$3)`, [`Kirim Transfer ${tf.rows[0].number}`, req.user.id, req.user.name]);
        res.json({ message: `${tf.rows[0].number} dalam proses pengiriman` });
    } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
}));

// PUT /api/inventory/transfers/:uuid/receive -- shipping → received
router.put('/:uuid/receive', requirePermission('inventory:edit'), asyncHandler(async (req, res) => {
    const tf = await query(`SELECT id, number, to_warehouse_id FROM stock_transfers WHERE uuid=$1 AND status='shipping'`, [req.params.uuid]);
    if (tf.rows.length === 0) return res.status(400).json({ error: 'Transfer tidak dalam status shipping' });
    const tfId = tf.rows[0].id;
    const toWh = tf.rows[0].to_warehouse_id;

    // Add to destination warehouse on receive
    const client = await getClient();
    try {
        await client.query('BEGIN');
        const lines = await client.query(
            `SELECT tl.item_id, tl.qty, tl.uom, i.conversion_factor,
                    su.name as small_uom_name, bu.name as big_uom_name
             FROM stock_transfer_lines tl
             JOIN items i ON tl.item_id = i.id
             LEFT JOIN units su ON i.small_uom_id = su.id
             LEFT JOIN units bu ON i.big_uom_id = bu.id
             WHERE tl.transfer_id=$1`, [tfId]
        );
        for (const l of lines.rows) {
            const convFactor = (l.uom && l.big_uom_name && l.uom === l.big_uom_name) ? (l.conversion_factor || 1) : 1;
            const baseQty = l.qty * convFactor;
            await client.query(`INSERT INTO inventory (item_id, warehouse_id, qty) VALUES ($1,$2,$3) ON CONFLICT (item_id, warehouse_id) DO UPDATE SET qty = inventory.qty + $3, updated_at=NOW()`, [l.item_id, toWh, baseQty]);
            await client.query(`INSERT INTO stock_movements (item_id, date, type, qty, ref, warehouse_id, description) VALUES ($1, CURRENT_DATE, 'in', $2, $3, $4, $5)`, [l.item_id, baseQty, tf.rows[0].number, toWh, `Transfer masuk (${l.qty} ${l.uom})`]);
        }
        await client.query(`UPDATE stock_transfers SET status='received', updated_at=NOW() WHERE id=$1`, [tfId]);
        await client.query('COMMIT');
        await query(`INSERT INTO audit_trail (action, module, description, user_id, user_name) VALUES ('receive','inventory',$1,$2,$3)`, [`Terima Transfer ${tf.rows[0].number}`, req.user.id, req.user.name]);
        res.json({ message: `${tf.rows[0].number} telah diterima` });
    } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
}));

module.exports = router;
