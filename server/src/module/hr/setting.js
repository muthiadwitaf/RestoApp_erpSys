/**
 * BE/src/module/hr/setting.js
 * Master data struktur organisasi: Departemen, Divisi, Jabatan
 *
 * Tabel menggunakan UUID sebagai Primary Key dan company_uuid (bukan company_id).
 *
 * Endpoints:
 *   GET    /api/hr/setting/departments            - List departemen
 *   POST   /api/hr/setting/departments            - Tambah departemen
 *   PUT    /api/hr/setting/departments/:uuid      - Edit departemen
 *   PATCH  /api/hr/setting/departments/:uuid/toggle - Soft-delete / restore
 *
 *   GET    /api/hr/setting/divisions              - List divisi (+departemen induk)
 *   POST   /api/hr/setting/divisions              - Tambah divisi
 *   PUT    /api/hr/setting/divisions/:uuid        - Edit divisi
 *   PATCH  /api/hr/setting/divisions/:uuid/toggle - Soft-delete / restore
 *
 *   GET    /api/hr/setting/positions              - List jabatan
 *   POST   /api/hr/setting/positions              - Tambah jabatan
 *   PUT    /api/hr/setting/positions/:uuid        - Edit jabatan
 *   PATCH  /api/hr/setting/positions/:uuid/toggle - Soft-delete / restore
 */
const router = require('express').Router();
const { query } = require('../../config/db');
const { requirePermission } = require('../../middleware/auth');
const { asyncHandler } = require('../../utils/helpers');

// Semua endpoint butuh login
// Shorthand: middleware khusus untuk operasi write (hanya HR Manager)
const hrWrite = requirePermission('hr:delete');

// ─────────────────────────────────────────────────────────────────────────────
// DEPARTMENTS
// ─────────────────────────────────────────────────────────────────────────────

// GET  /departments   — list semua (termasuk yg is_deleted=true untuk HR bisa restore)
router.get('/departments', asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const result = await query(
        `SELECT uuid, nama, kode, deskripsi, is_deleted, created_at, updated_at
         FROM departments
         WHERE company_uuid = $1
         ORDER BY is_deleted ASC, nama ASC`,
        [companyUuid]
    );
    res.json(result.rows);
}));

// POST /departments
router.post('/departments', hrWrite, asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const { nama, kode, deskripsi } = req.body;
    if (!nama?.trim()) return res.status(400).json({ error: 'Nama departemen wajib diisi' });

    const result = await query(
        `INSERT INTO departments (company_uuid, nama, kode, deskripsi, created_by)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [companyUuid, nama.trim(), kode?.trim() || null, deskripsi?.trim() || null, req.user.name]
    );
    res.status(201).json(result.rows[0]);
}));

// PUT /departments/:uuid
router.put('/departments/:uuid', hrWrite, asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const { nama, kode, deskripsi } = req.body;
    if (!nama?.trim()) return res.status(400).json({ error: 'Nama departemen wajib diisi' });

    const result = await query(
        `UPDATE departments
         SET nama = $1, kode = $2, deskripsi = $3, updated_at = NOW()
         WHERE uuid = $4 AND company_uuid = $5
         RETURNING *`,
        [nama.trim(), kode?.trim() || null, deskripsi?.trim() || null, req.params.uuid, companyUuid]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Departemen tidak ditemukan' });
    res.json(result.rows[0]);
}));

// PATCH /departments/:uuid/toggle — soft-delete / restore
router.patch('/departments/:uuid/toggle', hrWrite, asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const result = await query(
        `UPDATE departments
         SET is_deleted = NOT is_deleted, updated_at = NOW()
         WHERE uuid = $1 AND company_uuid = $2
         RETURNING *`,
        [req.params.uuid, companyUuid]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Departemen tidak ditemukan' });
    const row = result.rows[0];
    res.json({ message: row.is_deleted ? 'Departemen dinonaktifkan' : 'Departemen dipulihkan', row });
}));

// ─────────────────────────────────────────────────────────────────────────────
// DIVISIONS
// ─────────────────────────────────────────────────────────────────────────────

router.get('/divisions', asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const { department_uuid } = req.query;

    const extra = department_uuid ? 'AND dv.department_uuid = $2' : '';
    const params = department_uuid ? [companyUuid, department_uuid] : [companyUuid];

    const result = await query(
        `SELECT dv.uuid, dv.nama, dv.kode, dv.deskripsi, dv.is_deleted,
                dv.department_uuid, dp.nama AS nama_departemen,
                dv.created_at, dv.updated_at
         FROM divisions dv
         JOIN departments dp ON dv.department_uuid = dp.uuid
         WHERE dv.company_uuid = $1 ${extra}
         ORDER BY dv.is_deleted ASC, dp.nama ASC, dv.nama ASC`,
        params
    );
    res.json(result.rows);
}));

router.post('/divisions', hrWrite, asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const { nama, kode, deskripsi, department_uuid } = req.body;
    if (!nama?.trim()) return res.status(400).json({ error: 'Nama divisi wajib diisi' });
    if (!department_uuid) return res.status(400).json({ error: 'Departemen induk wajib dipilih' });

    // Pastikan department valid & milik company yg sama
    const deptCheck = await query(
        `SELECT uuid FROM departments WHERE uuid = $1 AND company_uuid = $2 AND is_deleted = FALSE`,
        [department_uuid, companyUuid]
    );
    if (!deptCheck.rows.length) return res.status(400).json({ error: 'Departemen tidak valid' });

    const result = await query(
        `INSERT INTO divisions (company_uuid, department_uuid, nama, kode, deskripsi, created_by)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [companyUuid, department_uuid, nama.trim(), kode?.trim() || null, deskripsi?.trim() || null, req.user.name]
    );
    res.status(201).json(result.rows[0]);
}));

