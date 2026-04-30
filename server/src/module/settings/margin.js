const router = require('express').Router();
const { query } = require('../../config/db');
const { requirePermission } = require('../../middleware/auth');
const { asyncHandler } = require('../../utils/helpers');

/**
 * GET /api/settings/margin
 * Get the company's current margin default setting.
 * Returns margin_pct, uuid, updated_by, updated_at.
 * Creates a default record (20%) if none exists yet.
 */
router.get('/', requirePermission('settings:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;

    let result = await query(
        `SELECT uuid, margin_pct, updated_by, updated_at FROM margin_defaults WHERE company_id = $1`,
        [companyId]
    );

    if (result.rows.length === 0) {
        // Auto-create default record (20%) for this company on first access
        result = await query(
            `INSERT INTO margin_defaults (company_id, margin_pct, updated_by)
             VALUES ($1, 20.00, $2)
             RETURNING uuid, margin_pct, updated_by, updated_at`,
            [companyId, req.user.name]
        );
    }

    res.json(result.rows[0]);
}));

/**
 * PUT /api/settings/margin
 * Update the company's margin default.
 * Body: { margin_pct: number }
 * Requires settings:edit permission.
 */
router.put('/', requirePermission('settings:edit'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const { margin_pct } = req.body;

    // Validate
    const pct = parseFloat(margin_pct);
    if (isNaN(pct) || pct < 0 || pct > 1000) {
        return res.status(400).json({ error: 'margin_pct harus antara 0 dan 1000' });
    }

    // Fetch current value for better audit trail
    const oldRow = await query(`SELECT margin_pct FROM margin_defaults WHERE company_id = $1`, [companyId]);
    const oldPct = oldRow.rows[0]?.margin_pct ?? null;

    const result = await query(
        `INSERT INTO margin_defaults (company_id, margin_pct, updated_by, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (company_id) DO UPDATE
           SET margin_pct  = EXCLUDED.margin_pct,
               updated_by  = EXCLUDED.updated_by,
               updated_at  = NOW()
         RETURNING uuid, margin_pct, updated_by, updated_at`,
        [companyId, pct, req.user.name]
    );

    const auditDesc = oldPct !== null
        ? `Ubah Margin Default: ${parseFloat(oldPct)}% → ${pct}%`
        : `Set Margin Default: ${pct}%`;
    await query(
        `INSERT INTO audit_trail (action, module, description, user_id, user_name)
         VALUES ('update', 'settings', $1, $2, $3)`,
        [auditDesc, req.user.id, req.user.name]
    );

    res.json(result.rows[0]);
}));

module.exports = router;
