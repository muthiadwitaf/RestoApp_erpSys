const router = require('express').Router();
const { query, getClient } = require('../../config/db');
const { requirePermission } = require('../../middleware/auth');
const { validateUUID } = require('../../middleware/validate');
const { asyncHandler, resolveUUID } = require('../../utils/helpers');
const { generateAutoNumber } = require('../../utils/autoNumber');

router.get('/', requirePermission('purchasing:view', 'inventory:view'), asyncHandler(async (req, res) => {
    const { branch_id, status } = req.query;
    const companyId = req.user.company_id;
    let where = ['b.company_id = $1']; let values = [companyId]; let idx = 2;
    if (branch_id) {
        const rB = await resolveUUID(branch_id, 'branches', query);
        where.push(`po.branch_id = $${idx++}`); values.push(rB);
    }
    if (status) { where.push(`po.status = $${idx++}`); values.push(status); }
    const wc = 'WHERE ' + where.join(' AND ');
    const result = await query(
        `SELECT po.uuid, po.number, po.date, po.status, po.approved_by, po.currency, po.notes, po.created_by,
       po.payment_method, po.payment_term_days, po.extra_discount, po.tax_rate, po.tax_amount,
       s.uuid as supplier_id, s.name as supplier_name, s.is_pkp as supplier_is_pkp,
       b.name as branch_name, b.uuid as branch_id, w.name as warehouse_name,
       COALESCE((SELECT SUM(pol.qty * pol.price * (1 - COALESCE(pol.discount,0)/100)) FROM purchase_order_lines pol WHERE pol.po_id = po.id), 0) as subtotal,
       ROUND(
         COALESCE((SELECT SUM(pol.qty * pol.price * (1 - COALESCE(pol.discount,0)/100)) FROM purchase_order_lines pol WHERE pol.po_id = po.id), 0)
         * (1 - COALESCE(po.extra_discount,0)/100)
         + COALESCE(po.tax_amount, 0)
       ) as total
     FROM purchase_orders po LEFT JOIN suppliers s ON po.supplier_id = s.id
     LEFT JOIN branches b ON po.branch_id = b.id LEFT JOIN warehouses w ON po.warehouse_id = w.id
     ${wc} ORDER BY po.date DESC`, values
    );
    res.json(result.rows);
}));

router.get('/:uuid', requirePermission('purchasing:view', 'inventory:view'), validateUUID(), asyncHandler(async (req, res) => {
    const result = await query(
        `SELECT po.uuid, po.number, po.date, po.status, po.approved_by, po.currency, po.notes, po.created_by,
       po.payment_method, po.payment_term_days, po.extra_discount, po.tax_rate, po.tax_amount,
       s.uuid as supplier_id, b.uuid as branch_id, w.uuid as warehouse_id,
       s.name as supplier_name, s.is_pkp as supplier_is_pkp, b.name as branch_name, w.name as warehouse_name
     FROM purchase_orders po LEFT JOIN suppliers s ON po.supplier_id = s.id LEFT JOIN branches b ON po.branch_id = b.id LEFT JOIN warehouses w ON po.warehouse_id = w.id
     WHERE po.uuid = $1`, [req.params.uuid]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'PO tidak ditemukan' });
    const poId = (await query(`SELECT id FROM purchase_orders WHERE uuid = $1`, [req.params.uuid])).rows[0].id;
    const lines = await query(
        `SELECT pol.qty, pol.price, pol.discount, pol.uom,
                i.uuid as item_id, i.name as item_name, i.code as item_code,
                COALESCE((
                    SELECT SUM(grl.qty)
                    FROM goods_receive_lines grl
                    JOIN goods_receives gr ON grl.gr_id = gr.id
                    WHERE gr.po_id = $1 AND grl.item_id = pol.item_id
                ), 0) as received_qty
         FROM purchase_order_lines pol
         JOIN items i ON pol.item_id = i.id
         WHERE pol.po_id = $1`, [poId]);
    const grList = await query(`SELECT g.uuid, g.number, g.date, g.created_by, w.name as warehouse_name FROM goods_receives g LEFT JOIN warehouses w ON g.warehouse_id = w.id WHERE g.po_id = $1 ORDER BY g.date DESC`, [poId]);
    // Ambil lines per GR untuk tampilkan detail item yang diterima
    for (const gr of grList.rows) {
        const grIdRow = await query(`SELECT id FROM goods_receives WHERE uuid = $1`, [gr.uuid]);
        const grLines = await query(
            `SELECT grl.qty, grl.uom, i.name as item_name, i.code as item_code
             FROM goods_receive_lines grl
             JOIN items i ON grl.item_id = i.id
             WHERE grl.gr_id = $1`, [grIdRow.rows[0].id]
        );
        gr.lines = grLines.rows;
    }
    const billList = await query(`SELECT pb.uuid, pb.number, pb.date, pb.due_date, pb.status, pb.total, pb.currency FROM purchase_bills pb WHERE pb.po_id = $1 ORDER BY pb.date DESC`, [poId]);
    res.json({ ...result.rows[0], lines: lines.rows, gr_list: grList.rows, bill_list: billList.rows });
}));



