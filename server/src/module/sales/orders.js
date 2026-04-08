const router = require('express').Router();
const { query } = require('../../config/db');
const { authenticateToken, requirePermission } = require('../../middleware/auth');
const { validateUUID } = require('../../middleware/validate');
const { asyncHandler, resolveUUID } = require('../../utils/helpers');
const { generateAutoNumber } = require('../../utils/autoNumber');

router.use(authenticateToken);

// GET all SO
router.get('/', requirePermission('sales:view', 'inventory:view', 'accounting:view'), asyncHandler(async (req, res) => {
    const { branch_id, status } = req.query;
    const companyId = req.user.company_id;
    let where = ['b.company_id = $1']; let values = [companyId]; let idx = 2;
    if (branch_id) {
        const rB = await resolveUUID(branch_id, 'branches', query);
        where.push(`so.branch_id = $${idx++}`); values.push(rB);
    }
    if (status) { where.push(`so.status = $${idx++}`); values.push(status); }
    const wc = 'WHERE ' + where.join(' AND ');

    const result = await query(
        `SELECT so.uuid, so.number, so.date, so.status, so.approved_by, so.currency, so.notes, so.created_by,
                so.extra_discount, so.tax_rate, so.tax_amount,
                c.uuid as customer_id, c.name as customer_name, c.is_pkp as customer_is_pkp,
                b.name as branch_name, b.uuid as branch_id,
                COALESCE((SELECT SUM(sol.qty * sol.price * (1 - COALESCE(sol.discount,0)/100))
                           FROM sales_order_lines sol WHERE sol.so_id = so.id), 0) as total
         FROM sales_orders so
         LEFT JOIN customers c ON so.customer_id = c.id
         LEFT JOIN branches b ON so.branch_id = b.id
         ${wc} ORDER BY so.date DESC`, values
    );
    res.json(result.rows);
}));

// GET detail SO
router.get('/:uuid', requirePermission('sales:view', 'inventory:view', 'accounting:view'), validateUUID(), asyncHandler(async (req, res) => {
    const result = await query(
        `SELECT so.uuid, so.number, so.date, so.status, so.approved_by, so.currency, so.notes, so.created_by,
                so.extra_discount, so.tax_rate, so.tax_amount,
                c.uuid as customer_id, c.name as customer_name, c.is_pkp as customer_is_pkp,
                c.npwp as customer_npwp, c.kode_transaksi as customer_kode_transaksi,
                b.uuid as branch_id, b.name as branch_name
         FROM sales_orders so
         LEFT JOIN customers c ON so.customer_id = c.id
         LEFT JOIN branches b ON so.branch_id = b.id
         WHERE so.uuid = $1`, [req.params.uuid]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'SO tidak ditemukan' });
    const soId = (await query(`SELECT id FROM sales_orders WHERE uuid = $1`, [req.params.uuid])).rows[0].id;
    const lines = await query(
        `SELECT sol.qty, sol.price, sol.discount, sol.uom,
                i.uuid as item_id, i.name as item_name, i.code as item_code, i.is_taxable,
                -- Total sudah terkirim via semua GI untuk SO ini (dalam satuan SOL, sebelum konversi)
                COALESCE((
                    SELECT SUM(gil.qty)
                    FROM goods_issue_lines gil
                    JOIN goods_issues gi ON gi.id = gil.gi_id
                    WHERE gi.so_id = $1
                      AND gil.item_id = sol.item_id
                ), 0) AS delivered_qty,
                -- Sisa yang masih harus dikirim
                GREATEST(0,
                    sol.qty - COALESCE((
                        SELECT SUM(gil.qty)
                        FROM goods_issue_lines gil
                        JOIN goods_issues gi ON gi.id = gil.gi_id
                        WHERE gi.so_id = $1
                          AND gil.item_id = sol.item_id
                    ), 0)
                ) AS remaining_qty
         FROM sales_order_lines sol
         JOIN items i ON sol.item_id = i.id
         WHERE sol.so_id = $1`, [soId]
    );
    res.json({ ...result.rows[0], lines: lines.rows });
}));

