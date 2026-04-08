/**
 * BE/src/module/hr/employeeClaim.js
 * Claim Karyawan (HR Self-Service)
 *
 * Menggunakan tabel yang SAMA dengan modul Reimburse Finance:
 *   - reimbursements
 *   - reimbursement_items
 *
 * Perbedaan:
 *   - employee diambil otomatis dari req.user (bukan dipilih di FE)
 *   - tidak ada endpoint /post — Finance yang approve via modul Reimburse
 *   - list hanya menampilkan claim milik karyawan yang login
 *
 * Endpoints:
 *   GET    /api/hr/employee-claims              - list claim saya
 *   GET    /api/hr/employee-claims/categories   - daftar kategori
 *   GET    /api/hr/employee-claims/:uuid        - detail + items
 *   POST   /api/hr/employee-claims              - buat claim baru (draft)
 *   DELETE /api/hr/employee-claims/:uuid        - hapus draft
 *
 *   POST   /api/hr/employee-claims/:uuid/items                      - tambah item
 *   POST   /api/hr/employee-claims/:uuid/items/:itemUuid/attachment  - upload struk
 *   DELETE /api/hr/employee-claims/:uuid/items/:itemUuid            - hapus item
 */
const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const { query, getClient } = require('../../config/db');
const { authenticateToken } = require('../../middleware/auth');
const { validateUUID } = require('../../middleware/validate');
const { asyncHandler } = require('../../utils/helpers');
const { generateAutoNumber } = require('../../utils/autoNumber');
const { uploadDoc, processAndSaveDoc, UPLOAD_DIR } = require('../../middleware/upload');

router.use(authenticateToken);

const REIMB_CATEGORIES = [
    'Transportasi & BBM', 'Konsumsi & Entertainment', 'ATK & Perlengkapan',
    'Komunikasi & Internet', 'Kesehatan & Asuransi', 'Akomodasi & Hotel',
    'Biaya Profesional', 'Pemeliharaan & Perbaikan', 'Lain-lain'
];

// ── Helpers ──────────────────────────────────────────────────────────────────

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
 * Resolve employee_id dari user yang login.
 * User harus sudah ter-link ke data karyawan via employees.user_id.
 */
async function resolveEmployeeFromUser(userId, companyUuid) {
    const res = await query(
        `SELECT e.id, e.uuid, e.nik, e.nama_lengkap,
                e.branch_id,
                b.uuid AS branch_uuid, b.code AS branch_code, b.name AS branch_name
         FROM employees e
         LEFT JOIN branches b ON e.branch_id = b.id
         WHERE e.user_id = $1 AND e.company_uuid = $2 AND e.is_active = TRUE
         LIMIT 1`,
        [userId, companyUuid]
    );
    return res.rows[0] || null;
}

async function getClaimWithItems(uuid, companyUuid, employeeId) {
    const hRes = await query(
        `SELECT r.uuid, r.number, r.date, r.description,
                r.payment_method, r.bank_name, r.bank_account,
                r.total_amount, r.status, r.notes,
                r.created_by, r.created_at,
                b.uuid AS branch_id, b.name AS branch_name,
                e.uuid AS employee_uuid, e.nik AS employee_nik,
                e.nama_lengkap AS employee_name,
                ej.jabatan AS employee_jabatan,
                je.number AS journal_number
         FROM reimbursements r
         JOIN branches b ON r.branch_id = b.id
         LEFT JOIN employees e ON r.employee_id = e.id
         LEFT JOIN employee_jobs ej ON ej.employee_id = e.id AND ej.is_current = TRUE
         LEFT JOIN journal_entries je ON r.journal_id = je.id
         WHERE r.uuid = $1 AND b.company_uuid = $2 AND r.employee_id = $3`,
        [uuid, companyUuid, employeeId]
    );
    if (!hRes.rows.length) return null;
    const header = hRes.rows[0];

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
router.get('/categories', asyncHandler(async (_req, res) => {
    res.json(REIMB_CATEGORIES);
}));

// ── GET /coa-beban ────────────────────────────────────────────────────────────
// Mengembalikan semua COA dengan type='Beban' untuk company yang login.
// Tidak butuh accounting:view — hanya autentikasi biasa agar HR user bisa akses.
router.get('/coa-beban', asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const result = await query(
        `SELECT uuid, code, name, type
         FROM chart_of_accounts
         WHERE company_uuid = $1 AND type = 'Beban'
         ORDER BY code`,
        [companyUuid]
    );
    res.json(result.rows);
}));


