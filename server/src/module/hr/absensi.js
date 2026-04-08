/**
 * BE/src/module/hr/absensi.js
 * Endpoints untuk Sistem Absensi Karyawan.
 *
 * Endpoints:
 *   POST   /api/hr/absensi/clock-in                    - Karyawan clock-in
 *   POST   /api/hr/absensi/clock-out                   - Karyawan clock-out
 *   GET    /api/hr/absensi/today                       - Status absensi hari ini (user sendiri)
 *   GET    /api/hr/absensi/rekap                       - Rekap bulanan semua karyawan [HR]
 *   GET    /api/hr/absensi/rekap/:employee_uuid        - Rekap per karyawan [HR]
 *   GET    /api/hr/absensi/records                     - List record harian [HR]
 *   GET    /api/hr/absensi/shift-types                 - List tipe shift
 *   POST   /api/hr/absensi/shift-types                 - Tambah tipe shift [HR]
 *   PUT    /api/hr/absensi/shift-types/:id             - Edit tipe shift [HR]
 *   DELETE /api/hr/absensi/shift-types/:id             - Hapus tipe shift [HR]
 *   GET    /api/hr/absensi/schedules                   - Lihat jadwal shift karyawan terbaru [HR]
 *   POST   /api/hr/absensi/schedules                   - Assign jadwal shift ke karyawan [HR]
 *   DELETE /api/hr/absensi/schedules/:id               - Hapus jadwal shift [HR]
 */
const router = require('express').Router();
const { query } = require('../../config/db');
const { authenticateToken, requirePermission } = require('../../middleware/auth');
const { asyncHandler } = require('../../utils/helpers');

router.use(authenticateToken);

// ─── Helper: tanggal lokal server (YYYY-MM-DD) tanpa UTC drift ───────────────
// toISOString() selalu UTC → jam 00:00-06:59 WIB hasilnya masih tanggal kemarin.
// 'sv-SE' locale menggunakan format ISO date secara bawaan.
function localDateStr(date) {
    const d = date || new Date();
    return d.toLocaleDateString('sv-SE'); // 'YYYY-MM-DD' sesuai timezone OS/proses
}

// ─── Helper: hitung terlambat (menit) ────────────────────────────────────────
function hitungTerlambat(waktuMasuk, jamMasukShift, toleransiMenit) {
    if (!waktuMasuk || !jamMasukShift) return 0;

    const [h, m] = jamMasukShift.split(':').map(Number);
    const masukDate = new Date(waktuMasuk);
    const batasDate = new Date(masukDate);
    batasDate.setHours(h, m + (toleransiMenit || 0), 0, 0);

    const diff = masukDate - batasDate; // ms
    return diff > 0 ? Math.round(diff / 60000) : 0;
}

// ─── Helper: hitung pulang lebih awal (menit) ────────────────────────────────
function hitungPulangAwal(waktuPulang, jamPulangShift, isOvernight) {
    if (!waktuPulang || !jamPulangShift) return 0;

    const [h, m] = jamPulangShift.split(':').map(Number);
    const pulangDate = new Date(waktuPulang);
    const batas = new Date(pulangDate);
    batas.setHours(h, m, 0, 0);

    // Untuk shift malam (overnight), jam pulang bisa di hari berikutnya
    if (isOvernight && pulangDate.getHours() < h) {
        batas.setDate(batas.getDate() + 1);
    }

    const diff = batas - pulangDate; // ms, positif jika pulang lebih awal
    return diff > 0 ? Math.round(diff / 60000) : 0;
}

