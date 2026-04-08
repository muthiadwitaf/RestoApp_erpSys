/**
 * BE/src/module/accounting/assets/location.js
 * Posisi & riwayat lokasi aset
 *
 * GET /:uuid/location  -- posisi saat ini + log riwayat
 * PUT /:uuid/location  -- update posisi/PIC, tulis log otomatis
 */
const router = require('express').Router();
const { query } = require('../../../config/db');
const { requirePermission } = require('../../../middleware/auth');
const { validateUUID } = require('../../../middleware/validate');
const { asyncHandler } = require('../../../utils/helpers');

// ── helpers ──────────────────────────────────────────────────────────────────

async function resolveAsset(assetUuid, companyId) {
    const r = await query(
        `SELECT a.id, a.uuid, b.company_id
         FROM assets a
         JOIN branches b ON a.branch_id = b.id
         WHERE a.uuid = $1`,
        [assetUuid]
    );
    if (!r.rows.length) return null;
    if (r.rows[0].company_id !== companyId) return null;
    return r.rows[0];
}

// ── GET /:uuid/location ───────────────────────────────────────────────────────
router.get(
    '/:uuid/location',
    requirePermission('accounting:view'),
    validateUUID(),
    asyncHandler(async (req, res) => {
        const asset = await resolveAsset(req.params.uuid, req.user.company_id);
        if (!asset) return res.status(404).json({ error: 'Aset tidak ditemukan' });

        // posisi saat ini
        const curRes = await query(
            `SELECT current_location, latitude, longitude,
                    pic_employee_uuid, pic_name
             FROM assets WHERE id = $1`,
            [asset.id]
        );
        const current = curRes.rows[0];

        // riwayat log
        const logRes = await query(
            `SELECT uuid, from_location, to_location,
                    from_lat, from_lng, to_lat, to_lng,
                    from_pic_name, to_pic_name, to_pic_employee_uuid,
                    reason, effective_date, changed_by, created_at
             FROM asset_location_logs
             WHERE asset_id = $1
             ORDER BY effective_date DESC, created_at DESC`,
            [asset.id]
        );

        res.json({
            current_location:      current.current_location,
            latitude:              current.latitude ? parseFloat(current.latitude) : null,
            longitude:             current.longitude ? parseFloat(current.longitude) : null,
            pic_employee_uuid:     current.pic_employee_uuid,
            pic_name:              current.pic_name,
            logs:                  logRes.rows.map(r => ({
                ...r,
                from_lat: r.from_lat ? parseFloat(r.from_lat) : null,
                from_lng: r.from_lng ? parseFloat(r.from_lng) : null,
                to_lat:   r.to_lat   ? parseFloat(r.to_lat)   : null,
                to_lng:   r.to_lng   ? parseFloat(r.to_lng)   : null
            }))
        });
    })
);

// ── PUT /:uuid/location ───────────────────────────────────────────────────────
router.put(
    '/:uuid/location',
    requirePermission('accounting:create'),
    validateUUID(),
    asyncHandler(async (req, res) => {
        const {
            current_location,
            latitude,
            longitude,
            pic_employee_uuid,
            pic_name,
            reason,
            effective_date
        } = req.body;

        const asset = await resolveAsset(req.params.uuid, req.user.company_id);
        if (!asset) return res.status(404).json({ error: 'Aset tidak ditemukan' });

        // Baca nilai lama untuk log
        const oldRes = await query(
            `SELECT current_location, latitude, longitude,
                    pic_employee_uuid, pic_name
             FROM assets WHERE id = $1`,
            [asset.id]
        );
        const old = oldRes.rows[0];

        // Resolve pic_name -- jika ada employee uuid, fetch dari karyawan
        let resolvedPicName = pic_name || null;
        let resolvedPicUuid = pic_employee_uuid || null;
        if (pic_employee_uuid) {
            const empRes = await query(
                `SELECT nama_lengkap FROM employees WHERE uuid = $1`,
                [pic_employee_uuid]
            ).catch(() => ({ rows: [] }));
            if (empRes.rows.length) resolvedPicName = empRes.rows[0].nama_lengkap;
        }

        // Validasi lat/lng jika diisi
        const lat = latitude  !== undefined && latitude  !== null && latitude  !== '' ? parseFloat(latitude)  : null;
        const lng = longitude !== undefined && longitude !== null && longitude !== '' ? parseFloat(longitude) : null;
        if ((lat !== null && isNaN(lat)) || (lng !== null && isNaN(lng))) {
            return res.status(400).json({ error: 'Koordinat latitude/longitude tidak valid' });
        }

        // Update assets
        await query(
            `UPDATE assets
             SET current_location      = $1,
                 latitude              = $2,
                 longitude             = $3,
                 pic_employee_uuid     = $4,
                 pic_name              = $5
             WHERE id = $6`,
            [current_location || null, lat, lng, resolvedPicUuid, resolvedPicName, asset.id]
        );

        // Insert log
        await query(
            `INSERT INTO asset_location_logs
             (asset_id, from_location, to_location,
              from_lat, from_lng, to_lat, to_lng,
              from_pic_name, to_pic_name, to_pic_employee_uuid,
              reason, effective_date, changed_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
            [
                asset.id,
                old.current_location || null,
                current_location || null,
                old.latitude  ? parseFloat(old.latitude)  : null,
                old.longitude ? parseFloat(old.longitude) : null,
                lat,
                lng,
                old.pic_name || null,
                resolvedPicName,
                resolvedPicUuid,
                reason || null,
                effective_date || new Date().toISOString().slice(0, 10),
                req.user.name
            ]
        );

        // Audit trail
        await query(
            `INSERT INTO audit_trail (action, module, description, user_id, user_name, branch_id)
             VALUES ('update','accounting',$1,$2,$3,$4)`,
            [
                'Update posisi aset: ' + req.params.uuid,
                req.user.id, req.user.name, req.user.branch_id
            ]
        ).catch(() => {});

        res.json({ message: 'Posisi aset berhasil diperbarui' });
    })
);

module.exports = router;