// ── GET / ─────────────────────────────────────────────────────────────────────
router.get('/', asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const emp = await resolveEmployeeFromUser(req.user.id, companyUuid);
    if (!emp) return res.status(403).json({ error: 'Akun Anda belum ter-link ke data karyawan. Hubungi HR.' });

    const { status, date_from, date_to } = req.query;
    let where = ['b.company_uuid = $1', 'r.employee_id = $2'];
    let values = [companyUuid, emp.id];
    let idx = 3;

    if (status) { where.push(`r.status = $${idx++}`); values.push(status); }
    if (date_from) { where.push(`r.date >= $${idx++}`); values.push(date_from); }
    if (date_to) { where.push(`r.date <= $${idx++}`); values.push(date_to); }

    const result = await query(
        `SELECT r.uuid, r.number, r.date, r.description,
                r.payment_method, r.bank_name, r.bank_account,
                r.total_amount, r.status, r.notes,
                r.created_by, r.created_at,
                b.uuid AS branch_id, b.name AS branch_name,
                e.uuid AS employee_uuid, e.nik AS employee_nik,
                e.nama_lengkap AS employee_name,
                ej.jabatan AS employee_jabatan
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

// ── GET /:uuid ────────────────────────────────────────────────────────────────
router.get('/:uuid', validateUUID(), asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const emp = await resolveEmployeeFromUser(req.user.id, companyUuid);
    if (!emp) return res.status(403).json({ error: 'Akun belum ter-link ke data karyawan' });

    const detail = await getClaimWithItems(req.params.uuid, companyUuid, emp.id);
    if (!detail) return res.status(404).json({ error: 'Claim tidak ditemukan' });
    res.json(detail);
}));

// ── POST / ────────────────────────────────────────────────────────────────────
router.post('/', asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const emp = await resolveEmployeeFromUser(req.user.id, companyUuid);
    if (!emp) return res.status(403).json({ error: 'Akun Anda belum ter-link ke data karyawan. Hubungi HR.' });

    const {
        branch_id: branchUuid,
        date, description,
        payment_method, bank_name, bank_account,
        notes, items = []
    } = req.body;

    if (!description) {
        return res.status(400).json({ error: 'Deskripsi/keperluan wajib diisi' });
    }

    let branchIntId = emp.branch_id || null;
    let branchCode  = emp.branch_code || null;

    if (!branchIntId) {
        const branchUuidToUse = branchUuid || req.user.branchIds?.[0];
        if (branchUuidToUse) {
            const bRes = await query(
                `SELECT id, code FROM branches WHERE uuid = $1 AND company_uuid = $2`,
                [branchUuidToUse, companyUuid]
            );
            if (bRes.rows.length) {
                branchIntId = bRes.rows[0].id;
                branchCode  = bRes.rows[0].code;
            }
        }
    }

    if (!branchIntId) {
        return res.status(400).json({ error: 'Branch tidak ditemukan. Pastikan Anda memilih cabang yang aktif.' });
    }

    const number = await generateAutoNumber(branchCode || 'GEN', 'CLM');

    const client = await getClient();
    try {
        await client.query('BEGIN');

        const rRes = await client.query(
            `INSERT INTO reimbursements
             (number, branch_id, employee_id, date, description,
              payment_method, bank_name, bank_account, notes, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
             RETURNING id, uuid, number`,
            [
                number,
                branchIntId,
                emp.id,
                date || new Date().toISOString().split('T')[0],
                description.trim(),
                payment_method || 'cash',
                bank_name?.trim() || null,
                bank_account?.trim() || null,
                notes?.trim() || null,
                req.user.name,
            ]
        );
        const reimb = rRes.rows[0];

        for (const item of items) {
            if (!item.description || !item.amount || parseFloat(item.amount) <= 0) continue;

            let coaIntId = null;
            if (item.coa_id) {
                const coaRes = await client.query(
                    `SELECT id FROM chart_of_accounts WHERE uuid = $1 AND company_uuid = $2`,
                    [item.coa_id, companyUuid]
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
                    coaIntId,
                ]
            );
        }

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
             VALUES ('create','hr',$1,$2,$3,$4)`,
            [`Karyawan buat claim: ${number} - ${description}`, req.user.id, req.user.name, emp.branch_id]
        ).catch(() => { });

        res.status(201).json({ uuid: reimb.uuid, number: reimb.number });
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}));

