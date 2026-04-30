const router = require('express').Router();
const { query, getClient } = require('../../config/db');
const { requirePermission } = require('../../middleware/auth');
const { validateUUID } = require('../../middleware/validate');
const { asyncHandler } = require('../../utils/helpers');
const { generateAutoNumber } = require('../../utils/autoNumber');

router.get('/', requirePermission('accounting:view'), asyncHandler(async (req, res) => {
    const { branch_id, status } = req.query;
    const companyId = req.user.company_id;
    let where = ['b.company_id = $1']; let values = [companyId]; let idx = 2;
    if (branch_id) { where.push(`je.branch_id = $${idx++}`); values.push(branch_id); }
    if (status) { where.push(`je.status = $${idx++}`); values.push(status); }
    const wc = 'WHERE ' + where.join(' AND ');
    const result = await query(
        `SELECT je.uuid, je.number, je.date, je.description, je.status, je.created_by,
               je.ref_number, je.ref_type,
       b.name as branch_name, b.uuid as branch_id,
       COALESCE((SELECT SUM(jl.debit) FROM journal_lines jl WHERE jl.journal_id = je.id), 0) as total_debit
     FROM journal_entries je LEFT JOIN branches b ON je.branch_id = b.id ${wc} ORDER BY je.date DESC, je.id DESC`, values
    );
    res.json(result.rows);
}));

