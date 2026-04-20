const router = require('express').Router();
const { query } = require('../../config/db');
const { authenticateToken, requirePermission } = require('../../middleware/auth');
const { asyncHandler } = require('../../utils/helpers');

router.use(authenticateToken);

// Laporan Laba Rugi
router.get('/profit-loss', requirePermission('accounting:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const { date_from, date_to } = req.query;

    let accounts;
    if (date_from || date_to) {
        // Hitung dari journal_lines berdasarkan date range
        // Gunakan subquery agar filter tanggal benar-benar efektif
        let dateWhere = ['je.status = \'posted\''];
        let dateVals = [companyId];
        let idx = 2;
        if (date_from) { dateWhere.push(`je.date >= $${idx++}`); dateVals.push(date_from); }
        if (date_to) { dateWhere.push(`je.date <= $${idx++}`); dateVals.push(date_to); }
        const dateClause = dateWhere.join(' AND ');

        accounts = await query(
            `SELECT coa.uuid, coa.code, coa.name, coa.type, coa.category,
                    COALESCE(sub.balance, 0) as balance
             FROM chart_of_accounts coa
             LEFT JOIN (
                 SELECT jl.account_id, SUM(jl.debit - jl.credit) as balance
                 FROM journal_lines jl
                 INNER JOIN journal_entries je ON jl.journal_id = je.id
                 WHERE ${dateClause}
                 GROUP BY jl.account_id
             ) sub ON sub.account_id = coa.id
             WHERE coa.company_id = $1 AND coa.type IN ('Pendapatan','Beban')
             ORDER BY coa.code`,
            dateVals
        );
    } else {
        // Default: pakai saldo akumulatif dari COA
        accounts = await query(
            `SELECT uuid, code, name, type, category, balance FROM chart_of_accounts
             WHERE type IN ('Pendapatan','Beban') AND company_id = $1 ORDER BY code`,
            [companyId]
        );
    }

    const rows = accounts.rows.map(a => ({ ...a, balance: Math.abs(parseFloat(a.balance) || 0) }));
    res.json(rows);
}));


// Neraca / Balance Sheet
router.get('/balance-sheet', requirePermission('accounting:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const assets = await query(`SELECT code, name, category, balance FROM chart_of_accounts WHERE type = 'Aset' AND company_id = $1 ORDER BY code`, [companyId]);
    const liabilities = await query(`SELECT code, name, category, balance FROM chart_of_accounts WHERE type = 'Kewajiban' AND company_id = $1 ORDER BY code`, [companyId]);
    const equity = await query(`SELECT code, name, category, balance FROM chart_of_accounts WHERE type = 'Ekuitas' AND company_id = $1 ORDER BY code`, [companyId]);

    const totalAssets = assets.rows.reduce((s, a) => s + parseFloat(a.balance), 0);
    const totalLiabilities = liabilities.rows.reduce((s, a) => s + parseFloat(a.balance), 0);
    const totalEquity = equity.rows.reduce((s, a) => s + parseFloat(a.balance), 0);

    res.json({
        assets: { accounts: assets.rows, total: totalAssets },
        liabilities: { accounts: liabilities.rows, total: totalLiabilities },
        equity: { accounts: equity.rows, total: totalEquity },
        balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01
    });
}));

// Buku Besar / General Ledger
router.get('/general-ledger', requirePermission('accounting:view'), asyncHandler(async (req, res) => {
    const { account_id, branch_id, date_from, date_to } = req.query;
    if (!account_id) return res.json([]);
    // Resolve UUID to integer ID
    const accRes = await query(`SELECT id FROM chart_of_accounts WHERE uuid = $1`, [account_id]);
    if (accRes.rows.length === 0) return res.json([]);
    const accId = accRes.rows[0].id;

    let where = ['jl.account_id = $1'];
    let values = [accId];
    let idx = 2;
    if (branch_id) { where.push(`je.branch_id = (SELECT id FROM branches WHERE uuid = $${idx++})`); values.push(branch_id); }
    if (date_from) { where.push(`je.date >= $${idx++}`); values.push(date_from); }
    if (date_to) { where.push(`je.date <= $${idx++}`); values.push(date_to); }

    const result = await query(
        `SELECT jl.debit, jl.credit, jl.description as line_desc,
       je.number, je.date, je.description as journal_desc,
       je.ref_number, je.ref_type,
       coa.code as account_code, coa.name as account_name
     FROM journal_lines jl JOIN journal_entries je ON jl.journal_id = je.id
     JOIN chart_of_accounts coa ON jl.account_id = coa.id
     WHERE ${where.join(' AND ')} ORDER BY je.date DESC, je.id DESC`,
        values
    );
    res.json(result.rows);
}));

