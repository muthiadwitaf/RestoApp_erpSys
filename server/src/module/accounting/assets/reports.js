/**
 * BE/src/module/accounting/assets/reports.js
 * Endpoint laporan aset -- dipisah agar tidak tabrakan route dengan /:uuid di crud.js
 *
 * GET /accounting/assets/report              -- Asset Register Report (semua aset)
 * GET /accounting/assets/:uuid/schedule      -- Jadwal penyusutan per aset
 */
const router = require('express').Router();
const { query } = require('../../../config/db');
const { requirePermission } = require('../../../middleware/auth');
const { validateUUID } = require('../../../middleware/validate');
const { asyncHandler } = require('../../../utils/helpers');

// ── GET /report -- Asset Register Report ─────────────────────────────────────
router.get('/report', requirePermission('accounting:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const { branch_uuid, category_uuid, status } = req.query;

    let where = ['b.company_id = $1'];
    let values = [companyId];
    let idx = 2;

    if (branch_uuid)   { where.push(`b.uuid = $${idx++}`);   values.push(branch_uuid); }
    if (category_uuid) { where.push(`ac.uuid = $${idx++}`);  values.push(category_uuid); }
    if (status)        { where.push(`a.status = $${idx++}`); values.push(status); }

    const result = await query(
        `SELECT
            a.uuid, a.number, a.name, a.status,
            a.acquisition_date, a.acquisition_cost,
            a.current_book_value, a.accumulated_depreciation,
            a.residual_value, a.useful_life_months,
            a.depreciation_method, a.disposal_date, a.disposal_price,
            a.created_at,
            b.uuid AS branch_uuid, b.name AS branch_name, b.code AS branch_code,
            ac.uuid AS category_uuid, ac.name AS category_name,
            ac.is_depreciable, ac.useful_life_months AS cat_useful_life,
            ac.depreciation_method AS cat_dep_method,
            ac.residual_value_pct  AS cat_residual_pct,
            COALESCE(a.useful_life_months, ac.useful_life_months, 60) AS eff_life,
            COALESCE(a.depreciation_method, ac.depreciation_method, 'straight-line') AS eff_method,
            ROUND(
                (EXTRACT(YEAR FROM AGE(NOW(), a.acquisition_date)) * 12 +
                 EXTRACT(MONTH FROM AGE(NOW(), a.acquisition_date)))::numeric
            , 0) AS age_months
         FROM assets a
         JOIN branches b          ON a.branch_id          = b.id
         JOIN asset_categories ac  ON a.asset_category_id  = ac.id
         WHERE ${where.join(' AND ')}
         ORDER BY b.name, ac.name, a.acquisition_date`,
        values
    );

    const rows = result.rows;
    const summary = {
        total_assets:     rows.length,
        total_active:     rows.filter(r => r.status === 'active').length,
        total_draft:      rows.filter(r => r.status === 'draft').length,
        total_disposed:   rows.filter(r => r.status === 'disposed').length,
        total_cost:       rows.reduce((s, r) => s + parseFloat(r.acquisition_cost || 0), 0),
        total_book_value: rows.reduce((s, r) => s + parseFloat(r.current_book_value || 0), 0),
        total_accum_dep:  rows.reduce((s, r) => s + parseFloat(r.accumulated_depreciation || 0), 0)
    };

    res.json({ assets: rows, summary });
}));

