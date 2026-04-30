/**
 * BE/src/module/accounting/reimbursements.js
 * Module Reimburse Karyawan - Finance input manual
 *
 * Endpoints:
 *   GET    /api/accounting/reimbursements            - list semua reimburse
 *   GET    /api/accounting/reimbursements/categories  - daftar kategori
 *   GET    /api/accounting/reimbursements/:uuid       - detail + items
 *   POST   /api/accounting/reimbursements             - buat reimburse baru (dengan items)
 *   PUT    /api/accounting/reimbursements/:uuid       - edit header (hanya draft)
 *   PUT    /api/accounting/reimbursements/:uuid/post  - posting + auto jurnal
 *   DELETE /api/accounting/reimbursements/:uuid       - hapus draft
 *
 *   POST   /api/accounting/reimbursements/:uuid/items           - tambah item
 *   PUT    /api/accounting/reimbursements/:uuid/items/:itemUuid - edit item
 *   DELETE /api/accounting/reimbursements/:uuid/items/:itemUuid - hapus item
 */
const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const { query, getClient } = require('../../config/db');
const { requirePermission } = require('../../middleware/auth');
const { validateUUID } = require('../../middleware/validate');
const { asyncHandler } = require('../../utils/helpers');
const { generateAutoNumber } = require('../../utils/autoNumber');
const { uploadDoc, processAndSaveDoc, UPLOAD_DIR } = require('../../middleware/upload');

const REIMB_CATEGORIES = [
    'Transportasi & BBM', 'Konsumsi & Entertainment', 'ATK & Perlengkapan',
    'Komunikasi & Internet', 'Kesehatan & Asuransi', 'Akomodasi & Hotel',
    'Biaya Profesional', 'Pemeliharaan & Perbaikan', 'Lain-lain'
];

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Recalculate total_amount dari items dan simpan ke header.
 */
async function recalcTotal(reimbId) {
    await query(
        `UPDATE reimbursements
         SET total_amount = COALESCE(
             (SELECT SUM(amount) FROM reimbursement_items WHERE reimbursement_id = $1), 0
         ), updated_at = NOW()
         WHERE id = $1`,
        [reimbId]
    );
}

/**
 * Semua field yang aman dikirim ke FE (tanpa integer id).
 */
async function getReimbWithItems(uuid, companyId) {
    const hRes = await query(
        `SELECT r.uuid, r.number, r.date, r.description,
                r.payment_method, r.bank_name, r.bank_account,
                r.total_amount, r.status, r.notes,
                r.created_by, r.created_at,
                r.employee_name_manual,
                b.uuid AS branch_id, b.name AS branch_name,
                e.uuid AS employee_uuid, e.nik AS employee_nik,
                COALESCE(e.nama_lengkap, r.employee_name_manual) AS employee_name,
                ej.jabatan AS employee_jabatan, ej.departemen AS employee_departemen,
                je.number AS journal_number
         FROM reimbursements r
         JOIN branches b ON r.branch_id = b.id
         LEFT JOIN employees e ON r.employee_id = e.id
         LEFT JOIN employee_jobs ej ON ej.employee_id = e.id AND ej.is_current = TRUE
         LEFT JOIN journal_entries je ON r.journal_id = je.id
         WHERE r.uuid = $1 AND b.company_id = $2`,
        [uuid, companyId]
    );
    if (!hRes.rows.length) return null;
    const header = hRes.rows[0];

    // ambil id (internal) untuk query items
    const idRes = await query(`SELECT id FROM reimbursements WHERE uuid = $1`, [uuid]);
    const reimbId = idRes.rows[0].id;

    const iRes = await query(
        `SELECT ri.uuid, ri.date_item, ri.category, ri.description,
                ri.amount, ri.attachment_path, ri.created_at,
                coa.uuid AS coa_id, coa.code AS coa_code, coa.name AS coa_name
         FROM reimbursement_items ri
         LEFT JOIN chart_of_accounts coa ON ri.coa_id = coa.id
         WHERE ri.reimbursement_id = $1
         ORDER BY ri.id ASC`,
        [reimbId]
    );

    return { ...header, items: iRes.rows };
}

