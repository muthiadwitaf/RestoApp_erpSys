/**
 * BE/src/module/hr/cuti.js
 * Modul Manajemen Cuti Karyawan (Leave Management)
 *
 * Menggunakan tabel: leave_types, leave_balances, leave_requests
 *
 * Exported routers:
 *   leaveTypes     → GET /hr/leave-types
 *   leaveBalances  → GET /hr/leave-balances/mine
 *   employeeLeaves → CRUD self-service untuk karyawan yang login
 *   leaveAdmin     → GET team calendar (approved leaves)
 */
const express = require('express');
const { query, getClient } = require('../../config/db');
const { authenticateToken } = require('../../middleware/auth');
const { validateUUID } = require('../../middleware/validate');
const { asyncHandler } = require('../../utils/helpers');
const { generateAutoNumber } = require('../../utils/autoNumber');
const path = require('path');
const fs   = require('fs');
let uploadDoc, processAndSaveDoc, UPLOAD_DIR;
try {
    const uploadMod = require('../../middleware/upload');
    uploadDoc = uploadMod.uploadDoc;
    processAndSaveDoc = uploadMod.processAndSaveDoc;
    UPLOAD_DIR = uploadMod.UPLOAD_DIR;
} catch (_) { /* upload optional */ }

// ── Shared helper: resolve employee from logged-in user ───────────────────────
async function resolveEmployee(userId, companyUuid) {
    const res = await query(
        `SELECT e.id, e.uuid, e.nik, e.nama_lengkap, e.branch_id,
                b.uuid AS branch_uuid, b.code AS branch_code, b.name AS branch_name,
                ej.jabatan
         FROM employees e
         LEFT JOIN branches b   ON e.branch_id = b.id
         LEFT JOIN employee_jobs ej ON ej.employee_id = e.id AND ej.is_current = TRUE
         WHERE e.user_id = $1 AND e.company_uuid = $2 AND e.is_active = TRUE
         LIMIT 1`,
        [userId, companyUuid]
    );
    return res.rows[0] || null;
}

// ── Helper: hitung total hari (dengan opsi skip weekend) ─────────────────────
// count_saturday: apakah Sabtu dihitung (0=Sun, 6=Sat)
// count_sunday:   apakah Minggu dihitung
function calcDays(startDate, endDate, countSaturday = true, countSunday = true) {
    const s = new Date(startDate);
    const e = new Date(endDate);
    if (e < s) return 0;
    // Jika keduanya dihitung, pakai formula cepat
    if (countSaturday && countSunday) {
        return Math.round((e - s) / 86400000) + 1;
    }
    // Loop per hari, skip hari yg tidak dihitung
    let count = 0;
    const cur = new Date(s);
    while (cur <= e) {
        const dow = cur.getDay(); // 0=Sun, 6=Sat
        const isSat = (dow === 6);
        const isSun = (dow === 0);
        if ((isSat && !countSaturday) || (isSun && !countSunday)) {
            cur.setDate(cur.getDate() + 1);
            continue;
        }
        count++;
        cur.setDate(cur.getDate() + 1);
    }
    return count;
}

// ── Helper: ensure leave_balance row exists ───────────────────────────────────
async function ensureBalance(client, companyUuid, employeeId, leaveTypeId, year) {
    await client.query(`
        INSERT INTO leave_balances (company_id, company_uuid, employee_id, leave_type_id, year, quota_days)
        SELECT (SELECT id FROM companies WHERE uuid = $1), $1, $2, $3, $4, lt.quota_days
        FROM leave_types lt WHERE lt.id = $3
        ON CONFLICT (employee_id, leave_type_id, year) DO NOTHING
    `, [companyUuid, employeeId, leaveTypeId, year]);
}

// =============================================================================
// 1. LEAVE TYPES — GET /hr/leave-types
// =============================================================================
const leaveTypes = express.Router();
leaveTypes.use(authenticateToken);

