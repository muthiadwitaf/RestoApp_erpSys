const router = require('express').Router();
const { query, getClient } = require('../../config/db');
const { requirePermission } = require('../../middleware/auth');
const { asyncHandler, resolveUUID } = require('../../utils/helpers');
const { generateAutoNumber } = require('../../utils/autoNumber');

// GET all
router.get('/', requirePermission('purchasing:view', 'inventory:view', 'accounting:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const result = await query(
        `SELECT pr.uuid, pr.number, pr.date, pr.status, pr.reason, pr.total, pr.created_by, pr.approved_by,
       pr.shipped_by, pr.shipped_at, pr.resolution_type, pr.resolution_note, pr.resolved_by, pr.resolved_at,
       s.uuid as supplier_id, s.name as supplier_name, po.uuid as po_id, po.number as po_number, b.name as branch_name, b.uuid as branch_id
     FROM purchase_returns pr LEFT JOIN suppliers s ON pr.supplier_id = s.id
     LEFT JOIN purchase_orders po ON pr.po_id = po.id LEFT JOIN branches b ON pr.branch_id = b.id
     WHERE b.company_id = $1
     ORDER BY pr.date DESC`, [companyId]
    );
    res.json(result.rows);
}));

// GET single
router.get('/:uuid', requirePermission('purchasing:view'), asyncHandler(async (req, res) => {
    const result = await query(
        `SELECT pr.uuid, pr.number, pr.date, pr.status, pr.reason, pr.total, pr.created_by, pr.approved_by,
       pr.shipped_by, pr.shipped_at, pr.resolution_type, pr.resolution_note, pr.resolved_by, pr.resolved_at,
       s.uuid as supplier_id, s.name as supplier_name, po.uuid as po_id, po.number as po_number, b.name as branch_name, b.uuid as branch_id
     FROM purchase_returns pr LEFT JOIN suppliers s ON pr.supplier_id = s.id
     LEFT JOIN purchase_orders po ON pr.po_id = po.id LEFT JOIN branches b ON pr.branch_id = b.id
     WHERE pr.uuid = $1`, [req.params.uuid]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Return tidak ditemukan' });
    const retId = (await query(`SELECT id FROM purchase_returns WHERE uuid = $1`, [req.params.uuid])).rows[0].id;
    const lines = await query(
        `SELECT prl.qty, prl.uom, prl.price, i.uuid as item_id, i.name as item_name, i.code as item_code
     FROM purchase_return_lines prl JOIN items i ON prl.item_id = i.id WHERE prl.return_id = $1`, [retId]
    );
    res.json({ ...result.rows[0], lines: lines.rows });
}));

// POST create (draft)
router.post('/', requirePermission('purchasing:create'), asyncHandler(async (req, res) => {
    const { po_id, supplier_id, branch_id, reason, lines } = req.body;
    const rBranch = await resolveUUID(branch_id, 'branches', query);
    const rSupplier = await resolveUUID(supplier_id, 'suppliers', query);
    const rPo = await resolveUUID(po_id, 'purchase_orders', query);
    const branchResult = await query(`SELECT code FROM branches WHERE id = $1`, [rBranch]);
    const number = await generateAutoNumber(branchResult.rows[0]?.code || 'JKT', 'PRET');
    let total = 0;
    for (const l of (lines || [])) total += (l.qty * l.price);
    const result = await query(
        `INSERT INTO purchase_returns (number, date, po_id, supplier_id, branch_id, reason, total, status, created_by)
     VALUES ($1,CURRENT_DATE,$2,$3,$4,$5,$6,'draft',$7) RETURNING id, uuid, number`,
        [number, rPo || null, rSupplier, rBranch, reason, total, req.user.name]
    );
    for (const l of (lines || [])) {
        const rItem = await resolveUUID(l.item_id, 'items', query);
        await query(`INSERT INTO purchase_return_lines (return_id, item_id, qty, uom, price) VALUES ($1,$2,$3,$4,$5)`, [result.rows[0].id, rItem, l.qty, l.uom, l.price]);
    }
    await query(`INSERT INTO audit_trail (action, module, description, user_id, user_name, branch_id) VALUES ('create','purchasing',$1,$2,$3,$4)`,
        [`Buat Retur Pembelian ${number}`, req.user.id, req.user.name, rBranch]);
    res.status(201).json(result.rows[0]);
}));

// PUT /approve -- Manager/Admin approves, NO stock change yet
router.put('/:uuid/approve', requirePermission('purchasing:approve'), asyncHandler(async (req, res) => {
    const result = await query(
        `UPDATE purchase_returns SET status='approved', approved_by=$1, updated_at=NOW() WHERE uuid=$2 AND status='draft' RETURNING uuid, number, branch_id`,
        [req.user.name, req.params.uuid]
    );
    if (result.rows.length === 0) return res.status(400).json({ error: 'Return tidak bisa diapprove' });
    const { number, branch_id } = result.rows[0];
    await query(`INSERT INTO audit_trail (action, module, description, user_id, user_name, branch_id) VALUES ('approve','purchasing',$1,$2,$3,$4)`,
        [`Approve Retur Pembelian ${number}`, req.user.id, req.user.name, branch_id]);
    res.json({ message: 'Retur disetujui, menunggu konfirmasi pengiriman dari gudang' });
}));

// PUT /reject
router.put('/:uuid/reject', requirePermission('purchasing:approve'), asyncHandler(async (req, res) => {
    const result = await query(
        `UPDATE purchase_returns SET status='rejected', approved_by=$1, updated_at=NOW() WHERE uuid=$2 AND status='draft' RETURNING uuid, number, branch_id`,
        [req.user.name, req.params.uuid]
    );
    if (result.rows.length === 0) return res.status(400).json({ error: 'Return tidak bisa direject' });
    const { number, branch_id } = result.rows[0];
    await query(`INSERT INTO audit_trail (action, module, description, user_id, user_name, branch_id) VALUES ('reject','purchasing',$1,$2,$3,$4)`,
        [`Tolak Retur Pembelian ${number}`, req.user.id, req.user.name, branch_id]);
    res.json({ message: 'Return rejected' });
}));

// PUT /ship -- Staff Gudang confirms goods shipped back to supplier → stock OUT + create GI
router.put('/:uuid/ship', requirePermission('inventory:edit', 'inventory:manage'), asyncHandler(async (req, res) => {
    const client = await getClient();
    try {
        await client.query('BEGIN');
        const result = await client.query(
            `UPDATE purchase_returns SET status='shipped', shipped_by=$1, shipped_at=NOW(), updated_at=NOW()
             WHERE uuid=$2 AND status='approved' RETURNING id, uuid, number, branch_id`,
            [req.user.name, req.params.uuid]
        );
        if (result.rows.length === 0) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Hanya retur yang sudah approved yang bisa dikonfirmasi pengirimannya' }); }

        const { id: retId, number, branch_id } = result.rows[0];
        const lines = await client.query(
            `SELECT prl.item_id, prl.qty, prl.uom, i.name as item_name, i.conversion_factor,
                    su.name as small_uom_name, bu.name as big_uom_name
             FROM purchase_return_lines prl
             JOIN items i ON prl.item_id = i.id
             LEFT JOIN units su ON i.small_uom_id = su.id
             LEFT JOIN units bu ON i.big_uom_id = bu.id
             WHERE prl.return_id = $1`, [retId]
        );
        const wh = await client.query(`SELECT id FROM warehouses WHERE branch_id = $1 LIMIT 1`, [branch_id]);
        const warehouseId = wh.rows[0]?.id || null;

        // Create Goods Issue record for warehouse view
        const giNumber = number.replace('PRET', 'GI-PRET');
        const giRes = await client.query(
            `INSERT INTO goods_issues (number, date, warehouse_id, branch_id, status, notes, created_by)
             VALUES ($1, CURRENT_DATE, $2, $3, 'completed', $4, $5) RETURNING id`,
            [giNumber, warehouseId, branch_id, `Pengeluaran retur pembelian: ${number}`, req.user.name]
        );
        const giId = giRes.rows[0].id;

        for (const line of lines.rows) {
            const convFactor = (line.uom && line.big_uom_name && line.uom === line.big_uom_name) ? (line.conversion_factor || 1) : 1;
            const baseQty = line.qty * convFactor;
            // Validate stock availability
            if (warehouseId) {
                const inv = await client.query(`SELECT COALESCE(qty, 0) as qty FROM inventory WHERE item_id=$1 AND warehouse_id=$2`, [line.item_id, warehouseId]);
                const available = inv.rows[0]?.qty || 0;
                if (available < baseQty) {
                    const unitLabel = convFactor > 1 ? ` (${line.qty} ${line.uom} = ${baseQty} ${line.small_uom_name || 'Pcs'})` : '';
                    await client.query('ROLLBACK');
                    return res.status(400).json({ error: `Stok ${line.item_name} tidak cukup untuk retur. Tersedia: ${available} ${line.small_uom_name || 'Pcs'}, dibutuhkan: ${baseQty} ${line.small_uom_name || 'Pcs'}${unitLabel}` });
                }
            }
            // Stock OUT
            if (warehouseId) {
                await client.query(
                    `UPDATE inventory SET qty = qty - $1, updated_at = NOW() WHERE item_id = $2 AND warehouse_id = $3`,
                    [baseQty, line.item_id, warehouseId]
                );
            }
            await client.query(
                `INSERT INTO stock_movements (item_id, date, type, qty, ref, warehouse_id, description) VALUES ($1, CURRENT_DATE, 'out', $2, $3, $4, $5)`,
                [line.item_id, baseQty, number, warehouseId, `Retur pembelian dikirim: ${number} (${line.qty} ${line.uom})`]
            );
            // GI line
            await client.query(
                `INSERT INTO goods_issue_lines (gi_id, item_id, qty, uom) VALUES ($1,$2,$3,$4)`,
                [giId, line.item_id, line.qty, line.uom || 'PCS']
            );
        }

        await client.query('COMMIT');
        await query(`INSERT INTO audit_trail (action, module, description, user_id, user_name, branch_id) VALUES ('update','inventory',$1,$2,$3,$4)`,
            [`Konfirmasi kirim barang retur ${number}`, req.user.id, req.user.name, branch_id]);
        res.json({ message: 'Barang retur dikirim ke supplier, stok disesuaikan' });
    } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
}));

// PUT /resolve -- Finance/Purchasing resolves after shipped + auto journal entry
router.put('/:uuid/resolve', requirePermission('purchasing:edit'), asyncHandler(async (req, res) => {
    const { resolution_type, resolution_note } = req.body;
    const allowed = ['refund_cash', 'refund_transfer', 'replacement'];
    if (!resolution_type || !allowed.includes(resolution_type)) {
        return res.status(400).json({ error: `Tipe resolusi tidak valid. Pilihan: ${allowed.join(', ')}` });
    }
    const client = await getClient();
    try {
        await client.query('BEGIN');
        const result = await client.query(
            `UPDATE purchase_returns SET status='completed', resolution_type=$1, resolution_note=$2, resolved_by=$3, resolved_at=NOW(), updated_at=NOW()
             WHERE uuid=$4 AND status='shipped' RETURNING uuid, number, branch_id, total`,
            [resolution_type, resolution_note || null, req.user.name, req.params.uuid]
        );
        if (result.rows.length === 0) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Hanya retur yang sudah dikirim yang bisa diselesaikan' }); }
        const { number, branch_id, total } = result.rows[0];
        const typeLabel = { refund_cash: 'Refund Tunai', refund_transfer: 'Refund Transfer', replacement: 'Tukar Barang' }[resolution_type];

        // Auto-create journal entry for cash/transfer refund from supplier
        if (resolution_type !== 'replacement' && parseFloat(total) > 0) {
            const brRes = await client.query(`SELECT id, code FROM branches WHERE id = $1`, [branch_id]);
            const branchCode = brRes.rows[0]?.code || 'JKT';
            const jnRes = await client.query(
                `INSERT INTO auto_number_counters (prefix, year, letter, counter)
                 VALUES ($1, $2, 'A', 1)
                 ON CONFLICT (prefix, year, letter) DO UPDATE SET counter = auto_number_counters.counter + 1
                 RETURNING counter`,
                [`${branchCode}-JU`, new Date().getFullYear().toString()]
            );
            const jnNumber = `${branchCode}-JU-${new Date().getFullYear()}-A-${String(jnRes.rows[0].counter).padStart(8, '0')}`;

            const jeRes = await client.query(
                `INSERT INTO journal_entries (number, date, description, branch_id, created_by, status, ref_number, ref_type)
                 VALUES ($1, CURRENT_DATE, $2, $3, $4, 'posted', $5, 'PRET') RETURNING id`,
                [jnNumber, `${typeLabel} - Retur Pembelian ${number}`, branch_id, req.user.name, number]
            );
            const jeId = jeRes.rows[0].id;

            // Purchase return: supplier refunds us
            // Debit Kas/Bank (asset in), Credit Utang Dagang (reduce liability)
            const debitCode = resolution_type === 'refund_cash' ? '1-0001' : '1-0003';
            const creditCode = '2-0001'; // Utang Dagang
            const debitAcc = await client.query(`SELECT id FROM chart_of_accounts WHERE code = $1 AND company_id = $2`, [debitCode, req.user.company_id]);
            const creditAcc = await client.query(`SELECT id FROM chart_of_accounts WHERE code = $1 AND company_id = $2`, [creditCode, req.user.company_id]);

            if (debitAcc.rows[0] && creditAcc.rows[0]) {
                await client.query(
                    `INSERT INTO journal_lines (journal_id, account_id, debit, credit, description) VALUES ($1,$2,$3,0,$4)`,
                    [jeId, debitAcc.rows[0].id, total, `Refund dari supplier - ${number}`]
                );
                await client.query(
                    `INSERT INTO journal_lines (journal_id, account_id, debit, credit, description) VALUES ($1,$2,0,$3,$4)`,
                    [jeId, creditAcc.rows[0].id, total, `Pengurangan utang dagang - ${number}`]
                );
                // Update account balances (posted immediately)
                await client.query(`UPDATE chart_of_accounts SET balance = balance + $1, updated_at=NOW() WHERE id = $2`, [total, debitAcc.rows[0].id]);
                await client.query(`UPDATE chart_of_accounts SET balance = balance - $1, updated_at=NOW() WHERE id = $2`, [total, creditAcc.rows[0].id]);
            }
        }

        await client.query('COMMIT');
        await query(`INSERT INTO audit_trail (action, module, description, user_id, user_name, branch_id) VALUES ('update','purchasing',$1,$2,$3,$4)`,
            [`Resolusi Retur ${number}: ${typeLabel}`, req.user.id, req.user.name, branch_id]);
        res.json({ message: `Retur selesai: ${typeLabel}` });
    } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
}));

// PUT edit (draft only)
router.put('/:uuid', requirePermission('purchasing:edit'), asyncHandler(async (req, res) => {
    const { po_id, supplier_id, reason, lines } = req.body;
    const retResult = await query(`SELECT id, status, number, branch_id FROM purchase_returns WHERE uuid = $1`, [req.params.uuid]);
    if (retResult.rows.length === 0) return res.status(404).json({ error: 'Return tidak ditemukan' });
    if (retResult.rows[0].status !== 'draft') return res.status(400).json({ error: 'Hanya draft yang bisa diedit' });
    const { id: retId, number, branch_id } = retResult.rows[0];
    const rPo = po_id ? await resolveUUID(po_id, 'purchase_orders', query) : null;
    const rSupplier = supplier_id ? await resolveUUID(supplier_id, 'suppliers', query) : null;
    let total = 0;
    for (const l of (lines || [])) total += (l.qty * l.price);
    await query(`UPDATE purchase_returns SET po_id=$1, supplier_id=$2, reason=$3, total=$4, updated_at=NOW() WHERE id=$5`, [rPo, rSupplier, reason, total, retId]);
    await query(`DELETE FROM purchase_return_lines WHERE return_id = $1`, [retId]);
    for (const l of (lines || [])) {
        const rItem = await resolveUUID(l.item_id, 'items', query);
        await query(`INSERT INTO purchase_return_lines (return_id, item_id, qty, uom, price) VALUES ($1,$2,$3,$4,$5)`, [retId, rItem, l.qty, l.uom, l.price]);
    }
    await query(`INSERT INTO audit_trail (action, module, description, user_id, user_name, branch_id) VALUES ('update','purchasing',$1,$2,$3,$4)`,
        [`Edit Retur Pembelian ${number}`, req.user.id, req.user.name, branch_id]);
    res.json({ message: 'Return updated' });
}));

module.exports = router;
