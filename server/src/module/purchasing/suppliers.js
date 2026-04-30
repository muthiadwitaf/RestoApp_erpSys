const router = require('express').Router();
const { query } = require('../../config/db');
const { requirePermission } = require('../../middleware/auth');
const { validateUUID } = require('../../middleware/validate');
const { asyncHandler, resolveUUID } = require('../../utils/helpers');

// GET /api/purchasing/suppliers
router.get('/', requirePermission('purchasing:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const result = await query(
        `SELECT s.uuid, s.code, s.name, s.address, s.phone, s.email, s.is_pkp, s.npwp, b.name as branch_name, b.uuid as branch_id
     FROM suppliers s LEFT JOIN branches b ON s.branch_id = b.id
     WHERE s.company_id = $1 ORDER BY s.id`, [companyId]
    );
    res.json(result.rows);
}));

// GET /api/purchasing/suppliers/prices -- global price list (for reorder page)
router.get('/prices', requirePermission('purchasing:view'), asyncHandler(async (req, res) => {
    const result = await query(
        `SELECT sp.uuid, sp.price, sp.effective_date, sp.notes,
       i.uuid as item_id, i.name as item_name, i.code as item_code,
       s.uuid as supplier_id, s.name as supplier_name,
       u.uuid as uom_id, u.name as uom_name
     FROM supplier_prices sp
     JOIN items i ON sp.item_id = i.id
     JOIN suppliers s ON sp.supplier_id = s.id
     LEFT JOIN units u ON sp.uom_id = u.id
     ORDER BY i.name, sp.price`
    );
    res.json(result.rows);
}));

// GET /api/purchasing/suppliers/:uuid/prices -- price list per supplier
router.get('/:uuid/prices', requirePermission('purchasing:view'), validateUUID(), asyncHandler(async (req, res) => {
    const suppRow = await query(`SELECT id FROM suppliers WHERE uuid = $1`, [req.params.uuid]);
    if (suppRow.rows.length === 0) return res.status(404).json({ error: 'Supplier tidak ditemukan' });
    const result = await query(
        `SELECT sp.uuid, sp.price, sp.effective_date, sp.notes,
       i.uuid as item_id, i.name as item_name, i.code as item_code,
       u.uuid as uom_id, u.name as uom_name
     FROM supplier_prices sp
     JOIN items i ON sp.item_id = i.id
     LEFT JOIN units u ON sp.uom_id = u.id
     WHERE sp.supplier_id = $1
     ORDER BY i.name, u.name`, [suppRow.rows[0].id]
    );
    res.json(result.rows);
}));

// POST /api/purchasing/suppliers/:uuid/prices
router.post('/:uuid/prices', requirePermission('purchasing:create'), validateUUID(), asyncHandler(async (req, res) => {
    const { item_id, uom_id, price, effective_date, notes } = req.body;
    if (!item_id || !price || price <= 0) return res.status(400).json({ error: 'Item dan harga wajib diisi' });
    const suppRow = await query(`SELECT id FROM suppliers WHERE uuid = $1`, [req.params.uuid]);
    if (suppRow.rows.length === 0) return res.status(404).json({ error: 'Supplier tidak ditemukan' });
    const rItem = await resolveUUID(item_id, 'items', query);
    const rUom = uom_id ? await resolveUUID(uom_id, 'units', query) : null;
    const result = await query(
        `INSERT INTO supplier_prices (supplier_id, item_id, uom_id, price, effective_date, notes)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING uuid`,
        [suppRow.rows[0].id, rItem, rUom, price, effective_date || null, notes?.trim() || null]
    );
    res.status(201).json({ uuid: result.rows[0].uuid });
}));