// ── GET /categories ──────────────────────────────────────────────────────────
router.get('/categories', requirePermission('accounting:view'), asyncHandler(async (req, res) => {
    res.json(REIMB_CATEGORIES);
}));

// ── GET / ────────────────────────────────────────────────────────────────────
router.get('/', requirePermission('accounting:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const { branch_id, status, employee_uuid, date_from, date_to } = req.query;

    let where = ['b.company_id = $1'];
    let values = [companyId];
    let idx = 2;

    if (branch_id) { where.push(`b.uuid = $${idx++}`); values.push(branch_id); }
    if (status) { where.push(`r.status = $${idx++}`); values.push(status); }
    if (employee_uuid) { where.push(`e.uuid = $${idx++}`); values.push(employee_uuid); }
    if (date_from) { where.push(`r.date >= $${idx++}`); values.push(date_from); }
    if (date_to) { where.push(`r.date <= $${idx++}`); values.push(date_to); }

    const result = await query(
        `SELECT r.uuid, r.number, r.date, r.description,
                r.payment_method, r.bank_name, r.bank_account,
                r.total_amount, r.status, r.notes,
                r.created_by, r.created_at,
                r.employee_name_manual,
                b.uuid AS branch_id, b.name AS branch_name,
                e.uuid AS employee_uuid, e.nik AS employee_nik,
                COALESCE(e.nama_lengkap, r.employee_name_manual) AS employee_name,
                ej.jabatan AS employee_jabatan, ej.departemen AS employee_departemen
         FROM reimbursements r
         JOIN branches b ON r.branch_id = b.id
         LEFT JOIN employees e ON r.employee_id = e.id
         LEFT JOIN employee_jobs ej ON ej.employee_id = e.id AND ej.is_current = TRUE
         WHERE ${where.join(' AND ')}
         ORDER BY r.date DESC, r.id DESC`,
        values
    );
    res.json(result.rows);
}));

// ── GET /:uuid ───────────────────────────────────────────────────────────────
router.get('/:uuid', requirePermission('accounting:view'), validateUUID(), asyncHandler(async (req, res) => {
    const detail = await getReimbWithItems(req.params.uuid, req.user.company_id);
    if (!detail) return res.status(404).json({ error: 'Reimburse tidak ditemukan' });
    res.json(detail);
}));

