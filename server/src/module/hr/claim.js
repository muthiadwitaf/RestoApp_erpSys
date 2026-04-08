/**
 * BE/src/module/hr/claim.js
 * Master data jenis claim + pengajuan claim karyawan
 *
 * Endpoints (Jenis Claim):
 *   GET    /api/hr/claim/types              - List semua jenis claim
 *   POST   /api/hr/claim/types              - Tambah jenis claim (HR Manager)
 *   PUT    /api/hr/claim/types/:id          - Edit jenis claim (HR Manager)
 *   PATCH  /api/hr/claim/types/:id/toggle   - Soft-delete / restore (HR Manager)
 *
 * Endpoints (Pengajuan Claim):
 *   GET    /api/hr/claim/submissions        - List claim milik user yg login
 *   POST   /api/hr/claim/submissions        - Apply claim baru (multipart/form-data)
 *   DELETE /api/hr/claim/submissions/:id    - Batalkan claim (hanya jika masih pending)
 */
const router = require('express').Router();
const path = require('path');
const { query } = require('../../config/db');
const { authenticateToken, requirePermission } = require('../../middleware/auth');
const { asyncHandler } = require('../../utils/helpers');
const { uploadDoc, processAndSaveDoc, UPLOAD_DIR } = require('../../middleware/upload');

// Semua endpoint butuh login
router.use(authenticateToken);

// Middleware write: hanya HR Manager (sama seperti setting.js)
const hrWrite = requirePermission('hr:delete');

// ─────────────────────────────────────────────────────────────────────────────
// CLAIM TYPES
// ─────────────────────────────────────────────────────────────────────────────

// GET /types — list semua jenis claim
router.get('/types', asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const result = await query(
        `SELECT id, nama, kode, deskripsi, max_amount, is_deleted, created_at, updated_at
         FROM claim_types
         WHERE company_uuid = $1
         ORDER BY is_deleted ASC, nama ASC`,
        [companyUuid]
    );
    res.json(result.rows);
}));

// POST /types — tambah jenis claim
router.post('/types', hrWrite, asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const { nama, kode, deskripsi, max_amount } = req.body;
    if (!nama?.trim()) return res.status(400).json({ error: 'Nama jenis claim wajib diisi' });

    const result = await query(
        `INSERT INTO claim_types (company_id, company_uuid, nama, kode, deskripsi, max_amount, created_by)
         VALUES ((SELECT id FROM companies WHERE uuid = $1), $1, $2, $3, $4, $5, $6) RETURNING *`,
        [
            companyUuid,
            nama.trim(),
            kode?.trim() || null,
            deskripsi?.trim() || null,
            max_amount ? parseFloat(max_amount) : null,
            req.user.name,
        ]
    );
    res.status(201).json(result.rows[0]);
}));

// PUT /types/:id — edit jenis claim
router.put('/types/:id', hrWrite, asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const { nama, kode, deskripsi, max_amount } = req.body;
    if (!nama?.trim()) return res.status(400).json({ error: 'Nama jenis claim wajib diisi' });

    const result = await query(
        `UPDATE claim_types
         SET nama = $1, kode = $2, deskripsi = $3, max_amount = $4, updated_at = NOW()
         WHERE id = $5 AND company_uuid = $6
         RETURNING *`,
        [
            nama.trim(),
            kode?.trim() || null,
            deskripsi?.trim() || null,
            max_amount ? parseFloat(max_amount) : null,
            req.params.id,
            companyUuid,
        ]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Jenis claim tidak ditemukan' });
    res.json(result.rows[0]);
}));

// PATCH /types/:id/toggle — soft-delete / restore
router.patch('/types/:id/toggle', hrWrite, asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const result = await query(
        `UPDATE claim_types
         SET is_deleted = NOT is_deleted, updated_at = NOW()
         WHERE id = $1 AND company_uuid = $2
         RETURNING *`,
        [req.params.id, companyUuid]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Jenis claim tidak ditemukan' });
    const row = result.rows[0];
    res.json({ message: row.is_deleted ? 'Jenis claim dinonaktifkan' : 'Jenis claim dipulihkan', row });
}));