// Helper: check HR Manager permission OR super admin
function requireHrManager(req, res, next) {
    if (req.user?.is_super_admin) return next(); // Super Admin bypass
    const perms = req.user?.permissions || [];
    if (!perms.includes('hr:delete')) {
        return res.status(403).json({ error: 'Hanya HR Manager atau Super Admin yang dapat mengelola jenis cuti' });
    }
    next();
}

// ── GET / — daftar jenis cuti aktif (public untuk semua auth) ─────────────────
leaveTypes.get('/', asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const perms = req.user?.permissions || [];
    const isAdmin = perms.includes('hr:delete') || req.user?.is_super_admin;
    const result = await query(
        `SELECT id, name, code, quota_days, is_paid, requires_doc, color, is_active,
                count_saturday, count_sunday, description
         FROM leave_types
         WHERE company_uuid = $1 ${isAdmin ? '' : "AND is_active = TRUE"}
         ORDER BY name`,
        [companyUuid]
    );
    res.json(result.rows);
}));

// ── POST / — tambah jenis cuti baru (HR Manager only) ────────────────────────
leaveTypes.post('/', requireHrManager, asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const { name, code, quota_days, is_paid, requires_doc, color, description,
            count_saturday, count_sunday } = req.body;

    if (!name?.trim())  return res.status(400).json({ error: 'Nama jenis cuti wajib diisi' });
    if (!code?.trim())  return res.status(400).json({ error: 'Kode wajib diisi (contoh: ANNUAL)' });
    if (!quota_days || parseInt(quota_days) < 1)
        return res.status(400).json({ error: 'Kuota hari wajib diisi (min 1)' });

    const result = await query(
        `INSERT INTO leave_types
         (company_id, company_uuid, name, code, quota_days, is_paid, requires_doc, color, description,
          count_saturday, count_sunday)
         VALUES ((SELECT id FROM companies WHERE uuid = $1),$1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING id, name, code, quota_days, is_paid, requires_doc, color, is_active,
                   count_saturday, count_sunday, description`,
        [
            companyUuid,
            name.trim(),
            code.trim().toUpperCase(),
            parseInt(quota_days),
            is_paid !== false,
            !!requires_doc,
            color?.trim() || '#6366f1',
            description?.trim() || null,
            !!count_saturday,
            !!count_sunday,
        ]
    );
    res.status(201).json(result.rows[0]);
}));

// ── PUT /:id — edit jenis cuti (HR Manager only) ──────────────────────────────
leaveTypes.put('/:id', requireHrManager, asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const { id } = req.params;
    const { name, code, quota_days, is_paid, requires_doc, color, description,
            count_saturday, count_sunday } = req.body;

    if (!name?.trim())  return res.status(400).json({ error: 'Nama wajib diisi' });
    if (!code?.trim())  return res.status(400).json({ error: 'Kode wajib diisi' });

    const result = await query(
        `UPDATE leave_types
         SET name=$1, code=$2, quota_days=$3, is_paid=$4, requires_doc=$5,
             color=$6, description=$7, count_saturday=$8, count_sunday=$9, updated_at=NOW()
         WHERE id=$10 AND company_uuid=$11
         RETURNING id, name, code, quota_days, is_paid, requires_doc, color, is_active,
                   count_saturday, count_sunday, description`,
        [
            name.trim(), code.trim().toUpperCase(), parseInt(quota_days),
            is_paid !== false, !!requires_doc,
            color?.trim() || '#6366f1', description?.trim() || null,
            !!count_saturday, !!count_sunday,
            parseInt(id), companyUuid,
        ]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Jenis cuti tidak ditemukan' });
    res.json(result.rows[0]);
}));

// ── PATCH /:id/toggle — aktifkan / nonaktifkan (HR Manager only) ──────────────
leaveTypes.patch('/:id/toggle', requireHrManager, asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const result = await query(
        `UPDATE leave_types SET is_active = NOT is_active, updated_at = NOW()
         WHERE id = $1 AND company_uuid = $2
         RETURNING id, name, is_active`,
        [parseInt(req.params.id), companyUuid]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Jenis cuti tidak ditemukan' });
    res.json({ row: result.rows[0] });
}));



