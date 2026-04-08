/**
 * BE/src/module/accounting/assets/documents.js
 * Dokumen terkait aset: upload (PDF/image), list, hapus
 *
 * GET    /:uuid/documents           -- list dokumen
 * POST   /:uuid/documents           -- upload dokumen (label wajib)
 * DELETE /:uuid/documents/:docUuid  -- hapus dokumen (accounting:delete)
 */
const router = require('express').Router();
const path   = require('path');
const fs     = require('fs');
const { query } = require('../../../config/db');
const { requirePermission } = require('../../../middleware/auth');
const { validateUUID } = require('../../../middleware/validate');
const { asyncHandler } = require('../../../utils/helpers');
const {
    uploadDoc, processAndSaveDoc, UPLOAD_DIR
} = require('../../../middleware/upload');

// ── helpers ──────────────────────────────────────────────────────────────────

async function resolveAsset(assetUuid, companyId) {
    const r = await query(
        `SELECT a.id, a.uuid, b.company_id, b.uuid AS company_uuid
         FROM assets a JOIN branches b ON a.branch_id = b.id
         WHERE a.uuid = $1`,
        [assetUuid]
    );
    if (!r.rows.length) return null;
    if (r.rows[0].company_id !== companyId) return null;
    return r.rows[0];
}

async function auditLog(req, action, desc) {
    await query(
        `INSERT INTO audit_trail (action, module, description, user_id, user_name, branch_id)
         VALUES ($1,'accounting',$2,$3,$4,$5)`,
        [action, desc, req.user.id, req.user.name, req.user.branch_id]
    ).catch(() => {});
}

// ── GET /:uuid/documents ──────────────────────────────────────────────────────
router.get(
    '/:uuid/documents',
    requirePermission('accounting:view'),
    validateUUID(),
    asyncHandler(async (req, res) => {
        const asset = await resolveAsset(req.params.uuid, req.user.company_id);
        if (!asset) return res.status(404).json({ error: 'Aset tidak ditemukan' });

        const r = await query(
            `SELECT uuid, file_url, ext, label, size_bytes, uploaded_by, created_at
             FROM asset_documents
             WHERE asset_id = $1
             ORDER BY created_at DESC`,
            [asset.id]
        );
        res.json(r.rows);
    })
);

// ── POST /:uuid/documents ─────────────────────────────────────────────────────
router.post(
    '/:uuid/documents',
    requirePermission('accounting:create'),
    validateUUID(),
    uploadDoc.single('document'),
    asyncHandler(async (req, res) => {
        const { label } = req.body;

        if (!req.file) return res.status(400).json({ error: 'File dokumen wajib diupload' });
        if (!label || !label.trim()) return res.status(400).json({ error: 'Nama dokumen (label) wajib diisi' });

        const asset = await resolveAsset(req.params.uuid, req.user.company_id);
        if (!asset) return res.status(404).json({ error: 'Aset tidak ditemukan' });

        const destDir = path.join(
            UPLOAD_DIR, asset.company_uuid, 'assets', asset.uuid, 'docs'
        );
        const { fileUuid, filename, ext, sizeBytes } = await processAndSaveDoc(
            req.file.buffer, req.file.mimetype, destDir
        );
        const fileUrl = '/uploadedImage/' + asset.company_uuid + '/assets/' + asset.uuid + '/docs/' + filename;

        const ins = await query(
            `INSERT INTO asset_documents (asset_id, file_uuid, file_url, ext, label, size_bytes, uploaded_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7)
             RETURNING uuid, file_url, ext, label, size_bytes, uploaded_by, created_at`,
            [asset.id, fileUuid, fileUrl, ext, label.trim(), sizeBytes, req.user.name]
        );

        await auditLog(req, 'create', 'Upload dokumen aset: ' + req.params.uuid + ' -- ' + label.trim());
        res.status(201).json(ins.rows[0]);
    })
);

// ── DELETE /:uuid/documents/:docUuid ─────────────────────────────────────────
router.delete(
    '/:uuid/documents/:docUuid',
    requirePermission('accounting:delete'),
    validateUUID(),
    asyncHandler(async (req, res) => {
        const asset = await resolveAsset(req.params.uuid, req.user.company_id);
        if (!asset) return res.status(404).json({ error: 'Aset tidak ditemukan' });

        const docRes = await query(
            `SELECT id, file_url, label FROM asset_documents
             WHERE uuid = $1 AND asset_id = $2`,
            [req.params.docUuid, asset.id]
        );
        if (!docRes.rows.length) return res.status(404).json({ error: 'Dokumen tidak ditemukan' });
        const doc = docRes.rows[0];

        // hapus file di disk
        try {
            const absPath = path.join(UPLOAD_DIR, '..', doc.file_url);
            if (fs.existsSync(absPath)) fs.unlinkSync(absPath);
        } catch (e) { /* ignore */ }

        await query(`DELETE FROM asset_documents WHERE id = $1`, [doc.id]);

        await auditLog(req, 'delete', 'Hapus dokumen aset: ' + req.params.uuid + ' -- ' + doc.label);
        res.json({ message: 'Dokumen berhasil dihapus' });
    })
);

module.exports = router;
