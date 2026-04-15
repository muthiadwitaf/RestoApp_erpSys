/**
 * BE/src/module/accounting/assets/categories.js
 * CRUD -- Asset Categories (template COA + parameter default penyusutan)
 *
 * GET    /accounting/assets/categories          -- list semua kategori
 * POST   /accounting/assets/categories          -- buat kategori baru
 * PUT    /accounting/assets/categories/:uuid    -- edit kategori
 * DELETE /accounting/assets/categories/:uuid    -- hapus (jika tidak dipakai)
 */
const router = require('express').Router();
const { query } = require('../../../config/db');
const { requirePermission } = require('../../../middleware/auth');
const { validateUUID } = require('../../../middleware/validate');
const { asyncHandler } = require('../../../utils/helpers');

// ── GET / -- list semua kategori milik company ───────────────────────────────
router.get('/', requirePermission('accounting:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;

    const result = await query(
        `SELECT
            ac.uuid, ac.name, ac.depreciation_method,
            ac.useful_life_months, ac.residual_value_pct,
            ac.fiscal_code, ac.fiscal_group, ac.fiscal_type, ac.fiscal_method,
            ca.uuid   AS coa_asset_uuid,       ca.code  AS coa_asset_code,   ca.name  AS coa_asset_name,
            cd.uuid   AS coa_dep_uuid,         cd.code  AS coa_dep_code,     cd.name  AS coa_dep_name,
            cad.uuid  AS coa_accum_dep_uuid,   cad.code AS coa_accum_dep_code, cad.name AS coa_accum_dep_name,
            cg.uuid   AS coa_gain_uuid,        cg.code  AS coa_gain_code,    cg.name  AS coa_gain_name,
            cl.uuid   AS coa_loss_uuid,        cl.code  AS coa_loss_code,    cl.name  AS coa_loss_name,
            cm.uuid   AS coa_maint_uuid,       cm.code  AS coa_maint_code,   cm.name  AS coa_maint_name
         FROM asset_categories ac
         LEFT JOIN chart_of_accounts ca  ON ac.coa_asset_id              = ca.id
         LEFT JOIN chart_of_accounts cd  ON ac.coa_depreciation_id       = cd.id
         LEFT JOIN chart_of_accounts cad ON ac.coa_accum_depreciation_id = cad.id
         LEFT JOIN chart_of_accounts cg  ON ac.coa_disposal_gain_id      = cg.id
         LEFT JOIN chart_of_accounts cl  ON ac.coa_disposal_loss_id      = cl.id
         LEFT JOIN chart_of_accounts cm  ON ac.coa_maintenance_id        = cm.id
         WHERE ac.company_id = $1
         ORDER BY ac.name ASC`,
        [companyId]
    );
    res.json(result.rows);
}));

// ── POST / -- buat kategori baru ─────────────────────────────────────────────
router.post('/', requirePermission('accounting:create'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const {
        name, depreciation_method, useful_life_months, residual_value_pct,
        fiscal_code, fiscal_group, fiscal_type, fiscal_method,
        coa_asset_uuid, coa_dep_uuid, coa_accum_dep_uuid,
        coa_gain_uuid, coa_loss_uuid, coa_maint_uuid
    } = req.body;

    if (!name?.trim()) {
        return res.status(400).json({ error: 'Nama kategori wajib diisi' });
    }

    // Resolve semua COA uuid -> id
    const coaMap = await resolveCoas(companyId, {
        coa_asset_uuid, coa_dep_uuid, coa_accum_dep_uuid,
        coa_gain_uuid, coa_loss_uuid, coa_maint_uuid
    });

    const result = await query(
        `INSERT INTO asset_categories
         (company_id, name, depreciation_method, useful_life_months, residual_value_pct,
          fiscal_code, fiscal_group, fiscal_type, fiscal_method,
          coa_asset_id, coa_depreciation_id, coa_accum_depreciation_id,
          coa_disposal_gain_id, coa_disposal_loss_id, coa_maintenance_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         RETURNING uuid, name`,
        [
            companyId, name.trim(),
            depreciation_method || 'straight-line',
            parseInt(useful_life_months) || 60,
            parseFloat(residual_value_pct) || 0,
            fiscal_code?.trim() || null,
            fiscal_group || null,
            fiscal_type || 'depreciation',
            fiscal_method?.trim() || null,
            coaMap.coa_asset_id, coaMap.coa_dep_id, coaMap.coa_accum_dep_id,
            coaMap.coa_gain_id, coaMap.coa_loss_id, coaMap.coa_maint_id
        ]
    );

    await auditLog(req, 'create', `Buat kategori aset: ${name.trim()}`);
    res.status(201).json(result.rows[0]);
}));