// POST -- buat SO baru
router.post('/', requirePermission('sales:create'), asyncHandler(async (req, res) => {
    const { customer_id, branch_id, lines, currency, notes, extra_discount } = req.body;

    // Resolve customer
    let resolvedCustomerId = customer_id;
    if (typeof customer_id === 'string' && customer_id.includes('-')) {
        const cr = await query(`SELECT id FROM customers WHERE uuid = $1`, [customer_id]);
        resolvedCustomerId = cr.rows[0]?.id;
        if (!resolvedCustomerId) return res.status(400).json({ error: 'Pelanggan tidak ditemukan' });
    }

    // Resolve branch
    let resolvedBranchId = branch_id || req.user.branch_id;
    if (typeof resolvedBranchId === 'string' && resolvedBranchId.includes('-')) {
        const br = await query(`SELECT id FROM branches WHERE uuid = $1`, [resolvedBranchId]);
        resolvedBranchId = br.rows[0]?.id;
    }

    // Auto-fetch PPN dari companies table jika company adalah PKP
    let taxRate = 0;
    if (req.user.company_id) {
        const companyRes = await query(
            `SELECT c.is_pkp, tc.rate
             FROM companies c
             LEFT JOIN tax_configs tc ON tc.company_id = c.id AND tc.is_active = TRUE
             WHERE c.id = $1`, [req.user.company_id]
        );
        if (companyRes.rows.length > 0 && companyRes.rows[0].is_pkp) {
            taxRate = parseFloat(companyRes.rows[0].rate) || 12;
        }
    }

    // DESIGN DECISION: Stock tidak di-reserve saat SO dibuat.
    // Validasi qty vs stok hanya dilakukan di FE sebagai UX safeguard.
    // Pengurangan stok sesungguhnya terjadi saat Goods Issue (issues.js) dibuat,
    // yang memiliki validasi stok backend yang ketat + DB transaction.
    // Jika perlu reserved stock di masa depan, tambahkan kolom reserved_qty di tabel inventory.
    let subtotal = 0;
    const resolvedLines = [];
    for (const line of (lines || [])) {
        let resolvedItemId = line.item_id;
        if (typeof line.item_id === 'string' && line.item_id.includes('-')) {
            const ir = await query(`SELECT id, is_taxable FROM items WHERE uuid = $1`, [line.item_id]);
            resolvedItemId = ir.rows[0]?.id;
        }
        const itemInfo = await query(`SELECT name, is_taxable, sell_price FROM items WHERE id = $1`, [resolvedItemId]);
        const itemRow = itemInfo.rows[0];
        if (!itemRow) return res.status(400).json({ error: `Item tidak ditemukan: ${line.item_id}` });

        // ── Pricelist Guard: SO tidak boleh dibuat jika item belum ada harga jual ──
        const sellPrice = parseFloat(itemRow.sell_price) || 0;
        const linePrice = parseFloat(line.price) || 0;
        if (sellPrice <= 0 && linePrice <= 0) {
            return res.status(400).json({ error: `Barang "${itemRow.name}" belum memiliki harga jual. Isi Pricelist terlebih dahulu.` });
        }

        const isTaxable = itemRow.is_taxable ?? true;
        const lineTotal = parseFloat(line.qty) * linePrice * (1 - parseFloat(line.discount || 0) / 100);
        if (isTaxable) subtotal += lineTotal;
        resolvedLines.push({ ...line, resolvedItemId });
    }


    const extraDisc = parseFloat(extra_discount) || 0;
    const dpp = subtotal * (1 - extraDisc / 100);
    const taxAmount = taxRate > 0 ? Math.round(dpp * taxRate / 100) : 0;

    const branchResult = await query(`SELECT code FROM branches WHERE id = $1`, [resolvedBranchId]);
    const number = await generateAutoNumber(branchResult.rows[0]?.code || 'JKT', 'SO');

    const result = await query(
        `INSERT INTO sales_orders (number, date, customer_id, branch_id, currency, notes, created_by, extra_discount, tax_rate, tax_amount)
         VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id, uuid, number`,
        [number, resolvedCustomerId, resolvedBranchId, currency || 'IDR', notes, req.user.name,
            extraDisc, taxRate, taxAmount]
    );
    const soId = result.rows[0].id;

    for (const line of resolvedLines) {
        await query(`INSERT INTO sales_order_lines (so_id, item_id, qty, uom, price, discount) VALUES ($1,$2,$3,$4,$5,$6)`,
            [soId, line.resolvedItemId, line.qty, line.uom, line.price, line.discount || 0]);
    }

    await query(`INSERT INTO audit_trail (action, module, description, user_id, user_name, branch_id) VALUES ('create','sales',$1,$2,$3,$4)`,
        [`Membuat SO ${number}${taxRate > 0 ? ` (PPN ${taxRate}%)` : ''}`, req.user.id, req.user.name, resolvedBranchId]);
    res.status(201).json(result.rows[0]);
}));