// ─── POST /api/hr/absensi/clock-in ───────────────────────────────────────────
router.post('/clock-in', asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const { lat, lon, lokasi_alamat } = req.body;

    const empRes = await query(
        `SELECT e.id, e.nama_lengkap FROM employees e
         WHERE (
           (e.user_id IS NOT NULL AND e.user_id = $3)
           OR (e.user_id IS NULL AND e.email_kerja = $1)
         )
         AND e.company_uuid = $2 AND e.is_active = TRUE
         LIMIT 1`,
        [req.user.email, companyUuid, req.user.id]
    );
    if (empRes.rows.length === 0) {
        return res.status(404).json({ error: 'Data karyawan tidak ditemukan untuk akun ini' });
    }
    const { id: employeeId, nama_lengkap } = empRes.rows[0];

    const today = localDateStr(); // YYYY-MM-DD sesuai timezone lokal

    // Cek apakah ada sesi yang masih aktif (belum clock-out)
    const activeSession = await query(
        `SELECT id FROM attendance_records
         WHERE employee_id = $1 AND tanggal = $2
           AND waktu_masuk IS NOT NULL AND waktu_pulang IS NULL`,
        [employeeId, today]
    );
    if (activeSession.rows.length > 0) {
        return res.status(400).json({ error: 'Anda masih dalam sesi aktif. Lakukan Clock Out terlebih dahulu.' });
    }

    // Hitung session_no berikutnya
    const sessionRes = await query(
        `SELECT COALESCE(MAX(session_no), 0) + 1 AS next_session
         FROM attendance_records WHERE employee_id = $1 AND tanggal = $2`,
        [employeeId, today]
    );
    const sessionNo = sessionRes.rows[0].next_session;

    // Cari shift aktif untuk karyawan hari ini
    const schedRes = await query(
        `SELECT es.shift_type_id, st.jam_masuk, st.jam_pulang, st.toleransi_menit, st.is_overnight, st.nama_shift
         FROM employee_schedules es
         JOIN shift_types st ON es.shift_type_id = st.id
         WHERE es.employee_id = $1 AND es.tanggal = $2`,
        [employeeId, today]
    );

    const now = new Date();
    let shiftTypeId = null;
    let terlambatMenit = 0;
    let status = 'hadir';

    if (schedRes.rows.length > 0) {
        const shift = schedRes.rows[0];
        shiftTypeId = shift.shift_type_id;
        // Hitung terlambat hanya untuk sesi pertama
        if (sessionNo === 1) {
            terlambatMenit = hitungTerlambat(now, shift.jam_masuk, shift.toleransi_menit);
            if (terlambatMenit > 0) status = 'terlambat';
        }
    }

    const ins = await query(
        `INSERT INTO attendance_records
            (employee_id, tanggal, session_no, waktu_masuk, shift_type_id, status, terlambat_menit,
             lat_masuk, lon_masuk, lokasi_alamat_masuk, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [employeeId, today, sessionNo, now, shiftTypeId, status, terlambatMenit,
         lat, lon, lokasi_alamat, req.user.name]
    );
    const record = ins.rows[0];

    res.status(201).json({
        message: `Clock In Sesi ${sessionNo} berhasil. ${terlambatMenit > 0 ? `Terlambat ${terlambatMenit} menit.` : 'Tepat waktu!'}`,
        record,
        session_no: sessionNo,
    });
}));

// ─── POST /api/hr/absensi/clock-out ──────────────────────────────────────────
router.post('/clock-out', asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;

    const empRes = await query(
        `SELECT e.id FROM employees e
         WHERE (
           (e.user_id IS NOT NULL AND e.user_id = $3)
           OR (e.user_id IS NULL AND e.email_kerja = $1)
         )
         AND e.company_uuid = $2 AND e.is_active = TRUE
         LIMIT 1`,
        [req.user.email, companyUuid, req.user.id]
    );
    if (empRes.rows.length === 0) {
        return res.status(404).json({ error: 'Data karyawan tidak ditemukan untuk akun ini' });
    }
    const employeeId = empRes.rows[0].id;

    const today = localDateStr(); // YYYY-MM-DD sesuai timezone lokal

    // Cari sesi aktif = sudah clock-in tapi belum clock-out
    const activeRec = await query(
        `SELECT ar.id, ar.waktu_masuk, ar.waktu_pulang, ar.session_no, ar.shift_type_id,
                st.jam_pulang, st.is_overnight
         FROM attendance_records ar
         LEFT JOIN shift_types st ON ar.shift_type_id = st.id
         WHERE ar.employee_id = $1 AND ar.tanggal = $2
           AND ar.waktu_masuk IS NOT NULL AND ar.waktu_pulang IS NULL
         ORDER BY ar.session_no DESC LIMIT 1`,
        [employeeId, today]
    );

    if (activeRec.rows.length === 0) {
        return res.status(400).json({ error: 'Tidak ada sesi aktif. Lakukan Clock In terlebih dahulu.' });
    }

    const now = new Date();
    const rec = activeRec.rows[0];
    const pulangAwalMenit = hitungPulangAwal(now, rec.jam_pulang, rec.is_overnight);

    const updated = await query(
        `UPDATE attendance_records
         SET waktu_pulang = $1, pulang_awal_menit = $2, updated_at = NOW()
         WHERE id = $3 RETURNING *`,
        [now, pulangAwalMenit, rec.id]
    );

    res.json({
        message: `Clock Out Sesi ${rec.session_no} berhasil. ${pulangAwalMenit > 0 ? `Pulang lebih awal ${pulangAwalMenit} menit.` : ''}`,
        record: updated.rows[0],
    });
}));

// ─── GET /api/hr/absensi/today ────────────────────────────────────────────────
// Status absensi hari ini untuk user yang sedang login
router.get('/today', asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;

    const empRes = await query(
        `SELECT e.id, e.nama_lengkap FROM employees e
         WHERE (
           (e.user_id IS NOT NULL AND e.user_id = $3)
           OR (e.user_id IS NULL AND e.email_kerja = $1)
         )
         AND e.company_uuid = $2 AND e.is_active = TRUE
         LIMIT 1`,
        [req.user.email, companyUuid, req.user.id]
    );
    if (empRes.rows.length === 0) {
        return res.json({ status: 'no_employee', record: null, schedule: null, sessions: [] });
    }
    const { id: employeeId, nama_lengkap } = empRes.rows[0];

    const today = localDateStr(); // YYYY-MM-DD sesuai timezone lokal

    const [allSessionsRes, schedRes] = await Promise.all([
        // Semua sesi hari ini, urut by session_no
        query(
            `SELECT ar.*, st.nama_shift, st.jam_masuk, st.jam_pulang
             FROM attendance_records ar
             LEFT JOIN shift_types st ON ar.shift_type_id = st.id
             WHERE ar.employee_id = $1 AND ar.tanggal = $2
             ORDER BY ar.session_no ASC`,
            [employeeId, today]
        ),
        query(
            `SELECT es.*, st.nama_shift, st.jam_masuk, st.jam_pulang, st.toleransi_menit
             FROM employee_schedules es
             JOIN shift_types st ON es.shift_type_id = st.id
             WHERE es.employee_id = $1 AND es.tanggal = $2`,
            [employeeId, today]
        ),
    ]);

    const sessions = allSessionsRes.rows;
    // Sesi aktif = yang waktu_masuk ada tapi waktu_pulang belum
    const activeRecord = sessions.find(s => s.waktu_masuk && !s.waktu_pulang) || null;
    // Sesi selesai (sudah clock-out)
    const completedSessions = sessions.filter(s => s.waktu_masuk && s.waktu_pulang);

    res.json({
        employee: { id: employeeId, nama_lengkap },
        record: activeRecord,           // sesi aktif (untuk timer & card)
        sessions: completedSessions,    // sesi yang sudah selesai (tampil di bawah)
        schedule: schedRes.rows[0] || null,
    });
}));

// ─── GET /api/hr/absensi/records ─────────────────────────────────────────────
// List record absensi harian (HR: bisa filter tanggal & karyawan)
router.get('/records', asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const { tanggal, employee_uuid, bulan, tahun } = req.query;

    let where = ['e.company_uuid = $1'];
    let values = [companyUuid];
    let idx = 2;

    if (tanggal) {
        where.push(`ar.tanggal = $${idx++}`);
        values.push(tanggal);
    } else if (bulan && tahun) {
        where.push(`EXTRACT(MONTH FROM ar.tanggal) = $${idx++}`);
        values.push(parseInt(bulan));
        where.push(`EXTRACT(YEAR FROM ar.tanggal) = $${idx++}`);
        values.push(parseInt(tahun));
    }

    if (employee_uuid) {
        where.push(`e.uuid = $${idx++}`);
        values.push(employee_uuid);
    }

    const result = await query(
        `SELECT
            ar.uuid, ar.tanggal, ar.waktu_masuk, ar.waktu_pulang,
            ar.status, ar.terlambat_menit, ar.pulang_awal_menit, ar.catatan,
            e.nama_lengkap, e.nik, e.uuid AS employee_uuid,
            st.nama_shift, st.jam_masuk, st.jam_pulang
         FROM attendance_records ar
         JOIN employees e ON ar.employee_id = e.id
         LEFT JOIN shift_types st ON ar.shift_type_id = st.id
         WHERE ${where.join(' AND ')}
         ORDER BY ar.tanggal DESC, e.nama_lengkap ASC`,
        values
    );
    res.json(result.rows);
}));

// ─── GET /api/hr/absensi/rekap ────────────────────────────────────────────────
// Rekap kehadiran bulanan semua karyawan [HR].
// Filter opsional: ?employee_uuid= dan ?departemen=
router.get('/rekap', asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const bulan = parseInt(req.query.bulan) || new Date().getMonth() + 1;
    const tahun = parseInt(req.query.tahun) || new Date().getFullYear();
    const { employee_uuid, departemen } = req.query;

    // Bangun filter WHERE opsional
    const extra = [];
    const extraVals = [];
    let idx = 4;

    if (employee_uuid) {
        extra.push(`e.uuid = $${idx++}`);
        extraVals.push(employee_uuid);
    }
    if (departemen) {
        extra.push(`ej.departemen ILIKE $${idx++}`);
        extraVals.push(`%${departemen}%`);
    }

    const extraWhere = extra.length ? `AND ${extra.join(' AND ')}` : '';

    const result = await query(
        `SELECT
            e.uuid AS employee_uuid, e.nik, e.nama_lengkap,
            ej.jabatan, ej.departemen,
            COUNT(ar.id) FILTER (WHERE ar.status IN ('hadir','terlambat'))        AS total_hadir,
            COUNT(ar.id) FILTER (WHERE ar.status = 'terlambat')                   AS total_terlambat,
            COUNT(ar.id) FILTER (WHERE ar.status = 'tidak_hadir')                 AS total_tidak_hadir,
            COUNT(ar.id) FILTER (WHERE ar.status = 'izin')                        AS total_izin,
            COUNT(ar.id) FILTER (WHERE ar.status = 'cuti')                        AS total_cuti,
            COALESCE(SUM(ar.terlambat_menit), 0)                                  AS total_terlambat_menit,
            COALESCE(SUM(ar.pulang_awal_menit), 0)                                AS total_pulang_awal_menit
         FROM employees e
         LEFT JOIN employee_jobs ej ON ej.employee_id = e.id AND ej.is_current = TRUE
         LEFT JOIN attendance_records ar ON ar.employee_id = e.id
            AND EXTRACT(MONTH FROM ar.tanggal) = $2
            AND EXTRACT(YEAR  FROM ar.tanggal) = $3
         WHERE e.company_uuid = $1 AND e.is_active = TRUE ${extraWhere}
         GROUP BY e.uuid, e.nik, e.nama_lengkap, ej.jabatan, ej.departemen
         ORDER BY e.nama_lengkap ASC`,
        [companyUuid, bulan, tahun, ...extraVals]
    );

    // Ambil daftar departemen unik untuk dropdown filter FE
    const deptRes = await query(
        `SELECT DISTINCT ej.departemen FROM employee_jobs ej
         JOIN employees e ON ej.employee_id = e.id
         WHERE e.company_uuid = $1 AND e.is_active = TRUE AND ej.is_current = TRUE AND ej.departemen IS NOT NULL
         ORDER BY ej.departemen ASC`,
        [companyUuid]
    );

    res.json({ bulan, tahun, data: result.rows, departemen_list: deptRes.rows.map(r => r.departemen) });
}));

router.get('/my-rekap', asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const bulan = parseInt(req.query.bulan) || new Date().getMonth() + 1;
    const tahun = parseInt(req.query.tahun) || new Date().getFullYear();

    const empRes = await query(
        `SELECT e.id, e.uuid, e.nik, e.nama_lengkap
         FROM employees e
         WHERE (
           (e.user_id IS NOT NULL AND e.user_id = $3)
           OR (e.user_id IS NULL AND e.email_kerja = $1)
         )
         AND e.company_uuid = $2 AND e.is_active = TRUE
         LIMIT 1`,
        [req.user.email, companyUuid, req.user.id]
    );
    if (empRes.rows.length === 0) return res.json({ no_employee: true });
    const emp = empRes.rows[0];

    // ── Ambil SEMUA sesi per hari, group di JS ──────────────────────────────────
    // Sesi pertama (session_no=1) menyimpan status & terlambat_menit.
    const allSessionsRes = await query(
        `SELECT
            ar.tanggal,
            ar.session_no,
            ar.status,
            ar.terlambat_menit,
            ar.waktu_masuk,
            ar.waktu_pulang,
            st.nama_shift,
            st.jam_masuk   AS shift_jam_masuk,
            st.jam_pulang  AS shift_jam_pulang
         FROM attendance_records ar
         LEFT JOIN shift_types st ON ar.shift_type_id = st.id
         WHERE ar.employee_id = $1
           AND EXTRACT(MONTH FROM ar.tanggal) = $2
           AND EXTRACT(YEAR  FROM ar.tanggal) = $3
         ORDER BY ar.tanggal ASC, ar.session_no ASC`,
        [emp.id, bulan, tahun]
    );

    // Group semua sesi ke dalam 1 entry per tanggal
    const dayMap = new Map();
    for (const row of allSessionsRes.rows) {
        const tgl = String(row.tanggal).slice(0, 10);
        if (!dayMap.has(tgl)) {
            // Baris pertama (session_no=1) → jadi summary hari
            dayMap.set(tgl, {
                tanggal       : tgl,
                status        : row.status,
                terlambat_menit: row.terlambat_menit,
                waktu_masuk   : row.waktu_masuk,   // clock-in pertama
                waktu_pulang  : row.waktu_pulang,  // akan di-update ke clock-out terakhir
                nama_shift    : row.nama_shift,
                shift_jam_masuk : row.shift_jam_masuk,
                shift_jam_pulang: row.shift_jam_pulang,
                sessions      : [],
            });
        }
        const day = dayMap.get(tgl);
        // Selalu update waktu_pulang ke sesi terakhir yang sudah clock-out
        if (row.waktu_pulang) day.waktu_pulang = row.waktu_pulang;
        day.sessions.push({
            session_no   : row.session_no,
            waktu_masuk  : row.waktu_masuk,
            waktu_pulang : row.waktu_pulang,
        });
    }
    const records = Array.from(dayMap.values());

    // ── Summary: hitung per hari (bukan per session record) ──
    const sumRes = await query(
        `SELECT
            COUNT(DISTINCT tanggal) FILTER (
                WHERE status IN ('hadir','terlambat')
            )                                                  AS total_hadir,
            COUNT(DISTINCT tanggal) FILTER (
                WHERE status = 'terlambat' AND session_no = 1
            )                                                  AS total_terlambat,
            COUNT(DISTINCT tanggal) FILTER (
                WHERE status = 'tidak_hadir'
            )                                                  AS total_tidak_hadir,
            COUNT(DISTINCT tanggal) FILTER (
                WHERE status = 'izin'
            )                                                  AS total_izin,
            COUNT(DISTINCT tanggal) FILTER (
                WHERE status = 'cuti'
            )                                                  AS total_cuti,
            COALESCE(SUM(terlambat_menit) FILTER (
                WHERE session_no = 1
            ), 0)                                              AS total_terlambat_menit
         FROM attendance_records
         WHERE employee_id = $1
           AND EXTRACT(MONTH FROM tanggal) = $2
           AND EXTRACT(YEAR  FROM tanggal) = $3`,
        [emp.id, bulan, tahun]
    );

    res.json({ employee: emp, bulan, tahun, summary: sumRes.rows[0], records });
}));


// ─── GET /api/hr/absensi/rekap/:employee_uuid ────────────────────────────────
// Rekap per karyawan + detail record harian [HR]
router.get('/rekap/:employee_uuid', asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const bulan = parseInt(req.query.bulan) || new Date().getMonth() + 1;
    const tahun = parseInt(req.query.tahun) || new Date().getFullYear();

    const empRes = await query(
        `SELECT e.id, e.uuid, e.nik, e.nama_lengkap
         FROM employees e WHERE e.uuid = $1 AND e.company_uuid = $2 AND e.is_active = TRUE`,
        [req.params.employee_uuid, companyUuid]
    );
    if (empRes.rows.length === 0) return res.status(404).json({ error: 'Karyawan tidak ditemukan' });
    const emp = empRes.rows[0];

    const records = await query(
        `SELECT ar.*, st.nama_shift, st.jam_masuk, st.jam_pulang
         FROM attendance_records ar
         LEFT JOIN shift_types st ON ar.shift_type_id = st.id
         WHERE ar.employee_id = $1
           AND EXTRACT(MONTH FROM ar.tanggal) = $2
           AND EXTRACT(YEAR  FROM ar.tanggal) = $3
         ORDER BY ar.tanggal ASC`,
        [emp.id, bulan, tahun]
    );

    res.json({ employee: emp, bulan, tahun, records: records.rows });
}));

// ─── GET /api/hr/absensi/my-schedules ────────────────────────────────────────
// Jadwal shift DIRI SENDIRI (untuk staff biasa).
router.get('/my-schedules', asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const bulan = parseInt(req.query.bulan) || new Date().getMonth() + 1;
    const tahun = parseInt(req.query.tahun) || new Date().getFullYear();

    const empRes = await query(
        `SELECT e.id FROM employees e
         WHERE (
           (e.user_id IS NOT NULL AND e.user_id = $3)
           OR (e.user_id IS NULL AND e.email_kerja = $1)
         )
         AND e.company_uuid = $2 AND e.is_active = TRUE
         LIMIT 1`,
        [req.user.email, companyUuid, req.user.id]
    );
    if (empRes.rows.length === 0) return res.json([]);

    const empId = empRes.rows[0].id;
    const result = await query(
        `SELECT es.id, es.tanggal, es.keterangan,
                st.nama_shift, st.jam_masuk, st.jam_pulang, st.is_overnight
         FROM employee_schedules es
         JOIN shift_types st ON es.shift_type_id = st.id
         WHERE es.employee_id = $1
           AND EXTRACT(MONTH FROM es.tanggal) = $2
           AND EXTRACT(YEAR  FROM es.tanggal) = $3
         ORDER BY es.tanggal ASC`,
        [empId, bulan, tahun]
    );
    res.json(result.rows);
}));


// ─── GET /api/hr/absensi/shift-types ─────────────────────────────────────────
router.get('/shift-types', asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const result = await query(
        `SELECT * FROM shift_types WHERE company_uuid = $1 ORDER BY jam_masuk ASC`,
        [companyUuid]
    );
    res.json(result.rows);
}));

// ─── POST /api/hr/absensi/shift-types ────────────────────────────────────────
router.post('/shift-types', asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const { nama_shift, jam_masuk, jam_pulang, toleransi_menit, is_overnight } = req.body;

    if (!nama_shift?.trim() || !jam_masuk || !jam_pulang) {
        return res.status(400).json({ error: 'nama_shift, jam_masuk, dan jam_pulang wajib diisi' });
    }

    const result = await query(
        `INSERT INTO shift_types (company_id, company_uuid, nama_shift, jam_masuk, jam_pulang, toleransi_menit, is_overnight, created_by)
         VALUES ((SELECT id FROM companies WHERE uuid = $1),$1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [
            companyUuid, nama_shift.trim(), jam_masuk, jam_pulang,
            toleransi_menit || 15, is_overnight || false, req.user.name,
        ]
    );
    res.status(201).json(result.rows[0]);
}));

