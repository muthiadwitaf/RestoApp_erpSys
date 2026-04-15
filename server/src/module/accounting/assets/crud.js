/**
 * BE/src/module/accounting/assets/crud.js
 * GET list, GET detail, POST buat, PUT edit header, DELETE aset
 *
 * GET    /accounting/assets          -- list aset
 * GET    /accounting/assets/:uuid    -- detail + logs
 * POST   /accounting/assets          -- buat aset baru
 * PUT    /accounting/assets/:uuid    -- edit header (draft only)
 * DELETE /accounting/assets/:uuid    -- hapus (draft only)
 *
 * CATATAN: endpoint /report dan /:uuid/schedule ada di reports.js
 * yang di-mount sebelum file ini di index.js -- sehingga tidak tabrakan route.
 */
const router = require('express').Router();
const { query } = require('../../../config/db');
const { requirePermission } = require('../../../middleware/auth');
const { validateUUID } = require('../../../middleware/validate');
const { asyncHandler } = require('../../../utils/helpers');
const { generateAutoNumber } = require('../../../utils/autoNumber');

// ── GET / -- list aset ────────────────────────────────────────────────────────
router.get('/', requirePermission('accounting:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const { branch_id, category_uuid, status, search } = req.query;

    let where = ['b.company_id = $1'];
    let values = [companyId];
    let idx = 2;

    if (branch_id)     { where.push(`b.uuid = $${idx++}`);   values.push(branch_id); }
    if (category_uuid) { where.push(`ac.uuid = $${idx++}`);  values.push(category_uuid); }
    if (status)        { where.push(`a.status = $${idx++}`); values.push(status); }
    if (search)        { where.push(`(a.number ILIKE $${idx} OR a.name ILIKE $${idx})`); values.push(`%${search}%`); idx++; }

    const result = await query(
        `SELECT
            a.uuid, a.number, a.name, a.description,
            a.acquisition_date, a.acquisition_cost, a.residual_value,
            a.current_book_value, a.accumulated_depreciation,
            a.depreciation_method, a.useful_life_months,
            a.status, a.disposal_date, a.disposal_price,
            a.created_by, a.created_at,
            b.uuid  AS branch_uuid, b.name AS branch_name,
            ac.uuid AS category_uuid, ac.name AS category_name,
            ac.is_depreciable
         FROM assets a
         JOIN branches b          ON a.branch_id          = b.id
         JOIN asset_categories ac  ON a.asset_category_id  = ac.id
         WHERE ${where.join(' AND ')}
         ORDER BY a.acquisition_date DESC, a.id DESC`,
        values
    );
    res.json(result.rows);
}));

// ── GET /:uuid -- detail + depreciation logs + maintenance logs + revaluation logs
router.get('/:uuid', requirePermission('accounting:view'), validateUUID(), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;

    const aRes = await query(
        `SELECT
            a.uuid, a.number, a.name, a.description,
            a.acquisition_date, a.acquisition_cost, a.residual_value,
            a.current_book_value, a.accumulated_depreciation,
            a.depreciation_method, a.useful_life_months,
            a.status, a.notes,
            a.disposal_date, a.disposal_price, a.disposal_notes,
            a.current_location, a.latitude, a.longitude,
            a.pic_employee_uuid, a.pic_name,
            a.created_by, a.created_at, a.updated_at,
            b.uuid  AS branch_uuid, b.name AS branch_name,
            ac.uuid AS category_uuid, ac.name AS category_name,
            ac.is_depreciable,
            ac.depreciation_method AS category_dep_method,
            ac.useful_life_months  AS category_useful_life,
            ac.residual_value_pct  AS category_residual_pct,
            ca.uuid   AS coa_asset_uuid,    ca.code   AS coa_asset_code,    ca.name   AS coa_asset_name,
            cd.uuid   AS coa_dep_uuid,      cd.code   AS coa_dep_code,      cd.name   AS coa_dep_name,
            cad.uuid  AS coa_accum_uuid,    cad.code  AS coa_accum_code,    cad.name  AS coa_accum_name,
            cg.uuid   AS coa_gain_uuid,     cg.code   AS coa_gain_code,     cg.name   AS coa_gain_name,
            cl.uuid   AS coa_loss_uuid,     cl.code   AS coa_loss_code,     cl.name   AS coa_loss_name,
            cm.uuid   AS coa_maint_uuid,    cm.code   AS coa_maint_code,    cm.name   AS coa_maint_name,
            je.number AS journal_number,
            ap.image_url AS primary_photo_url
         FROM assets a
         JOIN branches b          ON a.branch_id          = b.id
         JOIN asset_categories ac  ON a.asset_category_id  = ac.id
         LEFT JOIN chart_of_accounts ca  ON a.coa_asset_id              = ca.id
         LEFT JOIN chart_of_accounts cd  ON a.coa_depreciation_id       = cd.id
         LEFT JOIN chart_of_accounts cad ON a.coa_accum_depreciation_id = cad.id
         LEFT JOIN chart_of_accounts cg  ON a.coa_disposal_gain_id      = cg.id
         LEFT JOIN chart_of_accounts cl  ON a.coa_disposal_loss_id      = cl.id
         LEFT JOIN chart_of_accounts cm  ON a.coa_maintenance_id        = cm.id
         LEFT JOIN journal_entries je    ON a.journal_id                 = je.id
         LEFT JOIN asset_photos ap       ON ap.asset_id = a.id AND ap.is_primary = true
         WHERE a.uuid = $1 AND b.company_id = $2`,
        [req.params.uuid, companyId]
    );
    if (!aRes.rows.length) return res.status(404).json({ error: 'Aset tidak ditemukan' });
    const asset = aRes.rows[0];

    const idRes = await query(`SELECT id FROM assets WHERE uuid = $1`, [req.params.uuid]);
    const assetId = idRes.rows[0].id;

    const depLogs = await query(
        `SELECT dl.uuid, dl.period, dl.depreciation_date, dl.amount, dl.book_value_after,
                je.number AS journal_number
         FROM asset_depreciation_logs dl
         LEFT JOIN journal_entries je ON dl.journal_id = je.id
         WHERE dl.asset_id = $1
         ORDER BY dl.period ASC`,
        [assetId]
    );

    const maintLogs = await query(
        `SELECT ml.uuid, ml.maintenance_date, ml.description, ml.cost, ml.vendor,
                ml.payment_method, ml.created_by, ml.created_at,
                je.number AS journal_number
         FROM asset_maintenance_logs ml
         LEFT JOIN journal_entries je ON ml.journal_id = je.id
         WHERE ml.asset_id = $1
         ORDER BY ml.maintenance_date DESC`,
        [assetId]
    );

    const revalLogs = await query(
        `SELECT rl.uuid, rl.revaluation_date, rl.old_value, rl.new_value, rl.difference,
                rl.notes, rl.created_by,
                je.number AS journal_number
         FROM asset_revaluation_logs rl
         LEFT JOIN journal_entries je ON rl.journal_id = je.id
         WHERE rl.asset_id = $1
         ORDER BY rl.revaluation_date DESC`,
        [assetId]
    );

    res.json({
        ...asset,
        depreciation_logs: depLogs.rows,
        maintenance_logs:  maintLogs.rows,
        revaluation_logs:  revalLogs.rows
    });
}));