// ── GET /report/cit-xml -- Export CIT Depreciation & Amortization XML ────────
router.get('/report/cit-xml', requirePermission('accounting:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const year = parseInt(req.query.year) || new Date().getFullYear();

    // Query all active assets with fiscal classification from category
    const result = await query(
        `SELECT
            a.uuid, a.number, a.name,
            a.acquisition_date, a.acquisition_cost,
            a.current_book_value, a.accumulated_depreciation,
            a.residual_value, a.useful_life_months,
            a.depreciation_method,
            ac.fiscal_code, ac.fiscal_group, ac.fiscal_type, ac.fiscal_method,
            ac.depreciation_method AS cat_dep_method,
            COALESCE(a.depreciation_method, ac.depreciation_method, 'straight-line') AS eff_method
         FROM assets a
         JOIN branches b          ON a.branch_id          = b.id
         JOIN asset_categories ac  ON a.asset_category_id  = ac.id
         WHERE b.company_id = $1
           AND a.status = 'active'
         ORDER BY ac.fiscal_type, ac.fiscal_code, ac.fiscal_group, a.acquisition_date`,
        [companyId]
    );

    // Get fiscal year depreciation amounts from logs
    const depRes = await query(
        `SELECT dl.asset_id, SUM(dl.amount) AS total_dep
         FROM asset_depreciation_logs dl
         JOIN assets a ON dl.asset_id = a.id
         JOIN branches b ON a.branch_id = b.id
         WHERE b.company_id = $1
           AND dl.period LIKE $2
         GROUP BY dl.asset_id`,
        [companyId, `${year}-%`]
    );
    const depByAssetId = {};
    // We need asset internal IDs - fetch them
    const assetIdRes = await query(
        `SELECT a.uuid, a.id FROM assets a
         JOIN branches b ON a.branch_id = b.id
         WHERE b.company_id = $1 AND a.status = 'active'`,
        [companyId]
    );
    const uuidToId = {};
    assetIdRes.rows.forEach(r => { uuidToId[r.uuid] = r.id; });
    depRes.rows.forEach(r => { depByAssetId[r.asset_id] = parseFloat(r.total_dep); });

    // Map commercial method to CIT code
    function mapCommercialMethod(method) {
        const map = {
            'straight-line': 'GL',
            'declining-balance': 'SM'
        };
        return map[method] || 'GL';
    }

    // Separate depreciation (tangible) vs amortization (intangible)
    const depreciationItems = [];
    const amortizationItems = [];

    for (const asset of result.rows) {
        const acqDate = new Date(asset.acquisition_date);
        const fiscalDepThisYear = depByAssetId[uuidToId[asset.uuid]] || 0;

        const item = {
            codeOfAsset:               asset.fiscal_code || '0408',
            groupOfAsset:              asset.fiscal_group || 'Group 1',
            monthOfAcquisition:        acqDate.getMonth() + 1,
            yearOfAcquisition:         acqDate.getFullYear(),
            acquisitionPrice:          parseFloat(asset.acquisition_cost),
            remainingValue:            parseFloat(asset.current_book_value),
            commercialMethode:         mapCommercialMethod(asset.eff_method),
            fiscalMethode:             asset.fiscal_method || mapCommercialMethod(asset.eff_method),
            fiscalDepretiationThisYear: fiscalDepThisYear,
            notes:                     asset.name
        };

        if (asset.fiscal_type === 'amortization') {
            amortizationItems.push(item);
        } else {
            depreciationItems.push(item);
        }
    }

    // Build XML
    function escapeXml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    function buildItemXml(item, tag) {
        return `\t\t<${tag}>
\t\t\t<CodeOfAsset>${escapeXml(item.codeOfAsset)}</CodeOfAsset>
\t\t\t<GroupOfAsset>${escapeXml(item.groupOfAsset)}</GroupOfAsset>
\t\t\t<MonthOfAcquisition>${item.monthOfAcquisition}</MonthOfAcquisition>
\t\t\t<YearOfAcquisition>${item.yearOfAcquisition}</YearOfAcquisition>
\t\t\t<AcquisitionPrice>${item.acquisitionPrice}</AcquisitionPrice>
\t\t\t<RemainingValue>${item.remainingValue}</RemainingValue>
\t\t\t<CommercialMethode>${escapeXml(item.commercialMethode)}</CommercialMethode>
\t\t\t<FiscalMethode>${escapeXml(item.fiscalMethode)}</FiscalMethode>
\t\t\t<FiscalDepretiationThisYear>${item.fiscalDepretiationThisYear}</FiscalDepretiationThisYear>
\t\t\t<Notes>${escapeXml(item.notes)}</Notes>
\t\t</${tag}>`;
    }

    const depXml = depreciationItems.map(i => buildItemXml(i, 'Depreciation')).join('\n');
    const amortXml = amortizationItems.map(i => buildItemXml(i, 'Amortization')).join('\n');

    const xml = `<?xml version="1.0" encoding="utf-8"?>
<DepreciationAmortization xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="schema.xsd">
\t<ListOfDepreciation>
${depXml}
\t</ListOfDepreciation>
\t<ListOfAmortization>
${amortXml}
\t</ListOfAmortization>
</DepreciationAmortization>`;

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="CIT_Depreciation_Amortization_${year}.xml"`);
    res.send(xml);
}));

// ── GET /:uuid/schedule -- Jadwal penyusutan per aset ────────────────────────
router.get('/:uuid/schedule', requirePermission('accounting:view'), validateUUID(), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;

    const aRes = await query(
        `SELECT
            a.uuid, a.number, a.name, a.status,
            a.acquisition_date, a.acquisition_cost, a.current_book_value,
            a.accumulated_depreciation, a.residual_value,
            a.useful_life_months, a.depreciation_method,
            b.company_id,
            ac.useful_life_months AS cat_useful_life,
            ac.depreciation_method AS cat_dep_method,
            ac.residual_value_pct  AS cat_residual_pct,
            ac.is_depreciable
         FROM assets a
         JOIN branches b          ON a.branch_id          = b.id
         JOIN asset_categories ac  ON a.asset_category_id  = ac.id
         WHERE a.uuid = $1 AND b.company_id = $2`,
        [req.params.uuid, companyId]
    );
    if (!aRes.rows.length) return res.status(404).json({ error: 'Aset tidak ditemukan' });
    const asset = aRes.rows[0];
    if (asset.company_id !== companyId) return res.status(403).json({ error: 'Akses ditolak' });

    if (asset.is_depreciable === false) {
        return res.json({ schedule: [], message: 'Aset ini tidak disusutkan (Non-Depreciable)' });
    }

    const cost        = parseFloat(asset.acquisition_cost);
    const residualPct = parseFloat(asset.cat_residual_pct) || 0;
    const residual    = parseFloat(asset.residual_value) || (cost * residualPct / 100);
    const life        = parseInt(asset.useful_life_months) || parseInt(asset.cat_useful_life) || 60;
    const method      = asset.depreciation_method || asset.cat_dep_method || 'straight-line';
    const startDate   = new Date(asset.acquisition_date);

    const logRes = await query(
        `SELECT dl.period, dl.amount, dl.book_value_after
         FROM asset_depreciation_logs dl
         JOIN assets a ON dl.asset_id = a.id
         WHERE a.uuid = $1
         ORDER BY dl.period ASC`,
        [req.params.uuid]
    );
    const loggedPeriods = {};
    logRes.rows.forEach(r => { loggedPeriods[r.period] = r; });

    const schedule = [];
    let bookValue = cost;

    for (let i = 1; i <= life; i++) {
        const d = new Date(startDate);
        d.setMonth(d.getMonth() + i);
        const period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

        let depAmount;
        if (method === 'declining-balance') {
            depAmount = bookValue * (2 / life);
        } else {
            depAmount = (cost - residual) / life;
        }
        depAmount = Math.max(0, Math.min(depAmount, bookValue - residual));

        const bookAfter = Math.max(residual, bookValue - depAmount);
        const logged    = loggedPeriods[period];

        schedule.push({
            period,
            month:             i,
            depreciation:      parseFloat(depAmount.toFixed(2)),
            book_value_before: parseFloat(bookValue.toFixed(2)),
            book_value_after:  parseFloat(bookAfter.toFixed(2)),
            accumulated:       parseFloat((cost - bookAfter).toFixed(2)),
            is_posted:         !!logged,
            posted_amount:     logged ? parseFloat(logged.amount) : null
        });

        bookValue = bookAfter;
        if (bookValue <= residual) break;
    }

    res.json({
        asset: {
            uuid: asset.uuid, number: asset.number, name: asset.name,
            acquisition_cost: cost, residual_value: residual,
            useful_life_months: life, depreciation_method: method,
            current_book_value: parseFloat(asset.current_book_value)
        },
        schedule
    });
}));

module.exports = router;