// =============================================================================
// 2. LEAVE BALANCES — GET /hr/leave-balances/mine
// =============================================================================
const leaveBalances = express.Router();
leaveBalances.use(authenticateToken);

leaveBalances.get('/mine', asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const emp = await resolveEmployee(req.user.id, companyUuid);
    if (!emp) return res.status(403).json({ error: 'Akun belum ter-link ke data karyawan' });

    const year = parseInt(req.query.year || new Date().getFullYear());

    // Ensure balance rows exist for all active leave types
    const ltRes = await query(
        `SELECT id FROM leave_types WHERE company_uuid = $1 AND is_active = TRUE`,
        [companyUuid]
    );
    const client = await getClient();
    try {
        await client.query('BEGIN');
        for (const lt of ltRes.rows) {
            await ensureBalance(client, companyUuid, emp.id, lt.id, year);
        }
        await client.query('COMMIT');
    } catch (_) {
        await client.query('ROLLBACK');
    } finally {
        client.release();
    }

    const result = await query(
        `SELECT lb.id, lb.year, lb.quota_days, lb.used_days, lb.carry_over_days,
                (lb.quota_days + lb.carry_over_days - lb.used_days) AS remaining_days,
                lt.id AS leave_type_id, lt.name AS leave_type_name,
                lt.code AS leave_type_code, lt.color, lt.requires_doc
         FROM leave_balances lb
         JOIN leave_types lt ON lt.id = lb.leave_type_id
         WHERE lb.employee_id = $1 AND lb.year = $2
         ORDER BY lt.name`,
        [emp.id, year]
    );
    res.json(result.rows);
}));

// =============================================================================
// 3. EMPLOYEE LEAVES — Self-service /hr/employee-leaves
// =============================================================================
const employeeLeaves = express.Router();
employeeLeaves.use(authenticateToken);

// ── GET / — list pengajuan saya ───────────────────────────────────────────────
employeeLeaves.get('/', asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const emp = await resolveEmployee(req.user.id, companyUuid);
    if (!emp) return res.status(403).json({ error: 'Akun belum ter-link ke data karyawan' });

    const { status, date_from, date_to, year } = req.query;
    let where = ['lr.employee_id = $1', 'lr.company_uuid = $2'];
    let values = [emp.id, companyUuid];
    let idx = 3;

    if (status)    { where.push(`lr.status = $${idx++}`);               values.push(status); }
    if (date_from) { where.push(`lr.start_date >= $${idx++}`);          values.push(date_from); }
    if (date_to)   { where.push(`lr.end_date <= $${idx++}`);            values.push(date_to); }
    if (year)      { where.push(`EXTRACT(YEAR FROM lr.start_date)=$${idx++}`); values.push(parseInt(year)); }

    const result = await query(
        `SELECT lr.uuid, lr.number,
                lr.start_date::text AS start_date,
                lr.end_date::text   AS end_date,
                lr.total_days,
                lr.reason, lr.status, lr.review_notes, lr.reviewed_at,
                lr.created_at, lr.attachment_path,
                lt.id AS leave_type_id, lt.name AS leave_type_name,
                lt.code AS leave_type_code, lt.color
         FROM leave_requests lr
         JOIN leave_types lt ON lt.id = lr.leave_type_id
         WHERE ${where.join(' AND ')}
         ORDER BY lr.created_at DESC`,
        values
    );
    res.json(result.rows);
}));

