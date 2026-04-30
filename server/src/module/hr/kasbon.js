/**
 * BE/src/module/hr/kasbon.js
 * API endpoints untuk modul Kasbon (Advance Salary).
 *
 * Endpoints (karyawan):
 *   GET    /api/hr/kasbon               - List kasbon milik sendiri
 *   POST   /api/hr/kasbon               - Ajukan kasbon baru
 *   GET    /api/hr/kasbon/:id/cicilan   - Detail cicilan 1 kasbon
 *
 * Endpoints (HR Manager):
 *   GET    /api/hr/kasbon/admin         - List semua kasbon (semua karyawan)
 *   PATCH  /api/hr/kasbon/:id/approve   - Approve + set cicilan schedule
 *   PATCH  /api/hr/kasbon/:id/reject    - Tolak
 */
const router = require('express').Router();
const { query } = require('../../config/db');
const { requirePermission } = require('../../middleware/auth');
const { asyncHandler } = require('../../utils/helpers');

const hrAdmin = requirePermission('hr:delete');

// ─── helper: generate nomor kasbon ──────────────────────────────────────────
async function generateNomor(companyUuid) {
    const year = new Date().getFullYear();
    const result = await query(
        `SELECT nomor FROM salary_advances
         WHERE company_uuid = $1 AND nomor LIKE $2
         ORDER BY nomor DESC LIMIT 1`,
        [companyUuid, `KSB-${year}-%`]
    );

    if (!result.rows.length) return `KSB-${year}-00001`;

    const last = result.rows[0].nomor;
    const seq  = parseInt(last.split('-')[2] || '0', 10);
    return `KSB-${year}-${String(seq + 1).padStart(5, '0')}`;
}

// ─── helper: next N months from (bulan, tahun) ──────────────────────────────
function nextMonths(bulan, tahun, count) {
    const months = [];
    let b = bulan, t = tahun;
    for (let i = 0; i < count; i++) {
        b++;
        if (b > 12) { b = 1; t++; }
        months.push({ bulan: b, tahun: t });
    }
    return months;
}

// ═══════════════════════════════════════════════════════════════════════════════
// KARYAWAN routes (semua karyawan login bisa akses)
// ═══════════════════════════════════════════════════════════════════════════════

// GET /kasbon — list kasbon milik karyawan sendiri
router.get('/', asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const userId      = req.user.id;

    const empRes = await query(
        `SELECT id FROM employees WHERE user_id = $1 AND company_uuid = $2`,
        [userId, companyUuid]
    );
    if (!empRes.rows.length) return res.json([]);

    const empId = empRes.rows[0].id;

    const result = await query(
        `SELECT sa.*,
                u.name AS reviewer_name
         FROM salary_advances sa
         LEFT JOIN users u ON sa.reviewed_by = u.id
         WHERE sa.employee_id = $1 AND sa.company_uuid = $2
         ORDER BY sa.created_at DESC`,
        [empId, companyUuid]
    );
    res.json(result.rows);
}));

