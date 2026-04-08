const router = require('express').Router();
const { query, getClient } = require('../../config/db');
const { authenticateToken, requirePermission } = require('../../middleware/auth');
const { validateUUID } = require('../../middleware/validate');
const { asyncHandler, resolveUUID, updateCoaBalancesForJournal } = require('../../utils/helpers');
const { generateAutoNumber } = require('../../utils/autoNumber');

router.use(authenticateToken);

// GET all bills — includes amount_paid & payment history per bill
router.get('/', requirePermission('purchasing:view', 'accounting:view'), asyncHandler(async (req, res) => {
    const { po_id } = req.query;
    const companyId = req.user.company_id;

    let extraWhere = ''; let values = [companyId]; let idx = 2;
    if (po_id) {
        const rPo = await resolveUUID(po_id, 'purchase_orders', query);
        extraWhere = ` AND pb.po_id = $${idx++}`;
        values.push(rPo);
    }
    const result = await query(
        `SELECT pb.uuid, pb.number, pb.date, pb.due_date,
                COALESCE(pb.status, 'unpaid') as status,
                pb.total, pb.amount_paid,
                COALESCE(pb.total, 0) - COALESCE(pb.amount_paid, 0) as remaining,
                pb.currency, pb.created_by,
                COALESCE(pb.tax_amount, 0) as bill_tax_amount,
                po.uuid as po_id, po.number as po_number,
                po.payment_method, po.payment_term_days,
                po.extra_discount, po.tax_rate, po.tax_amount,
                b.name as branch_name, b.uuid as branch_id,
                s.name as supplier_name, s.phone as supplier_phone,
                s.address as supplier_address,
                COALESCE(
                  (SELECT json_agg(json_build_object(
                    'item_code',     i.code,
                    'item_name',     i.name,
                    'ordered_qty',   pol.qty,
                    'qty',           COALESCE((
                                         SELECT SUM(grl2.qty)
                                         FROM goods_receive_lines grl2
                                         WHERE grl2.gr_id = pb.gr_id AND grl2.item_id = pol.item_id
                                     ), 0),
                    'uom',           pol.uom,
                    'price',         pol.price,
                    'discount',      pol.discount
                  ) ORDER BY pol.id)
                  FROM purchase_order_lines pol
                  LEFT JOIN items i ON pol.item_id = i.id
                  WHERE pol.po_id = po.id), '[]'::json
                ) as lines,
                COALESCE(
                  (SELECT json_agg(json_build_object(
                    'uuid', bp.uuid,
                    'date', bp.date,
                    'amount', bp.amount,
                    'notes', bp.notes,
                    'created_by', bp.created_by,
                    'account_name', coa.name,
                    'account_code', coa.code
                  ) ORDER BY bp.date DESC, bp.id DESC)
                  FROM bill_payments bp
                  LEFT JOIN chart_of_accounts coa ON bp.cash_account_id = coa.id
                  WHERE bp.bill_id = pb.id), '[]'::json
                ) as payments
         FROM purchase_bills pb
         JOIN branches b ON pb.branch_id = b.id
         LEFT JOIN purchase_orders po ON pb.po_id = po.id
         LEFT JOIN suppliers s ON po.supplier_id = s.id
         WHERE b.company_id = $1${extraWhere}
         ORDER BY pb.date DESC, pb.id DESC`, values
    );
    res.json(result.rows);
}));

// GET bill payments history
router.get('/:uuid/payments', requirePermission('purchasing:view', 'accounting:view'), validateUUID(), asyncHandler(async (req, res) => {
    const bill = await query(`SELECT id FROM purchase_bills WHERE uuid = $1`, [req.params.uuid]);
    if (bill.rows.length === 0) return res.status(404).json({ error: 'Bill tidak ditemukan' });
    const billId = bill.rows[0].id;
    const result = await query(
        `SELECT bp.uuid, bp.date, bp.amount, bp.notes, bp.created_by, bp.created_at,
                coa.uuid as account_id, coa.name as account_name, coa.code as account_code,
                je.uuid as journal_uuid, je.number as journal_number
         FROM bill_payments bp
         LEFT JOIN chart_of_accounts coa ON bp.cash_account_id = coa.id
         LEFT JOIN journal_entries je ON bp.journal_id = je.id
         WHERE bp.bill_id = $1
         ORDER BY bp.date DESC, bp.id DESC`, [billId]
    );
    res.json(result.rows);
}));

