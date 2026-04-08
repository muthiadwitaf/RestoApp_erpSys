/**
 * BE/src/module/hr/karyawan.js
 * CRUD endpoints untuk Master Karyawan.
 *
 * Endpoints:
 *   GET    /api/hr/karyawan            - list karyawan (dengan filter)
 *   GET    /api/hr/karyawan/:uuid      - detail karyawan (semua relasi)
 *   POST   /api/hr/karyawan            - tambah karyawan baru
 *   PUT    /api/hr/karyawan/:uuid      - update data karyawan
 *   DELETE /api/hr/karyawan/:uuid      - nonaktifkan karyawan
 *
 *   POST   /api/hr/karyawan/:uuid/foto              - upload/ganti foto profil
 *   DELETE /api/hr/karyawan/:uuid/foto              - hapus foto profil
 *
 *   POST   /api/hr/karyawan/:uuid/identities        - simpan data identitas
 *   POST   /api/hr/karyawan/:uuid/jobs              - tambah riwayat jabatan
 *   PUT    /api/hr/karyawan/:uuid/jobs/:jobId       - edit riwayat jabatan
 *   POST   /api/hr/karyawan/:uuid/family            - tambah anggota keluarga
 *   DELETE /api/hr/karyawan/:uuid/family/:famId     - hapus anggota keluarga
 *   POST   /api/hr/karyawan/:uuid/documents         - upload dokumen
 *   DELETE /api/hr/karyawan/:uuid/documents/:docId  - hapus dokumen
 *
 *   POST   /api/hr/karyawan/:uuid/create-user-account  - buat akun login baru dari email_kerja
 *   POST   /api/hr/karyawan/:uuid/link-existing-user   - hubungkan ke akun user yang sudah ada
 *   POST   /api/hr/karyawan/:uuid/unlink-user          - putuskan link + nonaktifkan akun
 */
const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');
const { query } = require('../../config/db');
const { authenticateToken, requirePermission } = require('../../middleware/auth');
const { upload, uploadDoc, UPLOAD_DIR } = require('../../middleware/upload');
const { asyncHandler } = require('../../utils/helpers');
const { bcryptRounds } = require('../../config/auth');

router.use(authenticateToken);

// ─── helper: generate NIK karyawan ──────────────────────────────────────────
// Format: {company_code}{YYYY}{A-Z}{5-digit-sequence per company per year}
// Contoh: ABC2026A00001 ... ABC2026A99999 -> ABC2026B00001
async function generateNik(companyUuid) {
    const year = new Date().getFullYear();

    // Ambil company_code sebagai prefix (fallback ke 'EMP' jika belum diset)
    const compRes = await query(
        `SELECT code FROM companies WHERE uuid = $1`,
        [companyUuid]
    );
    const companyCode = (compRes.rows[0]?.code?.trim() || 'EMP').replace(/[^A-Z0-9]/gi, '').toUpperCase();
    const prefix = `${companyCode}${year}`;

    // Ambil NIK terakhir untuk company ini di tahun ini
    const result = await query(
        `SELECT nik FROM employees
         WHERE company_uuid = $1 AND nik LIKE $2
         ORDER BY nik DESC LIMIT 1`,
        [companyUuid, `${prefix}%`]
    );

    if (result.rows.length === 0) {
        return `${prefix}A00001`;
    }

    const last = result.rows[0].nik; // e.g. ABC2026A00042
    const rest = last.slice(prefix.length);  // 'A00042'
    const lastLetter = rest[0] || 'A';
    const lastNum = parseInt(rest.slice(1), 10) || 0;

    if (lastNum >= 99999) {
        // Overflow: naik ke huruf berikutnya, reset number
        const nextLetter = String.fromCharCode(lastLetter.charCodeAt(0) + 1);
        return `${prefix}${nextLetter}00001`;
    } else {
        const nextNum = String(lastNum + 1).padStart(5, '0');
        return `${prefix}${lastLetter}${nextNum}`;
    }
}

// ─── helper: path folder foto karyawan ──────────────────────────────────────
function getFotoDir(companyUuid, employeeUuid) {
    return path.join(UPLOAD_DIR, companyUuid, 'karyawan', employeeUuid);
}

// ─── GET /api/hr/karyawan ───────────────────────────────────────────────────
router.get('/', requirePermission('hr:view'), asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const { search, status, branch_uuid, departemen } = req.query;

    let where = ['e.company_uuid = $1', 'e.is_active = TRUE'];
    let values = [companyUuid];
    let idx = 2;

    if (search) {
        where.push(`(e.nama_lengkap ILIKE $${idx} OR e.nik ILIKE $${idx} OR e.email_kerja ILIKE $${idx})`);
        values.push(`%${search}%`);
        idx++;
    }
    if (status) {
        where.push(`e.status = $${idx}`);
        values.push(status);
        idx++;
    }
    if (branch_uuid) {
        where.push(`e.branch_id = (SELECT id FROM branches WHERE uuid = $${idx})`);
        values.push(branch_uuid);
        idx++;
    }
    if (departemen) {
        where.push(`ej.departemen ILIKE $${idx}`);
        values.push(`%${departemen}%`);
        idx++;
    }

    const result = await query(
        `SELECT
            e.uuid, e.nik, e.nama_lengkap, e.nama_panggilan, e.gender,
            e.foto_url, e.email_kerja, e.no_hp,
            e.status, e.created_at,
            b.name AS branch_name,
            ej.jabatan, ej.departemen, ej.jenis_karyawan, ej.tanggal_mulai,
            u.uuid AS user_uuid, u.is_active AS user_is_active,
            CASE WHEN e.user_id IS NOT NULL THEN TRUE ELSE FALSE END AS has_user_account
         FROM employees e
         LEFT JOIN branches b ON e.branch_id = b.id
         LEFT JOIN employee_jobs ej ON ej.employee_id = e.id AND ej.is_current = TRUE
         LEFT JOIN users u ON e.user_id = u.id
         WHERE ${where.join(' AND ')}
         ORDER BY e.nama_lengkap ASC`,
        values
    );
    res.json(result.rows);
}));

// ─── GET /api/hr/karyawan/:uuid ─────────────────────────────────────────────
router.get('/:uuid', requirePermission('hr:view'), asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;

    // Data utama karyawan
    const empRes = await query(
        `SELECT e.*, b.name AS branch_name, b.uuid AS branch_uuid
         FROM employees e
         LEFT JOIN branches b ON e.branch_id = b.id
         WHERE e.uuid = $1 AND e.company_uuid = $2`,
        [req.params.uuid, companyUuid]
    );
    if (empRes.rows.length === 0) return res.status(404).json({ error: 'Karyawan tidak ditemukan' });
    const emp = empRes.rows[0];

    // Identitas
    const idRes = await query(
        `SELECT * FROM employee_identities WHERE employee_id = $1`, [emp.id]
    );

    // Keluarga
    const famRes = await query(
        `SELECT * FROM employee_family WHERE employee_id = $1 ORDER BY hubungan, nama`, [emp.id]
    );

    // Riwayat jabatan (sertakan role uuid jika ada)
    const jobRes = await query(
        `SELECT ej.id, ej.jabatan, ej.departemen, ej.divisi, ej.jenis_karyawan,
                ej.tanggal_mulai, ej.tanggal_selesai, ej.gaji_pokok,
                ej.is_current, ej.keterangan, ej.created_by,
                b.name AS branch_name,
                r.uuid AS role_uuid, r.name AS role_name
         FROM employee_jobs ej
         LEFT JOIN branches b ON ej.branch_id = b.id
         LEFT JOIN roles r ON ej.role_id = r.id
         WHERE ej.employee_id = $1
         ORDER BY ej.tanggal_mulai DESC`,
        [emp.id]
    );

    // Dokumen
    const docRes = await query(
        `SELECT * FROM employee_documents WHERE employee_id = $1 ORDER BY created_at DESC`, [emp.id]
    );

    // Akun login yang terhubung (jika ada)
    let linkedUser = null;
    if (emp.user_id) {
        const userRes = await query(
            `SELECT u.uuid, u.name, u.email, u.is_active,
                    COALESCE(json_agg(DISTINCT r.name) FILTER (WHERE r.id IS NOT NULL), '[]') AS roles
             FROM users u
             LEFT JOIN user_roles ur ON ur.user_id = u.id
             LEFT JOIN roles r ON ur.role_id = r.id
             WHERE u.id = $1
             GROUP BY u.id`,
            [emp.user_id]
        );
        if (userRes.rows.length > 0) {
            linkedUser = userRes.rows[0];
        }
    }

    // Jangan expose integer id ke FE
    const { id: _id, user_id: _uid, ...safeEmp } = emp;
    res.json({
        ...safeEmp,
        identities: idRes.rows[0] || null,
        family: famRes.rows,
        jobs: jobRes.rows,
        documents: docRes.rows,
        linked_user: linkedUser,
    });
}));

