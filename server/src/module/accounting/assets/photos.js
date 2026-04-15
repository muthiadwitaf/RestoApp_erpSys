/**
 * BE/src/module/accounting/assets/photos.js
 * Foto aset: upload, list, set gambar utama, hapus
 *
 * GET    /:uuid/photos              -- list foto aset
 * POST   /:uuid/photos              -- upload foto baru
 * PUT    /:uuid/photos/:photoUuid/primary -- set gambar utama
 * DELETE /:uuid/photos/:photoUuid   -- hapus foto (accounting:delete)
 */
const router = require('express').Router();
const path   = require('path');
const fs     = require('fs');
const { query } = require('../../../config/db');
const { requirePermission } = require('../../../middleware/auth');
const { validateUUID } = require('../../../middleware/validate');
const { asyncHandler } = require('../../../utils/helpers');
const {
    upload, processAndSaveDoc, UPLOAD_DIR
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

async function auditLog(req, action, desc, assetId) {
    await query(
        `INSERT INTO audit_trail (action, module, description, user_id, user_name, branch_id)
         VALUES ($1,'accounting',$2,$3,$4,$5)`,
        [action, desc, req.user.id, req.user.name, req.user.branch_id]
    );
}

// ── GET /:uuid/photos ─────────────────────────────────────────────────────────
router.get(
    '/:uuid/photos',
    requirePermission('accounting:view'),
    validateUUID(),
    asyncHandler(async (req, res) => {
        const asset = await resolveAsset(req.params.uuid, req.user.company_id);
        if (!asset) return res.status(404).json({ error: 'Aset tidak ditemukan' });

        const r = await query(
            `SELECT uuid, image_url, is_primary, sort_order, uploaded_by, created_at
             FROM asset_photos
             WHERE asset_id = $1
             ORDER BY is_primary DESC, sort_order ASC, created_at ASC`,
            [asset.id]
        );
        res.json(r.rows);
    })
);

// ── POST /:uuid/photos ────────────────────────────────────────────────────────
router.post(
    '/:uuid/photos',
    requirePermission('accounting:create'),
    validateUUID(),
    upload.single('photo'),
    asyncHandler(async (req, res) => {
        if (!req.file) return res.status(400).json({ error: 'File foto wajib diupload' });

        const asset = await resolveAsset(req.params.uuid, req.user.company_id);
        if (!asset) return res.status(404).json({ error: 'Aset tidak ditemukan' });

        // cek batas 10 foto
        const countRes = await query(
            `SELECT COUNT(*) AS cnt FROM asset_photos WHERE asset_id = $1`,
            [asset.id]
        );
        if (parseInt(countRes.rows[0].cnt, 10) >= 10) {
            return res.status(400).json({ error: 'Maksimal 10 foto per aset' });
        }

        const destDir = path.join(
            UPLOAD_DIR, asset.company_uuid, 'assets', asset.uuid, 'photos'
        );
        const { fileUuid, filename } = await processAndSaveDoc(
            req.file.buffer, req.file.mimetype, destDir
        );
        const imageUrl = '/uploadedImage/' + asset.company_uuid + '/assets/' + asset.uuid + '/photos/' + filename;

        // jika belum ada foto, jadikan primary otomatis
        const existCount = parseInt(countRes.rows[0].cnt, 10);
        const isPrimary  = existCount === 0;

        const ins = await query(
            `INSERT INTO asset_photos (asset_id, file_uuid, image_url, is_primary, uploaded_by)
             VALUES ($1,$2,$3,$4,$5)
             RETURNING uuid, image_url, is_primary, sort_order, created_at`,
            [asset.id, fileUuid, imageUrl, isPrimary, req.user.name]
        );

        await auditLog(req, 'create', 'Upload foto aset: ' + req.params.uuid, asset.id);
        res.status(201).json(ins.rows[0]);
    })
);

// ── PUT /:uuid/photos/:photoUuid/primary -- set gambar utama ──────────────────
router.put(
    '/:uuid/photos/:photoUuid/primary',
    requirePermission('accounting:create'),
    validateUUID(),
    asyncHandler(async (req, res) => {
        const asset = await resolveAsset(req.params.uuid, req.user.company_id);
        if (!asset) return res.status(404).json({ error: 'Aset tidak ditemukan' });

        const photoRes = await query(
            `SELECT id FROM asset_photos WHERE uuid = $1 AND asset_id = $2`,
            [req.params.photoUuid, asset.id]
        );
        if (!photoRes.rows.length) return res.status(404).json({ error: 'Foto tidak ditemukan' });

        // reset semua is_primary lalu set yang dipilih
        await query(`UPDATE asset_photos SET is_primary = false WHERE asset_id = $1`, [asset.id]);
        await query(`UPDATE asset_photos SET is_primary = true  WHERE id = $1`, [photoRes.rows[0].id]);

        res.json({ message: 'Gambar utama berhasil diperbarui' });
    })
);

// ── DELETE /:uuid/photos/:photoUuid ──────────────────────────────────────────
router.delete(
    '/:uuid/photos/:photoUuid',
    requirePermission('accounting:delete'),
    validateUUID(),
    asyncHandler(async (req, res) => {
        const asset = await resolveAsset(req.params.uuid, req.user.company_id);
        if (!asset) return res.status(404).json({ error: 'Aset tidak ditemukan' });

        const photoRes = await query(
            `SELECT id, file_uuid, image_url, is_primary FROM asset_photos
             WHERE uuid = $1 AND asset_id = $2`,
            [req.params.photoUuid, asset.id]
        );
        if (!photoRes.rows.length) return res.status(404).json({ error: 'Foto tidak ditemukan' });
        const photo = photoRes.rows[0];

        // hapus file di disk
        try {
            const absPath = path.join(UPLOAD_DIR, '..', photo.image_url);
            if (fs.existsSync(absPath)) fs.unlinkSync(absPath);
        } catch (e) { /* ignore */ }

        await query(`DELETE FROM asset_photos WHERE id = $1`, [photo.id]);

        // jika yang dihapus adalah primary, promote foto pertama
        if (photo.is_primary) {
            const next = await query(
                `SELECT id FROM asset_photos WHERE asset_id = $1 ORDER BY sort_order ASC, created_at ASC LIMIT 1`,
                [asset.id]
            );
            if (next.rows.length) {
                await query(`UPDATE asset_photos SET is_primary = true WHERE id = $1`, [next.rows[0].id]);
            }
        }

        await auditLog(req, 'delete', 'Hapus foto aset: ' + req.params.uuid, asset.id);
        res.json({ message: 'Foto berhasil dihapus' });
    })
);

module.exports = router;
