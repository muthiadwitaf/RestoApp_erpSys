/**
 * BE/src/module/hr/specialDisbursement.js
 * Modul Pencairan Khusus: THR, Bonus, dll.
 *
 * Endpoints:
 *   GET    /api/hr/special-disbursements                    - List batch (filter tahun/jenis)
 *   POST   /api/hr/special-disbursements                    - Buat batch baru
 *   GET    /api/hr/special-disbursements/:id                - Detail batch + list slip
 *   POST   /api/hr/special-disbursements/:id/generate       - Generate slip semua karyawan aktif
 *   POST   /api/hr/special-disbursements/:id/finalize       - Finalisasi (lock)
 *   DELETE /api/hr/special-disbursements/:id                - Hapus (hanya draft)
 *
 *   GET    /api/hr/special-disbursements/slips/:id          - Detail slip
 *   PUT    /api/hr/special-disbursements/slips/:id          - Edit gross/catatan slip
 *   POST   /api/hr/special-disbursements/slips/:id/approve  - Approve slip
 */
const router = require('express').Router();
const { query } = require('../../config/db');
const { requirePermission } = require('../../middleware/auth');
const { asyncHandler } = require('../../utils/helpers');

const hrView  = requirePermission('hr:view');
const hrWrite = requirePermission('hr:edit');
const hrAdmin = requirePermission('hr:delete');

// ─── Helper: hitung masa kerja dalam bulan (hingga tanggal tertentu) ─────────
function hitungMasaKerja(tanggalMasuk, tanggalHitung) {
    const masuk  = new Date(tanggalMasuk);
    const hitung = new Date(tanggalHitung);
    const diffMs = hitung - masuk;
    if (diffMs <= 0) return 0;
    // Hitung selisih bulan (bulatkan ke bawah)
    const diffYear  = hitung.getFullYear() - masuk.getFullYear();
    const diffMonth = hitung.getMonth() - masuk.getMonth();
    return Math.max(0, diffYear * 12 + diffMonth);
}

// ─── Helper: hitung gross THR berdasarkan masa kerja ──────────────────────────
function hitungGrossTHR(gajiPokok, masaKerjaBulan) {
    if (masaKerjaBulan >= 12) return gajiPokok;
    if (masaKerjaBulan >= 1)  return Math.round((masaKerjaBulan / 12) * gajiPokok);
    return 0;
}

// ─── Helper: hitung gross Bonus berdasarkan mode ──────────────────────────────
function hitungGrossBonus(gajiPokok, bonusMode, bonusNilai) {
    if (bonusMode === 'flat')   return parseFloat(bonusNilai) || 0;
    if (bonusMode === 'persen') return Math.round(gajiPokok * (parseFloat(bonusNilai) || 0) / 100);
    return 0; // 'manual' → 0, HR isi sendiri
}

// ─── Helper: recalc net slip ──────────────────────────────────────────────────
async function recalcSlip(slipId) {
    const slipRes = await query(
        `SELECT gross_amount, pph21_amount, potongan_lain FROM special_disbursement_slips WHERE id = $1`,
        [slipId]
    );
    if (!slipRes.rows.length) return;
    const { gross_amount, pph21_amount, potongan_lain } = slipRes.rows[0];
    const net = parseFloat(gross_amount) - parseFloat(pph21_amount) - parseFloat(potongan_lain);
    await query(
        `UPDATE special_disbursement_slips SET net_amount = $1, updated_at = NOW() WHERE id = $2`,
        [net, slipId]
    );
    return net;
}