// Dashboard summary
router.get('/summary', requirePermission('accounting:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const cash = await query(`SELECT COALESCE(SUM(balance), 0) as total FROM chart_of_accounts WHERE category = 'Aset Lancar' AND company_id = $1`, [companyId]);
    const receivables = await query(`SELECT COALESCE(SUM(inv.total), 0) as total FROM invoices inv JOIN branches b ON inv.branch_id = b.id WHERE inv.status = 'unpaid' AND b.company_id = $1`, [companyId]);
    const payables = await query(`SELECT COALESCE(SUM(pb.total), 0) as total FROM purchase_bills pb JOIN branches b ON pb.branch_id = b.id WHERE pb.status = 'unpaid' AND b.company_id = $1`, [companyId]);
    const revenue = await query(`SELECT COALESCE(SUM(balance), 0) as total FROM chart_of_accounts WHERE type = 'Pendapatan' AND company_id = $1`, [companyId]);

    res.json({
        cash_and_bank: parseFloat(cash.rows[0].total),
        receivables: parseFloat(receivables.rows[0].total),
        payables: parseFloat(payables.rows[0].total),
        revenue: parseFloat(revenue.rows[0].total)
    });
}));

// AP Summary
router.get('/ap-summary', requirePermission('accounting:view'), asyncHandler(async (req, res) => {
    const { company_id, supplier_id } = req.query;

    // Validasi: company_id wajib dan harus format UUID
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!company_id || !UUID_REGEX.test(company_id)) {
        return res.status(400).json({ error: 'company_id tidak valid' });
    }

    const values = [company_id];
    let idx = 2;
    let supplierClause = '';

    if (supplier_id && supplier_id !== '00') {
        const suppId = parseInt(supplier_id);
        if (isNaN(suppId)) return res.status(400).json({ error: 'supplier_id tidak valid' });
        supplierClause = ` AND a.supplier_id = $${idx++}`;
        values.push(suppId);
    }

    const result = await query(
        `SELECT c."name" NamaSupplier, SUM(d.total - COALESCE(d.amount_paid, 0)) TotalHutang,
            hutang7hari(a.warehouse_id, a.branch_id, c.id) JT1Minggu,
            hutangJT(a.warehouse_id, a.branch_id, c.id) JT
        FROM purchase_orders a
        JOIN goods_receives b ON a.id = b.po_id 
        JOIN suppliers c ON a.supplier_id = c.id
        JOIN purchase_bills d ON d.po_id = a.id AND d.gr_id = b.id
        WHERE a.branch_id IN (
            SELECT id FROM branches WHERE company_id = (
                SELECT id FROM companies WHERE uuid = $1
            )
        ) 
        AND a.warehouse_id IN (
            SELECT id FROM warehouses WHERE branch_id IN (
                SELECT id FROM branches WHERE company_id = (
                    SELECT id FROM companies WHERE uuid = $1
                )
            )
        )
        AND a.status IN ('processed', 'partial')
        ${supplierClause}
        GROUP BY c."name", a.warehouse_id, a.branch_id, c.id
        ORDER BY c."name"`,
        values
    );
    res.json(result.rows);
}));

router.get('/ap-detail', requirePermission('accounting:view'), asyncHandler(async (req, res) => {
    const { company_id, supplier_id } = req.query;

    // Validasi: company_id wajib dan harus format UUID
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!company_id || !UUID_REGEX.test(company_id)) {
        return res.status(400).json({ error: 'company_id tidak valid' });
    }

    const values = [company_id];
    let idx = 2;
    let supplierClause = '';

    if (supplier_id && supplier_id !== '00') {
        const suppId = parseInt(supplier_id);
        if (isNaN(suppId)) return res.status(400).json({ error: 'supplier_id tidak valid' });
        supplierClause = ` AND a.supplier_id = $${idx++}`;
        values.push(suppId);
    }

    const result = await query(
        `SELECT c."name" SupplierName, a."number" PONumber, b."number" GRNumber,
            TO_CHAR(b."date", 'yyyy-mm-dd') receiveDate, 
            TO_CHAR(d.due_date, 'yyyy-mm-dd') dueDate, d.total ReceiveAmt,
            COALESCE(d.amount_paid, 0) amountpaid, 
            d.total - COALESCE(d.amount_paid, 0) saldoAP
        FROM purchase_orders a
        JOIN goods_receives b ON a.id = b.po_id 
        JOIN suppliers c ON a.supplier_id = c.id
        JOIN purchase_bills d ON d.po_id = a.id AND d.gr_id = b.id
        WHERE a.branch_id IN (
            SELECT id FROM branches WHERE company_id = (
                SELECT id FROM companies WHERE uuid = $1
            )
        ) 
        AND a.warehouse_id IN (
            SELECT id FROM warehouses WHERE branch_id IN (
                SELECT id FROM branches WHERE company_id = (
                    SELECT id FROM companies WHERE uuid = $1
                )
            )
        )
        AND a.status IN ('processed', 'partial')
        ${supplierClause}
        ORDER BY c."name"`,
        values
    );
    res.json(result.rows);
}));
module.exports = router;
