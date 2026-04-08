const router = require('express').Router();
const { query } = require('../../config/db');
const { authenticateToken, requirePermission, requireCompany } = require('../../middleware/auth');
const { validateUUID } = require('../../middleware/validate');
const { asyncHandler } = require('../../utils/helpers');

router.use(authenticateToken);

// GET -- filter by company_id dari JWT
router.get('/', requirePermission('branch:view'), asyncHandler(async (req, res) => {
    let result;
    if (req.user.is_super_admin && !req.user.company_id) {
        // Super Admin tanpa company context → return semua
        result = await query(`SELECT b.uuid, b.code, b.name, b.address, b.phone, b.is_active, c.name as company_name
            FROM branches b LEFT JOIN companies c ON b.company_id = c.id`);
    } else {
        // User biasa atau Super Admin dengan company context → filter by company
        const companyId = req.user.company_id;
        result = await query(
            `SELECT b.uuid, b.code, b.name, b.address, b.phone, b.is_active, c.name as company_name
             FROM branches b LEFT JOIN companies c ON b.company_id = c.id
             WHERE b.company_id = (SELECT id FROM companies WHERE id = $1)`,
            [companyId]
        );
    }
    res.json(result.rows);
}));

// GET /next-code -- generate kode cabang berikutnya untuk company aktif
router.get('/next-code', requirePermission('branch:create'), requireCompany, asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    // Ambil kode perusahaan untuk prefix
    const compRes = await query(`SELECT code FROM companies WHERE id = $1`, [companyId]);
    if (compRes.rows.length === 0) return res.status(400).json({ error: 'Company tidak valid' });
    // Sanitasi: hapus spasi & karakter aneh agar kode cabang tetap bersih
    const compCode = compRes.rows[0].code.toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9\-]/g, '');

    // Hitung jumlah branch yang sudah ada + 1 untuk sequence berikutnya
    const countRes = await query(`SELECT COUNT(*) FROM branches WHERE company_id = $1`, [companyId]);
    const seq = parseInt(countRes.rows[0].count) + 1;
    const seqStr = String(seq).padStart(5, '0');
    const nextCode = `${compCode}-${seqStr}`;

    // Pastikan kode belum dipakai (jika ada collision, increment lagi)
    let finalCode = nextCode;
    let attempts = 0;
    while ((await query(`SELECT id FROM branches WHERE code = $1`, [finalCode])).rows.length > 0 && attempts < 100) {
        attempts++;
        finalCode = `${compCode}-${String(seq + attempts).padStart(5, '0')}`;
    }

    res.json({ code: finalCode });
}));

// GET :uuid
router.get('/:uuid', requirePermission('branch:view'), validateUUID(), asyncHandler(async (req, res) => {
    const result = await query(`SELECT b.uuid, b.code, b.name, b.address, b.phone, b.is_active, c.name as company_name
        FROM branches b LEFT JOIN companies c ON b.company_id = c.id WHERE b.uuid = $1`, [req.params.uuid]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Cabang tidak ditemukan' });
    // Validasi company access (non-super-admin)
    if (!req.user.is_super_admin) {
        const branch = result.rows[0];
        if (!req.user.branchIds?.includes(req.params.uuid)) return res.status(403).json({ error: 'Akses ditolak' });
    }
    res.json(result.rows[0]);
}));

// POST -- assign company_id dari JWT
router.post('/', requirePermission('branch:create'), requireCompany, asyncHandler(async (req, res) => {
    const { code, name, address, phone } = req.body;
    if (!code || !name) return res.status(400).json({ error: 'Kode dan nama cabang wajib diisi' });
    const existing = await query(`SELECT id FROM branches WHERE code = $1`, [code]);
    if (existing.rows.length > 0) return res.status(409).json({ error: 'Kode cabang sudah digunakan' });

    // Dapatkan company_id integer dari JWT company_id
    const compRes = await query(`SELECT id FROM companies WHERE id = $1`, [req.user.company_id]);
    if (compRes.rows.length === 0) return res.status(400).json({ error: 'Company tidak valid' });

    const result = await query(
        `INSERT INTO branches (code, name, address, phone, company_id) VALUES ($1,$2,$3,$4,$5) RETURNING uuid, code, name`,
        [code.trim(), name.trim(), address?.trim(), phone?.trim(), req.user.company_id]
    );
    res.status(201).json(result.rows[0]);
}));

// PUT
router.put('/:uuid', requirePermission('branch:edit'), validateUUID(), asyncHandler(async (req, res) => {
    const { name, address, phone, is_active } = req.body;
    const result = await query(
        `UPDATE branches SET name=COALESCE($1,name), address=COALESCE($2,address), phone=COALESCE($3,phone), is_active=COALESCE($4,is_active), updated_at=NOW() WHERE uuid=$5 RETURNING uuid`,
        [name?.trim(), address?.trim(), phone?.trim(), is_active, req.params.uuid]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Cabang tidak ditemukan' });
    res.json({ message: 'Cabang berhasil diupdate' });
}));

module.exports = router;
