const router = require('express').Router();
const { query } = require('../../config/db');
const { authenticateToken, requirePermission } = require('../../middleware/auth');
const { validateUUID } = require('../../middleware/validate');
const { asyncHandler, resolveUUID } = require('../../utils/helpers');

router.use(authenticateToken);

// Helper: auto-map customer_type ke kode_transaksi e-Faktur sesuai PER-03/PJ/2022
function getKodeTransaksi(customerType) {
    const map = {
        regular: '01', // Penyerahan kepada pihak selain Pemungut PPN
        bendaharawan: '02', // Penyerahan kepada Bendaharawan Pemerintah
        wapu: '03', // Penyerahan kepada Pemungut PPN Selain Bendaharawan
        luar_negeri: '07', // Tidak dipungut PPN (ekspor)
    };
    return map[customerType] || '01';
}

// GET all customers
router.get('/', requirePermission('sales:view', 'accounting:view'), asyncHandler(async (req, res) => {
    const { branch_id } = req.query;
    const companyId = req.user.company_id;
    let wc = 'WHERE c.company_id = $1';
    let values = [companyId];
    let idx = 2;
    if (branch_id) {
        const rBranch = await resolveUUID(branch_id, 'branches', query);
        wc += ` AND c.branch_id = $${idx++}`;
        values.push(rBranch);
    }
    
    // Pagination (Optional but recommended to prevent memory overload)
    let paginationClause = '';
    const page = parseInt(req.query.page);
    const limit = parseInt(req.query.limit);
    if (!isNaN(page) && !isNaN(limit) && page > 0 && limit > 0) {
        const offset = (page - 1) * limit;
        paginationClause = `LIMIT $${idx++} OFFSET $${idx++}`;
        values.push(limit, offset);
    }

    const result = await query(
        `SELECT c.uuid, c.code, c.name, c.address, c.phone, c.email,
                c.is_pkp, c.npwp, c.customer_type,
                b.uuid as branch_id, b.name as branch_name,
                cg.name as group_name, cg.discount_pct
         FROM customers c
         LEFT JOIN customer_groups cg ON c.group_id = cg.id
         LEFT JOIN branches b ON c.branch_id = b.id
         ${wc} ORDER BY c.id ${paginationClause}`, values
    );
    const rows = result.rows.map(r => ({
        ...r,
        kode_transaksi: getKodeTransaksi(r.customer_type)
    }));
    
    if (paginationClause) {
        const countRes = await query(`SELECT COUNT(*) FROM customers c ${wc}`, values.slice(0, branch_id ? 2 : 1));
        return res.json({ data: rows, total: parseInt(countRes.rows[0].count), page, limit });
    }
    
    res.json(rows);
}));

// GET customer groups
router.get('/groups', requirePermission('sales:view'), asyncHandler(async (req, res) => {
    const result = await query(`SELECT uuid, name, discount_pct, description FROM customer_groups ORDER BY id`);
    res.json(result.rows);
}));

