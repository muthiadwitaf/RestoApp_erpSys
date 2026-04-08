const router = require('express').Router();
const { query, getClient } = require('../../config/db');
const { authenticateToken, requirePermission } = require('../../middleware/auth');
const { validateUUID } = require('../../middleware/validate');
const { asyncHandler } = require('../../utils/helpers');
const { generateAutoNumber } = require('../../utils/autoNumber');

router.use(authenticateToken);

// Kategori default biaya operasional
const EXPENSE_CATEGORIES = [
    'Sewa & Utilitas', 'Transportasi & BBM', 'Gaji & Honor',
    'ATK & Perlengkapan', 'Komunikasi & Internet', 'Marketing & Promosi',
    'Pemeliharaan & Perbaikan', 'Kesehatan & Asuransi', 'Biaya Profesional',
    'Konsumsi & Entertainment', 'Lain-lain'
];

// GET /api/accounting/expenses/categories
router.get('/categories', requirePermission('accounting:view'), asyncHandler(async (req, res) => {
    res.json(EXPENSE_CATEGORIES);
}));

// GET /api/accounting/expenses
router.get('/', requirePermission('accounting:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const { branch_id, status, category, date_from, date_to } = req.query;

    let where = ['b.company_id = $1'];
    let values = [companyId];
    let idx = 2;

    if (branch_id) { where.push(`b.uuid = $${idx++}`); values.push(branch_id); }
    if (status) { where.push(`e.status = $${idx++}`); values.push(status); }
    if (category) { where.push(`e.category = $${idx++}`); values.push(category); }
    if (date_from) { where.push(`e.date >= $${idx++}`); values.push(date_from); }
    if (date_to) { where.push(`e.date <= $${idx++}`); values.push(date_to); }

    const result = await query(
        `SELECT e.uuid, e.number, e.date, e.description, e.category,
                e.amount, e.payment_method, e.paid_by, e.status, e.notes,
                e.created_by, e.created_at,
                b.name as branch_name, b.uuid as branch_id,
                coa.code as coa_code, coa.name as coa_name, coa.uuid as coa_id
         FROM expenses e
         JOIN branches b ON e.branch_id = b.id
         LEFT JOIN chart_of_accounts coa ON e.coa_id = coa.id
         WHERE ${where.join(' AND ')}
         ORDER BY e.date DESC, e.id DESC`,
        values
    );
    res.json(result.rows);
}));

// GET /api/accounting/expenses/:uuid
router.get('/:uuid', requirePermission('accounting:view'), validateUUID(), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const result = await query(
        `SELECT e.uuid, e.number, e.date, e.description, e.category,
                e.amount, e.payment_method, e.paid_by, e.status, e.notes,
                e.created_by, e.created_at,
                b.name as branch_name, b.uuid as branch_id, b.company_id,
                coa.code as coa_code, coa.name as coa_name, coa.uuid as coa_id
         FROM expenses e
         JOIN branches b ON e.branch_id = b.id
         LEFT JOIN chart_of_accounts coa ON e.coa_id = coa.id
         WHERE e.uuid = $1`,
        [req.params.uuid]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Biaya tidak ditemukan' });

    // Security: company isolation
    if (result.rows[0].company_id !== companyId) {
        return res.status(403).json({ error: 'Akses ditolak' });
    }

    const { company_id: _cid, ...safe } = result.rows[0];
    res.json(safe);
}));