// ── GET /:uuid — detail pengajuan ─────────────────────────────────────────────
employeeLeaves.get('/:uuid', validateUUID(), asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const emp = await resolveEmployee(req.user.id, companyUuid);
    if (!emp) return res.status(403).json({ error: 'Akun belum ter-link ke data karyawan' });

    const result = await query(
        `SELECT lr.uuid, lr.number, lr.start_date, lr.end_date, lr.total_days,
                lr.reason, lr.status, lr.review_notes, lr.reviewed_at,
                lr.created_at, lr.attachment_path,
                lt.id AS leave_type_id, lt.name AS leave_type_name,
                lt.code AS leave_type_code, lt.color, lt.requires_doc,
                u.name AS reviewed_by_name
         FROM leave_requests lr
         JOIN leave_types lt ON lt.id = lr.leave_type_id
         LEFT JOIN users u ON u.id = lr.reviewed_by
         WHERE lr.uuid = $1 AND lr.employee_id = $2 AND lr.company_uuid = $3`,
        [req.params.uuid, emp.id, companyUuid]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Pengajuan tidak ditemukan' });
    res.json(result.rows[0]);
}));

// ── POST / — buat pengajuan cuti baru ─────────────────────────────────────────
employeeLeaves.post('/', asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const emp = await resolveEmployee(req.user.id, companyUuid);
    if (!emp) return res.status(403).json({ error: 'Akun belum ter-link ke data karyawan' });

    const { leave_type_id, start_date, end_date, reason } = req.body;

    if (!leave_type_id) return res.status(400).json({ error: 'Jenis cuti wajib dipilih' });
    if (!start_date)    return res.status(400).json({ error: 'Tanggal mulai wajib diisi' });
    if (!end_date)      return res.status(400).json({ error: 'Tanggal selesai wajib diisi' });
    if (new Date(end_date) < new Date(start_date)) {
        return res.status(400).json({ error: 'Tanggal selesai tidak boleh sebelum tanggal mulai' });
    }

    // Resolve leave_type integer id + weekend config
    const ltRes = await query(
        `SELECT id, name, count_saturday, count_sunday
         FROM leave_types WHERE id = $1 AND company_uuid = $2 AND is_active = TRUE`,
        [leave_type_id, companyUuid]
    );
    if (!ltRes.rows.length) return res.status(400).json({ error: 'Jenis cuti tidak valid' });
    const leaveType = ltRes.rows[0];

    const total_days = calcDays(start_date, end_date, leaveType.count_saturday, leaveType.count_sunday);
    if (total_days < 1) {
        return res.status(400).json({ error: 'Rentang tanggal tidak menghasilkan hari kerja yang valid (semua hari libur?)' });
    }

    const year = new Date(start_date).getFullYear();
    const client = await getClient();
    try {
        await client.query('BEGIN');
        await ensureBalance(client, companyUuid, emp.id, leaveType.id, year);

        const balRes = await client.query(
            `SELECT quota_days, used_days, carry_over_days FROM leave_balances
             WHERE employee_id = $1 AND leave_type_id = $2 AND year = $3`,
            [emp.id, leaveType.id, year]
        );
        const bal = balRes.rows[0];
        const remaining = (bal.quota_days + bal.carry_over_days) - bal.used_days;
        if (total_days > remaining) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                error: `Saldo cuti tidak cukup. Sisa: ${remaining} hari, diajukan: ${total_days} hari`
            });
        }

        const overlapRes = await client.query(
            `SELECT id FROM leave_requests
             WHERE employee_id = $1 AND status != 'rejected'
               AND start_date <= $2 AND end_date >= $3`,
            [emp.id, end_date, start_date]
        );
        if (overlapRes.rows.length) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Terdapat jadwal cuti yang overlap dengan pengajuan ini' });
        }

        const number = await generateAutoNumber(emp.branch_code || 'GEN', 'LV');

        const insRes = await client.query(
            `INSERT INTO leave_requests
             (number, company_id, company_uuid, employee_id, leave_type_id,
              start_date, end_date, total_days, reason, created_by)
             VALUES ((SELECT id FROM companies WHERE uuid = $2),$2,$3,$4,$5,$6,$7,$8,$9,$10)
             RETURNING uuid, number`,
            [number, companyUuid, emp.id, leaveType.id,
             start_date, end_date, total_days, reason?.trim() || null, req.user.name]
        );

        await client.query('COMMIT');

        await query(
            `INSERT INTO audit_trail (action, module, description, user_id, user_name)
             VALUES ('create','hr',$1,$2,$3)`,
            [`Ajukan cuti: ${number} (${leaveType.name}, ${total_days} hari)`, req.user.id, req.user.name]
        );

        res.status(201).json({ uuid: insRes.rows[0].uuid, number: insRes.rows[0].number });
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}));