// ─── PUT /api/hr/absensi/shift-types/:id ─────────────────────────────────────
router.put('/shift-types/:id', asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const { nama_shift, jam_masuk, jam_pulang, toleransi_menit, is_overnight, is_active } = req.body;

    const existing = await query(
        `SELECT id FROM shift_types WHERE id = $1 AND company_uuid = $2`,
        [req.params.id, companyUuid]
    );
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Shift tidak ditemukan' });

    const result = await query(
        `UPDATE shift_types SET
            nama_shift      = COALESCE($1, nama_shift),
            jam_masuk       = COALESCE($2, jam_masuk),
            jam_pulang      = COALESCE($3, jam_pulang),
            toleransi_menit = COALESCE($4, toleransi_menit),
            is_overnight    = COALESCE($5, is_overnight),
            is_active       = COALESCE($6, is_active),
            updated_at      = NOW()
         WHERE id = $7 AND company_uuid = $8 RETURNING *`,
        [
            nama_shift?.trim() || null, jam_masuk || null, jam_pulang || null,
            toleransi_menit ?? null, is_overnight ?? null, is_active ?? null,
            req.params.id, companyUuid,
        ]
    );
    res.json(result.rows[0]);
}));

// ─── DELETE /api/hr/absensi/shift-types/:id ──────────────────────────────────
router.delete('/shift-types/:id', asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;

    const used = await query(
        `SELECT COUNT(*) FROM employee_schedules WHERE shift_type_id = $1`,
        [req.params.id]
    );
    if (parseInt(used.rows[0].count) > 0) {
        return res.status(400).json({ error: 'Shift masih digunakan oleh jadwal karyawan, tidak bisa dihapus' });
    }

    await query(`DELETE FROM shift_types WHERE id = $1 AND company_uuid = $2`, [req.params.id, companyUuid]);
    res.json({ message: 'Tipe shift berhasil dihapus' });
}));