// POST /kasbon — ajukan kasbon baru
router.post('/', asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const userId      = req.user.id;

    const empRes = await query(
        `SELECT id FROM employees WHERE user_id = $1 AND company_uuid = $2 AND is_active = TRUE`,
        [userId, companyUuid]
    );
    if (!empRes.rows.length) {
        return res.status(403).json({ error: 'Akun karyawan tidak ditemukan. Hubungi HR.' });
    }
    const empId = empRes.rows[0].id;

    const { amount, alasan, jumlah_cicilan_bulan } = req.body;

    if (!amount || parseFloat(amount) <= 0) {
        return res.status(400).json({ error: 'Jumlah kasbon harus lebih dari 0' });
    }
    const cicilan = parseInt(jumlah_cicilan_bulan) || 1;
    if (cicilan < 1 || cicilan > 24) {
        return res.status(400).json({ error: 'Jumlah cicilan harus antara 1–24 bulan' });
    }

    // Cek apakah masih ada kasbon pending / approved yang belum lunas
    const active = await query(
        `SELECT id FROM salary_advances
         WHERE employee_id = $1 AND status IN ('draft','approved')
         LIMIT 1`,
        [empId]
    );
    if (active.rows.length > 0) {
        return res.status(409).json({ error: 'Anda masih memiliki kasbon yang belum lunas atau menunggu persetujuan' });
    }

    const nomor = await generateNomor(companyUuid);
    const amountPerCicilan = parseFloat(amount) / cicilan;

    const result = await query(
        `INSERT INTO salary_advances
            (nomor, company_id, company_uuid, employee_id, amount, alasan, jumlah_cicilan_bulan,
             amount_per_cicilan, sisa_cicilan, created_by)
         VALUES ($1,(SELECT id FROM companies WHERE uuid = $2),$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [
            nomor, companyUuid, empId, parseFloat(amount),
            alasan?.trim() || null, cicilan,
            amountPerCicilan, cicilan,
            req.user.name,
        ]
    );
    res.status(201).json(result.rows[0]);
}));

// GET /kasbon/:id/cicilan
router.get('/:id/cicilan', asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const userId      = req.user.id;

    const saRes = await query(
        `SELECT sa.*, e.user_id
         FROM salary_advances sa
         JOIN employees e ON sa.employee_id = e.id
         WHERE sa.id = $1 AND sa.company_uuid = $2`,
        [req.params.id, companyUuid]
    );
    if (!saRes.rows.length) return res.status(404).json({ error: 'Kasbon tidak ditemukan' });

    const sa = saRes.rows[0];
    const isOwner   = sa.user_id === userId;
    const isHrAdmin = req.user.permissions?.includes('hr:delete');
    if (!isOwner && !isHrAdmin) return res.status(403).json({ error: 'Akses ditolak' });

    const cicilan = await query(
        `SELECT ac.*, pp.label AS period_label
         FROM advance_cicilan ac
         LEFT JOIN payroll_periods pp ON ac.period_id = pp.id
         WHERE ac.advance_id = $1
         ORDER BY ac.urutan ASC`,
        [req.params.id]
    );

    res.json({ ...sa, cicilan: cicilan.rows });
}));

// ═══════════════════════════════════════════════════════════════════════════════
// HR ADMIN routes
// ═══════════════════════════════════════════════════════════════════════════════

// GET /kasbon/admin — semua kasbon semua karyawan
router.get('/admin', hrAdmin, asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const { status } = req.query;

    let where = ['sa.company_uuid = $1'];
    let values = [companyUuid];
    let idx = 2;

    if (status) {
        where.push(`sa.status = $${idx++}`);
        values.push(status);
    }

    const result = await query(
        `SELECT sa.*,
                e.nik, e.nama_lengkap, e.foto_url,
                ej.jabatan, ej.departemen,
                u.name AS reviewer_name
         FROM salary_advances sa
         JOIN employees e ON sa.employee_id = e.id
         LEFT JOIN employee_jobs ej ON ej.employee_id = e.id AND ej.is_current = TRUE
         LEFT JOIN users u ON sa.reviewed_by = u.id
         WHERE ${where.join(' AND ')}
         ORDER BY sa.created_at DESC`,
        values
    );
    res.json(result.rows);
}));

// PATCH /kasbon/:id/approve
router.patch('/:id/approve', hrAdmin, asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;

    const saRes = await query(
        `SELECT * FROM salary_advances WHERE id = $1 AND company_uuid = $2`,
        [req.params.id, companyUuid]
    );
    if (!saRes.rows.length) return res.status(404).json({ error: 'Kasbon tidak ditemukan' });
    const sa = saRes.rows[0];

    if (sa.status !== 'draft') {
        return res.status(400).json({ error: `Kasbon tidak bisa diapprove (status: ${sa.status})` });
    }

    // Tentukan cicilan mulai bulan depan dari sekarang
    const now = new Date();
    let startBulan = now.getMonth() + 2; // next month
    let startTahun = now.getFullYear();
    if (startBulan > 12) { startBulan = 1; startTahun++; }

    const jumlah = sa.jumlah_cicilan_bulan;
    const perCicilan = parseFloat(sa.amount) / jumlah;

    // Set status approved + cicilan schedule info
    await query(
        `UPDATE salary_advances SET
            status = 'approved',
            amount_per_cicilan = $1,
            cicilan_mulai_bulan = $2,
            cicilan_mulai_tahun = $3,
            sisa_cicilan = $4,
            reviewed_by = $5,
            reviewed_at = NOW(),
            review_notes = $6,
            updated_at = NOW()
         WHERE id = $7`,
        [perCicilan, startBulan, startTahun, jumlah, req.user.id, req.body.notes || null, sa.id]
    );

    // Buat advance_cicilan rows
    const months = nextMonths(startBulan - 1, startTahun, jumlah);
    // nextMonths dimulai dari startBulan-1 karena akan increment di dalam loop
    // sebenarnya kita butuh startBulan langsung, mari fix:
    const schedule = [];
    let b = startBulan, t = startTahun;
    for (let i = 0; i < jumlah; i++) {
        schedule.push({ bulan: b, tahun: t, urutan: i + 1 });
        b++;
        if (b > 12) { b = 1; t++; }
    }

    for (const s of schedule) {
        await query(
            `INSERT INTO advance_cicilan (advance_id, urutan, bulan, tahun, amount)
             VALUES ($1,$2,$3,$4,$5)
             ON CONFLICT (advance_id, urutan) DO NOTHING`,
            [sa.id, s.urutan, s.bulan, s.tahun, perCicilan]
        );
    }

    res.json({
        message: 'Kasbon disetujui',
        cicilan_schedule: schedule.map(s => ({ ...s, amount: perCicilan })),
    });
}));

// PATCH /kasbon/:id/reject
router.patch('/:id/reject', hrAdmin, asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;

    const saRes = await query(
        `SELECT id, status FROM salary_advances WHERE id = $1 AND company_uuid = $2`,
        [req.params.id, companyUuid]
    );
    if (!saRes.rows.length) return res.status(404).json({ error: 'Kasbon tidak ditemukan' });

    if (saRes.rows[0].status !== 'draft') {
        return res.status(400).json({ error: `Kasbon tidak bisa ditolak (status: ${saRes.rows[0].status})` });
    }

    await query(
        `UPDATE salary_advances SET
            status = 'rejected', reviewed_by = $1, reviewed_at = NOW(),
            review_notes = $2, updated_at = NOW()
         WHERE id = $3`,
        [req.user.id, req.body.notes?.trim() || null, req.params.id]
    );

    res.json({ message: 'Kasbon ditolak' });
}));

module.exports = router;