// ── POST / ────────────────────────────────────────────────────────────────────
// Buat reimburse baru. Items bisa dikirim sekaligus atau ditambah nanti.
router.post('/', requirePermission('accounting:create'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const {
        branch_id, employee_uuid, employee_name_manual,
        date, description,
        payment_method, bank_name, bank_account,
        notes, items = []
    } = req.body;

    // Wajib: branch + description, dan salah satu dari employee_uuid atau employee_name_manual
    const hasEmployee = !!(employee_uuid || employee_name_manual?.trim());
    if (!branch_id || !description || !hasEmployee) {
        return res.status(400).json({
            error: 'branch_id, description, dan karyawan (employee_uuid atau employee_name_manual) wajib diisi'
        });
    }

    // Resolve branch
    const brRes = await query(
        `SELECT b.id, b.code, b.company_id FROM branches b WHERE b.uuid = $1`,
        [branch_id]
    );
    if (!brRes.rows.length) return res.status(400).json({ error: 'Cabang tidak ditemukan' });
    if (brRes.rows[0].company_id !== companyId) return res.status(403).json({ error: 'Akses ditolak' });
    const branchIntId = brRes.rows[0].id;
    const branchCode  = brRes.rows[0].code;

    // Resolve employee — optional jika mode manual
    let employeeIntId = null;
    if (employee_uuid) {
        const empRes = await query(
            `SELECT e.id FROM employees e
             WHERE e.uuid = $1 AND e.company_id = $2 AND e.is_active = TRUE`,
            [employee_uuid, companyId]
        );
        if (!empRes.rows.length) return res.status(400).json({ error: 'Karyawan tidak ditemukan atau tidak aktif' });
        employeeIntId = empRes.rows[0].id;
    }

    const number = await generateAutoNumber(branchCode || 'GEN', 'RMB');

    const client = await getClient();
    try {
        await client.query('BEGIN');

        const rRes = await client.query(
            `INSERT INTO reimbursements
             (number, branch_id, employee_id, employee_name_manual, date, description,
              payment_method, bank_name, bank_account, notes, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
             RETURNING id, uuid, number`,
            [
                number, branchIntId, employeeIntId,
                employee_name_manual?.trim() || null,
                date || new Date().toISOString().split('T')[0],
                description.trim(),
                payment_method || 'cash',
                bank_name?.trim() || null,
                bank_account?.trim() || null,
                notes?.trim() || null,
                req.user.name
            ]
        );
        const reimb = rRes.rows[0];

        // Insert items jika ada
        for (const item of items) {
            if (!item.description || !item.amount || parseFloat(item.amount) <= 0) continue;

            let coaIntId = null;
            if (item.coa_id) {
                const coaRes = await client.query(
                    `SELECT id FROM chart_of_accounts WHERE uuid = $1 AND company_id = $2`,
                    [item.coa_id, companyId]
                );
                coaIntId = coaRes.rows[0]?.id || null;
            }

            await client.query(
                `INSERT INTO reimbursement_items
                 (reimbursement_id, date_item, category, description, amount, coa_id)
                 VALUES ($1,$2,$3,$4,$5,$6)`,
                [
                    reimb.id,
                    item.date_item || null,
                    item.category || 'Lain-lain',
                    item.description.trim(),
                    parseFloat(item.amount),
                    coaIntId
                ]
            );
        }

        // Recalc total dalam transaksi
        await client.query(
            `UPDATE reimbursements
             SET total_amount = COALESCE(
                 (SELECT SUM(amount) FROM reimbursement_items WHERE reimbursement_id = $1), 0
             ) WHERE id = $1`,
            [reimb.id]
        );

        await client.query('COMMIT');

        await query(
            `INSERT INTO audit_trail (action, module, description, user_id, user_name, branch_id)
             VALUES ('create','accounting',$1,$2,$3,$4)`,
            [`Buat reimburse: ${number} - ${description}`, req.user.id, req.user.name, branchIntId]
        );

        res.status(201).json({ uuid: reimb.uuid, number: reimb.number });
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}));

// ── PUT /:uuid — edit header (hanya draft) ───────────────────────────────────
router.put('/:uuid', requirePermission('accounting:create'), validateUUID(), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const rRes = await query(
        `SELECT r.id, r.status, b.company_id
         FROM reimbursements r JOIN branches b ON r.branch_id = b.id
         WHERE r.uuid = $1`,
        [req.params.uuid]
    );
    if (!rRes.rows.length) return res.status(404).json({ error: 'Reimburse tidak ditemukan' });
    const reimb = rRes.rows[0];
    if (reimb.company_id !== companyId) return res.status(403).json({ error: 'Akses ditolak' });
    if (reimb.status === 'posted') return res.status(400).json({ error: 'Reimburse yang sudah diposting tidak bisa diubah' });

    const { date, description, payment_method, bank_name, bank_account, notes, employee_uuid } = req.body;

    let employeeIntId;
    if (employee_uuid) {
        const empRes = await query(
            `SELECT e.id FROM employees e WHERE e.uuid = $1 AND e.company_id = $2`,
            [employee_uuid, companyId]
        );
        if (!empRes.rows.length) return res.status(400).json({ error: 'Karyawan tidak ditemukan' });
        employeeIntId = empRes.rows[0].id;
    }

    const updates = ['updated_at = NOW()'];
    const vals = [];
    let idx = 1;

    if (date) { updates.push(`date = $${idx++}`); vals.push(date); }
    if (description) { updates.push(`description = $${idx++}`); vals.push(description.trim()); }
    if (payment_method) { updates.push(`payment_method = $${idx++}`); vals.push(payment_method); }
    if (bank_name !== undefined) { updates.push(`bank_name = $${idx++}`); vals.push(bank_name?.trim() || null); }
    if (bank_account !== undefined) { updates.push(`bank_account = $${idx++}`); vals.push(bank_account?.trim() || null); }
    if (notes !== undefined) { updates.push(`notes = $${idx++}`); vals.push(notes?.trim() || null); }
    if (employeeIntId) { updates.push(`employee_id = $${idx++}`); vals.push(employeeIntId); }

    vals.push(reimb.id);
    await query(`UPDATE reimbursements SET ${updates.join(', ')} WHERE id = $${idx}`, vals);

    await query(
        `INSERT INTO audit_trail (action, module, description, user_id, user_name, branch_id)
         VALUES ('update','accounting',$1,$2,$3,$4)`,
        [`Edit reimburse: ${req.params.uuid}`, req.user.id, req.user.name, req.user.branch_id]
    );

    res.json({ message: 'Reimburse berhasil diupdate' });
}));

