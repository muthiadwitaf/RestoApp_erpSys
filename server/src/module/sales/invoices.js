const router = require('express').Router();
const { query, getClient } = require('../../config/db');
const { authenticateToken, requirePermission } = require('../../middleware/auth');
const { validateUUID } = require('../../middleware/validate');
const { asyncHandler, updateCoaBalancesForJournal } = require('../../utils/helpers');
const { generateAutoNumber } = require('../../utils/autoNumber');

router.use(authenticateToken);

// GET / -- List semua invoice (SO + Manual)
router.get('/', requirePermission('sales:view', 'accounting:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const result = await query(
        `SELECT inv.uuid, inv.number, inv.date, inv.due_date, inv.status, inv.total, inv.currency,
               inv.notes, inv.tax_rate, inv.tax_amount, inv.faktur_pajak_number, inv.kode_transaksi,
               COALESCE(inv.amount_paid, 0) as amount_paid,
               COALESCE(inv.total, 0) - COALESCE(inv.amount_paid, 0) as remaining,
               COALESCE(inv.is_manual, FALSE) as is_manual,
               inv.customer_name_manual,
               so.uuid as so_id, so.number as so_number,
               COALESCE(c_so.uuid, c_m.uuid)                      as customer_id,
               COALESCE(c_so.name, c_m.name, inv.customer_name_manual) as customer_name,
               COALESCE(c_so.npwp, c_m.npwp)                      as customer_npwp,
               b.name as branch_name, b.uuid as branch_id
         FROM invoices inv
         LEFT JOIN sales_orders so  ON inv.so_id = so.id
         LEFT JOIN customers c_so   ON so.customer_id = c_so.id
         LEFT JOIN customers c_m    ON inv.customer_id = c_m.id
         LEFT JOIN branches b       ON inv.branch_id = b.id
         WHERE b.company_id = $1
         ORDER BY inv.date DESC, inv.id DESC`, [companyId]
    );
    res.json(result.rows);
}));

