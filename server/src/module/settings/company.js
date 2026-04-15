/**
 * settings/company.js -- Company Profile & e-Faktur Settings API
 *
 * Single data source: `companies` table
 * Uses req.user.company_id from JWT (set at login) for company context.
 *
 * GET  /api/settings/company        -- get company profile
 * PUT  /api/settings/company        -- update company profile
 */
const router = require('express').Router();
const { query } = require('../../config/db');
const { authenticateToken, requirePermission } = require('../../middleware/auth');
const { asyncHandler } = require('../../utils/helpers');

router.use(authenticateToken);

// GET company profile — accessible by all authenticated users (needed for document printing)
router.get('/', asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    if (!companyId) {
        return res.json({
            company_name: null, npwp: null, is_pkp: false, pkp_since: null,
            address: null, phone: null, efaktur_series_prefix: '010', efaktur_last_number: 0
        });
    }
    const result = await query(
        `SELECT uuid, code, name as company_name, npwp, address, phone,
                is_pkp, pkp_since, efaktur_series_prefix, efaktur_last_number,
                fiscal_year_start_month, closing_deadline_day
         FROM companies WHERE id = $1`, [companyId]
    );
    if (result.rows.length === 0) {
        return res.json({
            company_name: null, npwp: null, is_pkp: false, pkp_since: null,
            address: null, phone: null, efaktur_series_prefix: '010', efaktur_last_number: 0
        });
    }
    res.json(result.rows[0]);
}));

// PUT update company profile
router.put('/', requirePermission('settings:edit'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    if (!companyId) return res.status(400).json({ error: 'Company context diperlukan. Login ulang.' });

    const { company_name, npwp, is_pkp, pkp_since, address, phone, efaktur_series_prefix,
            fiscal_year_start_month, closing_deadline_day } = req.body;

    const result = await query(
        `UPDATE companies SET
            name                    = $1,
            npwp                    = $2,
            is_pkp                  = $3,
            pkp_since               = $4,
            address                 = $5,
            phone                   = $6,
            efaktur_series_prefix   = $7,
            fiscal_year_start_month = $8,
            closing_deadline_day    = $9,
            updated_at              = NOW()
         WHERE id = $10
         RETURNING uuid, name as company_name, npwp, is_pkp,
                   fiscal_year_start_month, closing_deadline_day`,
        [company_name, npwp?.replace(/\D/g, '') || null, is_pkp ?? false, pkp_since || null, address, phone, efaktur_series_prefix || '010',
         fiscal_year_start_month ?? 1, closing_deadline_day ?? 5, companyId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Company tidak ditemukan' });

    await query(`INSERT INTO audit_trail (action, module, description, user_id, user_name, company_id) VALUES ('update','settings',$1,$2,$3,$4)`,
        [`Update profil perusahaan: ${company_name}`, req.user.id, req.user.name, companyId]);

    res.json({ message: 'Profil perusahaan berhasil diupdate', data: result.rows[0] });
}));

module.exports = router;