// ─── PATCH /api/hr/absensi/shift-types/:id/toggle ────────────────────────────
// Aktifkan atau nonaktifkan tipe shift [HR]
router.patch('/shift-types/:id/toggle', requirePermission('hr:edit'), asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;

    const existing = await query(
        `SELECT id, is_active FROM shift_types WHERE id = $1 AND company_uuid = $2`,
        [req.params.id, companyUuid]
    );
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Shift tidak ditemukan' });

    const result = await query(
        `UPDATE shift_types SET is_active = NOT is_active, updated_at = NOW()
         WHERE id = $1 AND company_uuid = $2 RETURNING *`,
        [req.params.id, companyUuid]
    );
    res.json({ shift: result.rows[0] });
}));

// ─── GET /api/hr/absensi/schedules ───────────────────────────────────────────
// Jadwal shift karyawan (bisa filter: bulan, tahun, employee_uuid)
router.get('/schedules', asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const { bulan, tahun, employee_uuid } = req.query;

    const currMonth = new Date().getMonth() + 1;
    const currYear = new Date().getFullYear();
    const filterBulan = parseInt(bulan) || currMonth;
    const filterTahun = parseInt(tahun) || currYear;

    let where = ['e.company_uuid = $1', `EXTRACT(MONTH FROM es.tanggal) = $2`, `EXTRACT(YEAR FROM es.tanggal) = $3`];
    let values = [companyUuid, filterBulan, filterTahun];
    let idx = 4;

    if (employee_uuid) {
        where.push(`e.uuid = $${idx++}`);
        values.push(employee_uuid);
    }

    const result = await query(
        `SELECT
            es.id, es.tanggal, es.keterangan,
            e.uuid AS employee_uuid, e.nama_lengkap, e.nik,
            st.id AS shift_type_id, st.nama_shift, st.jam_masuk, st.jam_pulang
         FROM employee_schedules es
         JOIN employees e ON es.employee_id = e.id
         JOIN shift_types st ON es.shift_type_id = st.id
         WHERE ${where.join(' AND ')}
         ORDER BY es.tanggal ASC, e.nama_lengkap ASC`,
        values
    );
    res.json(result.rows);
}));