// ── PUT /:uuid -- edit kategori ───────────────────────────────────────────────
router.put('/:uuid', requirePermission('accounting:create'), validateUUID(), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const catRes = await query(
        `SELECT id FROM asset_categories WHERE uuid = $1 AND company_id = $2`,
        [req.params.uuid, companyId]
    );
    if (!catRes.rows.length) return res.status(404).json({ error: 'Kategori tidak ditemukan' });
    const catId = catRes.rows[0].id;

    const {
        name, depreciation_method, useful_life_months, residual_value_pct,
        fiscal_code, fiscal_group, fiscal_type, fiscal_method,
        coa_asset_uuid, coa_dep_uuid, coa_accum_dep_uuid,
        coa_gain_uuid, coa_loss_uuid, coa_maint_uuid
    } = req.body;

    const coaMap = await resolveCoas(companyId, {
        coa_asset_uuid, coa_dep_uuid, coa_accum_dep_uuid,
        coa_gain_uuid, coa_loss_uuid, coa_maint_uuid
    });

    await query(
        `UPDATE asset_categories SET
            name                        = COALESCE($1, name),
            depreciation_method         = COALESCE($2, depreciation_method),
            useful_life_months          = COALESCE($3, useful_life_months),
            residual_value_pct          = COALESCE($4, residual_value_pct),
            fiscal_code                 = $5,
            fiscal_group                = $6,
            fiscal_type                 = COALESCE($7, fiscal_type),
            fiscal_method               = $8,
            coa_asset_id                = $9,
            coa_depreciation_id         = $10,
            coa_accum_depreciation_id   = $11,
            coa_disposal_gain_id        = $12,
            coa_disposal_loss_id        = $13,
            coa_maintenance_id          = $14,
            updated_at                  = NOW()
         WHERE id = $15`,
        [
            name?.trim() || null,
            depreciation_method || null,
            useful_life_months ? parseInt(useful_life_months) : null,
            residual_value_pct !== undefined ? parseFloat(residual_value_pct) : null,
            fiscal_code?.trim() || null,
            fiscal_group || null,
            fiscal_type || null,
            fiscal_method?.trim() || null,
            coaMap.coa_asset_id, coaMap.coa_dep_id, coaMap.coa_accum_dep_id,
            coaMap.coa_gain_id, coaMap.coa_loss_id, coaMap.coa_maint_id,
            catId
        ]
    );

    await auditLog(req, 'update', `Edit kategori aset: ${req.params.uuid}`);
    res.json({ message: 'Kategori berhasil diupdate' });
}));

// ── DELETE /:uuid -- hapus kategori (jika tidak ada aset yang memakai) ────────
router.delete('/:uuid', requirePermission('accounting:create'), validateUUID(), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const catRes = await query(
        `SELECT id, name FROM asset_categories WHERE uuid = $1 AND company_id = $2`,
        [req.params.uuid, companyId]
    );
    if (!catRes.rows.length) return res.status(404).json({ error: 'Kategori tidak ditemukan' });
    const cat = catRes.rows[0];

    const usageRes = await query(`SELECT id FROM assets WHERE asset_category_id = $1 LIMIT 1`, [cat.id]);
    if (usageRes.rows.length) {
        return res.status(400).json({ error: 'Kategori tidak bisa dihapus karena masih digunakan oleh aset' });
    }

    await query(`DELETE FROM asset_categories WHERE id = $1`, [cat.id]);
    await auditLog(req, 'delete', `Hapus kategori aset: ${cat.name}`);
    res.json({ message: 'Kategori berhasil dihapus' });
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

async function resolveCoas(companyId, uuids) {
    const resolve = async (uuid) => {
        if (!uuid) return null;
        const r = await query(
            `SELECT id FROM chart_of_accounts WHERE uuid = $1 AND company_id = $2`,
            [uuid, companyId]
        );
        return r.rows[0]?.id || null;
    };
    return {
        coa_asset_id:     await resolve(uuids.coa_asset_uuid),
        coa_dep_id:       await resolve(uuids.coa_dep_uuid),
        coa_accum_dep_id: await resolve(uuids.coa_accum_dep_uuid),
        coa_gain_id:      await resolve(uuids.coa_gain_uuid),
        coa_loss_id:      await resolve(uuids.coa_loss_uuid),
        coa_maint_id:     await resolve(uuids.coa_maint_uuid)
    };
}

async function auditLog(req, action, description) {
    await query(
        `INSERT INTO audit_trail (action, module, description, user_id, user_name, branch_id)
         VALUES ($1,'accounting',$2,$3,$4,$5)`,
        [action, description, req.user.id, req.user.name, req.user.branch_id]
    );
}

module.exports = router;