// POST -- buat customer baru
router.post('/', requirePermission('sales:create'), asyncHandler(async (req, res) => {
    const { name, address, phone, email, group_id, branch_id, is_pkp, npwp, customer_type } = req.body;
    if (!name) return res.status(400).json({ error: 'Nama pelanggan wajib diisi' });
    const companyId = req.user.company_id;

    // Auto-generate code per company: CST-A-00000001
    const lastCode = await query(`SELECT code FROM customers WHERE code LIKE 'CST-%' AND company_id = $1 ORDER BY code DESC LIMIT 1`, [companyId]);
    let newCode;
    if (lastCode.rows.length === 0) {
        newCode = 'CST-A-00000001';
    } else {
        const prev = lastCode.rows[0].code;
        const letter = prev.charAt(4);
        const num = parseInt(prev.substring(6), 10);
        const next = isNaN(num) ? 1 : num + 1;
        if (next > 99999999) {
            newCode = `CST-${String.fromCharCode(letter.charCodeAt(0) + 1)}-00000001`;
        } else {
            newCode = `CST-${letter}-${String(next).padStart(8, '0')}`;
        }
    }

    let resolvedGroupId = null;
    if (group_id) {
        if (typeof group_id === 'string' && group_id.includes('-')) {
            const gr = await query(`SELECT id FROM customer_groups WHERE uuid = $1`, [group_id]);
            resolvedGroupId = gr.rows[0]?.id || null;
        } else {
            resolvedGroupId = group_id;
        }
    }
    const rBranch = await resolveUUID(branch_id, 'branches', query);
    const cType = customer_type || 'regular';
    const result = await query(
        `INSERT INTO customers (code, name, address, phone, email, group_id, branch_id, is_pkp, npwp, customer_type, company_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING uuid, code, name`,
        [newCode, name.trim(), address?.trim(), phone?.trim(), email?.trim(),
            resolvedGroupId, rBranch || null,
            is_pkp ?? false, npwp?.trim() || null, cType, companyId]
    );
    await query(`INSERT INTO audit_trail (action, module, description, user_id, user_name) VALUES ('create','sales',$1,$2,$3)`,
        [`Tambah pelanggan: ${result.rows[0].code} - ${result.rows[0].name} (${cType})`, req.user.id, req.user.name]);
    res.status(201).json({ ...result.rows[0], kode_transaksi: getKodeTransaksi(cType) });
}));

// PUT -- update customer
router.put('/:uuid', requirePermission('sales:edit'), validateUUID(), asyncHandler(async (req, res) => {
    const { name, address, phone, email, group_id, is_pkp, npwp, customer_type } = req.body;
    let resolvedGroupId = undefined;
    if (group_id !== undefined) {
        if (group_id && typeof group_id === 'string' && group_id.includes('-')) {
            const gr = await query(`SELECT id FROM customer_groups WHERE uuid = $1`, [group_id]);
            resolvedGroupId = gr.rows[0]?.id || null;
        } else {
            resolvedGroupId = group_id;
        }
    }
    const result = await query(
        `UPDATE customers SET
            name          = COALESCE($1, name),
            address       = COALESCE($2, address),
            phone         = COALESCE($3, phone),
            email         = COALESCE($4, email),
            group_id      = COALESCE($5, group_id),
            is_pkp        = COALESCE($6, is_pkp),
            npwp          = COALESCE($7, npwp),
            customer_type = COALESCE($8, customer_type),
            updated_at    = NOW()
         WHERE uuid = $9 RETURNING uuid, name, customer_type`,
        [name?.trim(), address?.trim(), phone?.trim(), email?.trim(),
            resolvedGroupId,
        is_pkp !== undefined ? is_pkp : null,
        npwp?.trim() || null,
        customer_type || null,
        req.params.uuid]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Pelanggan tidak ditemukan' });
    await query(`INSERT INTO audit_trail (action, module, description, user_id, user_name) VALUES ('update','sales',$1,$2,$3)`,
        [`Update pelanggan: ${result.rows[0].name}`, req.user.id, req.user.name]);
    res.json({ message: 'Pelanggan berhasil diupdate', kode_transaksi: getKodeTransaksi(result.rows[0].customer_type) });
}));

// DELETE
router.delete('/:uuid', requirePermission('sales:delete'), validateUUID(), asyncHandler(async (req, res) => {
    const result = await query(`DELETE FROM customers WHERE uuid = $1 RETURNING uuid`, [req.params.uuid]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Pelanggan tidak ditemukan' });
    await query(`INSERT INTO audit_trail (action, module, description, user_id, user_name) VALUES ('delete','sales',$1,$2,$3)`,
        [`Hapus pelanggan: ${req.params.uuid}`, req.user.id, req.user.name]);
    res.json({ message: 'Pelanggan berhasil dihapus' });
}));

module.exports = router;
