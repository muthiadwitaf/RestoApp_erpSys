const router = require('express').Router();
const { query, getClient } = require('../../config/db');
const { requirePermission } = require('../../middleware/auth');
const { asyncHandler, resolveUUID } = require('../../utils/helpers');
const { generateAutoNumber } = require('../../utils/autoNumber');

// GET all
router.get('/', requirePermission('sales:view', 'inventory:view', 'accounting:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const result = await query(
        `SELECT sr.uuid, sr.number, sr.date, sr.status, sr.reason, sr.total, sr.created_by, sr.approved_by,
       sr.received_by, sr.received_at, sr.resolution_type, sr.resolution_note, sr.resolved_by, sr.resolved_at,
       c.uuid as customer_id, c.name as customer_name, so.uuid as so_id, so.number as so_number, b.name as branch_name, b.uuid as branch_id
     FROM sales_returns sr LEFT JOIN customers c ON sr.customer_id = c.id
     LEFT JOIN sales_orders so ON sr.so_id = so.id LEFT JOIN branches b ON sr.branch_id = b.id
     WHERE b.company_id = $1
     ORDER BY sr.date DESC`, [companyId]
    );
    res.json(result.rows);
}));

// GET single
router.get('/:uuid', requirePermission('sales:view'), asyncHandler(async (req, res) => {
    const result = await query(
        `SELECT sr.uuid, sr.number, sr.date, sr.status, sr.reason, sr.total, sr.created_by, sr.approved_by,
       sr.received_by, sr.received_at, sr.resolution_type, sr.resolution_note, sr.resolved_by, sr.resolved_at,
       c.uuid as customer_id, c.name as customer_name, so.uuid as so_id, so.number as so_number, b.name as branch_name, b.uuid as branch_id
     FROM sales_returns sr LEFT JOIN customers c ON sr.customer_id = c.id
     LEFT JOIN sales_orders so ON sr.so_id = so.id LEFT JOIN branches b ON sr.branch_id = b.id
     WHERE sr.uuid = $1`, [req.params.uuid]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Return tidak ditemukan' });
    const retId = (await query(`SELECT id FROM sales_returns WHERE uuid = $1`, [req.params.uuid])).rows[0].id;
    const lines = await query(
        `SELECT srl.qty, srl.uom, srl.price, i.uuid as item_id, i.name as item_name, i.code as item_code
     FROM sales_return_lines srl JOIN items i ON srl.item_id = i.id WHERE srl.return_id = $1`, [retId]
    );
    res.json({ ...result.rows[0], lines: lines.rows });
}));

// POST create (draft)
router.post('/', requirePermission('sales:create'), asyncHandler(async (req, res) => {
    const { so_id, customer_id, branch_id, reason, lines } = req.body;
    const rBranch = await resolveUUID(branch_id, 'branches', query);
    const rCustomer = await resolveUUID(customer_id, 'customers', query);
    const rSo = await resolveUUID(so_id, 'sales_orders', query);
    const branchResult = await query(`SELECT code FROM branches WHERE id = $1`, [rBranch]);
    const number = await generateAutoNumber(branchResult.rows[0]?.code || 'JKT', 'RET');
    let total = 0;
    for (const l of (lines || [])) total += (l.qty * l.price);
    const client = await getClient();
    try {
        await client.query('BEGIN');
        const result = await client.query(
            `INSERT INTO sales_returns (number, date, so_id, customer_id, branch_id, reason, total, status, created_by)
         VALUES ($1,CURRENT_DATE,$2,$3,$4,$5,$6,'draft',$7) RETURNING id, uuid, number`,
            [number, rSo || null, rCustomer, rBranch, reason, total, req.user.name]
        );
        for (const l of (lines || [])) {
            const rItem = await resolveUUID(l.item_id, 'items', query);
            await client.query(`INSERT INTO sales_return_lines (return_id, item_id, qty, uom, price) VALUES ($1,$2,$3,$4,$5)`, [result.rows[0].id, rItem, l.qty, l.uom, l.price]);
        }
        await client.query('COMMIT');
        await query(`INSERT INTO audit_trail (action, module, description, user_id, user_name, branch_id) VALUES ('create','sales',$1,$2,$3,$4)`,
            [`Buat Retur Penjualan ${number}`, req.user.id, req.user.name, rBranch]);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}));

// PUT /approve -- Manager/Admin approves, NO stock change yet
router.put('/:uuid/approve', requirePermission('sales:approve'), asyncHandler(async (req, res) => {
    const result = await query(
        `UPDATE sales_returns SET status='approved', approved_by=$1, updated_at=NOW() WHERE uuid=$2 AND status='draft' RETURNING uuid, number, branch_id`,
        [req.user.name, req.params.uuid]
    );
    if (result.rows.length === 0) return res.status(400).json({ error: 'Return tidak bisa diapprove' });
    const { number, branch_id } = result.rows[0];
    await query(`INSERT INTO audit_trail (action, module, description, user_id, user_name, branch_id) VALUES ('approve','sales',$1,$2,$3,$4)`,
        [`Approve Retur Penjualan ${number}`, req.user.id, req.user.name, branch_id]);
    res.json({ message: 'Retur disetujui, menunggu konfirmasi penerimaan barang dari gudang' });
}));

// PUT /reject
router.put('/:uuid/reject', requirePermission('sales:approve'), asyncHandler(async (req, res) => {
    const result = await query(
        `UPDATE sales_returns SET status='rejected', approved_by=$1, updated_at=NOW() WHERE uuid=$2 AND status='draft' RETURNING uuid, number, branch_id`,
        [req.user.name, req.params.uuid]
    );
    if (result.rows.length === 0) return res.status(400).json({ error: 'Return tidak bisa direject' });
    const { number, branch_id } = result.rows[0];
    await query(`INSERT INTO audit_trail (action, module, description, user_id, user_name, branch_id) VALUES ('reject','sales',$1,$2,$3,$4)`,
        [`Tolak Retur Penjualan ${number}`, req.user.id, req.user.name, branch_id]);
    res.json({ message: 'Return rejected' });
}));

// PUT /receive -- Staff Gudang confirms goods received → stock IN + create GR
router.put('/:uuid/receive', requirePermission('inventory:edit'), asyncHandler(async (req, res) => {
    const client = await getClient();
    try {
        await client.query('BEGIN');
        const result = await client.query(
            `UPDATE sales_returns SET status='received', received_by=$1, received_at=NOW(), updated_at=NOW()
             WHERE uuid=$2 AND status='approved' RETURNING id, uuid, number, branch_id`,
            [req.user.name, req.params.uuid]
        );
        if (result.rows.length === 0) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Hanya retur yang sudah approved yang bisa dikonfirmasi penerimaannya' }); }

        const { id: retId, number, branch_id } = result.rows[0];
        const lines = await client.query(`SELECT item_id, qty, uom FROM sales_return_lines WHERE return_id = $1`, [retId]);
        const wh = await client.query(`SELECT id FROM warehouses WHERE branch_id = $1 LIMIT 1`, [branch_id]);
        const warehouseId = wh.rows[0]?.id || null;

        // Create Goods Receive record for warehouse view
        const grNumber = number.replace('RET', 'GR-RET');
        const grRes = await client.query(
            `INSERT INTO goods_receives (number, date, warehouse_id, branch_id, status, notes, created_by)
             VALUES ($1, CURRENT_DATE, $2, $3, 'completed', $4, $5) RETURNING id`,
            [grNumber, warehouseId, branch_id, `Penerimaan retur penjualan: ${number}`, req.user.name]
        );
        const grId = grRes.rows[0].id;

        for (const line of lines.rows) {
            // Stock IN
            if (warehouseId) {
                await client.query(
                    `INSERT INTO inventory (item_id, warehouse_id, qty) VALUES ($1,$2,$3)
                     ON CONFLICT (item_id, warehouse_id) DO UPDATE SET qty = inventory.qty + $3, updated_at = NOW()`,
                    [line.item_id, warehouseId, line.qty]
                );
            }
            await client.query(
                `INSERT INTO stock_movements (item_id, date, type, qty, ref, warehouse_id, description) VALUES ($1, CURRENT_DATE, 'in', $2, $3, $4, $5)`,
                [line.item_id, line.qty, number, warehouseId, `Retur penjualan diterima: ${number}`]
            );
            // GR line
            await client.query(
                `INSERT INTO goods_receive_lines (gr_id, item_id, qty, uom) VALUES ($1,$2,$3,$4)`,
                [grId, line.item_id, line.qty, line.uom || 'PCS']
            );
        }

        await client.query('COMMIT');
        await query(`INSERT INTO audit_trail (action, module, description, user_id, user_name, branch_id) VALUES ('update','inventory',$1,$2,$3,$4)`,
            [`Konfirmasi terima barang retur ${number}`, req.user.id, req.user.name, branch_id]);
        res.json({ message: 'Barang retur diterima, stok disesuaikan' });
    } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
}));

// PUT /refund -- Finance processes refund + auto journal entry
router.put('/:uuid/refund', requirePermission('accounting:create'), asyncHandler(async (req, res) => {
    const { resolution_type, resolution_note } = req.body;
    const allowed = ['refund_cash', 'refund_transfer', 'replacement'];
    if (!resolution_type || !allowed.includes(resolution_type)) {
        return res.status(400).json({ error: `Tipe resolusi tidak valid. Pilihan: ${allowed.join(', ')}` });
    }
    const client = await getClient();
    try {
        await client.query('BEGIN');
        const result = await client.query(
            `UPDATE sales_returns SET status='completed', resolution_type=$1, resolution_note=$2, resolved_by=$3, resolved_at=NOW(), updated_at=NOW()
             WHERE uuid=$4 AND status='received' RETURNING uuid, number, branch_id, total`,
            [resolution_type, resolution_note || null, req.user.name, req.params.uuid]
        );
        if (result.rows.length === 0) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Hanya retur yang sudah diterima gudang yang bisa diproses refund' }); }
        const { number, branch_id, total } = result.rows[0];
        const typeLabel = { refund_cash: 'Refund Tunai', refund_transfer: 'Refund Transfer', replacement: 'Tukar Barang' }[resolution_type];

        // Auto-create journal entry for cash/transfer refund
        if (resolution_type !== 'replacement' && parseFloat(total) > 0) {
            const brRes = await client.query(`SELECT id, code FROM branches WHERE id = $1`, [branch_id]);
            const branchCode = brRes.rows[0]?.code || 'JKT';
            // Generate journal number
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
                 VALUES ($1, CURRENT_DATE, $2, $3, $4, 'posted', $5, 'SRET') RETURNING id`,
                [jnNumber, `${typeLabel} - Retur Penjualan ${number}`, branch_id, req.user.name, number]
            );
            const jeId = jeRes.rows[0].id;

            // Determine credit account: Kas (1-0001) for cash, Bank BCA (1-0003) for transfer
            const creditCode = resolution_type === 'refund_cash' ? '1-0001' : '1-0003';
            const debitCode = '4-0001'; // Pendapatan Penjualan
            const debitAcc = await client.query(`SELECT id FROM chart_of_accounts WHERE code = $1 AND company_id = $2`, [debitCode, req.user.company_id]);
            const creditAcc = await client.query(`SELECT id FROM chart_of_accounts WHERE code = $1 AND company_id = $2`, [creditCode, req.user.company_id]);

            if (debitAcc.rows[0] && creditAcc.rows[0]) {
                await client.query(
                    `INSERT INTO journal_lines (journal_id, account_id, debit, credit, description) VALUES ($1,$2,$3,0,$4)`,
                    [jeId, debitAcc.rows[0].id, total, `Retur penjualan ${number}`]
                );
                await client.query(
                    `INSERT INTO journal_lines (journal_id, account_id, debit, credit, description) VALUES ($1,$2,0,$3,$4)`,
                    [jeId, creditAcc.rows[0].id, total, `${typeLabel} ke customer`]
                );
                // Update account balances (posted immediately)
                await client.query(`UPDATE chart_of_accounts SET balance = balance + $1, updated_at=NOW() WHERE id = $2`, [total, debitAcc.rows[0].id]);
                await client.query(`UPDATE chart_of_accounts SET balance = balance - $1, updated_at=NOW() WHERE id = $2`, [total, creditAcc.rows[0].id]);
            }
        }

        await client.query('COMMIT');
        await query(`INSERT INTO audit_trail (action, module, description, user_id, user_name, branch_id) VALUES ('update','sales',$1,$2,$3,$4)`,
            [`Refund Retur ${number}: ${typeLabel}`, req.user.id, req.user.name, branch_id]);
        res.json({ message: `Retur selesai: ${typeLabel}` });
    } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
}));

// PUT edit (draft only)
router.put('/:uuid', requirePermission('sales:edit'), asyncHandler(async (req, res) => {
    const { so_id, customer_id, reason, lines } = req.body;
    const retResult = await query(`SELECT id, status, number, branch_id FROM sales_returns WHERE uuid = $1`, [req.params.uuid]);
    if (retResult.rows.length === 0) return res.status(404).json({ error: 'Return tidak ditemukan' });
    if (retResult.rows[0].status !== 'draft') return res.status(400).json({ error: 'Hanya draft yang bisa diedit' });
    const { id: retId, number, branch_id } = retResult.rows[0];
    const rSo = so_id ? await resolveUUID(so_id, 'sales_orders', query) : null;
    const rCustomer = customer_id ? await resolveUUID(customer_id, 'customers', query) : null;
    let total = 0;
    for (const l of (lines || [])) total += (l.qty * l.price);
    
    const client = await getClient();
    try {
        await client.query('BEGIN');
        await client.query(`UPDATE sales_returns SET so_id=$1, customer_id=$2, reason=$3, total=$4, updated_at=NOW() WHERE id=$5`, [rSo, rCustomer, reason, total, retId]);
        await client.query(`DELETE FROM sales_return_lines WHERE return_id = $1`, [retId]);
        for (const l of (lines || [])) {
            const rItem = await resolveUUID(l.item_id, 'items', query);
            await client.query(`INSERT INTO sales_return_lines (return_id, item_id, qty, uom, price) VALUES ($1,$2,$3,$4,$5)`, [retId, rItem, l.qty, l.uom, l.price]);
        }
        await client.query('COMMIT');
        await query(`INSERT INTO audit_trail (action, module, description, user_id, user_name, branch_id) VALUES ('update','sales',$1,$2,$3,$4)`,
            [`Edit Retur Penjualan ${number}`, req.user.id, req.user.name, branch_id]);
        res.json({ message: 'Return updated' });
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}));

module.exports = router;