// ─── POST /api/hr/karyawan ──────────────────────────────────────────────────
router.post('/', requirePermission('hr:create'), asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const {
        nama_lengkap, nama_panggilan, gender, tanggal_lahir, tempat_lahir,
        agama, status_kawin, golongan_darah,
        email_kerja, email_pribadi, no_hp, no_hp_darurat, nama_darurat, hubungan_darurat,
        alamat_ktp, kota_ktp, provinsi_ktp, kode_pos_ktp, alamat_domisili,
        branch_id,
        // job info (opsional, bisa diisi nanti)
        jabatan, departemen, divisi, jenis_karyawan, tanggal_mulai, gaji_pokok,
    } = req.body;

    if (!nama_lengkap?.trim()) {
        return res.status(400).json({ error: 'Nama lengkap wajib diisi' });
    }

    // ── Generate NIK dengan retry untuk handle race condition ──────────────
    // Jika dua request masuk bersamaan dan generate NIK yang sama,
    // salah satu akan kena duplicate key → regenerate NIK lalu retry.
    const MAX_NIK_ATTEMPTS = 5;
    let emp = null;
    for (let attempt = 1; attempt <= MAX_NIK_ATTEMPTS; attempt++) {
        const nik = await generateNik(companyUuid);
        try {
            const empRes = await query(
                `INSERT INTO employees
                    (nik, nama_lengkap, nama_panggilan, gender, tanggal_lahir, tempat_lahir,
                     agama, status_kawin, golongan_darah,
                     email_kerja, email_pribadi, no_hp, no_hp_darurat, nama_darurat, hubungan_darurat,
                     alamat_ktp, kota_ktp, provinsi_ktp, kode_pos_ktp, alamat_domisili,
                     branch_id, company_id, company_uuid, created_by)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,
                         (SELECT id FROM companies WHERE uuid = $22),$22,$23)
                 RETURNING *`,
                [
                    nik, nama_lengkap.trim(), nama_panggilan?.trim() || null,
                    gender || null, tanggal_lahir || null, tempat_lahir?.trim() || null,
                    agama || null, status_kawin || null, golongan_darah?.trim() || null,
                    email_kerja?.trim() || null, email_pribadi?.trim() || null,
                    no_hp?.trim() || null, no_hp_darurat?.trim() || null,
                    nama_darurat?.trim() || null, hubungan_darurat?.trim() || null,
                    alamat_ktp?.trim() || null, kota_ktp?.trim() || null,
                    provinsi_ktp?.trim() || null, kode_pos_ktp?.trim() || null,
                    alamat_domisili?.trim() || null,
                    branch_id || null, companyUuid, req.user.name,
                ]
            );
            emp = empRes.rows[0];
            break; // sukses, keluar dari loop
        } catch (err) {
            // Duplicate NIK karena race condition → retry dengan NIK baru
            if (err.code === '23505' && attempt < MAX_NIK_ATTEMPTS) {
                console.warn(`[HR] generateNik collision (attempt ${attempt}), retrying...`);
                continue;
            }
            throw err; // error lain atau habis percobaan → lempar ke handler
        }
    }

    // Buat identitas kosong (bisa diisi nanti)
    await query(
        `INSERT INTO employee_identities (employee_id) VALUES ($1) ON CONFLICT DO NOTHING`,
        [emp.id]
    );

    // Jika ada info jabatan, langsung buat entry pertama
    if (jabatan || jenis_karyawan || tanggal_mulai) {
        await query(
            `INSERT INTO employee_jobs
                (employee_id, jabatan, departemen, divisi, branch_id,
                 jenis_karyawan, tanggal_mulai, gaji_pokok, is_current, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE,$9)`,
            [
                emp.id, jabatan?.trim() || null, departemen?.trim() || null,
                divisi?.trim() || null, branch_id || null,
                jenis_karyawan || null, tanggal_mulai || null,
                gaji_pokok || 0, req.user.name,
            ]
        );
    }

    await query(
        `INSERT INTO audit_trail (action, module, description, user_id, user_name, branch_id)
         VALUES ('create','hr',$1,$2,$3,$4)`,
        [`Tambah karyawan: ${emp.nama_lengkap} (${emp.nik})`, req.user.id, req.user.name, req.user.branch_id]
    ).catch(() => { });

    res.status(201).json(emp);
}));

// ─── PUT /api/hr/karyawan/:uuid ─────────────────────────────────────────────
router.put('/:uuid', requirePermission('hr:edit'), asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const empRes = await query(
        `SELECT id, nama_lengkap FROM employees WHERE uuid = $1 AND company_uuid = $2`,
        [req.params.uuid, companyUuid]
    );
    if (empRes.rows.length === 0) return res.status(404).json({ error: 'Karyawan tidak ditemukan' });
    const empId = empRes.rows[0].id;

    const FIELDS = [
        'nama_lengkap', 'nama_panggilan', 'gender', 'tanggal_lahir', 'tempat_lahir',
        'agama', 'status_kawin', 'golongan_darah',
        'email_kerja', 'email_pribadi', 'no_hp', 'no_hp_darurat', 'nama_darurat', 'hubungan_darurat',
        'alamat_ktp', 'kota_ktp', 'provinsi_ktp', 'kode_pos_ktp', 'alamat_domisili',
        'status',
    ];

    const updates = [];
    const values = [];
    let idx = 1;

    for (const field of FIELDS) {
        if (req.body[field] !== undefined) {
            updates.push(`${field} = $${idx++}`);
            const v = req.body[field];
            values.push(typeof v === 'string' ? (v.trim() || null) : v);
        }
    }

    // branch_uuid -> resolve to branch_id integer FK
    if (req.body.branch_uuid !== undefined) {
        if (req.body.branch_uuid) {
            const brRes = await query('SELECT id FROM branches WHERE uuid = $1', [req.body.branch_uuid]);
            if (brRes.rows.length > 0) {
                updates.push(`branch_id = $${idx++}`);
                values.push(brRes.rows[0].id);
            }
        } else {
            updates.push(`branch_id = $${idx++}`);
            values.push(null);
        }
    }

    if (updates.length > 0) {
        updates.push(`updated_at = NOW()`);
        values.push(req.params.uuid);
        await query(
            `UPDATE employees SET ${updates.join(', ')} WHERE uuid = $${idx}`,
            values
        );
    }

    await query(
        `INSERT INTO audit_trail (action, module, description, user_id, user_name, branch_id)
         VALUES ('update','hr',$1,$2,$3,$4)`,
        [`Edit karyawan: ${empRes.rows[0].nama_lengkap}`, req.user.id, req.user.name, req.user.branch_id]
    ).catch(() => { });

    res.json({ message: 'Data karyawan berhasil diupdate' });
}));

// ─── PATCH /api/hr/karyawan/:uuid/nonaktifkan ────────────────────────────────
// Ubah status -> nonaktif, sekaligus nonaktifkan akun login yang terhubung (jika ada).
router.patch('/:uuid/nonaktifkan', requirePermission('hr:edit'), asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const empRes = await query(
        `SELECT e.id, e.nama_lengkap, e.nik, e.user_id,
                u.email AS user_email
         FROM employees e
         LEFT JOIN users u ON e.user_id = u.id
         WHERE e.uuid = $1 AND e.company_uuid = $2`,
        [req.params.uuid, companyUuid]
    );
    if (empRes.rows.length === 0) return res.status(404).json({ error: 'Karyawan tidak ditemukan' });
    const { id: empId, nama_lengkap, nik, user_id, user_email } = empRes.rows[0];

    // Nonaktifkan karyawan
    await query(
        `UPDATE employees SET status = 'nonaktif', updated_at = NOW() WHERE uuid = $1`,
        [req.params.uuid]
    );

    // Jika ada akun login: nonaktifkan akun + putus link
    if (user_id) {
        await query(
            `UPDATE users SET is_active = FALSE, updated_at = NOW() WHERE id = $1`,
            [user_id]
        );
        await query(
            `UPDATE employees SET user_id = NULL, updated_at = NOW() WHERE id = $1`,
            [empId]
        );
    }

    const desc = user_id
        ? `Nonaktifkan karyawan: ${nama_lengkap} (${nik}) — akun login ${user_email} ikut dinonaktifkan`
        : `Nonaktifkan karyawan: ${nama_lengkap} (${nik})`;

    await query(
        `INSERT INTO audit_trail (action, module, description, user_id, user_name, branch_id)
         VALUES ('update','hr',$1,$2,$3,$4)`,
        [desc, req.user.id, req.user.name, req.user.branch_id]
    ).catch(() => { });

    res.json({
        message: `Karyawan ${nama_lengkap} berhasil dinonaktifkan`,
        account_deactivated: !!user_id,
        deactivated_email: user_email || null,
    });
}));