// ─── GET /api/hr/absensi/schedules/calendar ──────────────────────────────────
// Kalender jadwal shift semua karyawan untuk 1 bulan (HR only).
// Response: { "YYYY-MM-DD": [ {employee_uuid, nama_lengkap, nik, nama_shift, jam_masuk, jam_pulang, shift_type_id}, ... ], ... }
router.get('/schedules/calendar', asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const bulan  = parseInt(req.query.bulan)  || new Date().getMonth() + 1;
    const tahun  = parseInt(req.query.tahun)  || new Date().getFullYear();
    const { employee_uuid } = req.query;

    let where = ['e.company_uuid = $1', 'EXTRACT(MONTH FROM es.tanggal) = $2', 'EXTRACT(YEAR FROM es.tanggal) = $3', 'e.is_active = TRUE'];
    let values = [companyUuid, bulan, tahun];
    let idx = 4;

    if (employee_uuid) {
        where.push(`e.uuid = $${idx++}`);
        values.push(employee_uuid);
    }

    const result = await query(
        `SELECT
            es.tanggal,
            e.uuid AS employee_uuid, e.nama_lengkap, e.nik,
            st.id  AS shift_type_id, st.nama_shift, st.jam_masuk, st.jam_pulang,
            st.is_overnight
         FROM employee_schedules es
         JOIN employees   e  ON es.employee_id   = e.id
         JOIN shift_types st ON es.shift_type_id = st.id
         WHERE ${where.join(' AND ')}
         ORDER BY es.tanggal ASC, e.nama_lengkap ASC`,
        values
    );

    // group by date string
    const grouped = {};
    for (const row of result.rows) {
        const dateStr = row.tanggal instanceof Date
            ? row.tanggal.toISOString().slice(0, 10)
            : String(row.tanggal).slice(0, 10);
        if (!grouped[dateStr]) grouped[dateStr] = [];
        grouped[dateStr].push({
            employee_uuid : row.employee_uuid,
            nama_lengkap  : row.nama_lengkap,
            nik           : row.nik,
            shift_type_id : row.shift_type_id,
            nama_shift    : row.nama_shift,
            jam_masuk     : row.jam_masuk,
            jam_pulang    : row.jam_pulang,
            is_overnight  : row.is_overnight,
        });
    }

    res.json({ bulan, tahun, data: grouped });
}));