// ── PUT /:uuid/post — posting + auto jurnal ──────────────────────────────────
router.put('/:uuid/post', requirePermission('accounting:approve'), validateUUID(), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;

    const rRes = await query(
        `SELECT r.id, r.uuid, r.number, r.description, r.total_amount,
                r.payment_method, r.status, r.branch_id,
                b.company_id, b.code AS branch_code
         FROM reimbursements r JOIN branches b ON r.branch_id = b.id
         WHERE r.uuid = $1`,
        [req.params.uuid]
    );
    if (!rRes.rows.length) return res.status(404).json({ error: 'Reimburse tidak ditemukan' });
    const reimb = rRes.rows[0];
    if (reimb.company_id !== companyId) return res.status(403).json({ error: 'Akses ditolak' });
    if (reimb.status === 'posted') return res.status(400).json({ error: 'Sudah diposting' });
    if (parseFloat(reimb.total_amount) <= 0) return res.status(400).json({ error: 'Tidak ada item atau total 0. Tambah item terlebih dahulu.' });

    // Ambil items + COA masing-masing
    const itemsRes = await query(
        `SELECT ri.description, ri.amount, ri.coa_id
         FROM reimbursement_items ri
         WHERE ri.reimbursement_id = $1`,
        [reimb.id]
    );
    if (!itemsRes.rows.length) return res.status(400).json({ error: 'Tidak ada item reimburse. Tambah item terlebih dahulu.' });

    // Validasi: semua item harus punya COA
    const itemsWithoutCoa = itemsRes.rows.filter(i => !i.coa_id);
    if (itemsWithoutCoa.length > 0) {
        return res.status(400).json({
            error: `${itemsWithoutCoa.length} item belum memiliki Akun Beban (COA). Lengkapi item terlebih dahulu.`
        });
    }

    // Cari akun kredit: Kas atau Bank (berdasarkan payment method)
    const creditKeyword = reimb.payment_method === 'cash' ? 'Kas' : 'Bank';
    const creditCoaRes = await query(
        `SELECT id FROM chart_of_accounts
         WHERE company_id = $1 AND (name ILIKE $2 OR code ILIKE $2) AND type = 'Aset'
         ORDER BY code LIMIT 1`,
        [companyId, `%${creditKeyword}%`]
    );
    if (!creditCoaRes.rows.length) {
        return res.status(400).json({ error: `Akun ${creditKeyword} tidak ditemukan di COA. Buat akun ${creditKeyword} terlebih dahulu.` });
    }
    const creditCoaId = creditCoaRes.rows[0].id;

    const client = await getClient();
    try {
        await client.query('BEGIN');

        const jeNumber = await generateAutoNumber(reimb.branch_code || 'GEN', 'JU');

        // Header jurnal
        const jeRes = await client.query(
            `INSERT INTO journal_entries (number, date, branch_id, description, status, created_by, ref_number, ref_type)
             VALUES ($1, NOW()::date, $2, $3, 'posted', $4, $5, 'RMB')
             RETURNING id`,
            [jeNumber, reimb.branch_id, `Reimburse Karyawan: ${reimb.description}`, req.user.name, reimb.number]
        );
        const jeId = jeRes.rows[0].id;

        // Debit lines: satu per item
        for (const item of itemsRes.rows) {
            await client.query(
                `INSERT INTO journal_lines (journal_id, account_id, debit, credit, description)
                 VALUES ($1, $2, $3, 0, $4)`,
                [jeId, item.coa_id, parseFloat(item.amount), item.description]
            );
            // Update COA balance debit
            await client.query(
                `UPDATE chart_of_accounts SET balance = balance + $1, updated_at = NOW() WHERE id = $2`,
                [parseFloat(item.amount), item.coa_id]
            );
        }

        // Credit line: total ke Kas/Bank
        await client.query(
            `INSERT INTO journal_lines (journal_id, account_id, debit, credit, description)
             VALUES ($1, $2, 0, $3, $4)`,
            [jeId, creditCoaId, parseFloat(reimb.total_amount), `Reimburse: ${reimb.description}`]
        );
        // Update COA balance credit
        await client.query(
            `UPDATE chart_of_accounts SET balance = balance - $1, updated_at = NOW() WHERE id = $2`,
            [parseFloat(reimb.total_amount), creditCoaId]
        );

        // Update status reimburse
        await client.query(
            `UPDATE reimbursements SET status = 'posted', journal_id = $1, updated_at = NOW() WHERE id = $2`,
            [jeId, reimb.id]
        );

        await client.query('COMMIT');

        await query(
            `INSERT INTO audit_trail (action, module, description, user_id, user_name, branch_id)
             VALUES ('approve','accounting',$1,$2,$3,$4)`,
            [`Post reimburse: ${reimb.number} - Jurnal: ${jeNumber}`, req.user.id, req.user.name, reimb.branch_id]
        );

        res.json({ message: `Reimburse ${reimb.number} berhasil diposting. Jurnal: ${jeNumber}` });
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}));