// ─── Helper: recalc batch totals ─────────────────────────────────────────────
async function recalcBatch(batchId) {
    await query(
        `UPDATE special_disbursement_batches SET
            total_karyawan = (SELECT COUNT(*) FROM special_disbursement_slips WHERE batch_id = $1),
            total_nominal  = (SELECT COALESCE(SUM(net_amount),0) FROM special_disbursement_slips WHERE batch_id = $1),
            updated_at     = NOW()
         WHERE id = $1`,
        [batchId]
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SLIPS (harus didefinisi dulu agar tidak konflik dengan /:id)
// ═══════════════════════════════════════════════════════════════════════════════

// GET /slips/:id
router.get('/slips/:id', hrView, asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;

    const result = await query(
        `SELECT sds.*,
                e.nik, e.nama_lengkap, e.foto_url,
                ej.jabatan, ej.departemen,
                sdb.jenis, sdb.label AS batch_label, sdb.tanggal_bayar,
                sdb.status AS batch_status
         FROM special_disbursement_slips sds
         JOIN employees e ON sds.employee_id = e.id
         LEFT JOIN employee_jobs ej ON ej.employee_id = e.id AND ej.is_current = TRUE
         JOIN special_disbursement_batches sdb ON sds.batch_id = sdb.id
         WHERE sds.id = $1 AND sds.company_uuid = $2`,
        [req.params.id, companyUuid]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Slip tidak ditemukan' });
    res.json(result.rows[0]);
}));

// PUT /slips/:id
router.put('/slips/:id', hrWrite, asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;

    const slipRes = await query(
        `SELECT sds.id, sdb.status AS batch_status
         FROM special_disbursement_slips sds
         JOIN special_disbursement_batches sdb ON sds.batch_id = sdb.id
         WHERE sds.id = $1 AND sds.company_uuid = $2`,
        [req.params.id, companyUuid]
    );
    if (!slipRes.rows.length) return res.status(404).json({ error: 'Slip tidak ditemukan' });
    if (slipRes.rows[0].batch_status === 'finalized') {
        return res.status(400).json({ error: 'Batch sudah difinalisasi, slip tidak bisa diubah' });
    }
    if (slipRes.rows[0].slip_status === 'approved') {
        return res.status(400).json({ error: 'Slip sudah diapprove, tidak bisa diubah' });
    }

    const slipId = slipRes.rows[0].id;
    const { gross_amount, pph21_amount, potongan_lain, catatan } = req.body;

    const sets    = [];
    const values  = [];
    let   idx     = 1;

    if (gross_amount   !== undefined) { sets.push(`gross_amount   = $${idx++}`); values.push(parseFloat(gross_amount)   || 0); }
    if (pph21_amount   !== undefined) { sets.push(`pph21_amount   = $${idx++}`); values.push(parseFloat(pph21_amount)   || 0); }
    if (potongan_lain  !== undefined) { sets.push(`potongan_lain  = $${idx++}`); values.push(parseFloat(potongan_lain)  || 0); }
    if (catatan        !== undefined) { sets.push(`catatan        = $${idx++}`); values.push(catatan?.trim() || null); }

    if (sets.length) {
        sets.push(`updated_at = NOW()`);
        values.push(slipId);
        await query(
            `UPDATE special_disbursement_slips SET ${sets.join(', ')} WHERE id = $${idx}`,
            values
        );
    }

    const net = await recalcSlip(slipId);

    // Update batch totals
    const batchRes = await query(`SELECT batch_id FROM special_disbursement_slips WHERE id = $1`, [slipId]);
    if (batchRes.rows.length) await recalcBatch(batchRes.rows[0].batch_id);

    res.json({ message: 'Slip berhasil diperbarui', net_amount: net });
}));

// POST /slips/:id/approve
router.post('/slips/:id/approve', hrAdmin, asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;

    const slipRes = await query(
        `SELECT sds.id, sdb.status AS batch_status
         FROM special_disbursement_slips sds
         JOIN special_disbursement_batches sdb ON sds.batch_id = sdb.id
         WHERE sds.id = $1 AND sds.company_uuid = $2`,
        [req.params.id, companyUuid]
    );
    if (!slipRes.rows.length) return res.status(404).json({ error: 'Slip tidak ditemukan' });

    await query(
        `UPDATE special_disbursement_slips
         SET status = 'approved', approved_by = $1, approved_at = NOW(), updated_at = NOW()
         WHERE id = $2`,
        [req.user.name, req.params.id]
    );
    res.json({ message: 'Slip disetujui' });
}));

// ═══════════════════════════════════════════════════════════════════════════════
// BATCHES
// ═══════════════════════════════════════════════════════════════════════════════

// GET /  — list batch (filter tahun & jenis)
router.get('/', hrView, asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const { tahun, jenis } = req.query;

    const where  = ['company_uuid = $1'];
    const values = [companyUuid];
    let idx = 2;

    if (tahun) {
        where.push(`EXTRACT(YEAR FROM tanggal_bayar) = $${idx++}`);
        values.push(parseInt(tahun));
    }
    if (jenis) {
        where.push(`jenis = $${idx++}`);
        values.push(jenis);
    }

    const result = await query(
        `SELECT * FROM special_disbursement_batches
         WHERE ${where.join(' AND ')}
         ORDER BY tanggal_bayar DESC`,
        values
    );
    res.json(result.rows);
}));