// POST /api/accounting/expenses
router.post('/', requirePermission('accounting:create'), asyncHandler(async (req, res) => {
    const { branch_id, date, description, category, amount, payment_method, paid_by, coa_id, notes } = req.body;

    if (!description || !amount || !branch_id || !coa_id || !paid_by) {
        return res.status(400).json({ error: 'branch_id, description, amount, coa_id (Akun Beban), dan paid_by (Dibayar Oleh) wajib diisi' });
    }
    if (parseFloat(amount) <= 0) {
        return res.status(400).json({ error: 'Jumlah harus lebih dari 0' });
    }

    // Resolve branch UUID → id + validate company
    const branchRes = await query(
        `SELECT b.id, b.code, b.company_id FROM branches b WHERE b.uuid = $1`,
        [branch_id]
    );
    if (!branchRes.rows.length) return res.status(400).json({ error: 'Cabang tidak ditemukan' });
    if (branchRes.rows[0].company_id !== req.user.company_id) {
        return res.status(403).json({ error: 'Akses ditolak' });
    }
    const branchIntId = branchRes.rows[0].id;
    const branchCode = branchRes.rows[0].code;

    // Resolve COA UUID → id (opsional)
    let coaIntId = null;
    if (coa_id) {
        const coaRes = await query(
            `SELECT id FROM chart_of_accounts WHERE uuid = $1 AND company_id = $2`,
            [coa_id, req.user.company_id]
        );
        if (!coaRes.rows.length) return res.status(400).json({ error: 'Akun COA tidak ditemukan' });
        coaIntId = coaRes.rows[0].id;
    }

    const number = await generateAutoNumber(branchCode || 'GEN', 'EXP');

    const result = await query(
        `INSERT INTO expenses
         (number, date, description, category, amount, payment_method, paid_by, coa_id, branch_id, created_by, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING uuid, number`,
        [
            number,
            date || new Date().toISOString().split('T')[0],
            description.trim(),
            category || 'Lain-lain',
            parseFloat(amount),
            payment_method || 'cash',
            paid_by?.trim() || null,
            coaIntId,
            branchIntId,
            req.user.name,
            notes?.trim() || null
        ]
    );

    await query(
        `INSERT INTO audit_trail (action, module, description, user_id, user_name, branch_id)
         VALUES ('create','accounting',$1,$2,$3,$4)`,
        [`Buat biaya operasional: ${number} - ${description}`, req.user.id, req.user.name, branchIntId]
    ).catch(() => { });

    res.status(201).json(result.rows[0]);
}));

// PUT /api/accounting/expenses/:uuid — edit draft
router.put('/:uuid', requirePermission('accounting:create'), validateUUID(), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const expRes = await query(
        `SELECT e.id, e.status, e.branch_id, b.company_id
         FROM expenses e JOIN branches b ON e.branch_id = b.id
         WHERE e.uuid = $1`,
        [req.params.uuid]
    );
    if (!expRes.rows.length) return res.status(404).json({ error: 'Biaya tidak ditemukan' });
    const exp = expRes.rows[0];
    if (exp.company_id !== companyId) return res.status(403).json({ error: 'Akses ditolak' });
    if (exp.status === 'posted') return res.status(400).json({ error: 'Biaya yang sudah diposting tidak bisa diubah' });

    const { date, description, category, amount, payment_method, paid_by, coa_id, notes } = req.body;
    if (!description || !amount || parseFloat(amount) <= 0 || !coa_id || !paid_by) {
        return res.status(400).json({ error: 'description, amount, coa_id (Akun Beban), dan paid_by (Dibayar Oleh) wajib diisi' });
    }

    let coaIntId = null;
    if (coa_id) {
        const coaRes = await query(
            `SELECT id FROM chart_of_accounts WHERE uuid = $1 AND company_id = $2`,
            [coa_id, companyId]
        );
        if (!coaRes.rows.length) return res.status(400).json({ error: 'Akun COA tidak ditemukan' });
        coaIntId = coaRes.rows[0].id;
    }

    await query(
        `UPDATE expenses SET
         date = COALESCE($1, date),
         description = $2,
         category = COALESCE($3, category),
         amount = $4,
         payment_method = COALESCE($5, payment_method),
         paid_by = $6,
         coa_id = $7,
         notes = $8,
         updated_at = NOW()
         WHERE id = $9`,
        [date, description.trim(), category, parseFloat(amount), payment_method,
            paid_by?.trim() || null, coaIntId, notes?.trim() || null, exp.id]
    );

    await query(
        `INSERT INTO audit_trail (action, module, description, user_id, user_name, branch_id)
         VALUES ('update','accounting',$1,$2,$3,$4)`,
        [`Edit biaya: ${description}`, req.user.id, req.user.name, exp.branch_id]
    ).catch(() => { });

    res.json({ message: 'Biaya berhasil diupdate' });
}));