// POST create bill -- manual (masih bisa untuk kasus non-GR)
router.post('/', requirePermission('purchasing:create'), asyncHandler(async (req, res) => {
    const { po_id, branch_id, due_date, total, currency } = req.body;
    const rBranch = branch_id ? await resolveUUID(branch_id, 'branches', query) : null;
    const rPo = po_id ? await resolveUUID(po_id, 'purchase_orders', query) : null;
    const branchResult = rBranch ? await query(`SELECT code FROM branches WHERE id = $1`, [rBranch]) : { rows: [{ code: 'JKT' }] };
    const branchCode = branchResult.rows[0]?.code || 'JKT';
    const number = await generateAutoNumber(branchCode, 'BILL');
    const billTotal = parseFloat(total || 0);

    // Ambil tax_amount dari PO terkait (jika ada)
    let taxAmount = 0;
    if (rPo) {
        const poTax = await query(`SELECT tax_amount FROM purchase_orders WHERE id = $1`, [rPo]);
        taxAmount = parseFloat(poTax.rows[0]?.tax_amount || 0);
    }
    const dpp = billTotal - taxAmount; // Dasar Pengenaan Pajak

    const client = await getClient();
    try {
        await client.query('BEGIN');

        // 1. Insert bill (simpan tax_amount)
        const result = await client.query(
            `INSERT INTO purchase_bills (number, po_id, date, due_date, branch_id, total, tax_amount, currency, created_by, amount_paid)
             VALUES ($1,$2,CURRENT_DATE,$3,$4,$5,$6,$7,$8, 0) RETURNING uuid, number, id`,
            [number, rPo || null, due_date, rBranch, billTotal, taxAmount, currency || 'IDR', req.user.name]
        );
        if (rPo) {
            await client.query(`UPDATE purchase_orders SET status='billed', updated_at=NOW() WHERE id=$1 AND status='processed'`, [rPo]);
        }

        // 2. Jurnal pengakuan hutang dengan PPN Masukan
        if (billTotal > 0) {
            // Cari / buat akun Persediaan Barang (asset)
            let persediaanId = null;
            const persRes = await client.query(
                `SELECT id FROM chart_of_accounts
                 WHERE company_id = $1
                   AND (LOWER(name) LIKE '%persediaan%' OR LOWER(name) LIKE '%inventory%' OR LOWER(name) LIKE '%stok%')
                   AND (type = 'asset' OR type = 'Aset')
                 ORDER BY code LIMIT 1`, [req.user.company_id]
            );
            if (persRes.rows.length > 0) { persediaanId = persRes.rows[0].id; }
            else {
                const r = await client.query(
                    `INSERT INTO chart_of_accounts (code, name, type, category, currency, company_id)
                     VALUES ('1300','Persediaan Barang','asset','persediaan','IDR',$1)
                     ON CONFLICT (code, company_id) DO UPDATE SET name=EXCLUDED.name RETURNING id`,
                    [req.user.company_id]
                );
                persediaanId = r.rows[0].id;
            }

            // Cari / buat akun Hutang Usaha (liability)
            let hutangId = null;
            const hutangRes = await client.query(
                `SELECT id FROM chart_of_accounts
                 WHERE company_id = $1
                   AND (type = 'liability' OR type = 'Liabilitas')
                   AND (LOWER(name) LIKE '%hutang usaha%' OR LOWER(name) LIKE '%utang dagang%'
                        OR LOWER(name) LIKE '%accounts payable%' OR LOWER(name) LIKE '%utang usaha%')
                 ORDER BY code LIMIT 1`, [req.user.company_id]
            );
            if (hutangRes.rows.length > 0) { hutangId = hutangRes.rows[0].id; }
            else {
                const r = await client.query(
                    `INSERT INTO chart_of_accounts (code, name, type, category, currency, company_id)
                     VALUES ('2100','Hutang Usaha','liability','hutang','IDR',$1)
                     ON CONFLICT (code, company_id) DO UPDATE SET name=EXCLUDED.name RETURNING id`,
                    [req.user.company_id]
                );
                hutangId = r.rows[0].id;
            }

            // Cari / buat akun PPN Masukan (asset — piutang pajak ke negara)
            let ppnMasukanId = null;
            if (taxAmount > 0) {
                const ppnRes = await client.query(
                    `SELECT id FROM chart_of_accounts
                     WHERE company_id = $1
                       AND (LOWER(name) LIKE '%ppn masukan%' OR LOWER(name) LIKE '%pajak masukan%'
                            OR LOWER(name) LIKE '%input vat%' OR LOWER(name) LIKE '%vat masukan%')
                     ORDER BY code LIMIT 1`, [req.user.company_id]
                );
                if (ppnRes.rows.length > 0) { ppnMasukanId = ppnRes.rows[0].id; }
                else {
                    const r = await client.query(
                        `INSERT INTO chart_of_accounts (code, name, type, category, currency, company_id)
                         VALUES ('1510','PPN Masukan','asset','pajak','IDR',$1)
                         ON CONFLICT (code, company_id) DO UPDATE SET name=EXCLUDED.name RETURNING id`,
                        [req.user.company_id]
                    );
                    ppnMasukanId = r.rows[0].id;
                }
            }

            // Buat jurnal
            const journalNumber = await generateAutoNumber(branchCode, 'JU');
            const journalRes = await client.query(
                `INSERT INTO journal_entries (number, date, branch_id, description, status, created_by, ref_number, ref_type)
                 VALUES ($1, CURRENT_DATE, $2, $3, 'posted', $4, $5, 'BILL') RETURNING id`,
                [journalNumber, rBranch, `Tagihan Pembelian ${number}`, req.user.name, number]
            );
            const journalId = journalRes.rows[0].id;
            const desc = `Tagihan ${number}`;

            if (taxAmount > 0 && ppnMasukanId) {
                // 3 baris: Dr. Persediaan (DPP) + Dr. PPN Masukan / Cr. Hutang Usaha (total)
                await client.query(
                    `INSERT INTO journal_lines (journal_id, account_id, debit, credit, description) VALUES
                     ($1,$2,$3,0,$5),
                     ($1,$4,$6,0,$5),
                     ($1,$7,0,$8,$5)`,
                    [journalId, persediaanId, dpp, ppnMasukanId, desc, taxAmount, hutangId, billTotal]
                );
            } else {
                // Tanpa PPN — 2 baris: Dr. Persediaan / Cr. Hutang Usaha
                await client.query(
                    `INSERT INTO journal_lines (journal_id, account_id, debit, credit, description)
                     VALUES ($1,$2,$3,0,$4), ($1,$5,0,$3,$4)`,
                    [journalId, persediaanId, billTotal, desc, hutangId]
                );
            }
            // Update COA balances
            await updateCoaBalancesForJournal(client, journalId);
        }

        await client.query('COMMIT');
        await query(`INSERT INTO audit_trail (action, module, description, user_id, user_name, branch_id) VALUES ('create','purchasing',$1,$2,$3,$4)`, [`Membuat Tagihan ${number}`, req.user.id, req.user.name, rBranch]);
        res.status(201).json({ uuid: result.rows[0].uuid, number: result.rows[0].number });
    } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
}));