// PUT submit/approve/reject

// PUT /:uuid — edit SO (hanya saat status draft)
router.put('/:uuid', requirePermission('sales:edit'), validateUUID(), asyncHandler(async (req, res) => {
    const { customer_id, notes, extra_discount, lines, currency } = req.body;

    // Guard: hanya draft yang boleh diedit
    const soRes = await query(`SELECT id, status, branch_id, number FROM sales_orders WHERE uuid = $1`, [req.params.uuid]);
    if (soRes.rows.length === 0) return res.status(404).json({ error: 'SO tidak ditemukan' });
    const so = soRes.rows[0];
    if (so.status !== 'draft') return res.status(400).json({ error: `SO tidak bisa diedit — status saat ini: '${so.status}'` });

    // Resolve customer_id UUID → integer
    let resolvedCustomerId = customer_id;
    if (typeof customer_id === 'string' && customer_id.includes('-')) {
        const cr = await query(`SELECT id FROM customers WHERE uuid = $1`, [customer_id]);
        resolvedCustomerId = cr.rows[0]?.id;
        if (!resolvedCustomerId) return res.status(400).json({ error: 'Customer tidak ditemukan' });
    }

    // Hitung ulang subtotal & PPN
    let taxRate = 0;
    if (req.user.company_id) {
        const companyRes = await query(
            `SELECT c.is_pkp, tc.rate FROM companies c LEFT JOIN tax_configs tc ON tc.company_id = c.id AND tc.is_active = TRUE WHERE c.id = $1`, [req.user.company_id]
        );
        if (companyRes.rows.length > 0 && companyRes.rows[0].is_pkp) taxRate = parseFloat(companyRes.rows[0].rate) || 12;
    }

    let subtotal = 0;
    const resolvedLines = [];
    for (const line of (lines || [])) {
        let resolvedItemId = line.item_id;
        if (typeof line.item_id === 'string' && line.item_id.includes('-')) {
            const ir = await query(`SELECT id, is_taxable FROM items WHERE uuid = $1`, [line.item_id]);
            resolvedItemId = ir.rows[0]?.id;
        }
        const itemInfo = await query(`SELECT is_taxable FROM items WHERE id = $1`, [resolvedItemId]);
        const isTaxable = itemInfo.rows[0]?.is_taxable ?? true;
        const lineTotal = parseFloat(line.qty) * parseFloat(line.price) * (1 - parseFloat(line.discount || 0) / 100);
        if (isTaxable) subtotal += lineTotal;
        resolvedLines.push({ ...line, resolvedItemId });
    }
    const extraDisc = parseFloat(extra_discount) || 0;
    const dpp = subtotal * (1 - extraDisc / 100);
    const taxAmount = taxRate > 0 ? Math.round(dpp * taxRate / 100) : 0;

    // Update header SO
    await query(
        `UPDATE sales_orders SET customer_id=$1, notes=$2, extra_discount=$3, tax_rate=$4, tax_amount=$5, currency=$6, updated_at=NOW() WHERE id=$7`,
        [resolvedCustomerId, notes || null, extraDisc, taxRate, taxAmount, currency || 'IDR', so.id]
    );

    // Delete & re-insert lines
    await query(`DELETE FROM sales_order_lines WHERE so_id = $1`, [so.id]);
    for (const line of resolvedLines) {
        await query(`INSERT INTO sales_order_lines (so_id, item_id, qty, uom, price, discount) VALUES ($1,$2,$3,$4,$5,$6)`,
            [so.id, line.resolvedItemId, line.qty, line.uom, line.price, line.discount || 0]);
    }

    await query(`INSERT INTO audit_trail (action, module, description, user_id, user_name, branch_id) VALUES ('update','sales',$1,$2,$3,$4)`,
        [`Update SO ${so.number}`, req.user.id, req.user.name, so.branch_id]);
    res.json({ message: 'SO berhasil diupdate', uuid: req.params.uuid });
}));