// ── DELETE /:uuid ─────────────────────────────────────────────────────────────
router.delete('/:uuid', requirePermission('accounting:create'), validateUUID(), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const rRes = await query(
        `SELECT r.id, r.number, r.description, r.status, r.branch_id, b.company_id
         FROM reimbursements r JOIN branches b ON r.branch_id = b.id
         WHERE r.uuid = $1`,
        [req.params.uuid]
    );
    if (!rRes.rows.length) return res.status(404).json({ error: 'Reimburse tidak ditemukan' });
    const reimb = rRes.rows[0];
    if (reimb.company_id !== companyId) return res.status(403).json({ error: 'Akses ditolak' });
    if (reimb.status === 'posted') return res.status(400).json({ error: 'Reimburse yang sudah diposting tidak bisa dihapus' });

    // Hapus attachment files jika ada
    const attRes = await query(
        `SELECT attachment_path FROM reimbursement_items WHERE reimbursement_id = $1 AND attachment_path IS NOT NULL`,
        [reimb.id]
    );
    for (const row of attRes.rows) {
        try {
            const fp = path.join(UPLOAD_DIR, row.attachment_path.replace(/^\/uploadedImage\//, ''));
            if (fs.existsSync(fp)) fs.unlinkSync(fp);
        } catch (e) { /* ignore */ }
    }

    await query(`DELETE FROM reimbursements WHERE id = $1`, [reimb.id]);

    await query(
        `INSERT INTO audit_trail (action, module, description, user_id, user_name, branch_id)
         VALUES ('delete','accounting',$1,$2,$3,$4)`,
        [`Hapus reimburse: ${reimb.number} - ${reimb.description}`, req.user.id, req.user.name, reimb.branch_id]
    );

    res.json({ message: `Reimburse ${reimb.number} berhasil dihapus` });
}));