// ── DELETE /:uuid ─────────────────────────────────────────────────────────────
router.delete('/:uuid', validateUUID(), asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const emp = await resolveEmployeeFromUser(req.user.id, companyUuid);
    if (!emp) return res.status(403).json({ error: 'Akun belum ter-link ke data karyawan' });

    const rRes = await query(
        `SELECT r.id, r.number, r.description, r.status
         FROM reimbursements r
         JOIN branches b ON r.branch_id = b.id
         WHERE r.uuid = $1 AND r.employee_id = $2 AND b.company_uuid = $3`,
        [req.params.uuid, emp.id, companyUuid]
    );
    if (!rRes.rows.length) return res.status(404).json({ error: 'Claim tidak ditemukan' });
    const reimb = rRes.rows[0];
    if (reimb.status === 'posted') return res.status(400).json({ error: 'Claim yang sudah disetujui tidak bisa dihapus' });

    // Hapus attachment files
    const attRes = await query(
        `SELECT attachment_path FROM reimbursement_items WHERE reimbursement_id = $1 AND attachment_path IS NOT NULL`,
        [reimb.id]
    );
    for (const row of attRes.rows) {
        try {
            const fp = path.join(UPLOAD_DIR, row.attachment_path.replace(/^\/uploadedImage\//, ''));
            if (fs.existsSync(fp)) fs.unlinkSync(fp);
        } catch (_) { /* ignore */ }
    }

    await query(`DELETE FROM reimbursements WHERE id = $1`, [reimb.id]);

    await query(
        `INSERT INTO audit_trail (action, module, description, user_id, user_name, branch_id)
         VALUES ('delete','hr',$1,$2,$3,$4)`,
        [`Hapus claim: ${reimb.number}`, req.user.id, req.user.name, emp.branch_id]
    ).catch(() => { });

    res.json({ message: `Claim ${reimb.number} berhasil dihapus` });
}));

// =============================================================================
// ITEM MANAGEMENT
// =============================================================================