// ─── POST /api/hr/absensi/schedules ──────────────────────────────────────────
// Assign shift ke karyawan (batch: 1 karyawan, banyak tanggal).
// TOLAK jika salah satu tanggal sudah ada jadwal untuk karyawan tersebut.
router.post('/schedules', requirePermission('hr:edit'), asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const { employee_uuid, shift_type_id, tanggal_list, keterangan } = req.body;

    if (!employee_uuid || !shift_type_id || !tanggal_list?.length) {
        return res.status(400).json({ error: 'employee_uuid, shift_type_id, dan tanggal_list wajib diisi' });
    }

    const empRes = await query(
        `SELECT e.id, e.nama_lengkap FROM employees e
         WHERE e.uuid = $1 AND e.company_uuid = $2 AND e.is_active = TRUE`,
        [employee_uuid, companyUuid]
    );
    if (empRes.rows.length === 0) return res.status(404).json({ error: 'Karyawan tidak ditemukan' });
    const { id: employeeId, nama_lengkap } = empRes.rows[0];

    const shiftRes = await query(
        `SELECT id FROM shift_types WHERE id = $1 AND company_uuid = $2 AND is_active = TRUE`,
        [shift_type_id, companyUuid]
    );
    if (shiftRes.rows.length === 0) return res.status(404).json({ error: 'Tipe shift tidak ditemukan atau tidak aktif' });

    // ── Cek konflik: apakah ada tanggal yang sudah punya jadwal? ─────────────
    const conflictCheck = await query(
        `SELECT es.tanggal, st.nama_shift
         FROM employee_schedules es
         JOIN shift_types st ON es.shift_type_id = st.id
         WHERE es.employee_id = $1
           AND es.tanggal = ANY($2::date[])`,
        [employeeId, tanggal_list]
    );

    if (conflictCheck.rows.length > 0) {
        const conflicts = conflictCheck.rows.map(r => ({
            tanggal   : String(r.tanggal).slice(0, 10),
            nama_shift: r.nama_shift,
        }));
        const detail = conflicts.map(c => `${c.tanggal} (${c.nama_shift})`).join(', ');
        return res.status(409).json({
            error   : `${nama_lengkap} sudah memiliki jadwal shift pada: ${detail}. Hapus jadwal lama terlebih dahulu.`,
            conflicts,
        });
    }

    // ── Tidak ada konflik → insert semua ─────────────────────────────────────
    let inserted = 0;
    for (const tgl of tanggal_list) {
        await query(
            `INSERT INTO employee_schedules (employee_id, shift_type_id, tanggal, keterangan, created_by)
             VALUES ($1,$2,$3,$4,$5)`,
            [employeeId, shift_type_id, tgl, keterangan?.trim() || null, req.user.name]
        );
        inserted++;
    }

    res.status(201).json({ message: `${inserted} jadwal shift berhasil disimpan untuk ${nama_lengkap}` });
}));

// ─── DELETE /api/hr/absensi/schedules/:id ────────────────────────────────────
router.delete('/schedules/:id', asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;

    // Pastikan schedule milik company ini (via JOIN)
    const check = await query(
        `SELECT es.id FROM employee_schedules es
         JOIN employees e ON es.employee_id = e.id
         WHERE es.id = $1 AND e.company_uuid = $2`,
        [req.params.id, companyUuid]
    );
    if (check.rows.length === 0) return res.status(404).json({ error: 'Jadwal tidak ditemukan' });

    await query(`DELETE FROM employee_schedules WHERE id = $1`, [req.params.id]);
    res.json({ message: 'Jadwal shift dihapus' });
}));

module.exports = router;