// ── POST / -- buat aset baru ──────────────────────────────────────────────────
router.post('/', requirePermission('accounting:create'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const {
        branch_uuid, category_uuid,
        name, description,
        acquisition_date, acquisition_cost,
        useful_life_months, residual_value, depreciation_method,
        notes,
        coa_asset_uuid, coa_dep_uuid, coa_accum_dep_uuid,
        coa_gain_uuid, coa_loss_uuid, coa_maint_uuid
    } = req.body;

    if (!branch_uuid || !category_uuid || !name?.trim() || !acquisition_date || !acquisition_cost) {
        return res.status(400).json({
            error: 'branch, kategori, nama, tanggal perolehan, dan nilai perolehan wajib diisi'
        });
    }

    const brRes = await query(
        `SELECT b.id, b.code, b.company_id FROM branches b WHERE b.uuid = $1`,
        [branch_uuid]
    );
    if (!brRes.rows.length) return res.status(400).json({ error: 'Cabang tidak ditemukan' });
    if (brRes.rows[0].company_id !== companyId) return res.status(403).json({ error: 'Akses ditolak' });
    const branch = brRes.rows[0];

    const catRes = await query(
        `SELECT id FROM asset_categories WHERE uuid = $1 AND company_id = $2`,
        [category_uuid, companyId]
    );
    if (!catRes.rows.length) return res.status(400).json({ error: 'Kategori tidak ditemukan' });
    const categoryId = catRes.rows[0].id;

    const coaMap = await resolveCoas(companyId, {
        coa_asset_uuid, coa_dep_uuid, coa_accum_dep_uuid,
        coa_gain_uuid, coa_loss_uuid, coa_maint_uuid
    });

    const cost   = parseFloat(acquisition_cost);
    const number = await generateAutoNumber(branch.code || 'GEN', 'AST');

    const result = await query(
        `INSERT INTO assets
         (number, branch_id, asset_category_id, name, description,
          acquisition_date, acquisition_cost, current_book_value,
          useful_life_months, residual_value, depreciation_method,
          coa_asset_id, coa_depreciation_id, coa_accum_depreciation_id,
          coa_disposal_gain_id, coa_disposal_loss_id, coa_maintenance_id,
          notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
         RETURNING uuid, number`,
        [
            number, branch.id, categoryId, name.trim(),
            description?.trim() || null,
            acquisition_date, cost,
            useful_life_months ? parseInt(useful_life_months) : null,
            residual_value ? parseFloat(residual_value) : 0,
            depreciation_method || null,
            coaMap.coa_asset_id, coaMap.coa_dep_id, coaMap.coa_accum_dep_id,
            coaMap.coa_gain_id, coaMap.coa_loss_id, coaMap.coa_maint_id,
            notes?.trim() || null, req.user.name
        ]
    );

    await auditLog(req, 'create', `Buat aset: ${number} - ${name.trim()}`, branch.id);
    res.status(201).json(result.rows[0]);
}));