router.get('/:uuid', requirePermission('accounting:view'), validateUUID(), asyncHandler(async (req, res) => {
    const result = await query(
        `SELECT je.*, je.ref_number, je.ref_type, b.name as branch_name, b.company_id
         FROM journal_entries je
         LEFT JOIN branches b ON je.branch_id = b.id
         WHERE je.uuid = $1`, [req.params.uuid]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Jurnal tidak ditemukan' });

    // Security: pastikan jurnal milik company user yang login
    if (result.rows[0].company_id !== req.user.company_id) {
        return res.status(403).json({ error: 'Akses ditolak' });
    }

    const je = result.rows[0];
    const { company_id: _cid, id: _id, ...safeJe } = je;
    const lines = await query(
        `SELECT jl.debit, jl.credit, jl.description,
                coa.code as account_code, coa.name as account_name
         FROM journal_lines jl
         JOIN chart_of_accounts coa ON jl.account_id = coa.id
         WHERE jl.journal_id = $1`, [je.id]
    );
    res.json({ ...safeJe, lines: lines.rows });
}));

router.post('/', requirePermission('accounting:create'), asyncHandler(async (req, res) => {
    const { branch_id, date, description, lines } = req.body;
    if (!lines?.length) return res.status(400).json({ error: 'Jurnal harus punya minimal 1 baris' });

    const totalDebit = lines.reduce((sum, l) => sum + (parseFloat(l.debit) || 0), 0);
    const totalCredit = lines.reduce((sum, l) => sum + (parseFloat(l.credit) || 0), 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
        return res.status(400).json({ error: `Debit (${totalDebit}) dan Credit (${totalCredit}) harus balance` });
    }

    // Resolve branch UUID → internal integer id
    const branchRes = await query(`SELECT id, code FROM branches WHERE uuid::text = $1 OR id::text = $1`, [String(branch_id)]);
    if (!branchRes.rows.length) return res.status(400).json({ error: 'Cabang tidak ditemukan' });
    const branchIntId = branchRes.rows[0].id;
    const branchCode = branchRes.rows[0].code;

    const number = await generateAutoNumber(branchCode || 'JKT', 'JU');

    // Resolve each line's account_id UUID → internal integer id
    const resolvedLines = [];
    for (const l of lines) {
        const accRes = await query(`SELECT id FROM chart_of_accounts WHERE uuid = $1 AND company_id = $2`, [l.account_id, req.user.company_id]);
        if (!accRes.rows.length) return res.status(400).json({ error: `Akun tidak ditemukan: ${l.account_id}` });
        resolvedLines.push({ account_id: accRes.rows[0].id, debit: l.debit || 0, credit: l.credit || 0, description: l.description || description });
    }

    const result = await query(
        date
            ? `INSERT INTO journal_entries (number, date, branch_id, description, created_by, ref_type) VALUES ($1, $2, $3, $4, $5, 'MANUAL') RETURNING id, uuid, number`
            : `INSERT INTO journal_entries (number, date, branch_id, description, created_by, ref_type) VALUES ($1, CURRENT_DATE, $2, $3, $4, 'MANUAL') RETURNING id, uuid, number`,
        date ? [number, date, branchIntId, description, req.user.name] : [number, branchIntId, description, req.user.name]
    );
    for (const l of resolvedLines) {
        await query(`INSERT INTO journal_lines (journal_id, account_id, debit, credit, description) VALUES ($1,$2,$3,$4,$5)`, [result.rows[0].id, l.account_id, l.debit, l.credit, l.description]);
    }
    await query(`INSERT INTO audit_trail (action, module, description, user_id, user_name, branch_id) VALUES ('create','accounting',$1,$2,$3,$4)`, [`Buat jurnal: ${result.rows[0].number}`, req.user.id, req.user.name, branchIntId]);
    const { id: _jid, ...safeJournal } = result.rows[0];
    res.status(201).json(safeJournal);
}));

router.put('/:uuid/post', requirePermission('accounting:approve'), validateUUID(), asyncHandler(async (req, res) => {
    // Security: cek company sebelum allow post
    const ownership = await query(
        `SELECT b.company_id FROM journal_entries je JOIN branches b ON je.branch_id = b.id WHERE je.uuid = $1`,
        [req.params.uuid]
    );
    if (!ownership.rows.length || ownership.rows[0].company_id !== req.user.company_id) {
        return res.status(403).json({ error: 'Akses ditolak' });
    }

    const client = await getClient();
    try {
        await client.query('BEGIN');
        const result = await client.query(`UPDATE journal_entries SET status='posted', updated_at=NOW() WHERE uuid=$1 AND status='draft' RETURNING id, uuid, number, branch_id`, [req.params.uuid]);
        if (result.rows.length === 0) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Jurnal tidak bisa diposting (sudah posted atau tidak ditemukan)' }); }
        const { id: jeId, number: jeNum, branch_id: jeBranch } = result.rows[0];
        // Update account balances
        const lines = await client.query(`SELECT account_id, debit, credit FROM journal_lines WHERE journal_id = $1`, [jeId]);
        for (const l of lines.rows) {
            await client.query(`UPDATE chart_of_accounts SET balance = balance + $1 - $2, updated_at=NOW() WHERE id = $3`, [l.debit, l.credit, l.account_id]);
        }
        await client.query('COMMIT');
        await query(`INSERT INTO audit_trail (action, module, description, user_id, user_name, branch_id) VALUES ('approve','accounting',$1,$2,$3,$4)`,
            [`Post Jurnal: ${jeNum} -- saldo akun diupdate`, req.user.id, req.user.name, jeBranch]);
        res.json({ message: `Jurnal ${jeNum} berhasil diposting, saldo akun diupdate` });
    } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
}));

router.delete('/:uuid', requirePermission('accounting:create'), validateUUID(), asyncHandler(async (req, res) => {
    // Only draft journals can be deleted
    const find = await query(
        `SELECT je.id, je.number, je.status, je.branch_id, b.company_id
         FROM journal_entries je JOIN branches b ON je.branch_id = b.id
         WHERE je.uuid = $1`, [req.params.uuid]
    );
    if (find.rows.length === 0) return res.status(404).json({ error: 'Jurnal tidak ditemukan' });
    const je = find.rows[0];

    // Security: company isolation
    if (je.company_id !== req.user.company_id) return res.status(403).json({ error: 'Akses ditolak' });
    if (je.status !== 'draft') return res.status(400).json({ error: 'Hanya jurnal berstatus draft yang bisa dihapus' });

    await query(`DELETE FROM journal_lines WHERE journal_id = $1`, [je.id]);
    await query(`DELETE FROM journal_entries WHERE id = $1`, [je.id]);
    await query(`INSERT INTO audit_trail (action, module, description, user_id, user_name, branch_id) VALUES ('delete','accounting',$1,$2,$3,$4)`,
        [`Hapus Jurnal: ${je.number}`, req.user.id, req.user.name, je.branch_id]);
    res.json({ message: `Jurnal ${je.number} berhasil dihapus` });
}));

module.exports = router;