// ─── PATCH /api/hr/karyawan/:uuid/aktifkan ────────────────────────────────────
// Re-aktifkan karyawan nonaktif.
router.patch('/:uuid/aktifkan', requirePermission('hr:edit'), asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const empRes = await query(
        `SELECT id, nama_lengkap, nik FROM employees WHERE uuid = $1 AND company_uuid = $2`,
        [req.params.uuid, companyUuid]
    );
    if (empRes.rows.length === 0) return res.status(404).json({ error: 'Karyawan tidak ditemukan' });
    const { nama_lengkap, nik } = empRes.rows[0];

    await query(
        `UPDATE employees SET status = 'aktif', updated_at = NOW() WHERE uuid = $1`,
        [req.params.uuid]
    );

    await query(
        `INSERT INTO audit_trail (action, module, description, user_id, user_name, branch_id)
         VALUES ('update','hr',$1,$2,$3,$4)`,
        [`Aktifkan karyawan: ${nama_lengkap} (${nik})`, req.user.id, req.user.name, req.user.branch_id]
    ).catch(() => { });

    res.json({ message: `Karyawan ${nama_lengkap} berhasil diaktifkan kembali` });
}));


// ─── DELETE /api/hr/karyawan/:uuid ──────────────────────────────────────────
// HARD DELETE: permanen, tidak bisa dikembalikan.
// Hanya hr:delete (HR Manager) dan Super Admin.
router.delete('/:uuid', requirePermission('hr:delete'), asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;

    // Ambil data karyawan (company_uuid sudah ada di kolom)
    const empRes = await query(
        `SELECT e.id, e.uuid, e.nama_lengkap, e.nik,
                e.company_uuid
         FROM employees e
         WHERE e.uuid = $1 AND e.company_uuid = $2`,
        [req.params.uuid, companyUuid]
    );
    if (empRes.rows.length === 0) return res.status(404).json({ error: 'Karyawan tidak ditemukan' });
    const { id: empId, uuid: empUuid, nama_lengkap, nik, company_uuid } = empRes.rows[0];

    // Hapus seluruh folder file karyawan (foto profil + semua dokumen)
    const karyawanDir = path.join(UPLOAD_DIR, company_uuid, 'karyawan', empUuid);
    try {
        if (fs.existsSync(karyawanDir)) {
            fs.rmSync(karyawanDir, { recursive: true, force: true });
        }
    } catch (e) {
        console.warn(`[HR] Gagal hapus folder ${karyawanDir}:`, e.message);
        // Lanjut tetap hapus dari DB agar tidak stuck
    }

    // Hard delete dari DB
    // Semua tabel relasi terhapus otomatis via ON DELETE CASCADE:
    // employee_identities, employee_family, employee_jobs, employee_documents
    await query(`DELETE FROM employees WHERE id = $1`, [empId]);

    await query(
        `INSERT INTO audit_trail (action, module, description, user_id, user_name, branch_id)
         VALUES ('delete','hr',$1,$2,$3,$4)`,
        [
            `HARD DELETE karyawan: ${nama_lengkap} (${nik}) — dihapus permanen oleh ${req.user.name}`,
            req.user.id, req.user.name, req.user.branch_id,
        ]
    ).catch(() => { });

    res.json({ message: `Karyawan ${nama_lengkap} berhasil dihapus permanen` });
}));


// ─── POST /api/hr/karyawan/:uuid/foto ───────────────────────────────────────
router.post('/:uuid/foto', requirePermission('hr:edit'), upload.single('foto'), asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'File foto diperlukan (jpg/png)' });

    const companyUuid = req.user.company_uuid;
    const empRes = await query(
        `SELECT e.id, e.foto_url, e.company_uuid
         FROM employees e
         WHERE e.uuid = $1 AND e.company_uuid = $2`,
        [req.params.uuid, companyUuid]
    );
    if (empRes.rows.length === 0) return res.status(404).json({ error: 'Karyawan tidak ditemukan' });
    const { id: empId, foto_url: oldFoto, company_uuid } = empRes.rows[0];

    // Hapus foto lama jika ada
    if (oldFoto) {
        const oldPath = path.join(UPLOAD_DIR, oldFoto.replace(/^\/uploadedImage\//, ''));
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    // Simpan foto baru di path khusus karyawan
    const fotoDir = getFotoDir(company_uuid, req.params.uuid);
    if (!fs.existsSync(fotoDir)) fs.mkdirSync(fotoDir, { recursive: true });

    const ext = req.file.mimetype === 'image/png' ? 'png' : 'jpg';
    const filename = `profile.${ext}`;
    const filePath = path.join(fotoDir, filename);
    fs.writeFileSync(filePath, req.file.buffer);

    const fotoUrl = `/uploadedImage/${company_uuid}/karyawan/${req.params.uuid}/${filename}`;
    await query(
        `UPDATE employees SET foto_url = $1, updated_at = NOW() WHERE id = $2`,
        [fotoUrl, empId]
    );

    res.json({ foto_url: fotoUrl });
}));

// ─── DELETE /api/hr/karyawan/:uuid/foto ─────────────────────────────────────
router.delete('/:uuid/foto', requirePermission('hr:edit'), asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const empRes = await query(
        `SELECT id, foto_url FROM employees WHERE uuid = $1 AND company_uuid = $2`,
        [req.params.uuid, companyUuid]
    );
    if (empRes.rows.length === 0) return res.status(404).json({ error: 'Karyawan tidak ditemukan' });
    const { id: empId, foto_url } = empRes.rows[0];

    if (foto_url) {
        const filePath = path.join(UPLOAD_DIR, foto_url.replace(/^\/uploadedImage\//, ''));
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    await query(`UPDATE employees SET foto_url = NULL, updated_at = NOW() WHERE id = $1`, [empId]);
    res.json({ message: 'Foto dihapus' });
}));

// ─── POST /api/hr/karyawan/:uuid/identities ─────────────────────────────────
router.post('/:uuid/identities', requirePermission('hr:edit'), asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const empRes = await query(
        `SELECT id FROM employees WHERE uuid = $1 AND company_uuid = $2`,
        [req.params.uuid, companyUuid]
    );
    if (empRes.rows.length === 0) return res.status(404).json({ error: 'Karyawan tidak ditemukan' });
    const empId = empRes.rows[0].id;

    const { no_ktp, no_npwp, no_bpjs_kesehatan, no_bpjs_ketenagakerjaan, no_rekening, nama_bank, nama_rekening,
            is_foreign, no_passport } = req.body;

    await query(
        `INSERT INTO employee_identities
            (employee_id, no_ktp, no_npwp, no_bpjs_kesehatan, no_bpjs_ketenagakerjaan, no_rekening, nama_bank, nama_rekening,
             is_foreign, no_passport)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (employee_id) DO UPDATE SET
            no_ktp                  = EXCLUDED.no_ktp,
            no_npwp                 = EXCLUDED.no_npwp,
            no_bpjs_kesehatan       = EXCLUDED.no_bpjs_kesehatan,
            no_bpjs_ketenagakerjaan = EXCLUDED.no_bpjs_ketenagakerjaan,
            no_rekening             = EXCLUDED.no_rekening,
            nama_bank               = EXCLUDED.nama_bank,
            nama_rekening           = EXCLUDED.nama_rekening,
            is_foreign              = EXCLUDED.is_foreign,
            no_passport             = EXCLUDED.no_passport,
            updated_at              = NOW()`,
        [empId, no_ktp || null, no_npwp || null, no_bpjs_kesehatan || null, no_bpjs_ketenagakerjaan || null,
         no_rekening || null, nama_bank || null, nama_rekening || null,
         is_foreign === true || is_foreign === 'true' || false,
         no_passport?.trim() || null]
    );

    res.json({ message: 'Data identitas disimpan' });
}));