router.put('/:uuid/submit', requirePermission('sales:edit'), validateUUID(), asyncHandler(async (req, res) => {
    const result = await query(`UPDATE sales_orders SET status='pending', updated_at=NOW() WHERE uuid=$1 AND status='draft' RETURNING uuid, number, branch_id`, [req.params.uuid]);
    if (result.rows.length === 0) return res.status(400).json({ error: 'SO tidak bisa disubmit' });
    const { number, branch_id } = result.rows[0];
    await query(`INSERT INTO audit_trail (action, module, description, user_id, user_name, branch_id) VALUES ('submit','sales',$1,$2,$3,$4)`, [`Submit SO ${number}`, req.user.id, req.user.name, branch_id]);
    res.json({ message: 'SO submitted' });
}));

router.put('/:uuid/approve', requirePermission('sales:approve'), validateUUID(), asyncHandler(async (req, res) => {
    const result = await query(`UPDATE sales_orders SET status='approved', approved_by=$1, updated_at=NOW() WHERE uuid=$2 AND status='pending' RETURNING uuid, number`, [req.user.name, req.params.uuid]);
    if (result.rows.length === 0) return res.status(400).json({ error: 'SO tidak bisa diapprove' });
    const so = result.rows[0];
    await query(`INSERT INTO audit_trail (action, module, description, user_id, user_name, branch_id, details_json) VALUES ('approve','sales',$1,$2,$3,(SELECT branch_id FROM sales_orders WHERE uuid=$4),$5)`,
        [`Approve SO ${so.number}`, req.user.id, req.user.name, req.params.uuid, JSON.stringify({ field: 'status', oldValue: 'pending', newValue: 'approved' })]);
    res.json({ message: 'SO approved' });
}));

router.put('/:uuid/reject', requirePermission('sales:approve'), validateUUID(), asyncHandler(async (req, res) => {
    const result = await query(`UPDATE sales_orders SET status='rejected', updated_at=NOW() WHERE uuid=$1 AND status='pending' RETURNING uuid, number, branch_id`, [req.params.uuid]);
    if (result.rows.length === 0) return res.status(400).json({ error: 'SO tidak bisa direject' });
    const { number, branch_id } = result.rows[0];
    await query(`INSERT INTO audit_trail (action, module, description, user_id, user_name, branch_id) VALUES ('reject','sales',$1,$2,$3,$4)`, [`Reject SO ${number}`, req.user.id, req.user.name, branch_id]);
    res.json({ message: 'SO rejected' });
}));

module.exports = router;