// PUT /api/accounting/expenses/:uuid/post — posting biaya + jurnal otomatis
router.put('/:uuid/post', requirePermission('accounting:approve'), validateUUID(), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;

    // Security check
    const expRes = await query(
        `SELECT e.id, e.uuid, e.number, e.amount, e.description, e.category,
                e.payment_method, e.status, e.branch_id, e.coa_id,
                b.company_id, b.code as branch_code, b.uuid as branch_uuid
         FROM expenses e JOIN branches b ON e.branch_id = b.id
         WHERE e.uuid = $1`,
        [req.params.uuid]
    );
    if (!expRes.rows.length) return res.status(404).json({ error: 'Biaya tidak ditemukan' });
    const exp = expRes.rows[0];
    if (exp.company_id !== companyId) return res.status(403).json({ error: 'Akses ditolak' });
    if (exp.status === 'posted') return res.status(400).json({ error: 'Sudah diposting' });

    // Tentukan akun COA:
    // - Debit: akun beban yang dipilih (atau fallback ke akun beban pertama di COA)
    // - Credit: akun kas/bank berdasarkan payment method
    let debitCoaId = exp.coa_id;
    if (!debitCoaId) {
        return res.status(400).json({ error: 'Akun Beban belum dipilih. Edit biaya dan pilih Akun Beban terlebih dahulu.' });
    }

    // Cari akun kredit: Kas (cash) atau Bank (transfer/kartu)
    const creditKeyword = exp.payment_method === 'cash' ? 'Kas' : 'Bank';
    const creditCoaRes = await query(
        `SELECT id FROM chart_of_accounts
         WHERE company_id = $1 AND (name ILIKE $2 OR code ILIKE $2) AND type = 'Aset'
         ORDER BY code LIMIT 1`,
        [companyId, `%${creditKeyword}%`]
    );
    const creditCoaId = creditCoaRes.rows[0]?.id || debitCoaId; // fallback

    if (!debitCoaId) {
        return res.status(400).json({ error: 'Tidak ada akun Beban di COA. Buat akun Beban terlebih dahulu.' });
    }

    const client = await getClient();
    try {
        await client.query('BEGIN');

        // Generate journal number
        const jeNumber = await generateAutoNumber(exp.branch_code || 'GEN', 'JU');

        // Insert journal entry
        const jeRes = await client.query(
            `INSERT INTO journal_entries (number, date, branch_id, description, status, created_by, ref_number, ref_type)
             VALUES ($1, NOW()::date, $2, $3, 'posted', $4, $5, 'EXP')
             RETURNING id`,
            [jeNumber, exp.branch_id, `Biaya Operasional: ${exp.description}`, req.user.name, exp.number]
        );
        const jeId = jeRes.rows[0].id;

        // Debit: Beban
        await client.query(
            `INSERT INTO journal_lines (journal_id, account_id, debit, credit, description)
             VALUES ($1, $2, $3, 0, $4)`,
            [jeId, debitCoaId, exp.amount, exp.description]
        );
        // Credit: Kas/Bank
        await client.query(
            `INSERT INTO journal_lines (journal_id, account_id, debit, credit, description)
             VALUES ($1, $2, 0, $3, $4)`,
            [jeId, creditCoaId, exp.amount, exp.description]
        );

        // Update COA balances
        await client.query(
            `UPDATE chart_of_accounts SET balance = balance + $1, updated_at = NOW() WHERE id = $2`,
            [exp.amount, debitCoaId]
        );
        await client.query(
            `UPDATE chart_of_accounts SET balance = balance - $1, updated_at = NOW() WHERE id = $2`,
            [exp.amount, creditCoaId]
        );

        // Mark expense as posted, link journal
        await client.query(
            `UPDATE expenses SET status = 'posted', journal_id = $1, updated_at = NOW() WHERE id = $2`,
            [jeId, exp.id]
        );

        await client.query('COMMIT');

        await query(
            `INSERT INTO audit_trail (action, module, description, user_id, user_name, branch_id)
             VALUES ('approve','accounting',$1,$2,$3,$4)`,
            [`Post biaya: ${exp.number} - Jurnal ${jeNumber}`, req.user.id, req.user.name, exp.branch_id]
        ).catch(() => { });

        res.json({ message: `Biaya ${exp.number} berhasil diposting. Jurnal: ${jeNumber}` });
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}));

// DELETE /api/accounting/expenses/:uuid — hanya draft
router.delete('/:uuid', requirePermission('accounting:create'), validateUUID(), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;

    const expRes = await query(
        `SELECT e.id, e.number, e.description, e.status, e.branch_id, b.company_id
         FROM expenses e JOIN branches b ON e.branch_id = b.id
         WHERE e.uuid = $1`,
        [req.params.uuid]
    );
    if (!expRes.rows.length) return res.status(404).json({ error: 'Biaya tidak ditemukan' });
    const exp = expRes.rows[0];

    if (exp.company_id !== companyId) return res.status(403).json({ error: 'Akses ditolak' });
    if (exp.status === 'posted') return res.status(400).json({ error: 'Biaya yang sudah diposting tidak bisa dihapus' });

    await query(`DELETE FROM expenses WHERE id = $1`, [exp.id]);

    await query(
        `INSERT INTO audit_trail (action, module, description, user_id, user_name, branch_id)
         VALUES ('delete','accounting',$1,$2,$3,$4)`,
        [`Hapus biaya: ${exp.number} - ${exp.description}`, req.user.id, req.user.name, exp.branch_id]
    ).catch(() => { });

    res.json({ message: `Biaya ${exp.number} berhasil dihapus` });
}));

module.exports = router;