// ─── POST /api/hr/karyawan/:uuid/jobs ───────────────────────────────────────
router.post('/:uuid/jobs', requirePermission('hr:edit'), asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const empRes = await query(
        `SELECT id, user_id FROM employees WHERE uuid = $1 AND company_uuid = $2`,
        [req.params.uuid, companyUuid]
    );
    if (empRes.rows.length === 0) return res.status(404).json({ error: 'Karyawan tidak ditemukan' });
    const { id: empId, user_id: empUserId } = empRes.rows[0];

    const { jabatan, departemen, divisi, branch_id, jenis_karyawan, tanggal_mulai,
            gaji_pokok, keterangan, role_uuid, sync_user_role } = req.body;
    if (!tanggal_mulai) return res.status(400).json({ error: 'Tanggal mulai wajib diisi' });

    // Resolve role_uuid -> role_id jika ada
    let roleId = null;
    if (role_uuid) {
        const roleRes = await query(
            `SELECT id FROM roles WHERE uuid = $1 AND company_uuid = $2`,
            [role_uuid, companyUuid]
        );
        if (roleRes.rows.length > 0) roleId = roleRes.rows[0].id;
    }

    // Tutup jabatan yang sedang aktif
    await query(
        `UPDATE employee_jobs SET is_current = FALSE, tanggal_selesai = $1 WHERE employee_id = $2 AND is_current = TRUE`,
        [tanggal_mulai, empId]
    );

    const result = await query(
        `INSERT INTO employee_jobs
            (employee_id, jabatan, departemen, divisi, branch_id, jenis_karyawan,
             tanggal_mulai, gaji_pokok, is_current, keterangan, role_id, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE,$9,$10,$11)
         RETURNING *`,
        [empId, jabatan?.trim() || null, departemen?.trim() || null, divisi?.trim() || null,
            branch_id || null, jenis_karyawan || null, tanggal_mulai, gaji_pokok || 0,
            keterangan?.trim() || null, roleId, req.user.name]
    );

    // Sync role ke user account jika diminta dan karyawan punya akun
    if (sync_user_role && roleId && empUserId) {
        await query(`DELETE FROM user_roles WHERE user_id = $1`, [empUserId]);
        await query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`, [empUserId, roleId]);
    }

    res.status(201).json(result.rows[0]);
}));

// ─── PUT /api/hr/karyawan/:uuid/jobs/:jobId ─────────────────────────────────
router.put('/:uuid/jobs/:jobId', requirePermission('hr:edit'), asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const empRes = await query(
        `SELECT id, user_id FROM employees WHERE uuid = $1 AND company_uuid = $2`,
        [req.params.uuid, companyUuid]
    );
    if (empRes.rows.length === 0) return res.status(404).json({ error: 'Karyawan tidak ditemukan' });
    const { id: empId, user_id: empUserId } = empRes.rows[0];

    const { jabatan, departemen, divisi, branch_id, jenis_karyawan, tanggal_mulai,
            tanggal_selesai, gaji_pokok, keterangan, role_uuid, sync_user_role } = req.body;

    // Resolve role_uuid -> role_id jika ada
    let roleId = null;
    if (role_uuid) {
        const roleRes = await query(
            `SELECT id FROM roles WHERE uuid = $1 AND company_uuid = $2`,
            [role_uuid, companyUuid]
        );
        if (roleRes.rows.length > 0) roleId = roleRes.rows[0].id;
    }

    await query(
        `UPDATE employee_jobs SET
            jabatan = $1, departemen = $2, divisi = $3, branch_id = $4,
            jenis_karyawan = $5, tanggal_mulai = $6, tanggal_selesai = $7,
            gaji_pokok = $8, keterangan = $9, role_id = $10
         WHERE id = $11 AND employee_id = $12`,
        [jabatan?.trim() || null, departemen?.trim() || null, divisi?.trim() || null, branch_id || null,
        jenis_karyawan || null, tanggal_mulai || null, tanggal_selesai || null,
        gaji_pokok || 0, keterangan?.trim() || null, roleId, req.params.jobId, empId]
    );

    // Sync role ke user account jika diminta dan karyawan punya akun
    if (sync_user_role && roleId && empUserId) {
        await query(`DELETE FROM user_roles WHERE user_id = $1`, [empUserId]);
        await query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`, [empUserId, roleId]);
    }

    res.json({ message: 'Riwayat jabatan diperbarui' });
}));