// ── DELETE /:uuid — hapus draft ───────────────────────────────────────────────
employeeLeaves.delete('/:uuid', validateUUID(), asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const emp = await resolveEmployee(req.user.id, companyUuid);
    if (!emp) return res.status(403).json({ error: 'Akun belum ter-link ke data karyawan' });

    const result = await query(
        `SELECT id, number, status, attachment_path FROM leave_requests
         WHERE uuid = $1 AND employee_id = $2 AND company_uuid = $3`,
        [req.params.uuid, emp.id, companyUuid]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Pengajuan tidak ditemukan' });
    const lr = result.rows[0];

    if (lr.status !== 'draft') {
        return res.status(400).json({ error: 'Hanya pengajuan berstatus Draft yang bisa dihapus' });
    }

    // Hapus file lampiran jika ada
    if (lr.attachment_path && UPLOAD_DIR) {
        try {
            const fp = path.join(UPLOAD_DIR, lr.attachment_path.replace(/^\/uploadedImage\//, ''));
            if (fs.existsSync(fp)) fs.unlinkSync(fp);
        } catch (_) {}
    }

    await query(`DELETE FROM leave_requests WHERE id = $1`, [lr.id]);
    res.json({ message: `Pengajuan ${lr.number} berhasil dihapus` });
}));

// =============================================================================
// 4. LEAVE ADMIN — /hr/leaves (approved calendar + management)
// =============================================================================
const leaveAdmin = express.Router();
leaveAdmin.use(authenticateToken);

// ── GET /team — Cuti approved semua karyawan 1 perusahaan (team calendar) ─────
leaveAdmin.get('/team', asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const emp = await resolveEmployee(req.user.id, companyUuid);

    const { month, year, leave_type_id } = req.query;
    const y = parseInt(year  || new Date().getFullYear());
    const m = parseInt(month || new Date().getMonth() + 1);

    const startOfMonth = `${y}-${String(m).padStart(2,'0')}-01`;
    const endOfMonth   = new Date(y, m, 0).toISOString().split('T')[0];

    let where = [
        `lr.company_uuid = $1`,
        `lr.status = 'approved'`,
        `lr.start_date <= $2`,
        `lr.end_date   >= $3`,
    ];
    let values = [companyUuid, endOfMonth, startOfMonth];
    let idx = 4;

    if (leave_type_id) { where.push(`lr.leave_type_id = $${idx++}`); values.push(parseInt(leave_type_id)); }

    const result = await query(
        `SELECT lr.uuid, lr.number,
                lr.start_date::text AS start_date,
                lr.end_date::text   AS end_date,
                lr.total_days, lr.reason,
                e.uuid AS employee_uuid, e.nama_lengkap AS employee_name,
                ej.jabatan AS employee_jabatan,
                lt.id AS leave_type_id, lt.name AS leave_type_name,
                lt.code AS leave_type_code, lt.color,
                lt.count_saturday, lt.count_sunday,
                -- flag: apakah ini karyawan yang login?
                (e.user_id = $${idx++}) AS is_mine
         FROM leave_requests lr
         JOIN employees e    ON e.id  = lr.employee_id
         JOIN leave_types lt ON lt.id = lr.leave_type_id
         LEFT JOIN employee_jobs ej ON ej.employee_id = e.id AND ej.is_current = TRUE
         WHERE ${where.join(' AND ')}
         ORDER BY lr.start_date ASC, e.nama_lengkap ASC`,
        [...values, req.user.id]
    );
    res.json(result.rows);
}));