// ── POST /:uuid/items ─────────────────────────────────────────────────────────
router.post('/:uuid/items', validateUUID(), asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const emp = await resolveEmployeeFromUser(req.user.id, companyUuid);
    if (!emp) return res.status(403).json({ error: 'Akun belum ter-link ke data karyawan' });

    const rRes = await query(
        `SELECT r.id, r.status
         FROM reimbursements r
         JOIN branches b ON r.branch_id = b.id
         WHERE r.uuid = $1 AND r.employee_id = $2 AND b.company_uuid = $3`,
        [req.params.uuid, emp.id, companyUuid]
    );
    if (!rRes.rows.length) return res.status(404).json({ error: 'Claim tidak ditemukan' });
    const reimb = rRes.rows[0];
    if (reimb.status === 'posted') return res.status(400).json({ error: 'Tidak bisa edit claim yang sudah disetujui' });

    const { date_item, category, description, amount, coa_id } = req.body;
    if (!description || !amount || parseFloat(amount) <= 0) {
        return res.status(400).json({ error: 'Deskripsi dan jumlah wajib diisi' });
    }

    let coaIntId = null;
    if (coa_id) {
        const coaRes = await query(
            `SELECT id FROM chart_of_accounts WHERE uuid = $1 AND company_uuid = $2`,
            [coa_id, companyUuid]
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

// ── POST /:uuid/items/:itemUuid/attachment ────────────────────────────────────
router.post(
    '/:uuid/items/:itemUuid/attachment',
    validateUUID(),
    uploadDoc.single('file'),
    asyncHandler(async (req, res) => {
        const companyUuid = req.user.company_uuid;
        if (!req.file) return res.status(400).json({ error: 'File diperlukan' });

        const emp = await resolveEmployeeFromUser(req.user.id, companyUuid);
        if (!emp) return res.status(403).json({ error: 'Akun belum ter-link ke data karyawan' });

        const rRes = await query(
            `SELECT r.id, b.company_uuid
             FROM reimbursements r
             JOIN branches b ON r.branch_id = b.id
             WHERE r.uuid = $1 AND r.employee_id = $2 AND b.company_uuid = $3`,
            [req.params.uuid, emp.id, companyUuid]
        );
        if (!rRes.rows.length) return res.status(404).json({ error: 'Claim tidak ditemukan' });
        const { id: reimbId, company_uuid } = rRes.rows[0];

        const itemRes = await query(
            `SELECT id, attachment_path FROM reimbursement_items WHERE uuid = $1 AND reimbursement_id = $2`,
            [req.params.itemUuid, reimbId]
        );
        if (!itemRes.rows.length) return res.status(404).json({ error: 'Item tidak ditemukan' });
        const item = itemRes.rows[0];

        if (item.attachment_path) {
            const old = path.join(UPLOAD_DIR, item.attachment_path.replace(/^\/uploadedImage\//, ''));
            if (fs.existsSync(old)) fs.unlinkSync(old);
        }

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

// ── DELETE /:uuid/items/:itemUuid ─────────────────────────────────────────────
router.delete('/:uuid/items/:itemUuid', validateUUID(), asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const emp = await resolveEmployeeFromUser(req.user.id, companyUuid);
    if (!emp) return res.status(403).json({ error: 'Akun belum ter-link ke data karyawan' });

    const rRes = await query(
        `SELECT r.id, r.status
         FROM reimbursements r
         JOIN branches b ON r.branch_id = b.id
         WHERE r.uuid = $1 AND r.employee_id = $2 AND b.company_uuid = $3`,
        [req.params.uuid, emp.id, companyUuid]
    );
    if (!rRes.rows.length) return res.status(404).json({ error: 'Claim tidak ditemukan' });
    const reimb = rRes.rows[0];
    if (reimb.status === 'posted') return res.status(400).json({ error: 'Tidak bisa hapus item dari claim yang sudah disetujui' });

    const itemRes = await query(
        `SELECT id, attachment_path FROM reimbursement_items WHERE uuid = $1 AND reimbursement_id = $2`,
        [req.params.itemUuid, reimb.id]
    );
    if (!itemRes.rows.length) return res.status(404).json({ error: 'Item tidak ditemukan' });

    if (itemRes.rows[0].attachment_path) {
        try {
            const fp = path.join(UPLOAD_DIR, itemRes.rows[0].attachment_path.replace(/^\/uploadedImage\//, ''));
            if (fs.existsSync(fp)) fs.unlinkSync(fp);
        } catch (_) { /* ignore */ }
    }

    await query(`DELETE FROM reimbursement_items WHERE id = $1`, [itemRes.rows[0].id]);
    await recalcTotal(reimb.id);

    res.json({ message: 'Item berhasil dihapus' });
}));

module.exports = router;
