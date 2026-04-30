const router = require('express').Router({ mergeParams: true });
const path   = require('path');
const fs     = require('fs');
const { query, getClient } = require('../../config/db');
const { requirePermission } = require('../../middleware/auth');
const { validateUUID } = require('../../middleware/validate');
const { asyncHandler } = require('../../utils/helpers');
const { uploadDoc, processAndSaveDoc, UPLOAD_DIR } = require('../../middleware/upload');

// Helper: resolve GR uuid -> integer id + validate company access
// Also returns company_uuid for folder path construction
async function resolveGR(grUuid, companyId) {
    const r = await query(
        `SELECT g.id, g.uuid, c.uuid as company_uuid
         FROM goods_receives g
         JOIN branches b ON g.branch_id = b.id
         JOIN companies c ON b.company_id = c.id
         WHERE g.uuid = $1 AND b.company_id = $2`,
        [grUuid, companyId]
    );
    if (r.rows.length === 0) return null;
    return { id: r.rows[0].id, companyUuid: r.rows[0].company_uuid };
}

// ── GET /:uuid/documents ──────────────────────────────────────────────────
router.get('/', requirePermission('inventory:view'), validateUUID(), asyncHandler(async (req, res) => {
    const gr = await resolveGR(req.params.uuid, req.user.company_id);
    if (!gr) return res.status(404).json({ error: 'Penerimaan tidak ditemukan' });

    const result = await query(
        `SELECT uuid, filename, mime_type, size_bytes, file_path, uploaded_by, created_at
         FROM gr_documents
         WHERE gr_id = $1
         ORDER BY created_at ASC`,
        [gr.id]
    );
    res.json(result.rows);
}));

// ── POST /:uuid/documents ─────────────────────────────────────────────────
router.post('/', requirePermission('inventory:create'), validateUUID(),
    uploadDoc.array('files', 10),
    asyncHandler(async (req, res) => {
        const grUuid = req.params.uuid;
        const gr = await resolveGR(grUuid, req.user.company_id);
        if (!gr) return res.status(404).json({ error: 'Penerimaan tidak ditemukan' });
        const { id: grId, companyUuid } = gr;

        const files = req.files || [];
        if (files.length === 0) return res.status(400).json({ error: 'Tidak ada file yang diupload' });

        // Destination: uploadedImage/{company_uuid}/Inventory/GI/{gr_uuid}/
        const destDir = path.join(UPLOAD_DIR, companyUuid, 'Inventory', 'GI', grUuid);

        const client = await getClient();
        const saved = [];
        try {
            await client.query('BEGIN');
            for (const file of files) {
                const { fileUuid, filename, ext, sizeBytes } = await processAndSaveDoc(
                    file.buffer, file.mimetype, destDir
                );

                const mimeStored = ext === 'pdf' ? 'application/pdf' : 'image/webp';
                const relPath = `/uploadedImage/${companyUuid}/Inventory/GI/${grUuid}/${filename}`;

                const ins = await client.query(
                    `INSERT INTO gr_documents
                       (gr_id, filename, file_uuid, mime_type, size_bytes, file_path, uploaded_by)
                     VALUES ($1, $2, $3::uuid, $4, $5, $6, $7)
                     RETURNING uuid, filename, mime_type, size_bytes, file_path, uploaded_by, created_at`,
                    [grId, file.originalname, fileUuid, mimeStored, sizeBytes, relPath, req.user.name]
                );
                saved.push(ins.rows[0]);
            }
            await client.query('COMMIT');
        } catch (err) {
            await client.query('ROLLBACK');
            // Hapus file yang sudah tersimpan ke disk jika transaksi gagal
            for (const f of saved) {
                try {
                    const fp = path.join(UPLOAD_DIR, f.file_path.replace('/uploadedImage/', ''));
                    if (fs.existsSync(fp)) fs.unlinkSync(fp);
                } catch {}
            }
            throw err;
        } finally {
            client.release();
        }

        res.status(201).json(saved);
    })
);

// ── DELETE /:uuid/documents/:doc_uuid ─────────────────────────────────────
// Minimal Manager level (inventory:delete permission)
router.delete('/:doc_uuid', requirePermission('inventory:delete'), validateUUID('doc_uuid'),
    asyncHandler(async (req, res) => {
        const gr = await resolveGR(req.params.uuid, req.user.company_id);
        if (!gr) return res.status(404).json({ error: 'Penerimaan tidak ditemukan' });
        const grId = gr.id;

        const docRes = await query(
            `SELECT id, file_path, uploaded_by FROM gr_documents WHERE uuid = $1 AND gr_id = $2`,
            [req.params.doc_uuid, grId]
        );
        if (docRes.rows.length === 0) return res.status(404).json({ error: 'Dokumen tidak ditemukan' });

        const doc = docRes.rows[0];

        // Hapus file dari disk
        try {
            const absPath = path.join(UPLOAD_DIR, doc.file_path.replace('/uploadedImage/', ''));
            if (fs.existsSync(absPath)) fs.unlinkSync(absPath);
        } catch (e) {
            console.error('Gagal hapus file dari disk:', e.message);
        }

        // Hapus record dari DB
        await query(`DELETE FROM gr_documents WHERE id = $1`, [doc.id]);

        // Audit trail
        await query(
            `INSERT INTO audit_trail (action, module, description, user_id, user_name, branch_id)
             SELECT 'delete','inventory', $1, $2, $3, g.branch_id
             FROM goods_receives g WHERE g.id = $4`,
            [`Hapus dokumen GR (${doc.file_path.split('/').pop()}) oleh ${req.user.name}`,
             req.user.id, req.user.name, grId]
        );

        res.json({ message: 'Dokumen berhasil dihapus' });
    })
);

module.exports = router;