// ── PUT /:uuid -- edit header (draft only) ────────────────────────────────────
router.put('/:uuid', requirePermission('accounting:create'), validateUUID(), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const aRes = await query(
        `SELECT a.id, a.status, b.company_id, b.id AS branch_id
         FROM assets a JOIN branches b ON a.branch_id = b.id
         WHERE a.uuid = $1`,
        [req.params.uuid]
    );
    if (!aRes.rows.length) return res.status(404).json({ error: 'Aset tidak ditemukan' });
    const asset = aRes.rows[0];
    if (asset.company_id !== companyId) return res.status(403).json({ error: 'Akses ditolak' });
    if (asset.status !== 'draft') return res.status(400).json({ error: 'Hanya aset berstatus Draft yang bisa diedit' });

    const {
        name, description,
        acquisition_date, acquisition_cost,
        useful_life_months, residual_value, depreciation_method,
        notes,
        coa_asset_uuid, coa_dep_uuid, coa_accum_dep_uuid,
        coa_gain_uuid, coa_loss_uuid, coa_maint_uuid
    } = req.body;

    const coaMap = await resolveCoas(companyId, {
        coa_asset_uuid, coa_dep_uuid, coa_accum_dep_uuid,
        coa_gain_uuid, coa_loss_uuid, coa_maint_uuid
    });

    const updates = ['updated_at = NOW()'];
    const vals = [];
    let i = 1;

    if (name)                    { updates.push(`name = $${i++}`);               vals.push(name.trim()); }
    if (description !== undefined) { updates.push(`description = $${i++}`);      vals.push(description?.trim() || null); }
    if (acquisition_date)        { updates.push(`acquisition_date = $${i++}`);   vals.push(acquisition_date); }
    if (acquisition_cost) {
        const cost = parseFloat(acquisition_cost);
        updates.push(`acquisition_cost = $${i++}`);  vals.push(cost);
        updates.push(`current_book_value = $${i++}`); vals.push(cost);
    }
    if (useful_life_months)      { updates.push(`useful_life_months = $${i++}`); vals.push(parseInt(useful_life_months)); }
    if (residual_value !== undefined) { updates.push(`residual_value = $${i++}`); vals.push(parseFloat(residual_value) || 0); }
    if (depreciation_method)     { updates.push(`depreciation_method = $${i++}`); vals.push(depreciation_method); }
    if (notes !== undefined)     { updates.push(`notes = $${i++}`);              vals.push(notes?.trim() || null); }

    updates.push(`coa_asset_id = $${i++}`);              vals.push(coaMap.coa_asset_id);
    updates.push(`coa_depreciation_id = $${i++}`);       vals.push(coaMap.coa_dep_id);
    updates.push(`coa_accum_depreciation_id = $${i++}`); vals.push(coaMap.coa_accum_dep_id);
    updates.push(`coa_disposal_gain_id = $${i++}`);      vals.push(coaMap.coa_gain_id);
    updates.push(`coa_disposal_loss_id = $${i++}`);      vals.push(coaMap.coa_loss_id);
    updates.push(`coa_maintenance_id = $${i++}`);        vals.push(coaMap.coa_maint_id);

    vals.push(asset.id);
    await query(`UPDATE assets SET ${updates.join(', ')} WHERE id = $${i}`, vals);

    await auditLog(req, 'update', `Edit aset: ${req.params.uuid}`, asset.branch_id);
    res.json({ message: 'Aset berhasil diupdate' });
}));

// ── DELETE /:uuid -- hapus aset draft ────────────────────────────────────────
router.delete('/:uuid', requirePermission('accounting:delete'), validateUUID(), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const aRes = await query(
        `SELECT a.id, a.number, a.name, a.status, b.company_id, b.id AS branch_id
         FROM assets a JOIN branches b ON a.branch_id = b.id
         WHERE a.uuid = $1`,
        [req.params.uuid]
    );
    if (!aRes.rows.length) return res.status(404).json({ error: 'Aset tidak ditemukan' });
    const asset = aRes.rows[0];
    if (asset.company_id !== companyId) return res.status(403).json({ error: 'Akses ditolak' });
    if (asset.status !== 'draft') return res.status(400).json({ error: 'Hanya aset berstatus Draft yang bisa dihapus' });

    await query(`DELETE FROM assets WHERE id = $1`, [asset.id]);
    await auditLog(req, 'delete', `Hapus aset: ${asset.number} - ${asset.name}`, asset.branch_id);
    res.json({ message: `Aset ${asset.number} berhasil dihapus` });
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

async function auditLog(req, action, description, branchId) {
    await query(
        `INSERT INTO audit_trail (action, module, description, user_id, user_name, branch_id)
         VALUES ($1,'accounting',$2,$3,$4,$5)`,
        [action, description, req.user.id, req.user.name, branchId || req.user.branch_id]
    );
}

module.exports = router;
