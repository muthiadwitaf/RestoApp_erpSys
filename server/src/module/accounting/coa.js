const router = require('express').Router();
const { query } = require('../../config/db');
const { requirePermission } = require('../../middleware/auth');
const { validateUUID } = require('../../middleware/validate');
const { asyncHandler } = require('../../utils/helpers');

router.get('/', requirePermission('accounting:view'), asyncHandler(async (req, res) => {
    const { type, category } = req.query;
    const companyId = req.user.company_id;
    let where = ['company_id = $1']; let values = [companyId]; let idx = 2;
    if (type) { where.push(`type = $${idx++}`); values.push(type); }
    if (category) { where.push(`category = $${idx++}`); values.push(category); }
    const wc = 'WHERE ' + where.join(' AND ');
    const result = await query(`SELECT uuid, code, name, type, category, balance, currency FROM chart_of_accounts ${wc} ORDER BY code`, values);
    res.json(result.rows);
}));

router.post('/', requirePermission('accounting:create'), asyncHandler(async (req, res) => {
    const { code, name, type, category, currency } = req.body;
    if (!code || !name || !type) return res.status(400).json({ error: 'Kode, nama, dan tipe wajib diisi' });
    const existing = await query(`SELECT id FROM chart_of_accounts WHERE code = $1 AND company_id = $2`, [code, req.user.company_id]);
    if (existing.rows.length > 0) return res.status(409).json({ error: 'Kode akun sudah digunakan' });
    const result = await query(`INSERT INTO chart_of_accounts (code, name, type, category, currency, company_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING uuid, code, name, type`, [code.trim(), name.trim(), type, category, currency || 'IDR', req.user.company_id]);
    res.status(201).json(result.rows[0]);
}));

router.put('/:uuid', requirePermission('accounting:edit'), validateUUID(), asyncHandler(async (req, res) => {
    const { name, type, category, balance } = req.body;
    const result = await query(`UPDATE chart_of_accounts SET name=COALESCE($1,name), type=COALESCE($2,type), category=COALESCE($3,category), balance=COALESCE($4,balance), updated_at=NOW() WHERE uuid=$5 RETURNING uuid`, [name?.trim(), type, category, balance, req.params.uuid]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Akun tidak ditemukan' });
    res.json({ message: 'Akun berhasil diupdate' });
}));

router.delete('/:uuid', requirePermission('accounting:delete'), validateUUID(), asyncHandler(async (req, res) => {
    const result = await query(`DELETE FROM chart_of_accounts WHERE uuid = $1 RETURNING uuid`, [req.params.uuid]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Akun tidak ditemukan' });
    res.json({ message: 'Akun berhasil dihapus' });
}));

module.exports = router;