// =============================================================================
// ITEM MANAGEMENT
// =============================================================================

// ── POST /:uuid/items ─────────────────────────────────────────────────────────
router.post('/:uuid/items', requirePermission('accounting:create'), validateUUID(), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const rRes = await query(
        `SELECT r.id, r.status, b.company_id
         FROM reimbursements r JOIN branches b ON r.branch_id = b.id
         WHERE r.uuid = $1`,
        [req.params.uuid]
    );
    if (!rRes.rows.length) return res.status(404).json({ error: 'Reimburse tidak ditemukan' });
    const reimb = rRes.rows[0];
    if (reimb.company_id !== companyId) return res.status(403).json({ error: 'Akses ditolak' });
    if (reimb.status === 'posted') return res.status(400).json({ error: 'Tidak bisa edit reimburse yang sudah diposting' });

    const { date_item, category, description, amount, coa_id } = req.body;
    if (!description || !amount || parseFloat(amount) <= 0) {
        return res.status(400).json({ error: 'description dan amount wajib diisi' });
    }

    let coaIntId = null;
    if (coa_id) {
        const coaRes = await query(
            `SELECT id FROM chart_of_accounts WHERE uuid = $1 AND company_id = $2`,
            [coa_id, companyId]
        );
        coaIntId = coaRes.rows[0]?.id || null;
    }

    const result = await query(
        `INSERT INTO reimbursement_items
         (reimbursement_id, date_item, category, description, amount, coa_id)
         VALUES ($1,$2,$3,$4,$5,$6)
         RETURNING uuid`,
        [reimb.id, date_item || null, category || 'Lain-lain', description.trim(), parseFloat(amount), coaIntId]
    );

    await recalcTotal(reimb.id);

    res.status(201).json({ uuid: result.rows[0].uuid, message: 'Item berhasil ditambahkan' });
}));