// PUT pay bill — partial payment support
// Body: { cash_account_id (uuid), amount (numeric), notes?, date? }
router.put('/:uuid/pay', requirePermission('purchasing:edit', 'accounting:create'), validateUUID(), asyncHandler(async (req, res) => {
    const { cash_account_id, amount, notes, date } = req.body;
    if (!cash_account_id) return res.status(400).json({ error: 'cash_account_id wajib diisi' });
    if (!amount || parseFloat(amount) <= 0) return res.status(400).json({ error: 'Jumlah pembayaran harus lebih dari 0' });

    const client = await getClient();
    try {
        await client.query('BEGIN');

        // 1. Get bill details
        const bill = await client.query(
            `SELECT pb.id, pb.po_id, pb.number, pb.branch_id, pb.total, pb.amount_paid,
                    COALESCE(pb.tax_amount, 0) as tax_amount,
                    po.supplier_id, s.name as supplier_name
             FROM purchase_bills pb
             LEFT JOIN purchase_orders po ON pb.po_id = po.id
             LEFT JOIN suppliers s ON po.supplier_id = s.id
             WHERE pb.uuid = $1`, [req.params.uuid]
        );
        if (bill.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Bill tidak ditemukan' }); }
        const b = bill.rows[0];

        const payAmount = parseFloat(amount);
        const totalBill = parseFloat(b.total);
        const alreadyPaid = parseFloat(b.amount_paid || 0);
        const remaining = totalBill - alreadyPaid;

        if (payAmount > remaining + 0.01) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                error: `Jumlah pembayaran (${payAmount}) melebihi sisa tagihan (${remaining.toFixed(2)})`
            });
        }

        // 2. Resolve cash account
        const cashAccResult = await client.query(
            `SELECT id, name, code FROM chart_of_accounts WHERE uuid = $1 AND company_id = $2`,
            [cash_account_id, req.user.company_id]
        );
        if (cashAccResult.rows.length === 0) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Akun kas tidak ditemukan' }); }
        const cashAcc = cashAccResult.rows[0];

        // 3. Find/create Hutang Usaha (AP) account
        const apResult = await client.query(
            `SELECT id FROM chart_of_accounts
             WHERE company_id = $1 AND (type = 'liability' OR type = 'Liabilitas')
               AND (LOWER(name) LIKE '%hutang usaha%' OR LOWER(name) LIKE '%utang dagang%'
                    OR LOWER(name) LIKE '%accounts payable%' OR LOWER(name) LIKE '%utang usaha%')
             ORDER BY code LIMIT 1`, [req.user.company_id]
        );
        let apId = apResult.rows[0]?.id;
        if (!apId) {
            const newAp = await client.query(
                `INSERT INTO chart_of_accounts (code, name, type, category, currency, company_id)
                 VALUES ('2100','Hutang Usaha','liability','hutang','IDR',$1)
                 ON CONFLICT (code, company_id) DO UPDATE SET name=EXCLUDED.name RETURNING id`,
                [req.user.company_id]
            );
            apId = newAp.rows[0].id;
        }

        // 4. Create journal entry
        const branchCode = (await client.query(`SELECT code FROM branches WHERE id = $1`, [b.branch_id])).rows[0]?.code || 'JKT';
        const journalNumber = await generateAutoNumber(branchCode, 'JU');
        const payDate = date || null; // null = CURRENT_DATE di DB

        const journalResult = await client.query(
            `INSERT INTO journal_entries (number, date, branch_id, description, status, created_by, ref_number, ref_type)
             VALUES ($1, COALESCE($2::DATE, CURRENT_DATE), $3, $4, 'posted', $5, $6, 'BILL') RETURNING id, uuid`,
            [journalNumber, payDate, b.branch_id,
                `Pembayaran Tagihan ${b.number} - ${b.supplier_name || 'Supplier'}`,
                req.user.name, b.number]
        );
        const journalId = journalResult.rows[0].id;

        // Lines: Dr. Hutang Usaha / Cr. Kas/Bank
        // (PPN Masukan sudah dicatat saat Bill dibuat — lihat kenapa_tax_on_GI.md)
        const payDesc = `Bayar tagihan ${b.number} (${payAmount})`;
        await client.query(
            `INSERT INTO journal_lines (journal_id, account_id, debit, credit, description)
             VALUES ($1,$2,$3,0,$4), ($1,$5,0,$3,$4)`,
            [journalId, apId, payAmount, payDesc, cashAcc.id]
        );
        // Update COA balances
        await updateCoaBalancesForJournal(client, journalId);

        // 5. Insert bill_payment record
        await client.query(
            `INSERT INTO bill_payments (bill_id, date, amount, cash_account_id, journal_id, notes, created_by)
             VALUES ($1, COALESCE($2::DATE, CURRENT_DATE), $3, $4, $5, $6, $7)`,
            [b.id, payDate, payAmount, cashAcc.id, journalId, notes || null, req.user.name]
        );

        // 6. Update bill amount_paid & status
        const newAmountPaid = alreadyPaid + payAmount;
        let newStatus = 'unpaid';
        if (newAmountPaid >= totalBill - 0.01) {
            newStatus = 'paid';
        } else if (newAmountPaid > 0) {
            newStatus = 'partial';
        }
        await client.query(
            `UPDATE purchase_bills SET amount_paid = $1, status = $2, updated_at = NOW() WHERE id = $3`,
            [newAmountPaid, newStatus, b.id]
        );

        // 7. Update PO status if fully paid
        if (newStatus === 'paid' && b.po_id) {
            await client.query(
                `UPDATE purchase_orders SET status='paid', updated_at=NOW() WHERE id=$1`,
                [b.po_id]
            );
        }

        await client.query('COMMIT');
        await query(
            `INSERT INTO audit_trail (action, module, description, user_id, user_name, branch_id) VALUES ('pay','purchasing',$1,$2,$3,$4)`,
            [`Bayar Tagihan ${b.number} — Rp ${payAmount.toLocaleString('id-ID')}`, req.user.id, req.user.name, b.branch_id]
        );

        res.json({
            message: `Pembayaran berhasil`,
            status: newStatus,
            amount_paid: newAmountPaid,
            remaining: Math.max(0, totalBill - newAmountPaid),
            journal_number: journalNumber
        });
    } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
}));

module.exports = router;