// ─── POST /api/hr/karyawan/:uuid/family ─────────────────────────────────────
router.post('/:uuid/family', requirePermission('hr:edit'), asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const empRes = await query(
        `SELECT id FROM employees WHERE uuid = $1 AND company_uuid = $2`,
        [req.params.uuid, companyUuid]
    );
    if (empRes.rows.length === 0) return res.status(404).json({ error: 'Karyawan tidak ditemukan' });
    const empId = empRes.rows[0].id;

    const { nama, hubungan, tanggal_lahir, is_tanggungan } = req.body;
    if (!nama?.trim() || !hubungan) return res.status(400).json({ error: 'Nama dan hubungan wajib diisi' });

    const result = await query(
        `INSERT INTO employee_family (employee_id, nama, hubungan, tanggal_lahir, is_tanggungan)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [empId, nama.trim(), hubungan, tanggal_lahir || null, is_tanggungan || false]
    );

    res.status(201).json(result.rows[0]);
}));

// ─── PUT /api/hr/karyawan/:uuid/family/:famId ────────────────────────────────
router.put('/:uuid/family/:famId', requirePermission('hr:edit'), asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const empRes = await query(
        `SELECT id FROM employees WHERE uuid = $1 AND company_uuid = $2`,
        [req.params.uuid, companyUuid]
    );
    if (empRes.rows.length === 0) return res.status(404).json({ error: 'Karyawan tidak ditemukan' });
    const empId = empRes.rows[0].id;

    const { nama, hubungan, tanggal_lahir, is_tanggungan } = req.body;
    if (!nama?.trim() || !hubungan) return res.status(400).json({ error: 'Nama dan hubungan wajib diisi' });

    const result = await query(
        `UPDATE employee_family
         SET nama = $1, hubungan = $2, tanggal_lahir = $3, is_tanggungan = $4
         WHERE id = $5 AND employee_id = $6
         RETURNING *`,
        [nama.trim(), hubungan, tanggal_lahir || null, is_tanggungan || false, req.params.famId, empId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Data keluarga tidak ditemukan' });

    res.json(result.rows[0]);
}));

// ─── DELETE /api/hr/karyawan/:uuid/family/:famId ────────────────────────────
router.delete('/:uuid/family/:famId', requirePermission('hr:edit'), asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const empRes = await query(
        `SELECT id FROM employees WHERE uuid = $1 AND company_uuid = $2`,
        [req.params.uuid, companyUuid]
    );
    if (empRes.rows.length === 0) return res.status(404).json({ error: 'Karyawan tidak ditemukan' });
    const empId = empRes.rows[0].id;

    await query(`DELETE FROM employee_family WHERE id = $1 AND employee_id = $2`, [req.params.famId, empId]);
    res.json({ message: 'Anggota keluarga dihapus' });
}));

// ─── POST /api/hr/karyawan/:uuid/documents ──────────────────────────────────
router.post('/:uuid/documents', requirePermission('hr:edit'), uploadDoc.single('file'), asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const empRes = await query(
        `SELECT e.id, e.company_uuid
         FROM employees e
         WHERE e.uuid = $1 AND e.company_uuid = $2`,
        [req.params.uuid, companyUuid]
    );
    if (empRes.rows.length === 0) return res.status(404).json({ error: 'Karyawan tidak ditemukan' });
    const { id: empId, company_uuid } = empRes.rows[0];

    const { jenis_dokumen, nomor_dokumen, tanggal_terbit, tanggal_kadaluarsa, catatan } = req.body;
    if (!jenis_dokumen) return res.status(400).json({ error: 'Jenis dokumen wajib diisi' });

    let file_url = null, file_name = null, file_size = null;
    if (req.file) {
        const docDir = path.join(UPLOAD_DIR, company_uuid, 'karyawan', req.params.uuid, 'docs');
        if (!fs.existsSync(docDir)) fs.mkdirSync(docDir, { recursive: true });

        const ts = Date.now();
        const safeName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
        const filename = `${ts}_${safeName}`;
        fs.writeFileSync(path.join(docDir, filename), req.file.buffer);

        file_url = `/uploadedImage/${company_uuid}/karyawan/${req.params.uuid}/docs/${filename}`;
        file_name = req.file.originalname;
        file_size = req.file.size;
    }

    const result = await query(
        `INSERT INTO employee_documents
            (employee_id, jenis_dokumen, nomor_dokumen, file_url, file_name, file_size,
             tanggal_terbit, tanggal_kadaluarsa, catatan, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING *`,
        [empId, jenis_dokumen, nomor_dokumen || null, file_url, file_name, file_size,
            tanggal_terbit || null, tanggal_kadaluarsa || null, catatan?.trim() || null, req.user.name]
    );

    res.status(201).json(result.rows[0]);
}));

// ─── DELETE /api/hr/karyawan/:uuid/documents/:docId ─────────────────────────
router.delete('/:uuid/documents/:docId', requirePermission('hr:edit'), asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const empRes = await query(
        `SELECT id FROM employees WHERE uuid = $1 AND company_uuid = $2`,
        [req.params.uuid, companyUuid]
    );
    if (empRes.rows.length === 0) return res.status(404).json({ error: 'Karyawan tidak ditemukan' });
    const empId = empRes.rows[0].id;

    const docRes = await query(
        `SELECT file_url FROM employee_documents WHERE uuid = $1 AND employee_id = $2`,
        [req.params.docId, empId]
    );
    if (docRes.rows.length === 0) return res.status(404).json({ error: 'Dokumen tidak ditemukan' });

    const { file_url } = docRes.rows[0];
    if (file_url) {
        const filePath = path.join(UPLOAD_DIR, file_url.replace(/^\/uploadedImage\//, ''));
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    await query(`DELETE FROM employee_documents WHERE uuid = $1 AND employee_id = $2`, [req.params.docId, empId]);
    res.json({ message: 'Dokumen dihapus' });
}));


// =============================================================================
// INTEGRASI HR <-> USERS
// =============================================================================

// ─── POST /api/hr/karyawan/:uuid/create-user-account ────────────────────────
// Buat akun login baru dari email_kerja karyawan.
// Jika ada user nonaktif dengan email sama, akan di-reaktivasi (bukan buat baru).
// Password default = NIK karyawan.
router.post('/:uuid/create-user-account', requirePermission('hr:edit'), asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;

    const empRes = await query(
        `SELECT e.id, e.nik, e.nama_lengkap, e.email_kerja, e.user_id, e.branch_id
         FROM employees e
         WHERE e.uuid = $1 AND e.company_uuid = $2`,
        [req.params.uuid, companyUuid]
    );
    if (empRes.rows.length === 0) return res.status(404).json({ error: 'Karyawan tidak ditemukan' });
    const emp = empRes.rows[0];

    if (emp.user_id) return res.status(409).json({ error: 'Karyawan sudah memiliki akun login' });
    if (!emp.email_kerja) return res.status(400).json({ error: 'Email kerja belum diisi. Isi email kerja karyawan terlebih dahulu.' });

    // Ambil role dari jabatan aktif
    const jobRes = await query(
        `SELECT ej.role_id, r.uuid AS role_uuid
         FROM employee_jobs ej
         LEFT JOIN roles r ON ej.role_id = r.id
         WHERE ej.employee_id = $1 AND ej.is_current = TRUE`,
        [emp.id]
    );
    const currentJob = jobRes.rows[0] || null;

    // Cek apakah ada user lama dengan email sama (mungkin nonaktif)
    const existingUser = await query(
        `SELECT id, uuid, name, email, is_active FROM users WHERE email = $1`,
        [emp.email_kerja.trim()]
    );

    let userId, userUuid, isReactivated = false;

    if (existingUser.rows.length > 0) {
        // Re-aktivasi akun lama + sync nama ke nama karyawan
        const oldUser = existingUser.rows[0];
        const nameChanged = oldUser.name !== emp.nama_lengkap;
        await query(
            `UPDATE users SET is_active = TRUE, name = $1, updated_at = NOW() WHERE id = $2`,
            [emp.nama_lengkap, oldUser.id]
        );
        userId = oldUser.id;
        userUuid = oldUser.uuid;
        isReactivated = true;
        // Simpan nama lama untuk audit trail
        if (nameChanged) {
            await query(
                `INSERT INTO audit_trail (action, module, description, user_id, user_name, company_uuid)
                 VALUES ('update', 'settings', $1, $2, $3, $4)`,
                [
                    `Nama akun login diubah dari "${oldUser.name}" menjadi "${emp.nama_lengkap}" (sinkronisasi dari data karyawan ${emp.nik})`,
                    req.user.id, req.user.name, companyUuid
                ]
            ).catch(() => {});
        }
    } else {
        // Buat user baru
        const baseUsername = emp.email_kerja.trim().split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '_');
        let username = baseUsername;
        let suffix = 1;
        while ((await query(`SELECT id FROM users WHERE username = $1`, [username])).rows.length > 0) {
            username = `${baseUsername}_${suffix++}`;
        }
        const hash = await bcrypt.hash(emp.nik, bcryptRounds);
        const newUserRes = await query(
            `INSERT INTO users (username, password_hash, name, email, is_active)
             VALUES ($1, $2, $3, $4, TRUE)
             RETURNING id, uuid`,
            [username, hash, emp.nama_lengkap, emp.email_kerja.trim()]
        );
        userId = newUserRes.rows[0].id;
        userUuid = newUserRes.rows[0].uuid;
    }

    // Assign ke company
    await query(
        `INSERT INTO user_companies (user_id, company_id)
         SELECT $1, id FROM companies WHERE uuid = $2
         ON CONFLICT DO NOTHING`,
        [userId, companyUuid]
    );

    // Assign ke branch karyawan
    if (emp.branch_id) {
        await query(
            `INSERT INTO user_branches (user_id, branch_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [userId, emp.branch_id]
        );
    }

    // Assign role dari jabatan aktif
    if (currentJob?.role_id) {
        await query(`DELETE FROM user_roles WHERE user_id = $1`, [userId]);
        await query(
            `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [userId, currentJob.role_id]
        );
    }

    // Link ke karyawan
    await query(
        `UPDATE employees SET user_id = $1, updated_at = NOW() WHERE id = $2`,
        [userId, emp.id]
    );

    const action = isReactivated ? 'Re-aktivasi' : 'Buat';
    const roleName = currentJob ? (await query(`SELECT name FROM roles WHERE id = $1`, [currentJob.role_id])).rows[0]?.name : null;
    await query(
        `INSERT INTO audit_trail (action, module, description, user_id, user_name, company_uuid)
         VALUES ('create', 'hr', $1, $2, $3, $4)`,
        [
            `${action} akun login untuk karyawan: ${emp.nama_lengkap} (${emp.nik}) -- email: ${emp.email_kerja}${roleName ? `, role: ${roleName}` : ''}`,
            req.user.id, req.user.name, companyUuid
        ]
    ).catch(() => {});

    res.status(201).json({
        message: isReactivated ? 'Akun lama berhasil diaktifkan kembali dan dihubungkan' : 'Akun login berhasil dibuat',
        user_uuid: userUuid,
        email: emp.email_kerja,
        is_reactivated: isReactivated,
        temp_password: isReactivated ? null : emp.nik,
    });
}));

// ─── POST /api/hr/karyawan/:uuid/link-existing-user ─────────────────────────
// Hubungkan karyawan ke akun user yang sudah ada (misal Admin IT dari setup company).
router.post('/:uuid/link-existing-user', requirePermission('hr:edit'), asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const { user_uuid } = req.body;
    if (!user_uuid) return res.status(400).json({ error: 'user_uuid diperlukan' });

    const empRes = await query(
        `SELECT id, nik, nama_lengkap, email_kerja, user_id FROM employees WHERE uuid = $1 AND company_uuid = $2`,
        [req.params.uuid, companyUuid]
    );
    if (empRes.rows.length === 0) return res.status(404).json({ error: 'Karyawan tidak ditemukan' });
    const emp = empRes.rows[0];
    if (emp.user_id) return res.status(409).json({ error: 'Karyawan sudah memiliki akun login. Putuskan link terlebih dahulu.' });

    // Cari user target (harus dari company yang sama, bukan super admin)
    const userRes = await query(
        `SELECT u.id, u.uuid, u.name, u.email FROM users u
         JOIN user_companies uc ON u.id = uc.user_id
         JOIN companies c ON c.id = uc.company_id AND c.uuid = $1
         WHERE u.uuid = $2 AND u.is_super_admin = FALSE`,
        [companyUuid, user_uuid]
    );
    if (userRes.rows.length === 0) return res.status(404).json({ error: 'User tidak ditemukan atau bukan anggota company ini' });
    const targetUser = userRes.rows[0];

    // Pastikan user belum dilink ke karyawan lain
    const alreadyLinked = await query(
        `SELECT uuid FROM employees WHERE user_id = $1`,
        [targetUser.id]
    );
    if (alreadyLinked.rows.length > 0) {
        return res.status(409).json({ error: 'User ini sudah terhubung ke karyawan lain' });
    }

    // Aktifkan kembali akun user (bisa saja nonaktif karena pernah di-unlink sebelumnya)
    await query(
        `UPDATE users SET is_active = TRUE, updated_at = NOW() WHERE id = $1`,
        [targetUser.id]
    );

    await query(
        `UPDATE employees SET user_id = $1, updated_at = NOW() WHERE id = $2`,
        [targetUser.id, emp.id]
    );

    // Sync nama user ke nama karyawan jika berbeda
    const nameChanged = targetUser.name !== emp.nama_lengkap;
    if (nameChanged) {
        await query(
            `UPDATE users SET name = $1, updated_at = NOW() WHERE id = $2`,
            [emp.nama_lengkap, targetUser.id]
        );
    }

    const auditDesc = nameChanged
        ? `Hubungkan karyawan ${emp.nama_lengkap} (${emp.nik}) ke akun existing: ${targetUser.email} -- nama diubah: "${targetUser.name}" -> "${emp.nama_lengkap}"`
        : `Hubungkan karyawan ${emp.nama_lengkap} (${emp.nik}) ke akun existing: ${targetUser.email}`;

    await query(
        `INSERT INTO audit_trail (action, module, description, user_id, user_name, company_uuid)
         VALUES ('update', 'hr', $1, $2, $3, $4)`,
        [auditDesc, req.user.id, req.user.name, companyUuid]
    ).catch(() => {});

    if (nameChanged) {
        await query(
            `INSERT INTO audit_trail (action, module, description, user_id, user_name, company_uuid)
             VALUES ('update', 'settings', $1, $2, $3, $4)`,
            [
                `Nama akun login diubah dari "${targetUser.name}" menjadi "${emp.nama_lengkap}" (sinkronisasi dari data karyawan ${emp.nik})`,
                req.user.id, req.user.name, companyUuid
            ]
        ).catch(() => {});
    }

    res.json({
        message: `Karyawan berhasil dihubungkan ke akun ${targetUser.email}`,
        user_uuid: targetUser.uuid,
        email: targetUser.email,
        name_synced: nameChanged,
        new_name: emp.nama_lengkap,
    });
}));

// ─── POST /api/hr/karyawan/:uuid/unlink-user ─────────────────────────────────
// Putuskan link karyawan dari akun user + nonaktifkan akun tersebut.
router.post('/:uuid/unlink-user', requirePermission('hr:edit'), asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;

    const empRes = await query(
        `SELECT e.id, e.nik, e.nama_lengkap, e.user_id,
                u.uuid AS user_uuid, u.email AS user_email
         FROM employees e
         LEFT JOIN users u ON e.user_id = u.id
         WHERE e.uuid = $1 AND e.company_uuid = $2`,
        [req.params.uuid, companyUuid]
    );
    if (empRes.rows.length === 0) return res.status(404).json({ error: 'Karyawan tidak ditemukan' });
    const emp = empRes.rows[0];
    if (!emp.user_id) return res.status(400).json({ error: 'Karyawan tidak memiliki akun login yang terhubung' });

    // Nonaktifkan akun user
    await query(
        `UPDATE users SET is_active = FALSE, updated_at = NOW() WHERE id = $1`,
        [emp.user_id]
    );

    // Putuskan link
    await query(
        `UPDATE employees SET user_id = NULL, updated_at = NOW() WHERE id = $1`,
        [emp.id]
    );

    await query(
        `INSERT INTO audit_trail (action, module, description, user_id, user_name, company_uuid)
         VALUES ('update', 'hr', $1, $2, $3, $4)`,
        [
            `Putuskan link karyawan: ${emp.nama_lengkap} (${emp.nik}) -- akun ${emp.user_email} dinonaktifkan`,
            req.user.id, req.user.name, companyUuid
        ]
    ).catch(() => {});

    res.json({
        message: `Akun ${emp.user_email} diputuskan dan dinonaktifkan`,
        user_uuid: emp.user_uuid,
    });
}));


// =============================================================================
// PPh 21 HELPER — Kalkulasi otomatis (UU HPP 2021 + PMK 101/2016)
// =============================================================================

/**
 * Hitung PPh 21 per bulan.
 * @param {object} p
 * @param {number} p.gajiPokok         - Gaji pokok per bulan (Rp)
 * @param {string} p.ptkpStatus        - Kode PTKP: 'TK/0', 'K/1', dll.
 * @param {boolean} p.jpAktif          - Apakah JP (Jaminan Pensiun) aktif
 * @param {number}  p.jpPersen         - Tarif iuran JP karyawan (%)
 * @param {string}  p.pph21Mode        - Mode perhitungan: 'auto' | 'ter' | 'manual'
 * @returns {{ pph21Bulanan, detail }}
 */
function hitungPPh21({ gajiPokok, ptkpStatus, jpAktif, jpPersen, pph21Mode = 'auto' }) {
    const brutoTahunan = (parseFloat(gajiPokok) || 0) * 12;

    if (pph21Mode === 'ter') {
        const { getRateTER } = require('./ter');
        const brutoBulanan = parseFloat(gajiPokok) || 0;
        const ter = getRateTER(ptkpStatus, brutoBulanan);
        let pph21Bulanan = Math.round(brutoBulanan * ter.rate);
        
        // Aturan PMK 168: Jika tarif 0%, nominal PPh 21 adalah 0.
        if (ter.rate === 0) pph21Bulanan = 0;

        const pajakTahunan = pph21Bulanan * 12;
        return {
            pph21Bulanan,
            detail: {
                gaji_pokok:        brutoBulanan,
                bruto_tahunan:     brutoTahunan,
                biaya_jabatan:     0,
                iuran_pensiun:     0,
                neto_tahunan:      0,
                ptkp_nilai:        0,
                ptkp_status:       ptkpStatus,
                pkp:               0,
                pajak_tahunan:     pajakTahunan,
                pph21_bulanan:     pph21Bulanan,
                brackets:          [
                    { batas: null, rate: ter.rate, kena: brutoBulanan, pajak: pph21Bulanan }
                ],
                ter_kategori:      ter.kategori,
                ter_rate:          ter.rate 
            },
        };
    }
    const PTKP_TABLE = {
        'TK/0':   54_000_000, 'TK/1':   58_500_000,
        'TK/2':   63_000_000, 'TK/3':   67_500_000,
        'K/0':    58_500_000, 'K/1':    63_000_000,
        'K/2':    67_500_000, 'K/3':    72_000_000,
        'K/I/0': 112_500_000, 'K/I/1': 117_000_000,
        'K/I/2': 121_500_000, 'K/I/3': 126_000_000,
    };

    const ptkpNilai      = PTKP_TABLE[ptkpStatus] ?? PTKP_TABLE['TK/0'];
    const biayaJabatan   = Math.min(brutoTahunan * 0.05, 6_000_000);

    // Pengurang iuran pensiun (JP) — ambil otomatis dari setting
    const iuranJPTahunan = jpAktif
        ? (parseFloat(gajiPokok) || 0) * (parseFloat(jpPersen) || 0) / 100 * 12
        : 0;

    const netoTahunan    = brutoTahunan - biayaJabatan - iuranJPTahunan;
    // PKP dibulatkan ke ribuan ke bawah (sesuai ketentuan DJP)
    const pkp            = Math.max(0, Math.floor((netoTahunan - ptkpNilai) / 1000) * 1000);

    // Tarif progresif Pasal 17 UU HPP (berlaku 1 Jan 2022)
    const BRACKETS = [
        [60_000_000,    0.05],
        [190_000_000,   0.15],
        [250_000_000,   0.25],
        [4_500_000_000, 0.30],
        [Infinity,      0.35],
    ];

    let pajakTahunan = 0;
    let sisa = pkp;
    const rincianBracket = [];
    for (const [limit, rate] of BRACKETS) {
        if (sisa <= 0) break;
        const kena = Math.min(sisa, limit);
        const pajak = Math.round(kena * rate);
        pajakTahunan += pajak;
        rincianBracket.push({ batas: limit === Infinity ? null : limit, rate, kena, pajak });
        sisa -= kena;
    }

    const pph21Bulanan = Math.round(pajakTahunan / 12);

    return {
        pph21Bulanan,
        detail: {
            gaji_pokok:        parseFloat(gajiPokok) || 0,
            bruto_tahunan:     brutoTahunan,
            biaya_jabatan:     biayaJabatan,
            iuran_pensiun:     iuranJPTahunan,
            neto_tahunan:      netoTahunan,
            ptkp_nilai:        ptkpNilai,
            ptkp_status:       ptkpStatus,
            pkp:               pkp,
            pajak_tahunan:     pajakTahunan,
            pph21_bulanan:     pph21Bulanan,
            brackets:          rincianBracket,
        },
    };
}

// =============================================================================
// PAYROLL SETTINGS (potongan otomatis per karyawan)
// =============================================================================

// GET /api/hr/karyawan/:uuid/payroll-settings
router.get('/:uuid/payroll-settings', requirePermission('hr:view'), asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;

    const empRes = await query(
        `SELECT id FROM employees WHERE uuid = $1 AND company_uuid = $2`,
        [req.params.uuid, companyUuid]
    );
    if (!empRes.rows.length) return res.status(404).json({ error: 'Karyawan tidak ditemukan' });
    const empId = empRes.rows[0].id;

    const settRes = await query(
        `SELECT * FROM employee_payroll_settings WHERE employee_id = $1`,
        [empId]
    );

    // Jika belum ada row, kembalikan default values
    if (!settRes.rows.length) {
        const defaults = {
            employee_id:     empId,
            bpjs_kes_aktif: false, bpjs_kes_persen: 1.00,
            jht_aktif: false,      jht_persen: 2.00,
            jkk_aktif: false,      jkk_persen: 0.24,
            jkm_aktif: false,      jkm_persen: 0.30,
            jp_aktif: false,       jp_persen: 1.00,
            pph21_aktif: false,    pph21_nominal: 0,
            ptkp_status: 'TK/0',   pph21_mode: 'manual',
        };
        // Sertakan pph21_auto untuk referensi (meski gaji belum diketahui = 0)
        const calc = hitungPPh21({ gajiPokok: 0, ptkpStatus: 'TK/0', jpAktif: false, jpPersen: 0, pph21Mode: 'auto' });
        return res.json({ ...defaults, pph21_auto: calc.pph21Bulanan, pph21_detail: calc.detail });
    }

    // Hitung PPh 21 otomatis berdasarkan gaji pokok karyawan
    const jobRes = await query(
        `SELECT gaji_pokok FROM employee_jobs WHERE employee_id = $1 AND is_current = TRUE`,
        [empId]
    );
    const gajiPokok = parseFloat(jobRes.rows[0]?.gaji_pokok || 0);
    const s = settRes.rows[0];

    const calc = hitungPPh21({
        gajiPokok,
        ptkpStatus: s.ptkp_status || 'TK/0',
        jpAktif:    !!s.jp_aktif,
        jpPersen:   parseFloat(s.jp_persen) || 0,
        pph21Mode:  s.pph21_mode || 'auto',
    });

    res.json({
        ...s,
        pph21_auto:   calc.pph21Bulanan,
        pph21_detail: calc.detail,
    });
}));

// PUT /api/hr/karyawan/:uuid/payroll-settings
router.put('/:uuid/payroll-settings', requirePermission('hr:edit'), asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;

    const empRes = await query(
        `SELECT id FROM employees WHERE uuid = $1 AND company_uuid = $2`,
        [req.params.uuid, companyUuid]
    );
    if (!empRes.rows.length) return res.status(404).json({ error: 'Karyawan tidak ditemukan' });
    const empId = empRes.rows[0].id;

    const {
        bpjs_kes_aktif, bpjs_kes_persen,
        jht_aktif, jht_persen,
        jkk_aktif, jkk_persen,
        jkm_aktif, jkm_persen,
        jp_aktif, jp_persen,
        pph21_aktif, pph21_nominal,
        ptkp_status, pph21_mode,
    } = req.body;

    // Jika mode auto, hitung ulang pph21_nominal dari kalkulasi otomatis
    let finalPph21Nominal = parseFloat(pph21_nominal) || 0;
    const mode = ['auto', 'ter'].includes(pph21_mode) ? pph21_mode : 'manual';
    if (mode === 'auto' || mode === 'ter') {
        const jobRes = await query(
            `SELECT gaji_pokok FROM employee_jobs WHERE employee_id = $1 AND is_current = TRUE`,
            [empId]
        );
        const gajiPokok = parseFloat(jobRes.rows[0]?.gaji_pokok || 0);
        const calc = hitungPPh21({
            gajiPokok,
            ptkpStatus: ptkp_status || 'TK/0',
            jpAktif:    !!jp_aktif,
            jpPersen:   parseFloat(jp_persen) || 0,
            pph21Mode:  mode,
        });
        finalPph21Nominal = calc.pph21Bulanan;
    }

    await query(
        `INSERT INTO employee_payroll_settings
            (employee_id,
             bpjs_kes_aktif, bpjs_kes_persen,
             jht_aktif, jht_persen,
             jkk_aktif, jkk_persen,
             jkm_aktif, jkm_persen,
             jp_aktif, jp_persen,
             pph21_aktif, pph21_nominal,
             ptkp_status, pph21_mode,
             updated_by, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW())
         ON CONFLICT (employee_id) DO UPDATE SET
            bpjs_kes_aktif  = EXCLUDED.bpjs_kes_aktif,
            bpjs_kes_persen = EXCLUDED.bpjs_kes_persen,
            jht_aktif       = EXCLUDED.jht_aktif,
            jht_persen      = EXCLUDED.jht_persen,
            jkk_aktif       = EXCLUDED.jkk_aktif,
            jkk_persen      = EXCLUDED.jkk_persen,
            jkm_aktif       = EXCLUDED.jkm_aktif,
            jkm_persen      = EXCLUDED.jkm_persen,
            jp_aktif        = EXCLUDED.jp_aktif,
            jp_persen       = EXCLUDED.jp_persen,
            pph21_aktif     = EXCLUDED.pph21_aktif,
            pph21_nominal   = EXCLUDED.pph21_nominal,
            ptkp_status     = EXCLUDED.ptkp_status,
            pph21_mode      = EXCLUDED.pph21_mode,
            updated_by      = EXCLUDED.updated_by,
            updated_at      = NOW()`,
        [
            empId,
            !!bpjs_kes_aktif, parseFloat(bpjs_kes_persen) || 1.00,
            !!jht_aktif,      parseFloat(jht_persen) || 2.00,
            !!jkk_aktif,      parseFloat(jkk_persen) || 0.24,
            !!jkm_aktif,      parseFloat(jkm_persen) || 0.30,
            !!jp_aktif,       parseFloat(jp_persen) || 1.00,
            !!pph21_aktif,    finalPph21Nominal,
            ptkp_status || 'TK/0',
            mode,
            req.user.name,
        ]
    );

    res.json({ message: 'Setting payroll karyawan berhasil disimpan', pph21_nominal: finalPph21Nominal });
}));

// GET /api/hr/karyawan/:uuid/pph21-preview — real-time kalkulasi PPh 21
router.get('/:uuid/pph21-preview', requirePermission('hr:view'), asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;

    const empRes = await query(
        `SELECT e.id, ej.gaji_pokok
         FROM employees e
         LEFT JOIN employee_jobs ej ON ej.employee_id = e.id AND ej.is_current = TRUE
         WHERE e.uuid = $1 AND e.company_uuid = $2`,
        [req.params.uuid, companyUuid]
    );
    if (!empRes.rows.length) return res.status(404).json({ error: 'Karyawan tidak ditemukan' });

    const gajiPokok  = parseFloat(empRes.rows[0].gaji_pokok || 0);
    const ptkpStatus = req.query.ptkp_status || 'TK/0';
    const jpAktif    = req.query.jp_aktif === 'true';
    const jpPersen   = parseFloat(req.query.jp_persen || 0);
    const pph21Mode  = req.query.pph21_mode || 'auto';

    const calc = hitungPPh21({ gajiPokok, ptkpStatus, jpAktif, jpPersen, pph21Mode });

    res.json(calc);
}));


// =============================================================================
// CUSTOM POTONGAN OTOMATIS (per karyawan)
// =============================================================================

// GET /api/hr/karyawan/:uuid/custom-deductions
router.get('/:uuid/custom-deductions', requirePermission('hr:view'), asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const empRes = await query(
        `SELECT id FROM employees WHERE uuid = $1 AND company_uuid = $2`,
        [req.params.uuid, companyUuid]
    );
    if (!empRes.rows.length) return res.status(404).json({ error: 'Karyawan tidak ditemukan' });
    const empId = empRes.rows[0].id;

    const result = await query(
        `SELECT * FROM employee_payroll_custom_deductions
         WHERE employee_id = $1 ORDER BY urutan ASC, id ASC`,
        [empId]
    );
    res.json(result.rows);
}));

// POST /api/hr/karyawan/:uuid/custom-deductions
router.post('/:uuid/custom-deductions', requirePermission('hr:edit'), asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const empRes = await query(
        `SELECT id FROM employees WHERE uuid = $1 AND company_uuid = $2`,
        [req.params.uuid, companyUuid]
    );
    if (!empRes.rows.length) return res.status(404).json({ error: 'Karyawan tidak ditemukan' });
    const empId = empRes.rows[0].id;

    const { nama, tipe, nilai, aktif } = req.body;
    if (!nama?.trim()) return res.status(400).json({ error: 'Nama potongan wajib diisi' });
    if (!['nominal', 'persen'].includes(tipe)) return res.status(400).json({ error: 'Tipe harus "nominal" atau "persen"' });
    if (nilai === undefined || nilai === null || isNaN(parseFloat(nilai))) return res.status(400).json({ error: 'Nilai wajib diisi' });

    const result = await query(
        `INSERT INTO employee_payroll_custom_deductions
             (employee_id, nama, tipe, nilai, aktif, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [empId, nama.trim(), tipe, parseFloat(nilai), aktif !== false, req.user.name]
    );
    res.status(201).json(result.rows[0]);
}));

// PATCH /api/hr/karyawan/:uuid/custom-deductions/:id
router.patch('/:uuid/custom-deductions/:id', requirePermission('hr:edit'), asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const empRes = await query(
        `SELECT id FROM employees WHERE uuid = $1 AND company_uuid = $2`,
        [req.params.uuid, companyUuid]
    );
    if (!empRes.rows.length) return res.status(404).json({ error: 'Karyawan tidak ditemukan' });
    const empId = empRes.rows[0].id;

    const { nama, tipe, nilai, aktif } = req.body;
    if (!nama?.trim()) return res.status(400).json({ error: 'Nama potongan wajib diisi' });
    if (!['nominal', 'persen'].includes(tipe)) return res.status(400).json({ error: 'Tipe harus "nominal" atau "persen"' });

    const result = await query(
        `UPDATE employee_payroll_custom_deductions
         SET nama = $1, tipe = $2, nilai = $3, aktif = $4, updated_at = NOW()
         WHERE id = $5 AND employee_id = $6
         RETURNING *`,
        [nama.trim(), tipe, parseFloat(nilai), aktif !== false, req.params.id, empId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Item tidak ditemukan' });
    res.json(result.rows[0]);
}));

// DELETE /api/hr/karyawan/:uuid/custom-deductions/:id
router.delete('/:uuid/custom-deductions/:id', requirePermission('hr:edit'), asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const empRes = await query(
        `SELECT id FROM employees WHERE uuid = $1 AND company_uuid = $2`,
        [req.params.uuid, companyUuid]
    );
    if (!empRes.rows.length) return res.status(404).json({ error: 'Karyawan tidak ditemukan' });
    const empId = empRes.rows[0].id;

    await query(
        `DELETE FROM employee_payroll_custom_deductions WHERE id = $1 AND employee_id = $2`,
        [req.params.id, empId]
    );
    res.json({ message: 'Potongan custom dihapus' });
}));