// ── GET / — list semua (HR/Manager only, optional) ───────────────────────────
leaveAdmin.get('/', asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const { status, employee_uuid, date_from, date_to } = req.query;

    let where = ['lr.company_uuid = $1'];
    let values = [companyUuid];
    let idx = 2;

    if (status)        { where.push(`lr.status = $${idx++}`);      values.push(status); }
    if (date_from)     { where.push(`lr.start_date >= $${idx++}`); values.push(date_from); }
    if (date_to)       { where.push(`lr.end_date <= $${idx++}`);   values.push(date_to); }
    if (employee_uuid) {
        where.push(`e.uuid = $${idx++}`);
        values.push(employee_uuid);
    }

    const result = await query(
        `SELECT lr.uuid, lr.number, lr.start_date, lr.end_date, lr.total_days,
                lr.reason, lr.status, lr.review_notes, lr.reviewed_at, lr.created_at,
                e.uuid AS employee_uuid, e.nama_lengkap AS employee_name, e.nik,
                ej.jabatan,
                lt.name AS leave_type_name, lt.code AS leave_type_code, lt.color
         FROM leave_requests lr
         JOIN employees e    ON e.id  = lr.employee_id
         JOIN leave_types lt ON lt.id = lr.leave_type_id
         LEFT JOIN employee_jobs ej ON ej.employee_id = e.id AND ej.is_current = TRUE
         WHERE ${where.join(' AND ')}
         ORDER BY lr.created_at DESC`,
        values
    );
    res.json(result.rows);
}));

// ── PATCH /:uuid/approve ───────────────────────────────────────────────────────
leaveAdmin.patch('/:uuid/approve', validateUUID(), asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;

    const lrRes = await query(
        `SELECT lr.id, lr.number, lr.employee_id, lr.leave_type_id,
                lr.total_days, lr.status, lr.start_date
         FROM leave_requests lr
         WHERE lr.uuid = $1 AND lr.company_uuid = $2`,
        [req.params.uuid, companyUuid]
    );
    if (!lrRes.rows.length) return res.status(404).json({ error: 'Pengajuan tidak ditemukan' });
    const lr = lrRes.rows[0];
    if (lr.status !== 'draft') return res.status(400).json({ error: 'Hanya pengajuan berstatus Draft yang bisa disetujui' });

    const year = new Date(lr.start_date).getFullYear();
    const client = await getClient();
    try {
        await client.query('BEGIN');
        await client.query(
            `UPDATE leave_requests
             SET status = 'approved', reviewed_by = $1, reviewed_at = NOW(), updated_at = NOW()
             WHERE id = $2`,
            [req.user.id, lr.id]
        );
        await ensureBalance(client, companyUuid, lr.employee_id, lr.leave_type_id, year);
        await client.query(
            `UPDATE leave_balances
             SET used_days = used_days + $1, updated_at = NOW()
             WHERE employee_id = $2 AND leave_type_id = $3 AND year = $4`,
            [lr.total_days, lr.employee_id, lr.leave_type_id, year]
        );
        await client.query('COMMIT');
        res.json({ message: `Pengajuan ${lr.number} disetujui`, status: 'approved' });
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}));

// ── PATCH /:uuid/reject ────────────────────────────────────────────────────────
leaveAdmin.patch('/:uuid/reject', validateUUID(), asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const { notes } = req.body;

    const lrRes = await query(
        `SELECT id, number, status FROM leave_requests WHERE uuid = $1 AND company_uuid = $2`,
        [req.params.uuid, companyUuid]
    );
    if (!lrRes.rows.length) return res.status(404).json({ error: 'Pengajuan tidak ditemukan' });
    const lr = lrRes.rows[0];
    if (lr.status !== 'draft') return res.status(400).json({ error: 'Hanya pengajuan Draft yang bisa ditolak' });

    await query(
        `UPDATE leave_requests
         SET status = 'rejected', reviewed_by = $1, reviewed_at = NOW(),
             review_notes = $2, updated_at = NOW()
         WHERE id = $3`,
        [req.user.id, notes?.trim() || null, lr.id]
    );
    res.json({ message: `Pengajuan ${lr.number} ditolak`, status: 'rejected' });
}));

module.exports = { leaveTypes, leaveBalances, employeeLeaves, leaveAdmin };