// PUT /api/purchasing/suppliers/:uuid/prices/:priceUuid
router.put('/:uuid/prices/:priceUuid', requirePermission('purchasing:edit'), validateUUID(), asyncHandler(async (req, res) => {
    const { uom_id, price, effective_date, notes } = req.body;
    const rUom = uom_id ? await resolveUUID(uom_id, 'units', query) : null;
    const result = await query(
        `UPDATE supplier_prices SET
       uom_id = COALESCE($1, uom_id),
       price = COALESCE($2, price),
       effective_date = COALESCE($3, effective_date),
       notes = $4
     WHERE uuid = $5 RETURNING uuid`,
        [rUom, price || null, effective_date || null, notes?.trim() || null, req.params.priceUuid]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Harga tidak ditemukan' });
    res.json({ message: 'Harga berhasil diupdate' });
}));

// DELETE /api/purchasing/suppliers/:uuid/prices/:priceUuid
router.delete('/:uuid/prices/:priceUuid', requirePermission('purchasing:edit'), validateUUID(), asyncHandler(async (req, res) => {
    const result = await query(`DELETE FROM supplier_prices WHERE uuid = $1 RETURNING uuid`, [req.params.priceUuid]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Harga tidak ditemukan' });
    res.json({ message: 'Harga berhasil dihapus' });
}));

// GET /api/purchasing/suppliers/:uuid
router.get('/:uuid', requirePermission('purchasing:view'), validateUUID(), asyncHandler(async (req, res) => {
    const result = await query(`SELECT id, uuid, code, name, address, phone, email, is_pkp, npwp FROM suppliers WHERE uuid = $1`, [req.params.uuid]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Supplier tidak ditemukan' });
    res.json(result.rows[0]);
}));

// POST /api/purchasing/suppliers
router.post('/', requirePermission('purchasing:create'), asyncHandler(async (req, res) => {
    const { name, address, phone, email, branch_id, is_pkp, npwp } = req.body;
    if (!name) return res.status(400).json({ error: 'Nama supplier wajib diisi' });
    const companyId = req.user.company_id;

    // Auto-generate code per company: SUP-A-00000001
    const lastCode = await query(`SELECT code FROM suppliers WHERE code LIKE 'SUP-%' AND company_id = $1 ORDER BY code DESC LIMIT 1`, [companyId]);
    let newCode;
    if (lastCode.rows.length === 0) {
        newCode = 'SUP-A-00000001';
    } else {
        const prev = lastCode.rows[0].code;
        const letter = prev.charAt(4);
        const num = parseInt(prev.substring(6), 10);
        const next = isNaN(num) ? 1 : num + 1;
        if (next > 99999999) {
            newCode = `SUP-${String.fromCharCode(letter.charCodeAt(0) + 1)}-00000001`;
        } else {
            newCode = `SUP-${letter}-${String(next).padStart(8, '0')}`;
        }
    }

    const rBranch = await resolveUUID(branch_id, 'branches', query);
    const result = await query(
        `INSERT INTO suppliers (code, name, address, phone, email, branch_id, is_pkp, npwp, company_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING uuid, code, name`,
        [newCode, name.trim(), address?.trim(), phone?.trim(), email?.trim(), rBranch || null, is_pkp || false, npwp?.trim() || null, companyId]
    );
    res.status(201).json(result.rows[0]);
    await query(`INSERT INTO audit_trail (action, module, description, user_id, user_name) VALUES ('create','purchasing',$1,$2,$3)`, [`Tambah supplier: ${result.rows[0].code} - ${result.rows[0].name}`, req.user.id, req.user.name]);
}));

// PUT /api/purchasing/suppliers/:uuid
router.put('/:uuid', requirePermission('purchasing:edit'), validateUUID(), asyncHandler(async (req, res) => {
    const { name, address, phone, email, is_pkp, npwp } = req.body;
    const result = await query(
        `UPDATE suppliers SET name=COALESCE($1,name), address=COALESCE($2,address), phone=COALESCE($3,phone), email=COALESCE($4,email),
         is_pkp=COALESCE($5,is_pkp), npwp=COALESCE($6,npwp), updated_at=NOW() WHERE uuid=$7 RETURNING uuid, code, name`,
        [name?.trim(), address?.trim(), phone?.trim(), email?.trim(), is_pkp != null ? is_pkp : null, npwp?.trim() || null, req.params.uuid]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Supplier tidak ditemukan' });
    await query(`INSERT INTO audit_trail (action, module, description, user_id, user_name) VALUES ('update','purchasing',$1,$2,$3)`, [`Update supplier: ${result.rows[0].code} - ${result.rows[0].name}`, req.user.id, req.user.name]);
    res.json({ message: 'Supplier berhasil diupdate' });
}));

// DELETE /api/purchasing/suppliers/:uuid
router.delete('/:uuid', requirePermission('purchasing:delete'), validateUUID(), asyncHandler(async (req, res) => {
    const existing = await query(`SELECT code, name FROM suppliers WHERE uuid = $1`, [req.params.uuid]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Supplier tidak ditemukan' });
    const { code, name } = existing.rows[0];
    await query(`DELETE FROM suppliers WHERE uuid = $1`, [req.params.uuid]);
    await query(`INSERT INTO audit_trail (action, module, description, user_id, user_name) VALUES ('delete','purchasing',$1,$2,$3)`, [`Hapus supplier: ${code} - ${name}`, req.user.id, req.user.name]);
    res.json({ message: 'Supplier berhasil dihapus' });
}));

module.exports = router;