// =============================================================================
// CUSTOM TUNJANGAN OTOMATIS (per karyawan)
// =============================================================================

// GET /api/hr/karyawan/:uuid/custom-allowances
router.get('/:uuid/custom-allowances', requirePermission('hr:view'), asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const empRes = await query(
        `SELECT id FROM employees WHERE uuid = $1 AND company_uuid = $2`,
        [req.params.uuid, companyUuid]
    );
    if (!empRes.rows.length) return res.status(404).json({ error: 'Karyawan tidak ditemukan' });
    const empId = empRes.rows[0].id;

    const result = await query(
        `SELECT * FROM employee_payroll_custom_allowances
         WHERE employee_id = $1 ORDER BY urutan ASC, id ASC`,
        [empId]
    );
    res.json(result.rows);
}));

// POST /api/hr/karyawan/:uuid/custom-allowances
router.post('/:uuid/custom-allowances', requirePermission('hr:edit'), asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const empRes = await query(
        `SELECT id FROM employees WHERE uuid = $1 AND company_uuid = $2`,
        [req.params.uuid, companyUuid]
    );
    if (!empRes.rows.length) return res.status(404).json({ error: 'Karyawan tidak ditemukan' });
    const empId = empRes.rows[0].id;

    const { nama, tipe, nilai, aktif } = req.body;
    if (!nama?.trim()) return res.status(400).json({ error: 'Nama tunjangan wajib diisi' });
    if (!['nominal', 'persen'].includes(tipe)) return res.status(400).json({ error: 'Tipe harus "nominal" atau "persen"' });
    if (nilai === undefined || nilai === null || isNaN(parseFloat(nilai))) return res.status(400).json({ error: 'Nilai wajib diisi' });

    const result = await query(
        `INSERT INTO employee_payroll_custom_allowances
             (employee_id, nama, tipe, nilai, aktif, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [empId, nama.trim(), tipe, parseFloat(nilai), aktif !== false, req.user.name]
    );
    res.status(201).json(result.rows[0]);
}));

// PATCH /api/hr/karyawan/:uuid/custom-allowances/:id
router.patch('/:uuid/custom-allowances/:id', requirePermission('hr:edit'), asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const empRes = await query(
        `SELECT id FROM employees WHERE uuid = $1 AND company_uuid = $2`,
        [req.params.uuid, companyUuid]
    );
    if (!empRes.rows.length) return res.status(404).json({ error: 'Karyawan tidak ditemukan' });
    const empId = empRes.rows[0].id;

    const { nama, tipe, nilai, aktif } = req.body;
    if (!nama?.trim()) return res.status(400).json({ error: 'Nama tunjangan wajib diisi' });
    if (!['nominal', 'persen'].includes(tipe)) return res.status(400).json({ error: 'Tipe harus "nominal" atau "persen"' });

    const result = await query(
        `UPDATE employee_payroll_custom_allowances
         SET nama = $1, tipe = $2, nilai = $3, aktif = $4, updated_at = NOW()
         WHERE id = $5 AND employee_id = $6
         RETURNING *`,
        [nama.trim(), tipe, parseFloat(nilai), aktif !== false, req.params.id, empId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Item tidak ditemukan' });
    res.json(result.rows[0]);
}));

// DELETE /api/hr/karyawan/:uuid/custom-allowances/:id
router.delete('/:uuid/custom-allowances/:id', requirePermission('hr:edit'), asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const empRes = await query(
        `SELECT id FROM employees WHERE uuid = $1 AND company_uuid = $2`,
        [req.params.uuid, companyUuid]
    );
    if (!empRes.rows.length) return res.status(404).json({ error: 'Karyawan tidak ditemukan' });
    const empId = empRes.rows[0].id;

    await query(
        `DELETE FROM employee_payroll_custom_allowances WHERE id = $1 AND employee_id = $2`,
        [req.params.id, empId]
    );
    res.json({ message: 'Tunjangan custom dihapus' });
}));


module.exports = router;