// ── POST /:uuid/items/:itemUuid/attachment — upload struk ──────────────────
router.post(
    '/:uuid/items/:itemUuid/attachment',
    requirePermission('accounting:create'),
    validateUUID(),
    uploadDoc.single('file'),
    asyncHandler(async (req, res) => {
        const companyId = req.user.company_id;
        if (!req.file) return res.status(400).json({ error: 'File diperlukan' });

        const rRes = await query(
            `SELECT r.id, b.company_id, b.uuid AS branch_uuid, c.uuid AS company_uuid
             FROM reimbursements r
             JOIN branches b ON r.branch_id = b.id
             JOIN companies c ON b.company_id = c.id
             WHERE r.uuid = $1`,
            [req.params.uuid]
        );
        if (!rRes.rows.length) return res.status(404).json({ error: 'Reimburse tidak ditemukan' });
        if (rRes.rows[0].company_id !== companyId) return res.status(403).json({ error: 'Akses ditolak' });

        const { id: reimbId, company_uuid } = rRes.rows[0];

        const itemRes = await query(
            `SELECT id, attachment_path FROM reimbursement_items WHERE uuid = $1 AND reimbursement_id = $2`,
            [req.params.itemUuid, reimbId]
        );
        if (!itemRes.rows.length) return res.status(404).json({ error: 'Item tidak ditemukan' });
        const item = itemRes.rows[0];

        // Hapus attachment lama jika ada
        if (item.attachment_path) {
            const old = path.join(UPLOAD_DIR, item.attachment_path.replace(/^\/uploadedImage\//, ''));
            if (fs.existsSync(old)) fs.unlinkSync(old);
        }

        // Simpan file via processAndSaveDoc (image -> WebP UUID, PDF -> PDF UUID)
        const destDir = path.join(UPLOAD_DIR, company_uuid, 'reimburse', req.params.uuid);
        const { filename } = await processAndSaveDoc(req.file.buffer, req.file.mimetype, destDir);

        const attachPath = `/uploadedImage/${company_uuid}/reimburse/${req.params.uuid}/${filename}`;
        await query(
            `UPDATE reimbursement_items SET attachment_path = $1 WHERE id = $2`,
            [attachPath, item.id]
        );

        res.json({ attachment_path: attachPath });
    })
);

// ── PUT /:uuid/items/:itemUuid ────────────────────────────────────────────────
router.put('/:uuid/items/:itemUuid', requirePermission('accounting:create'), validateUUID(), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const rRes = await query(
        `SELECT r.id, r.status, b.company_id
         FROM reimbursements r JOIN branches b ON r.branch_id = b.id
         WHERE r.uuid = $1`,
        [req.params.uuid]
    );
    if (!rRes.rows.length) return res.status(404).json({ error: 'Reimburse tidak ditemukan' });
    const reimb = rRes.rows[0];
    if (reimb.company_id !== companyId) return res.status(403).json({ error: 'Akses ditolak' });
    if (reimb.status === 'posted') return res.status(400).json({ error: 'Tidak bisa edit reimburse yang sudah diposting' });

    const { date_item, category, description, amount, coa_id } = req.body;
    if (!description || !amount || parseFloat(amount) <= 0) {
        return res.status(400).json({ error: 'description dan amount wajib diisi' });
    }

    let coaIntId = null;
    if (coa_id) {
        const coaRes = await query(
            `SELECT id FROM chart_of_accounts WHERE uuid = $1 AND company_id = $2`,
            [coa_id, companyId]
        );
        coaIntId = coaRes.rows[0]?.id || null;
    }

    await query(
        `UPDATE reimbursement_items
         SET date_item = $1, category = $2, description = $3, amount = $4, coa_id = $5
         WHERE uuid = $6 AND reimbursement_id = $7`,
        [date_item || null, category || 'Lain-lain', description.trim(), parseFloat(amount), coaIntId,
            req.params.itemUuid, reimb.id]
    );

    await recalcTotal(reimb.id);
    res.json({ message: 'Item berhasil diupdate' });
}));

// ── DELETE /:uuid/items/:itemUuid ─────────────────────────────────────────────
router.delete('/:uuid/items/:itemUuid', requirePermission('accounting:create'), validateUUID(), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const rRes = await query(
        `SELECT r.id, r.status, b.company_id
         FROM reimbursements r JOIN branches b ON r.branch_id = b.id
         WHERE r.uuid = $1`,
        [req.params.uuid]
    );
    if (!rRes.rows.length) return res.status(404).json({ error: 'Reimburse tidak ditemukan' });
    const reimb = rRes.rows[0];
    if (reimb.company_id !== companyId) return res.status(403).json({ error: 'Akses ditolak' });
    if (reimb.status === 'posted') return res.status(400).json({ error: 'Tidak bisa hapus item dari reimburse yang sudah diposting' });

    const itemRes = await query(
        `SELECT id, attachment_path FROM reimbursement_items WHERE uuid = $1 AND reimbursement_id = $2`,
        [req.params.itemUuid, reimb.id]
    );
    if (!itemRes.rows.length) return res.status(404).json({ error: 'Item tidak ditemukan' });

    // Hapus attachment jika ada
    if (itemRes.rows[0].attachment_path) {
        try {
            const fp = path.join(UPLOAD_DIR, itemRes.rows[0].attachment_path.replace(/^\/uploadedImage\//, ''));
            if (fs.existsSync(fp)) fs.unlinkSync(fp);
        } catch (e) { /* ignore */ }
    }

    await query(`DELETE FROM reimbursement_items WHERE id = $1`, [itemRes.rows[0].id]);
    await recalcTotal(reimb.id);

    res.json({ message: 'Item berhasil dihapus' });
}));

module.exports = router;
