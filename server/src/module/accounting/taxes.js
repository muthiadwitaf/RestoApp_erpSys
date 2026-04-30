const router = require('express').Router();
const { query } = require('../../config/db');
const { requirePermission } = require('../../middleware/auth');
const { validateUUID } = require('../../middleware/validate');
const { asyncHandler } = require('../../utils/helpers');

// GET /api/accounting/taxes -- list all tax configs
router.get('/', requirePermission('accounting:view', 'settings:view'), asyncHandler(async (req, res) => {
    const result = await query(
        `SELECT uuid, name, rate, is_active, effective_date, notes, created_at
         FROM tax_configs WHERE company_id = $1 ORDER BY effective_date DESC, id DESC`, [req.user.company_id]
    );
    res.json(result.rows);
}));

// GET /api/accounting/taxes/active -- get the currently active tax config
router.get('/active', requirePermission('accounting:view', 'purchasing:view', 'sales:view'), asyncHandler(async (req, res) => {
    const result = await query(
        `SELECT uuid, name, rate, is_active, effective_date, notes FROM tax_configs WHERE is_active = TRUE AND company_id = $1 LIMIT 1`, [req.user.company_id]
    );
    res.json(result.rows[0] || { rate: 0, name: 'Non-PKP', is_active: false });
}));

// POST /api/accounting/taxes -- create new tax config
router.post('/', requirePermission('accounting:create'), asyncHandler(async (req, res) => {
    const { name, rate, effective_date, notes } = req.body;
    if (!name || rate == null) return res.status(400).json({ error: 'Nama dan rate wajib diisi' });
    if (parseFloat(rate) < 0 || parseFloat(rate) > 100) return res.status(400).json({ error: 'Rate harus antara 0-100' });
    const result = await query(
        `INSERT INTO tax_configs (name, rate, is_active, effective_date, notes, company_id)
         VALUES ($1, $2, FALSE, $3, $4, $5) RETURNING uuid, name, rate, is_active`,
        [name.trim(), parseFloat(rate), effective_date || null, notes?.trim() || null, req.user.company_id]
    );
    await query(`INSERT INTO audit_trail (action, module, description, user_id, user_name)
                 VALUES ('create','accounting',$1,$2,$3)`,
        [`Tambah konfigurasi pajak: ${name} (${rate}%)`, req.user.id, req.user.name]);
    res.status(201).json(result.rows[0]);
}));

// PUT /api/accounting/taxes/:uuid -- update tax config (non-active only)
router.put('/:uuid', requirePermission('accounting:edit'), validateUUID(), asyncHandler(async (req, res) => {
    const { name, rate, effective_date, notes } = req.body;
    const existing = await query(`SELECT id, is_active FROM tax_configs WHERE uuid = $1 AND ($2::int IS NULL OR company_id = $2)`, [req.params.uuid, req.user.company_id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Tax config tidak ditemukan' });
    const result = await query(
        `UPDATE tax_configs SET
         name = COALESCE($1, name), rate = COALESCE($2::numeric, rate),
         effective_date = COALESCE($3, effective_date), notes = $4, updated_at = NOW()
         WHERE uuid = $5 RETURNING uuid, name, rate, is_active`,
        [name?.trim(), rate != null ? parseFloat(rate) : null, effective_date || null, notes?.trim() || null, req.params.uuid]
    );
    await query(`INSERT INTO audit_trail (action, module, description, user_id, user_name)
                 VALUES ('update','accounting',$1,$2,$3)`,
        [`Update konfigurasi pajak: ${result.rows[0].name}`, req.user.id, req.user.name]);
    res.json({ message: 'Tax config berhasil diupdate', data: result.rows[0] });
}));

// PUT /api/accounting/taxes/:uuid/set-active -- set as active (deactivates others)
router.put('/:uuid/set-active', requirePermission('accounting:edit'), validateUUID(), asyncHandler(async (req, res) => {
    const existing = await query(`SELECT id, name, rate, company_id FROM tax_configs WHERE uuid = $1 AND ($2::int IS NULL OR company_id = $2)`, [req.params.uuid, req.user.company_id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Tax config tidak ditemukan' });
    // Deactivate all for the target company, then activate the selected one
    const targetCompanyId = existing.rows[0].company_id;
    await query(`UPDATE tax_configs SET is_active = FALSE, updated_at = NOW() WHERE company_id = $1`, [targetCompanyId]);
    await query(`UPDATE tax_configs SET is_active = TRUE, updated_at = NOW() WHERE uuid = $1`, [req.params.uuid]);
    const { name, rate } = existing.rows[0];
    await query(`INSERT INTO audit_trail (action, module, description, user_id, user_name)
                 VALUES ('update','accounting',$1,$2,$3)`,
        [`Set pajak aktif: ${name} (${rate}%)`, req.user.id, req.user.name]);
    res.json({ message: `${name} (${rate}%) sekarang menjadi tarif pajak aktif` });
}));

// DELETE /api/accounting/taxes/:uuid -- delete non-active tax config
router.delete('/:uuid', requirePermission('accounting:delete'), validateUUID(), asyncHandler(async (req, res) => {
    const existing = await query(`SELECT id, name, rate, is_active FROM tax_configs WHERE uuid = $1 AND ($2::int IS NULL OR company_id = $2)`, [req.params.uuid, req.user.company_id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Tax config tidak ditemukan' });
    if (existing.rows[0].is_active) return res.status(400).json({ error: 'Tidak bisa menghapus tarif pajak yang sedang aktif' });
    await query(`DELETE FROM tax_configs WHERE uuid = $1`, [req.params.uuid]);
    res.json({ message: 'Tax config berhasil dihapus' });
}));

module.exports = router;