router.post('/', requirePermission('purchasing:create'), asyncHandler(async (req, res) => {
    const { supplier_id, branch_id, warehouse_id, lines, currency, notes,
        payment_method, payment_term_days, extra_discount } = req.body;
    // Resolve supplier_id UUID
    let resolvedSupplierId = supplier_id;
    if (typeof supplier_id === 'string' && supplier_id.includes('-')) {
        const sr = await query(`SELECT id FROM suppliers WHERE uuid = $1`, [supplier_id]);
        resolvedSupplierId = sr.rows[0]?.id;
        if (!resolvedSupplierId) return res.status(400).json({ error: 'Supplier tidak ditemukan' });
    }
    let resolvedBranchId = branch_id;
    if (typeof branch_id === 'string' && branch_id.includes('-')) {
        const br = await query(`SELECT id FROM branches WHERE uuid = $1`, [branch_id]);
        resolvedBranchId = br.rows[0]?.id;
    }
    let resolvedWhId = warehouse_id;
    if (warehouse_id && typeof warehouse_id === 'string' && warehouse_id.includes('-')) {
        const wr = await query(`SELECT id FROM warehouses WHERE uuid = $1`, [warehouse_id]);
        resolvedWhId = wr.rows[0]?.id;
    }

    // Auto-detect PPN rate from active tax_config if supplier is PKP
    const supRow = await query(`SELECT is_pkp FROM suppliers WHERE id = $1`, [resolvedSupplierId]);
    const isPKP = supRow.rows[0]?.is_pkp || false;
    let taxRate = 0;
    if (isPKP) {
        const taxRow = await query(`SELECT rate FROM tax_configs WHERE is_active = TRUE AND company_id = $1 LIMIT 1`, [req.user.company_id]);
        taxRate = parseFloat(taxRow.rows[0]?.rate || 0);
    }

    const branchResult = await query(`SELECT code FROM branches WHERE id = $1`, [resolvedBranchId]);
    const number = await generateAutoNumber(branchResult.rows[0]?.code || 'JKT', 'PO');

    // Calculate tax_amount from lines
    const lineTotal = (lines || []).reduce((s, l) => s + (l.qty * l.price * (1 - (l.discount || 0) / 100)), 0);
    const extraDiscPct = parseFloat(extra_discount || 0);
    const afterDisc = lineTotal * (1 - extraDiscPct / 100);
    const taxAmount = Math.round(afterDisc * taxRate / 100);

    const client = await getClient();
    try {
        await client.query('BEGIN');
        
        const result = await client.query(
            `INSERT INTO purchase_orders (number, date, supplier_id, branch_id, warehouse_id, currency, notes, created_by,
             payment_method, payment_term_days, extra_discount, tax_rate, tax_amount)
         VALUES ($1,CURRENT_DATE,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id, uuid, number`,
            [number, resolvedSupplierId, resolvedBranchId, resolvedWhId || null, currency || 'IDR', notes, req.user.name,
                payment_method || 'transfer', payment_term_days || 30, extraDiscPct, taxRate, taxAmount]
        );
        for (const l of (lines || [])) {
            let resolvedItemId = l.item_id;
            if (typeof l.item_id === 'string' && l.item_id.includes('-')) {
                const ir = await query(`SELECT id FROM items WHERE uuid = $1`, [l.item_id]);
                resolvedItemId = ir.rows[0]?.id;
            }
            await client.query(`INSERT INTO purchase_order_lines (po_id, item_id, qty, uom, price, discount) VALUES ($1,$2,$3,$4,$5,$6)`, [result.rows[0].id, resolvedItemId, l.qty, l.uom, l.price, l.discount || 0]);
        }
        await client.query('COMMIT');
        await query(`INSERT INTO audit_trail (action, module, description, user_id, user_name, branch_id) VALUES ('create','purchasing',$1,$2,$3,$4)`, [`Membuat PO ${number}`, req.user.id, req.user.name, resolvedBranchId]).catch(() => {});
        res.status(201).json(result.rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}));

// Edit draft PO
router.put('/:uuid', requirePermission('purchasing:edit'), validateUUID(), asyncHandler(async (req, res) => {
    const { supplier_id, warehouse_id, lines, currency, notes,
        payment_method, payment_term_days, extra_discount } = req.body;
    const po = await query(`SELECT id, status FROM purchase_orders WHERE uuid = $1`, [req.params.uuid]);
    if (po.rows.length === 0) return res.status(404).json({ error: 'PO tidak ditemukan' });
    if (po.rows[0].status !== 'draft') return res.status(400).json({ error: 'Hanya PO draft yang bisa diedit' });
    const poId = po.rows[0].id;

    let resolvedSupplierId = supplier_id ? await resolveUUID(supplier_id, 'suppliers', query) : null;
    let resolvedWhId = warehouse_id ? await resolveUUID(warehouse_id, 'warehouses', query) : null;

    // Re-calculate tax if supplier changed
    let taxRate = null;
    if (resolvedSupplierId) {
        const supRow = await query(`SELECT is_pkp FROM suppliers WHERE id = $1`, [resolvedSupplierId]);
        const isPKP = supRow.rows[0]?.is_pkp || false;
        if (isPKP) {
            const taxRow = await query(`SELECT rate FROM tax_configs WHERE is_active = TRUE AND company_id = $1 LIMIT 1`, [req.user.company_id]);
            taxRate = parseFloat(taxRow.rows[0]?.rate || 0);
        } else {
            taxRate = 0;
        }
    }

    const client = await getClient();
    try {
        await client.query('BEGIN');
        await client.query(`UPDATE purchase_orders SET
           supplier_id=COALESCE($1,supplier_id), warehouse_id=COALESCE($2,warehouse_id),
           currency=COALESCE($3,currency), notes=COALESCE($4,notes),
           payment_method=COALESCE($5,payment_method), payment_term_days=COALESCE($6,payment_term_days),
           extra_discount=COALESCE($7,extra_discount),
           tax_rate=COALESCE($8::numeric,tax_rate),
           updated_at=NOW()
         WHERE id=$9`,
            [resolvedSupplierId, resolvedWhId, currency, notes,
                payment_method, payment_term_days != null ? payment_term_days : null,
                extra_discount != null ? extra_discount : null,
                taxRate, poId]);

        if (lines !== undefined) {
            await client.query(`DELETE FROM purchase_order_lines WHERE po_id = $1`, [poId]);
            for (const l of (lines || [])) {
                const rItem = await resolveUUID(l.item_id, 'items', query);
                await client.query(`INSERT INTO purchase_order_lines (po_id, item_id, qty, price, discount, uom) VALUES ($1,$2,$3,$4,$5,$6)`,
                    [poId, rItem, l.qty, l.price, l.discount || 0, l.uom || 'Pcs']);
            }
        }
        await client.query('COMMIT');
        res.json({ message: 'PO berhasil diupdate' });
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}));

router.put('/:uuid/submit', requirePermission('purchasing:edit'), validateUUID(), asyncHandler(async (req, res) => {
    const result = await query(`UPDATE purchase_orders SET status='pending', updated_at=NOW() WHERE uuid=$1 AND status='draft' RETURNING uuid, number, branch_id`, [req.params.uuid]);
    if (result.rows.length === 0) return res.status(400).json({ error: 'PO tidak bisa disubmit' });
    const { number, branch_id } = result.rows[0];
    await query(`INSERT INTO audit_trail (action, module, description, user_id, user_name, branch_id) VALUES ('submit','purchasing',$1,$2,$3,$4)`, [`Submit PO ${number}`, req.user.id, req.user.name, branch_id]);
    res.json({ message: 'PO submitted' });
}));

router.put('/:uuid/approve', requirePermission('purchasing:approve'), validateUUID(), asyncHandler(async (req, res) => {
    const result = await query(`UPDATE purchase_orders SET status='approved', approved_by=$1, updated_at=NOW() WHERE uuid=$2 AND status='pending' RETURNING uuid, number, branch_id`, [req.user.name, req.params.uuid]);
    if (result.rows.length === 0) return res.status(400).json({ error: 'PO tidak bisa diapprove' });
    const { number, branch_id } = result.rows[0];
    await query(`INSERT INTO audit_trail (action, module, description, user_id, user_name, branch_id) VALUES ('approve','purchasing',$1,$2,$3,$4)`, [`Approve PO ${number}`, req.user.id, req.user.name, branch_id]);
    res.json({ message: 'PO approved' });
}));

router.put('/:uuid/reject', requirePermission('purchasing:approve'), validateUUID(), asyncHandler(async (req, res) => {
    const result = await query(`UPDATE purchase_orders SET status='rejected', updated_at=NOW() WHERE uuid=$1 AND status='pending' RETURNING uuid, number, branch_id`, [req.params.uuid]);
    if (result.rows.length === 0) return res.status(400).json({ error: 'PO tidak bisa direject' });
    const { number, branch_id } = result.rows[0];
    await query(`INSERT INTO audit_trail (action, module, description, user_id, user_name, branch_id) VALUES ('reject','purchasing',$1,$2,$3,$4)`, [`Reject PO ${number}`, req.user.id, req.user.name, branch_id]);
    res.json({ message: 'PO rejected' });
}));

// Close PO (partial received, close without full delivery)
router.put('/:uuid/close-po', requirePermission('purchasing:create'), validateUUID(), asyncHandler(async (req, res) => {
    const result = await query(
        `UPDATE purchase_orders SET status='processed', updated_at=NOW()
         WHERE uuid=$1 AND status IN ('approved','partial')
         RETURNING uuid, number, branch_id`,
        [req.params.uuid]
    );
    if (result.rows.length === 0) return res.status(400).json({ error: 'PO tidak bisa di-close (status harus approved atau partial)' });
    const { number, branch_id } = result.rows[0];
    await query(
        `INSERT INTO audit_trail (action, module, description, user_id, user_name, branch_id)
         VALUES ('close','purchasing',$1,$2,$3,$4)`,
        [`Tutup PO ${number} (partial close)`, req.user.id, req.user.name, branch_id]
    );
    res.json({ message: `PO ${number} berhasil ditutup` });
}));

module.exports = router;