// POST / — buat batch baru
router.post('/', hrAdmin, asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const { jenis, label, tanggal_bayar, bonus_mode, bonus_nilai, catatan } = req.body;

    if (!jenis || !['thr','bonus','other'].includes(jenis))
        return res.status(400).json({ error: 'Jenis harus: thr, bonus, atau other' });
    if (!label?.trim())
        return res.status(400).json({ error: 'Label wajib diisi (contoh: THR Lebaran 2026)' });
    if (!tanggal_bayar)
        return res.status(400).json({ error: 'Tanggal bayar wajib diisi' });

    const result = await query(
        `INSERT INTO special_disbursement_batches
             (company_id, company_uuid, jenis, label, tanggal_bayar, bonus_mode, bonus_nilai, catatan, created_by)
         VALUES ((SELECT id FROM companies WHERE uuid = $1), $1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
            companyUuid, jenis, label.trim(), tanggal_bayar,
            bonus_mode || 'manual',
            bonus_nilai ? parseFloat(bonus_nilai) : null,
            catatan?.trim() || null,
            req.user.name,
        ]
    );
    res.status(201).json(result.rows[0]);
}));

// GET /:id — detail batch + slip list
router.get('/:id', hrView, asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;

    const batchRes = await query(
        `SELECT * FROM special_disbursement_batches WHERE id = $1 AND company_uuid = $2`,
        [req.params.id, companyUuid]
    );
    if (!batchRes.rows.length) return res.status(404).json({ error: 'Batch tidak ditemukan' });
    const batch = batchRes.rows[0];

    const slipsRes = await query(
        `SELECT sds.*,
                e.nik, e.nama_lengkap, e.foto_url,
                ej.jabatan, ej.departemen
         FROM special_disbursement_slips sds
         JOIN employees e ON sds.employee_id = e.id
         LEFT JOIN employee_jobs ej ON ej.employee_id = e.id AND ej.is_current = TRUE
         WHERE sds.batch_id = $1
         ORDER BY e.nama_lengkap ASC`,
        [batch.id]
    );

    res.json({ ...batch, slips: slipsRes.rows });
}));

// POST /:id/generate — generate slip semua karyawan aktif
router.post('/:id/generate', hrAdmin, asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;

    const batchRes = await query(
        `SELECT * FROM special_disbursement_batches WHERE id = $1 AND company_uuid = $2`,
        [req.params.id, companyUuid]
    );
    if (!batchRes.rows.length) return res.status(404).json({ error: 'Batch tidak ditemukan' });
    const batch = batchRes.rows[0];

    if (batch.status === 'finalized')
        return res.status(400).json({ error: 'Batch sudah difinalisasi' });

    // Ambil semua karyawan aktif + gaji_pokok + tanggal mulai kerja
    const emps = await query(
        `SELECT e.id AS employee_id,
                ej.tanggal_mulai AS tanggal_masuk,
                COALESCE(ej.gaji_pokok, 0) AS gaji_pokok
         FROM employees e
         LEFT JOIN employee_jobs ej ON ej.employee_id = e.id AND ej.is_current = TRUE
         WHERE e.company_uuid = $1 AND e.is_active = TRUE AND e.status = 'aktif'`,
        [companyUuid]
    );

    let created = 0, skipped = 0;

    for (const emp of emps.rows) {
        // Skip jika sudah ada slip untuk employee ini di batch ini
        const existing = await query(
            `SELECT id FROM special_disbursement_slips WHERE batch_id = $1 AND employee_id = $2`,
            [batch.id, emp.employee_id]
        );
        if (existing.rows.length > 0) { skipped++; continue; }

        const gajiPokok = parseFloat(emp.gaji_pokok);
        const masaKerjaBulan = emp.tanggal_masuk
            ? hitungMasaKerja(emp.tanggal_masuk, batch.tanggal_bayar)
            : 0;

        let gross = 0;
        if (batch.jenis === 'thr') {
            gross = hitungGrossTHR(gajiPokok, masaKerjaBulan);
        } else if (batch.jenis === 'bonus') {
            gross = hitungGrossBonus(gajiPokok, batch.bonus_mode, batch.bonus_nilai);
        }
        // 'other' atau 'manual' → gross = 0, HR isi manual

        const net = gross; // net awal = gross (belum ada potongan)

        await query(
            `INSERT INTO special_disbursement_slips
                 (batch_id, company_id, company_uuid, employee_id, gaji_pokok_snapshot, masa_kerja_bulan,
                  gross_amount, net_amount)
             VALUES ($1, (SELECT id FROM companies WHERE uuid = $2), $2, $3, $4, $5, $6, $6)`,
            [batch.id, companyUuid, emp.employee_id, gajiPokok, masaKerjaBulan, gross]
        );
        created++;
    }

    await recalcBatch(batch.id);

    res.json({
        message: `Generate selesai: ${created} slip dibuat, ${skipped} slip sudah ada`,
        created,
        skipped,
    });
}));

// POST /:id/finalize
router.post('/:id/finalize', hrAdmin, asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;

    const batchRes = await query(
        `SELECT * FROM special_disbursement_batches WHERE id = $1 AND company_uuid = $2`,
        [req.params.id, companyUuid]
    );
    if (!batchRes.rows.length) return res.status(404).json({ error: 'Batch tidak ditemukan' });
    if (batchRes.rows[0].status === 'finalized')
        return res.status(400).json({ error: 'Batch sudah difinalisasi' });

    await query(
        `UPDATE special_disbursement_batches
         SET status = 'finalized', finalized_at = NOW(), finalized_by = $1, updated_at = NOW()
         WHERE id = $2`,
        [req.user.name, req.params.id]
    );

    res.json({ message: 'Batch berhasil difinalisasi' });
}));

// DELETE /:id
router.delete('/:id', hrAdmin, asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;

    const batchRes = await query(
        `SELECT * FROM special_disbursement_batches WHERE id = $1 AND company_uuid = $2`,
        [req.params.id, companyUuid]
    );
    if (!batchRes.rows.length) return res.status(404).json({ error: 'Batch tidak ditemukan' });
    if (batchRes.rows[0].status === 'finalized')
        return res.status(400).json({ error: 'Batch yang sudah difinalisasi tidak bisa dihapus' });

    await query(`DELETE FROM special_disbursement_batches WHERE id = $1`, [req.params.id]);
    res.json({ message: 'Batch berhasil dihapus' });
}));

module.exports = router;