// ─────────────────────────────────────────────────────────────────────────────
// CLAIM SUBMISSIONS (PENGAJUAN CLAIM)
// ─────────────────────────────────────────────────────────────────────────────

// GET /submissions — list claim milik user yg sedang login
router.get('/submissions', asyncHandler(async (req, res) => {
    const userId      = req.user.id;
    const companyUuid = req.user.company_uuid;

    const result = await query(
        `SELECT c.id, c.tanggal, c.detail, c.amount, c.status,
                c.bukti_path, c.bukti_ext, c.bukti_filename,
                c.catatan_review, c.reviewed_by, c.reviewed_at,
                c.created_at,
                ct.nama AS jenis_claim,
                ct.kode AS kode_claim,
                ct.max_amount
         FROM claims c
         JOIN claim_types ct ON c.claim_type_id = ct.id
         WHERE c.user_id = $1 AND c.company_uuid = $2
         ORDER BY c.created_at DESC`,
        [userId, companyUuid]
    );
    res.json(result.rows);
}));

// POST /submissions — ajukan claim baru (multipart: claim_type_id, tanggal, detail, amount, bukti)
router.post('/submissions', uploadDoc.single('bukti'), asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const { claim_type_id, tanggal, detail, amount } = req.body;

    if (!claim_type_id) return res.status(400).json({ error: 'Jenis claim wajib dipilih' });
    if (!tanggal) return res.status(400).json({ error: 'Tanggal wajib diisi' });

    // Verifikasi claim_type valid & milik company ini
    const typeCheck = await query(
        `SELECT id, max_amount FROM claim_types WHERE id = $1 AND company_uuid = $2 AND is_deleted = FALSE`,
        [claim_type_id, companyUuid]
    );
    if (!typeCheck.rows.length) return res.status(400).json({ error: 'Jenis claim tidak valid' });

    // Proses file bukti jika ada
    let bukti_filename = null, bukti_ext = null, bukti_path = null;
    if (req.file) {
        const destDir = path.join(UPLOAD_DIR, 'claims', String(companyUuid));
        const saved = await processAndSaveDoc(req.file.buffer, req.file.mimetype, destDir);
        bukti_filename = saved.filename;
        bukti_ext = saved.ext;
        bukti_path = `/uploadedImage/claims/${companyUuid}/${saved.filename}`;
    }

    const result = await query(
        `INSERT INTO claims
            (company_id, company_uuid, claim_type_id, user_id, tanggal, detail, amount,
             bukti_filename, bukti_ext, bukti_path)
         VALUES ((SELECT id FROM companies WHERE uuid = $1),$1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING *`,
        [
            companyUuid,
            parseInt(claim_type_id),
            req.user.id,
            tanggal,
            detail?.trim() || null,
            amount ? parseFloat(amount) : null,
            bukti_filename,
            bukti_ext,
            bukti_path,
        ]
    );

    // Join dengan claim_type untuk response lengkap
    const full = await query(
        `SELECT c.*, ct.nama AS jenis_claim, ct.kode AS kode_claim, ct.max_amount
         FROM claims c JOIN claim_types ct ON c.claim_type_id = ct.id
         WHERE c.id = $1`,
        [result.rows[0].id]
    );
    res.status(201).json(full.rows[0]);
}));

// DELETE /submissions/:id — batalkan claim (hanya jika masih pending & milik sendiri)
router.delete('/submissions/:id', asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;

    const existing = await query(
        `SELECT id, status FROM claims WHERE id = $1 AND user_id = $2`,
        [id, userId]
    );
    if (!existing.rows.length) return res.status(404).json({ error: 'Claim tidak ditemukan' });
    if (existing.rows[0].status !== 'pending') {
        return res.status(400).json({ error: 'Hanya claim berstatus pending yang bisa dibatalkan' });
    }

    await query(`DELETE FROM claims WHERE id = $1`, [id]);
    res.json({ message: 'Claim berhasil dibatalkan' });
}));

module.exports = router;