// GET /:uuid -- Detail invoice dengan lines
router.get('/:uuid', requirePermission('sales:view', 'accounting:view'), validateUUID(), asyncHandler(async (req, res) => {
    const result = await query(
        `SELECT inv.uuid, inv.number, inv.date, inv.due_date, inv.status, inv.total, inv.currency,
               inv.notes, inv.tax_rate, inv.tax_amount, inv.faktur_pajak_number, inv.kode_transaksi,
               COALESCE(inv.is_manual, FALSE) as is_manual,
               inv.customer_name_manual,
               so.uuid as so_id, so.number as so_number,
               COALESCE(c_so.uuid, c_m.uuid)                         as customer_id,
               COALESCE(c_so.name, c_m.name, inv.customer_name_manual) as customer_name,
               COALESCE(c_so.npwp, c_m.npwp)                         as customer_npwp,
               b.name as branch_name, b.uuid as branch_id,
               inv.id as inv_int_id
         FROM invoices inv
         LEFT JOIN sales_orders so  ON inv.so_id = so.id
         LEFT JOIN customers c_so   ON so.customer_id = c_so.id
         LEFT JOIN customers c_m    ON inv.customer_id = c_m.id
         LEFT JOIN branches b       ON inv.branch_id = b.id
         WHERE inv.uuid = $1`, [req.params.uuid]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Invoice tidak ditemukan' });

    const inv = result.rows[0];

    // Security: pastikan invoice milik company user yang login
    const branchCheck = await query(`SELECT company_id FROM branches WHERE id = (SELECT branch_id FROM invoices WHERE uuid = $1)`, [req.params.uuid]);
    if (!branchCheck.rows.length || branchCheck.rows[0].company_id !== req.user.company_id) {
        return res.status(403).json({ error: 'Akses ditolak' });
    }

    const invIntId = inv.inv_int_id;
    delete inv.inv_int_id;

    let lines = [];
    if (inv.is_manual) {
        // Invoice manual -- ambil dari invoice_lines (free-text)
        const lineRes = await query(
            `SELECT item_name, item_code, qty, uom, price, discount, notes
             FROM invoice_lines WHERE inv_id = $1 ORDER BY id`, [invIntId]
        );
        lines = lineRes.rows;
    } else {
        // Invoice dari GI: ambil qty AKTUAL dari goods_issue_lines via gi_id
        const giRes = await query(`SELECT gi_id FROM invoices WHERE id = $1`, [invIntId]);
        const giId = giRes.rows[0]?.gi_id;

        if (giId) {
            // ✅ Pakai GI lines — qty sesuai yang benar-benar dikirim
            const lineRes = await query(
                `SELECT gil.qty, gil.uom,
                        i.uuid as item_id, i.name as item_name, i.code as item_code,
                        sol.price, sol.discount
                 FROM goods_issue_lines gil
                 JOIN items i ON gil.item_id = i.id
                 LEFT JOIN sales_order_lines sol
                       ON sol.so_id = (SELECT so_id FROM invoices WHERE id = $1)
                      AND sol.item_id = gil.item_id
                 WHERE gil.gi_id = $2
                 ORDER BY i.name`, [invIntId, giId]
            );
            lines = lineRes.rows;
        } else if (inv.so_id) {
            // Fallback: invoice lama tanpa gi_id → ambil dari SO lines
            const soIntRes = await query(`SELECT id FROM sales_orders WHERE uuid = $1`, [inv.so_id]);
            const soIntId = soIntRes.rows[0]?.id;
            if (soIntId) {
                const lineRes = await query(
                    `SELECT sol.qty, sol.price, sol.discount, sol.uom,
                            i.uuid as item_id, i.name as item_name, i.code as item_code
                     FROM sales_order_lines sol
                     JOIN items i ON sol.item_id = i.id
                     WHERE sol.so_id = $1`, [soIntId]
                );
                lines = lineRes.rows;
            }
        }
    }


    res.json({ ...inv, lines });
}));

// GET /:uuid/payments -- Riwayat penerimaan pembayaran
router.get('/:uuid/payments', requirePermission('sales:view', 'accounting:view'), validateUUID(), asyncHandler(async (req, res) => {
    const inv = await query(`SELECT id FROM invoices WHERE uuid = $1`, [req.params.uuid]);
    if (inv.rows.length === 0) return res.status(404).json({ error: 'Invoice tidak ditemukan' });
    const invId = inv.rows[0].id;
    const result = await query(
        `SELECT ip.uuid, ip.date, ip.amount, ip.notes, ip.created_by, ip.created_at,
                coa.uuid as account_id, coa.name as account_name, coa.code as account_code,
                je.uuid as journal_uuid, je.number as journal_number
         FROM invoice_payments ip
         LEFT JOIN chart_of_accounts coa ON ip.cash_account_id = coa.id
         LEFT JOIN journal_entries je ON ip.journal_id = je.id
         WHERE ip.invoice_id = $1
         ORDER BY ip.date DESC, ip.id DESC`, [invId]
    );
    res.json(result.rows);
}));

router.post('/', requirePermission('sales:create', 'accounting:create'), asyncHandler(async (req, res) => {
    const { is_manual, branch_id, due_date, currency, notes, kode_transaksi } = req.body;

    // Resolve branch UUID -> integer id
    let resolvedBranchId = branch_id;
    if (typeof branch_id === 'string' && branch_id.includes('-')) {
        const br = await query(`SELECT id FROM branches WHERE uuid = $1`, [branch_id]);
        resolvedBranchId = br.rows[0]?.id;
        if (!resolvedBranchId) return res.status(400).json({ error: 'Cabang tidak ditemukan' });
    }
    const branchResult = await query(`SELECT code FROM branches WHERE id = $1`, [resolvedBranchId]);
    const branchCode = branchResult.rows[0]?.code || 'JKT';
    const number = await generateAutoNumber(branchCode, 'INV');

    // ============================================================
    // JALUR A: Invoice Manual (is_manual = true)
    // ============================================================
    if (is_manual) {
        const { customer_id, customer_name_manual, lines } = req.body;

        // Harus ada salah satu: customer dari list ATAU nama manual
        if (!customer_id && !customer_name_manual?.trim()) {
            return res.status(400).json({ error: 'Pilih customer dari daftar atau isi nama customer manual' });
        }
        if (!lines || lines.length === 0) return res.status(400).json({ error: 'Invoice manual harus memiliki minimal 1 baris item' });

        // Validasi setiap baris: item_name tidak boleh kosong
        for (const l of lines) {
            if (!l.item_name || !l.item_name.trim()) {
                return res.status(400).json({ error: 'Nama item tidak boleh kosong' });
            }
            if (!l.price || parseFloat(l.price) <= 0) {
                return res.status(400).json({ error: `Harga item "${l.item_name}" tidak valid` });
            }
        }

        // Resolve customer UUID -> integer id (jika dipilih dari list)
        let resolvedCustomerId = null;
        if (customer_id) {
            resolvedCustomerId = customer_id;
            if (typeof customer_id === 'string' && customer_id.includes('-')) {
                const cr = await query(
                    `SELECT id FROM customers WHERE uuid = $1 AND company_id = $2`,
                    [customer_id, req.user.company_id]
                );
                resolvedCustomerId = cr.rows[0]?.id || null;
                if (!resolvedCustomerId) return res.status(400).json({ error: 'Customer tidak ditemukan' });
            }
        }

        // Hitung subtotal dari lines[]
        let subtotal = 0;
        for (const l of lines) {
            const qty = parseFloat(l.qty) || 0;
            const price = parseFloat(l.price) || 0;
            const disc = parseFloat(l.discount) || 0;
            subtotal += qty * price * (1 - disc / 100);
        }

        // Auto-hitung PPN dari tax_config perusahaan
        let taxRate = 0;
        let taxAmount = 0;
        if (req.user.company_id) {
            const taxRes = await query(
                `SELECT c.is_pkp, tc.rate
                 FROM companies c
                 LEFT JOIN tax_configs tc ON tc.company_id = c.id AND tc.is_active = TRUE
                 WHERE c.id = $1`, [req.user.company_id]
            );
            if (taxRes.rows.length > 0 && taxRes.rows[0].is_pkp) {
                taxRate = parseFloat(taxRes.rows[0].rate) || 12;
                taxAmount = Math.round(subtotal * taxRate / 100);
            }
        }
        const finalTotal = subtotal + taxAmount;

        const client = await getClient();
        try {
            await client.query('BEGIN');

            const invRes = await client.query(
                `INSERT INTO invoices
                    (number, date, due_date, branch_id, total, tax_rate, tax_amount, currency, notes,
                     is_manual, customer_id, customer_name_manual, kode_transaksi, so_id)
                 VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6, $7, $8, TRUE, $9, $10, $11, NULL)
                 RETURNING uuid, number, id`,
                [number, due_date || null, resolvedBranchId, finalTotal, taxRate, taxAmount,
                    currency || 'IDR', notes || null, resolvedCustomerId,
                    customer_name_manual?.trim() || null, kode_transaksi || '01']
            );
            const invId = invRes.rows[0].id;

            // Insert invoice_lines (free-text, tidak FK ke items)
            for (const l of lines) {
                await client.query(
                    `INSERT INTO invoice_lines (inv_id, item_name, item_code, qty, uom, price, discount, notes)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                    [invId, l.item_name.trim(), l.item_code || null,
                        parseFloat(l.qty) || 1, l.uom || 'pcs',
                        parseFloat(l.price), parseFloat(l.discount) || 0, l.notes || null]
                );
            }

            await client.query(
                `INSERT INTO audit_trail (action, module, description, user_id, user_name, branch_id)
                 VALUES ('create', 'sales', $1, $2, $3, $4)`,
                [`Buat Invoice Manual ${number} (Total: ${finalTotal})`,
                req.user.id, req.user.name, resolvedBranchId]
            );

            await client.query('COMMIT');
            const { id: _id, ...safeInv } = invRes.rows[0];
            res.status(201).json(safeInv);
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
        return;
    }

    // ============================================================
    // JALUR B: Invoice dari SO (logika existing, tidak berubah)
    // ============================================================
    const { so_id, total } = req.body;

    // Resolve so_id: terima UUID atau integer
    let resolvedSoId = so_id;
    if (so_id && typeof so_id === 'string' && so_id.includes('-')) {
        const sr = await query(`SELECT id FROM sales_orders WHERE uuid = $1`, [so_id]);
        resolvedSoId = sr.rows[0]?.id;
        if (!resolvedSoId) return res.status(400).json({ error: 'SO tidak ditemukan' });
    }

    // Validasi status SO
    if (resolvedSoId) {
        const soCheck = await query(`SELECT status, number FROM sales_orders WHERE id = $1`, [resolvedSoId]);
        if (soCheck.rows.length === 0) return res.status(400).json({ error: 'SO tidak ditemukan' });
        const { status: soStatus, number: soNumber } = soCheck.rows[0];
        if (!['approved', 'processed'].includes(soStatus)) {
            return res.status(400).json({
                error: `SO ${soNumber} belum bisa dibuatkan invoice -- status saat ini: '${soStatus}'. Harus 'approved' atau 'processed'.`
            });
        }
        // Cek duplikat
        const existing = await query(`SELECT uuid, number FROM invoices WHERE so_id = $1`, [resolvedSoId]);
        if (existing.rows.length > 0) {
            return res.status(400).json({ error: `Invoice sudah dibuat untuk SO ini (${existing.rows[0].number})` });
        }
    }

    // Auto-hitung total dari SO lines (single source of truth)
    let finalTotal = parseFloat(total) || 0;
    let finalTaxRate = 0;
    let finalTaxAmount = 0;
    if (resolvedSoId) {
        const soMeta = await query(`SELECT tax_rate, tax_amount FROM sales_orders WHERE id = $1`, [resolvedSoId]);
        if (soMeta.rows.length > 0) {
            finalTaxRate = parseFloat(soMeta.rows[0].tax_rate) || 0;
            finalTaxAmount = parseFloat(soMeta.rows[0].tax_amount) || 0;
        }
        const linesRes = await query(
            `SELECT COALESCE(SUM(qty * price * (1 - COALESCE(discount,0)/100)), 0) as subtotal
             FROM sales_order_lines WHERE so_id = $1`, [resolvedSoId]
        );
        const subtotal = parseFloat(linesRes.rows[0]?.subtotal) || 0;
        finalTotal = subtotal + finalTaxAmount;
    }

    const result = await query(
        `INSERT INTO invoices
            (number, so_id, date, due_date, branch_id, total, tax_rate, tax_amount, currency, is_manual, kode_transaksi)
         VALUES ($1, $2, CURRENT_DATE, $3, $4, $5, $6, $7, $8, FALSE, $9)
         RETURNING uuid, number`,
        [number, resolvedSoId || null, due_date || null, resolvedBranchId,
            finalTotal, finalTaxRate, finalTaxAmount, currency || 'IDR', kode_transaksi || '01']
    );

    if (resolvedSoId) {
        await query(`UPDATE sales_orders SET status='processed', updated_at=NOW() WHERE id=$1`, [resolvedSoId]);
    }
    await query(
        `INSERT INTO audit_trail (action, module, description, user_id, user_name, branch_id)
         VALUES ('create', 'sales', $1, $2, $3, $4)`,
        [`Membuat Invoice ${number} (Total: ${finalTotal})`, req.user.id, req.user.name, resolvedBranchId]
    );
    res.status(201).json(result.rows[0]);
}));

// PUT /:uuid/pay -- Partial payment AR
// Body: { cash_account_id (uuid), amount, notes?, date? }
router.put('/:uuid/pay', requirePermission('sales:edit', 'accounting:create'), validateUUID(), asyncHandler(async (req, res) => {
    const { cash_account_id, amount, notes, date } = req.body;
    if (!cash_account_id) return res.status(400).json({ error: 'cash_account_id wajib diisi' });
    if (!amount || parseFloat(amount) <= 0) return res.status(400).json({ error: 'Jumlah pembayaran harus lebih dari 0' });

    const find = await query(
        `SELECT inv.id, inv.uuid, inv.number, inv.so_id, inv.branch_id, inv.status,
                inv.total, COALESCE(inv.amount_paid, 0) as amount_paid,
                COALESCE(inv.is_manual, FALSE) as is_manual,
                b.code as branch_code, b.company_id
         FROM invoices inv
         JOIN branches b ON inv.branch_id = b.id
         WHERE inv.uuid = $1`, [req.params.uuid]
    );
    if (find.rows.length === 0) return res.status(404).json({ error: 'Invoice tidak ditemukan' });
    const inv = find.rows[0];
    if (inv.company_id !== req.user.company_id) return res.status(403).json({ error: 'Akses ditolak' });
    if (inv.status === 'paid') return res.status(400).json({ error: 'Invoice sudah lunas' });

    const payAmount = parseFloat(amount);
    const totalInv = parseFloat(inv.total);
    const alreadyPaid = parseFloat(inv.amount_paid);
    const remaining = totalInv - alreadyPaid;

    if (payAmount > remaining + 0.01) {
        return res.status(400).json({
            error: `Jumlah pembayaran (${payAmount}) melebihi sisa piutang (${remaining.toFixed(2)})`
        });
    }

    const client = await getClient();
    try {
        await client.query('BEGIN');

        // Resolve cash account
        const cashRes = await client.query(
            `SELECT id, name, code FROM chart_of_accounts WHERE uuid = $1 AND company_id = $2`,
            [cash_account_id, inv.company_id]
        );
        if (!cashRes.rows.length) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Akun Kas/Bank tidak ditemukan' });
        }
        const cashAcc = cashRes.rows[0];

        // Find/create Piutang Usaha (AR) account
        const arRes = await client.query(
            `SELECT id FROM chart_of_accounts
             WHERE company_id = $1 AND (type = 'asset' OR type = 'Aset')
               AND (LOWER(name) LIKE '%piutang%' OR LOWER(category) LIKE '%piutang%')
             ORDER BY code LIMIT 1`, [inv.company_id]
        );
        let arId = arRes.rows[0]?.id;
        if (!arId) {
            const newAr = await client.query(
                `INSERT INTO chart_of_accounts (code, name, type, category, currency, company_id)
                 VALUES ('1200','Piutang Usaha','asset','piutang','IDR',$1)
                 ON CONFLICT (code, company_id) DO UPDATE SET name=EXCLUDED.name RETURNING id`,
                [inv.company_id]
            );
            arId = newAr.rows[0].id;
        }

        // Build journal
        const journalNumber = await generateAutoNumber(inv.branch_code, 'JU');
        const payDate = date || null;

        const jeRes = await client.query(
            `INSERT INTO journal_entries (number, date, branch_id, description, status, created_by, ref_number, ref_type)
             VALUES ($1, COALESCE($2::DATE, CURRENT_DATE), $3, $4, 'posted', $5, $6, 'INV') RETURNING id, uuid`,
            [journalNumber, payDate, inv.branch_id,
                `Penerimaan Piutang Invoice ${inv.number}`, req.user.name, inv.number]
        );
        const journalId = jeRes.rows[0].id;

        // Dr. Kas/Bank / Cr. Piutang Usaha
        // (PPN Keluaran sudah dicatat saat GI dibuat — lihat kenapa_tax_on_GI.md)
        const payDesc = `Terima bayar Invoice ${inv.number} (${payAmount})`;
        await client.query(
            `INSERT INTO journal_lines (journal_id, account_id, debit, credit, description)
             VALUES ($1,$2,$3,0,$4), ($1,$5,0,$3,$4)`,
            [journalId, cashAcc.id, payAmount, payDesc, arId]
        );
        // Update COA balances
        await updateCoaBalancesForJournal(client, journalId);

        // Insert invoice_payments record
        await client.query(
            `INSERT INTO invoice_payments (invoice_id, date, amount, cash_account_id, journal_id, notes, created_by)
             VALUES ($1, COALESCE($2::DATE, CURRENT_DATE), $3, $4, $5, $6, $7)`,
            [inv.id, payDate, payAmount, cashAcc.id, journalId, notes || null, req.user.name]
        );

        // Update invoice amount_paid & status
        const newAmountPaid = alreadyPaid + payAmount;
        // DB constraint: invoices_status_check hanya izinkan 'unpaid', 'paid', 'overdue'
        const newStatus = newAmountPaid >= totalInv - 0.01 ? 'paid' : 'unpaid';

        await client.query(
            `UPDATE invoices SET amount_paid = $1, status = $2, updated_at = NOW() WHERE id = $3`,
            [newAmountPaid, newStatus, inv.id]
        );

        // Update SO status if fully paid
        if (newStatus === 'paid' && inv.so_id && !inv.is_manual) {
            await client.query(
                `UPDATE sales_orders SET status='paid', updated_at=NOW() WHERE id=$1`, [inv.so_id]
            );
        }

        await client.query('COMMIT');
        await query(
            `INSERT INTO audit_trail (action, module, description, user_id, user_name, branch_id)
             VALUES ('pay', 'sales', $1, $2, $3, $4)`,
            [`Terima Bayar Invoice ${inv.number} — Rp ${payAmount.toLocaleString('id-ID')}`,
            req.user.id, req.user.name, inv.branch_id]
        );

        res.json({
            message: 'Pembayaran berhasil diterima',
            status: newStatus,
            amount_paid: newAmountPaid,
            remaining: Math.max(0, totalInv - newAmountPaid),
            journal_number: journalNumber
        });
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}));

module.exports = router;