router.put('/divisions/:uuid', hrWrite, asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const { nama, kode, deskripsi, department_uuid } = req.body;
    if (!nama?.trim()) return res.status(400).json({ error: 'Nama divisi wajib diisi' });
    if (!department_uuid) return res.status(400).json({ error: 'Departemen induk wajib dipilih' });

    const result = await query(
        `UPDATE divisions
         SET nama = $1, kode = $2, deskripsi = $3, department_uuid = $4, updated_at = NOW()
         WHERE uuid = $5 AND company_uuid = $6
         RETURNING *`,
        [nama.trim(), kode?.trim() || null, deskripsi?.trim() || null, department_uuid, req.params.uuid, companyUuid]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Divisi tidak ditemukan' });
    res.json(result.rows[0]);
}));

router.patch('/divisions/:uuid/toggle', hrWrite, asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const result = await query(
        `UPDATE divisions
         SET is_deleted = NOT is_deleted, updated_at = NOW()
         WHERE uuid = $1 AND company_uuid = $2
         RETURNING *`,
        [req.params.uuid, companyUuid]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Divisi tidak ditemukan' });
    const row = result.rows[0];
    res.json({ message: row.is_deleted ? 'Divisi dinonaktifkan' : 'Divisi dipulihkan', row });
}));

// ─────────────────────────────────────────────────────────────────────────────
// POSITIONS (JABATAN)
// ─────────────────────────────────────────────────────────────────────────────

router.get('/positions', asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const result = await query(
        `SELECT uuid, nama, kode, level, deskripsi, is_deleted, created_at, updated_at
         FROM positions
         WHERE company_uuid = $1
         ORDER BY is_deleted ASC, level ASC, nama ASC`,
        [companyUuid]
    );
    res.json(result.rows);
}));

router.post('/positions', hrWrite, asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const { nama, kode, level, deskripsi } = req.body;
    if (!nama?.trim()) return res.status(400).json({ error: 'Nama jabatan wajib diisi' });

    const result = await query(
        `INSERT INTO positions (company_uuid, nama, kode, level, deskripsi, created_by)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [companyUuid, nama.trim(), kode?.trim() || null, parseInt(level) || 1, deskripsi?.trim() || null, req.user.name]
    );
    res.status(201).json(result.rows[0]);
}));

router.put('/positions/:uuid', hrWrite, asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const { nama, kode, level, deskripsi } = req.body;
    if (!nama?.trim()) return res.status(400).json({ error: 'Nama jabatan wajib diisi' });

    const result = await query(
        `UPDATE positions
         SET nama = $1, kode = $2, level = $3, deskripsi = $4, updated_at = NOW()
         WHERE uuid = $5 AND company_uuid = $6
         RETURNING *`,
        [nama.trim(), kode?.trim() || null, parseInt(level) || 1, deskripsi?.trim() || null, req.params.uuid, companyUuid]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Jabatan tidak ditemukan' });
    res.json(result.rows[0]);
}));

router.patch('/positions/:uuid/toggle', hrWrite, asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const result = await query(
        `UPDATE positions
         SET is_deleted = NOT is_deleted, updated_at = NOW()
         WHERE uuid = $1 AND company_uuid = $2
         RETURNING *`,
        [req.params.uuid, companyUuid]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Jabatan tidak ditemukan' });
    const row = result.rows[0];
    res.json({ message: row.is_deleted ? 'Jabatan dinonaktifkan' : 'Jabatan dipulihkan', row });
}));

module.exports = router;
