/**
 * BE/src/module/hr/payroll.js
 * API endpoints untuk modul Payroll.
 *
 * Endpoints:
 *   GET    /api/hr/payroll/periods              - List periode (filter tahun)
 *   POST   /api/hr/payroll/periods              - Buat periode baru
 *   GET    /api/hr/payroll/periods/:id          - Detail periode + daftar slip
 *   POST   /api/hr/payroll/periods/:id/generate - Generate slip semua karyawan aktif
 *   POST   /api/hr/payroll/periods/:id/finalize - Finalisasi periode
 *   DELETE /api/hr/payroll/periods/:id          - Hapus periode (hanya jika draft)
 *
 *   GET    /api/hr/payroll/slips/:id            - Detail slip 1 karyawan
 *   PUT    /api/hr/payroll/slips/:id            - Edit catatan / komponen slip
 *   POST   /api/hr/payroll/slips/:id/approve    - Approve slip individual
 */
const router = require('express').Router();
const { query } = require('../../config/db');
const { authenticateToken, requirePermission } = require('../../middleware/auth');
const { asyncHandler } = require('../../utils/helpers');
const { getRateTER } = require('./ter');

router.use(authenticateToken);

const hrView  = requirePermission('hr:view');
const hrWrite = requirePermission('hr:edit');
const hrAdmin = requirePermission('hr:delete'); // HR Manager

// ─── helper: recalculate net_salary & total_kasbon dari slip ─────────────────
async function recalcSlip(client, slipId) {
    const totAllow = await client.query(
        `SELECT COALESCE(SUM(amount),0) AS total FROM payroll_allowances WHERE slip_id = $1`,
        [slipId]
    );
    const totDeduct = await client.query(
        `SELECT COALESCE(SUM(amount),0) AS total FROM payroll_deductions WHERE slip_id = $1`,
        [slipId]
    );
    const totKasbon = await client.query(
        `SELECT COALESCE(SUM(amount),0) AS total FROM advance_cicilan WHERE slip_id = $1`,
        [slipId]
    );

    const tunjangan = parseFloat(totAllow.rows[0].total);
    const potongan  = parseFloat(totDeduct.rows[0].total);
    const kasbon    = parseFloat(totKasbon.rows[0].total);

    const slipRes = await client.query(
        `SELECT gaji_pokok FROM payroll_slips WHERE id = $1`, [slipId]
    );
    const gajiPokok = parseFloat(slipRes.rows[0]?.gaji_pokok || 0);

    const net = gajiPokok + tunjangan - potongan - kasbon;

    await client.query(
        `UPDATE payroll_slips
         SET total_tunjangan = $1, total_potongan = $2, total_kasbon = $3, net_salary = $4, updated_at = NOW()
         WHERE id = $5`,
        [tunjangan, potongan, kasbon, net, slipId]
    );
    return { tunjangan, potongan, kasbon, net };
}

// ─── helper: recalculate period totals ──────────────────────────────────────
async function recalcPeriod(client, periodId) {
    await client.query(
        `UPDATE payroll_periods pp SET
            total_gaji = (SELECT COALESCE(SUM(net_salary),0) FROM payroll_slips WHERE period_id = $1),
            total_karyawan = (SELECT COUNT(*) FROM payroll_slips WHERE period_id = $1),
            updated_at = NOW()
         WHERE pp.id = $1`,
        [periodId]
    );
}

// ─── helper: bulan label ─────────────────────────────────────────────────────
const BULAN_NAMES = ['','Januari','Februari','Maret','April','Mei','Juni',
                     'Juli','Agustus','September','Oktober','November','Desember'];

// ═══════════════════════════════════════════════════════════════════════════════
// PERIODS
// ═══════════════════════════════════════════════════════════════════════════════

// GET /periods
router.get('/periods', hrView, asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const { tahun } = req.query;

    let where = ['company_uuid = $1'];
    let values = [companyUuid];
    let idx = 2;

    if (tahun) {
        where.push(`tahun = $${idx++}`);
        values.push(parseInt(tahun));
    }

    const result = await query(
        `SELECT * FROM payroll_periods WHERE ${where.join(' AND ')} ORDER BY tahun DESC, bulan DESC`,
        values
    );
    res.json(result.rows);
}));

// POST /periods
router.post('/periods', hrAdmin, asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const { bulan, tahun } = req.body;

    if (!bulan || !tahun) return res.status(400).json({ error: 'Bulan dan tahun wajib diisi' });
    const b = parseInt(bulan), t = parseInt(tahun);
    if (b < 1 || b > 12) return res.status(400).json({ error: 'Bulan tidak valid (1-12)' });

    const label = `${BULAN_NAMES[b]} ${t}`;

    try {
        const result = await query(
            `INSERT INTO payroll_periods (company_id, company_uuid, bulan, tahun, label, created_by)
             VALUES ((SELECT id FROM companies WHERE uuid = $1),$1,$2,$3,$4,$5) RETURNING *`,
            [companyUuid, b, t, label, req.user.name]
        );
        res.status(201).json(result.rows[0]);
    } catch (e) {
        if (e.code === '23505') return res.status(409).json({ error: `Periode ${label} sudah ada` });
        throw e;
    }
}));

// GET /periods/:id
router.get('/periods/:id', hrView, asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;

    const periodRes = await query(
        `SELECT * FROM payroll_periods WHERE id = $1 AND company_uuid = $2`,
        [req.params.id, companyUuid]
    );
    if (!periodRes.rows.length) return res.status(404).json({ error: 'Periode tidak ditemukan' });
    const period = periodRes.rows[0];

    const slipsRes = await query(
        `SELECT ps.*,
                e.nik, e.nama_lengkap, e.foto_url,
                ej.jabatan, ej.departemen
         FROM payroll_slips ps
         JOIN employees e ON ps.employee_id = e.id
         LEFT JOIN employee_jobs ej ON ej.employee_id = e.id AND ej.is_current = TRUE
         WHERE ps.period_id = $1
         ORDER BY e.nama_lengkap ASC`,
        [req.params.id]
    );

    res.json({ ...period, slips: slipsRes.rows });
}));

// POST /periods/:id/generate
router.post('/periods/:id/generate', hrAdmin, asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;

    const periodRes = await query(
        `SELECT * FROM payroll_periods WHERE id = $1 AND company_uuid = $2`,
        [req.params.id, companyUuid]
    );
    if (!periodRes.rows.length) return res.status(404).json({ error: 'Periode tidak ditemukan' });
    const period = periodRes.rows[0];
    if (period.status === 'finalized') return res.status(400).json({ error: 'Periode sudah difinalisasi' });

    // Ambil semua karyawan aktif + gaji_pokok dari jabatan current
    const emps = await query(
        `SELECT e.id AS employee_id, COALESCE(ej.gaji_pokok, 0) AS gaji_pokok
         FROM employees e
         LEFT JOIN employee_jobs ej ON ej.employee_id = e.id AND ej.is_current = TRUE
         WHERE e.company_uuid = $1 AND e.is_active = TRUE AND e.status = 'aktif'`,
        [companyUuid]
    );

    let created = 0, skipped = 0;

    for (const emp of emps.rows) {
        // Skip jika sudah ada slip untuk employee ini di periode ini
        const existing = await query(
            `SELECT id FROM payroll_slips WHERE period_id = $1 AND employee_id = $2`,
            [period.id, emp.employee_id]
        );
        if (existing.rows.length > 0) { skipped++; continue; }

        const gajiPokok = parseFloat(emp.gaji_pokok);

        // Buat slip kosong
        const slip = await query(
            `INSERT INTO payroll_slips
                (period_id, company_id, company_uuid, employee_id, gaji_pokok, net_salary)
             VALUES ($1,(SELECT id FROM companies WHERE uuid = $2),$2,$3,$4,$4) RETURNING id`,
            [period.id, companyUuid, emp.employee_id, gajiPokok]
        );
        const slipId = slip.rows[0].id;

        // ─── Auto-deductions dari employee_payroll_settings ───────────────
        const settRes = await query(
            `SELECT * FROM employee_payroll_settings WHERE employee_id = $1`,
            [emp.employee_id]
        );
        if (settRes.rows.length > 0) {
            const s = settRes.rows[0];
            const autoDeductions = [
                { aktif: s.bpjs_kes_aktif, nama: 'BPJS Kesehatan',    amount: gajiPokok * parseFloat(s.bpjs_kes_persen) / 100 },
                { aktif: s.jht_aktif,      nama: 'JHT (BPJS TK)',     amount: gajiPokok * parseFloat(s.jht_persen)      / 100 },
                { aktif: s.jkk_aktif,      nama: 'JKK (BPJS TK)',     amount: gajiPokok * parseFloat(s.jkk_persen)      / 100 },
                { aktif: s.jkm_aktif,      nama: 'JKM (BPJS TK)',     amount: gajiPokok * parseFloat(s.jkm_persen)      / 100 },
                { aktif: s.jp_aktif,       nama: 'Jaminan Pensiun',   amount: gajiPokok * parseFloat(s.jp_persen)       / 100 },
                { aktif: s.pph21_aktif,    nama: 'PPh 21',            amount: parseFloat(s.pph21_nominal) },
            ];
            for (const d of autoDeductions) {
                if (d.aktif && d.amount > 0) {
                    await query(
                        `INSERT INTO payroll_deductions (slip_id, nama, amount) VALUES ($1,$2,$3)`,
                        [slipId, d.nama, Math.round(d.amount)]
                    );
                }
            }
        }

        // ─── Custom potongan otomatis ─────────────────────────────────────
        const customDeductRes = await query(
            `SELECT * FROM employee_payroll_custom_deductions WHERE employee_id = $1 AND aktif = TRUE`,
            [emp.employee_id]
        );
        for (const cd of customDeductRes.rows) {
            const amount = cd.tipe === 'persen'
                ? gajiPokok * parseFloat(cd.nilai) / 100
                : parseFloat(cd.nilai);
            if (amount > 0) {
                await query(
                    `INSERT INTO payroll_deductions (slip_id, nama, amount) VALUES ($1,$2,$3)`,
                    [slipId, cd.nama, Math.round(amount)]
                );
            }
        }

        // ─── Custom tunjangan otomatis ────────────────────────────────────
        const customAllowRes = await query(
            `SELECT * FROM employee_payroll_custom_allowances WHERE employee_id = $1 AND aktif = TRUE`,
            [emp.employee_id]
        );
        for (const ca of customAllowRes.rows) {
            const amount = ca.tipe === 'persen'
                ? gajiPokok * parseFloat(ca.nilai) / 100
                : parseFloat(ca.nilai);
            if (amount > 0) {
                await query(
                    `INSERT INTO payroll_allowances (slip_id, nama, amount) VALUES ($1,$2,$3)`,
                    [slipId, ca.nama, Math.round(amount)]
                );
            }
        }

        // Attach cicilan kasbon aktif di bulan ini
        const cicilan = await query(
            `SELECT ac.id, ac.amount FROM advance_cicilan ac
             JOIN salary_advances sa ON ac.advance_id = sa.id
             WHERE sa.employee_id = $1
               AND ac.bulan = $2 AND ac.tahun = $3
               AND ac.status = 'pending'
               AND sa.status = 'approved'`,
            [emp.employee_id, period.bulan, period.tahun]
        );

        for (const c of cicilan.rows) {
            await query(
                `UPDATE advance_cicilan SET slip_id = $1, period_id = $2 WHERE id = $3`,
                [slipId, period.id, c.id]
            );
        }

        // Recalc net (gaji_pokok + tunjangan - potongan - kasbon)
        const totDeduct = await query(
            `SELECT COALESCE(SUM(amount),0) AS t FROM payroll_deductions WHERE slip_id = $1`, [slipId]
        );
        const totAllow = await query(
            `SELECT COALESCE(SUM(amount),0) AS t FROM payroll_allowances WHERE slip_id = $1`, [slipId]
        );
        const totalKasbon = cicilan.rows.reduce((s, c) => s + parseFloat(c.amount), 0);
        const totalPotongan = parseFloat(totDeduct.rows[0].t);
        const totalTunjangan = parseFloat(totAllow.rows[0].t);
        const net = gajiPokok + totalTunjangan - totalPotongan - totalKasbon;

        await query(
            `UPDATE payroll_slips SET total_tunjangan = $1, total_potongan = $2, total_kasbon = $3, net_salary = $4 WHERE id = $5`,
            [totalTunjangan, totalPotongan, totalKasbon, net, slipId]
        );

        created++;
    }

    await recalcPeriod({ query: (...args) => query(...args) }, period.id);

    res.json({
        message: `Generate selesai: ${created} slip dibuat, ${skipped} slip sudah ada`,
        created, skipped,
    });
}));

// POST /periods/:id/finalize
router.post('/periods/:id/finalize', hrAdmin, asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;

    const periodRes = await query(
        `SELECT * FROM payroll_periods WHERE id = $1 AND company_uuid = $2`,
        [req.params.id, companyUuid]
    );
    if (!periodRes.rows.length) return res.status(404).json({ error: 'Periode tidak ditemukan' });
    if (periodRes.rows[0].status === 'finalized') {
        return res.status(400).json({ error: 'Periode sudah difinalisasi' });
    }

    // Cek apakah ada slip yg masih draft (opsional warning)
    const draftCount = await query(
        `SELECT COUNT(*) AS cnt FROM payroll_slips WHERE period_id = $1 AND status = 'draft'`,
        [req.params.id]
    );

    await query(
        `UPDATE payroll_periods
         SET status = 'finalized', finalized_at = NOW(), finalized_by = $1, updated_at = NOW()
         WHERE id = $2`,
        [req.user.name, req.params.id]
    );

    // Mark semua cicilan kasbon di periode ini sebagai paid
    await query(
        `UPDATE advance_cicilan SET status = 'paid', paid_at = NOW()
         WHERE period_id = $1 AND status = 'pending'`,
        [req.params.id]
    );

    // Update sisa_cicilan pada salary_advances yang terkait
    await query(
        `UPDATE salary_advances sa SET
            sisa_cicilan = (
                SELECT COUNT(*) FROM advance_cicilan
                WHERE advance_id = sa.id AND status = 'pending'
            ),
            status = CASE
                WHEN (SELECT COUNT(*) FROM advance_cicilan WHERE advance_id = sa.id AND status = 'pending') = 0
                THEN 'lunas'
                ELSE sa.status
            END,
            updated_at = NOW()
         WHERE sa.id IN (
             SELECT DISTINCT ac.advance_id FROM advance_cicilan ac WHERE ac.period_id = $1
         )`,
        [req.params.id]
    );

    res.json({
        message: 'Periode berhasil difinalisasi',
        draft_slips_remaining: parseInt(draftCount.rows[0].cnt),
    });
}));

// DELETE /periods/:id
router.delete('/periods/:id', hrAdmin, asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const periodRes = await query(
        `SELECT * FROM payroll_periods WHERE id = $1 AND company_uuid = $2`,
        [req.params.id, companyUuid]
    );
    if (!periodRes.rows.length) return res.status(404).json({ error: 'Periode tidak ditemukan' });
    if (periodRes.rows[0].status === 'finalized') {
        return res.status(400).json({ error: 'Periode yang sudah difinalisasi tidak bisa dihapus' });
    }

    // Detach cicilan kasbon yang sudah di-link ke slip di periode ini
    await query(
        `UPDATE advance_cicilan SET slip_id = NULL, period_id = NULL
         WHERE period_id = $1`,
        [req.params.id]
    );

    // Delete period (cascade hapus slips + allowances + deductions)
    await query(`DELETE FROM payroll_periods WHERE id = $1`, [req.params.id]);
    res.json({ message: 'Periode berhasil dihapus' });
}));

// ═══════════════════════════════════════════════════════════════════════════════
// SLIPS
// ═══════════════════════════════════════════════════════════════════════════════

// GET /slips/:id — detail slip lengkap
router.get('/slips/:id', hrView, asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;

    const slipRes = await query(
        `SELECT ps.*,
                e.uuid AS employee_uuid, e.nik, e.nama_lengkap, e.foto_url,
                ej.jabatan, ej.departemen, ej.jenis_karyawan,
                pp.bulan, pp.tahun, pp.label AS period_label, pp.status AS period_status
         FROM payroll_slips ps
         JOIN employees e ON ps.employee_id = e.id
         LEFT JOIN employee_jobs ej ON ej.employee_id = e.id AND ej.is_current = TRUE
         JOIN payroll_periods pp ON ps.period_id = pp.id
         WHERE ps.id = $1 AND ps.company_uuid = $2`,
        [req.params.id, companyUuid]
    );
    if (!slipRes.rows.length) return res.status(404).json({ error: 'Slip tidak ditemukan' });

    const slip = slipRes.rows[0];

    const allowances = await query(
        `SELECT * FROM payroll_allowances WHERE slip_id = $1 ORDER BY id ASC`, [slip.id]
    );
    const deductions = await query(
        `SELECT * FROM payroll_deductions WHERE slip_id = $1 ORDER BY id ASC`, [slip.id]
    );
    const cicilan = await query(
        `SELECT ac.*, sa.nomor AS kasbon_nomor, sa.amount AS kasbon_total
         FROM advance_cicilan ac
         JOIN salary_advances sa ON ac.advance_id = sa.id
         WHERE ac.slip_id = $1
         ORDER BY ac.urutan ASC`,
        [slip.id]
    );

    res.json({
        ...slip,
        allowances: allowances.rows,
        deductions: deductions.rows,
        cicilan_kasbon: cicilan.rows,
    });
}));

// PUT /slips/:id — update gaji_pokok, catatan + replace allowances/deductions
router.put('/slips/:id', hrWrite, asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;

    const slipRes = await query(
        `SELECT ps.id, pp.status AS period_status
         FROM payroll_slips ps
         JOIN payroll_periods pp ON ps.period_id = pp.id
         WHERE ps.id = $1 AND ps.company_uuid = $2`,
        [req.params.id, companyUuid]
    );
    if (!slipRes.rows.length) return res.status(404).json({ error: 'Slip tidak ditemukan' });
    if (slipRes.rows[0].period_status === 'finalized') {
        return res.status(400).json({ error: 'Periode sudah difinalisasi, slip tidak bisa diubah' });
    }
    const slipId = slipRes.rows[0].id;

    const { gaji_pokok, catatan, allowances = [], deductions = [] } = req.body;

    // Update gaji_pokok jika dikirim
    if (gaji_pokok !== undefined) {
        await query(
            `UPDATE payroll_slips SET gaji_pokok = $1, updated_at = NOW() WHERE id = $2`,
            [parseFloat(gaji_pokok) || 0, slipId]
        );
    }
    if (catatan !== undefined) {
        await query(
            `UPDATE payroll_slips SET catatan = $1, updated_at = NOW() WHERE id = $2`,
            [catatan?.trim() || null, slipId]
        );
    }

    // Replace allowances
    if (allowances.length >= 0) {
        await query(`DELETE FROM payroll_allowances WHERE slip_id = $1`, [slipId]);
        for (const a of allowances) {
            if (!a.nama?.trim() || !a.amount) continue;
            await query(
                `INSERT INTO payroll_allowances (slip_id, nama, amount) VALUES ($1,$2,$3)`,
                [slipId, a.nama.trim(), parseFloat(a.amount)]
            );
        }
    }

    // Replace deductions
    if (deductions.length >= 0) {
        await query(`DELETE FROM payroll_deductions WHERE slip_id = $1`, [slipId]);
        for (const d of deductions) {
            if (!d.nama?.trim() || !d.amount) continue;
            await query(
                `INSERT INTO payroll_deductions (slip_id, nama, amount) VALUES ($1,$2,$3)`,
                [slipId, d.nama.trim(), parseFloat(d.amount)]
            );
        }
    }

    // Recalc
    const totAllow = await query(
        `SELECT COALESCE(SUM(amount),0) AS t FROM payroll_allowances WHERE slip_id = $1`, [slipId]
    );
    const totDeduct = await query(
        `SELECT COALESCE(SUM(amount),0) AS t FROM payroll_deductions WHERE slip_id = $1`, [slipId]
    );
    const totKasbon = await query(
        `SELECT COALESCE(SUM(amount),0) AS t FROM advance_cicilan WHERE slip_id = $1`, [slipId]
    );
    const gpRes = await query(
        `SELECT gaji_pokok FROM payroll_slips WHERE id = $1`, [slipId]
    );

    const gp  = parseFloat(gpRes.rows[0].gaji_pokok);
    const ta  = parseFloat(totAllow.rows[0].t);
    const td  = parseFloat(totDeduct.rows[0].t);
    const tk  = parseFloat(totKasbon.rows[0].t);
    const net = gp + ta - td - tk;

    await query(
        `UPDATE payroll_slips
         SET total_tunjangan = $1, total_potongan = $2, total_kasbon = $3, net_salary = $4, updated_at = NOW()
         WHERE id = $5`,
        [ta, td, tk, net, slipId]
    );

    // Recalc period totals
    const periodRes = await query(
        `SELECT period_id FROM payroll_slips WHERE id = $1`, [slipId]
    );
    await query(
        `UPDATE payroll_periods SET
            total_gaji = (SELECT COALESCE(SUM(net_salary),0) FROM payroll_slips WHERE period_id = $1),
            total_karyawan = (SELECT COUNT(*) FROM payroll_slips WHERE period_id = $1),
            updated_at = NOW()
         WHERE id = $1`,
        [periodRes.rows[0].period_id]
    );

    res.json({ message: 'Slip berhasil diperbarui', net_salary: net });
}));

// POST /slips/:id/approve
router.post('/slips/:id/approve', hrAdmin, asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;

    const slipRes = await query(
        `SELECT ps.id, pp.status AS period_status
         FROM payroll_slips ps
         JOIN payroll_periods pp ON ps.period_id = pp.id
         WHERE ps.id = $1 AND ps.company_uuid = $2`,
        [req.params.id, companyUuid]
    );
    if (!slipRes.rows.length) return res.status(404).json({ error: 'Slip tidak ditemukan' });

    await query(
        `UPDATE payroll_slips
         SET status = 'approved', approved_by = $1, approved_at = NOW(), updated_at = NOW()
         WHERE id = $2`,
        [req.user.name, req.params.id]
    );

    res.json({ message: 'Slip disetujui' });
}));

// =============================================================================
// CORETAX eBUPOT MASA PPh 21
// =============================================================================

// ─── XML helper functions ─────────────────────────────────────────────────────
function xmlEscape(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

// Bersihkan NPWP → hanya digit (Coretax pakai 16-digit NPWP/NIK)
function formatNpwp(npwp) {
    if (!npwp) return '';
    return String(npwp).replace(/[^0-9]/g, '');
}

// Auto-derive TaxObjectCode berdasarkan jenis_karyawan & is_foreign
function deriveTaxObjectCode(taxObjectCode, jenisKaryawan, isForeign) {
    if (taxObjectCode) return taxObjectCode; // override manual diutamakan
    if (isForeign) return '21-100-32';
    const map = {
        'Tetap':    '21-100-01',
        'PKWTT':    '21-100-01',
        'PKWT':     '21-100-02',
        'Part-time':'21-100-02',
        'Magang':   '21-100-03',
        'Freelance':'21-100-03',
    };
    return map[jenisKaryawan] || '21-100-01';
}

// ─── GET /coretax-settings — Ambil NPWP (dari accounting config) + ID Tempat Usaha ─────
// NPWP diambil dari companies.npwp yang diisi via Settings → Konfigurasi Keuangan
router.get('/coretax-settings', hrView, asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const result = await query(
        `SELECT npwp, id_tempat_usaha FROM companies WHERE uuid = $1`,
        [companyUuid]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Data perusahaan tidak ditemukan' });
    res.json(result.rows[0]);
}));

// ─── PUT /coretax-settings — Simpan ID Tempat Usaha saja (NPWP diurus via accounting config) ─
router.put('/coretax-settings', hrAdmin, asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const { id_tempat_usaha } = req.body;

    await query(
        `UPDATE companies SET id_tempat_usaha = $1, updated_at = NOW() WHERE uuid = $2`,
        [(id_tempat_usaha || '000000').trim(), companyUuid]
    );

    res.json({ message: 'ID Tempat Usaha disimpan', id_tempat_usaha: id_tempat_usaha || '000000' });
}));

// ─── PUT /periods/:id/withholding-date — Set tanggal pemotongan manual ────────
router.put('/periods/:id/withholding-date', hrAdmin, asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const { withholding_date } = req.body;

    if (!withholding_date) return res.status(400).json({ error: 'withholding_date wajib diisi (format: YYYY-MM-DD)' });

    const periodRes = await query(
        `SELECT id FROM payroll_periods WHERE id = $1 AND company_uuid = $2`,
        [req.params.id, companyUuid]
    );
    if (!periodRes.rows.length) return res.status(404).json({ error: 'Periode tidak ditemukan' });

    await query(
        `UPDATE payroll_periods SET withholding_date = $1, updated_at = NOW() WHERE id = $2`,
        [withholding_date, req.params.id]
    );

    res.json({ message: 'Tanggal pemotongan disimpan', withholding_date });
}));

// ─── GET /periods/:id/bupot-xml — Generate XML eBupot Masa PPh 21 ─────────────
//
// Query params:
//   ?recalculate=true  → hitung ulang Rate dari formula (TER/manual), bukan dari actual deductions
//   ?exclude_zero=true → lewati karyawan dengan PPh 21 = 0 (opsional)
//
router.get('/periods/:id/bupot-xml', hrAdmin, asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const recalculate  = req.query.recalculate  === 'true';
    const excludeZero  = req.query.exclude_zero === 'true';

    // ── 1. Ambil data periode + NPWP perusahaan ──────────────────────────────
    const periodRes = await query(
        `SELECT pp.*, c.npwp AS company_npwp, c.id_tempat_usaha
         FROM payroll_periods pp
         JOIN companies c ON c.uuid = pp.company_uuid
         WHERE pp.id = $1 AND pp.company_uuid = $2`,
        [req.params.id, companyUuid]
    );
    if (!periodRes.rows.length) return res.status(404).json({ error: 'Periode tidak ditemukan' });
    const period = periodRes.rows[0];

    if (period.status !== 'finalized') {
        return res.status(400).json({
            error: 'Periode harus sudah difinalisasi sebelum bisa di-generate XML Coretax.',
            hint : 'Finalisasi periode terlebih dahulu via POST /periods/:id/finalize'
        });
    }

    if (!period.company_npwp) {
        return res.status(400).json({
            error : 'NPWP perusahaan belum diisi.',
            hint  : 'Isi melalui Settings → Profile Perusahaan → Konfigurasi Keuangan → NPWP Perusahaan'
        });
    }

    // ── 2. Ambil semua slip + data karyawan ──────────────────────────────────
    const slipsRes = await query(
        `SELECT
             ps.id, ps.gaji_pokok, ps.total_tunjangan, ps.net_salary,
             e.nama_lengkap, e.uuid AS employee_uuid,
             ei.no_npwp   AS karyawan_npwp,
             ei.is_foreign,
             ei.no_passport,
             ej.jabatan,
             ej.jenis_karyawan,
             eps.ptkp_status,
             eps.pph21_mode,
             eps.pph21_aktif,
             eps.pph21_nominal,
             eps.tax_object_code,
             COALESCE(
                 (SELECT SUM(pd.amount)
                  FROM payroll_deductions pd
                  WHERE pd.slip_id = ps.id
                    AND (pd.nama = 'PPh 21' OR pd.nama ILIKE 'pph%21%')
                 ), 0
             ) AS pph21_amount
         FROM payroll_slips ps
         JOIN employees e ON ps.employee_id = e.id
         LEFT JOIN employee_identities ei ON ei.employee_id = e.id
         LEFT JOIN employee_jobs ej ON ej.employee_id = e.id AND ej.is_current = TRUE
         LEFT JOIN employee_payroll_settings eps ON eps.employee_id = e.id
         WHERE ps.period_id = $1
         ORDER BY e.nama_lengkap ASC`,
        [req.params.id]
    );

    // ── 3. Tentukan WithholdingDate ───────────────────────────────────────────
    let withholdingDate;
    if (period.withholding_date) {
        // Manual override oleh HR
        withholdingDate = new Date(period.withholding_date).toISOString().split('T')[0];
    } else if (period.finalized_at) {
        // Fallback: tanggal finalisasi
        withholdingDate = new Date(period.finalized_at).toISOString().split('T')[0];
    } else {
        // Fallback: hari terakhir bulan periode
        const lastDay = new Date(period.tahun, period.bulan, 0).getDate();
        withholdingDate = `${period.tahun}-${String(period.bulan).padStart(2, '0')}-${lastDay}`;
    }

    const companyNpwp  = formatNpwp(period.company_npwp);
    const idTempatUsaha = (period.id_tempat_usaha || '000000').trim();

    // ── 4. Build XML items ────────────────────────────────────────────────────
    const skipped = [];
    let xmlItems = '';
    let totalRecords = 0;

    for (const slip of slipsRes.rows) {
        const gross = parseFloat(slip.gaji_pokok || 0) + parseFloat(slip.total_tunjangan || 0);

        // Tentukan Rate (%) PPh 21
        let rate = 0;
        let rateSource = 'actual';

        if (recalculate) {
            // Recalc: selalu gunakan TER (PMK 168/2023) — tidak simpan ke DB
            rateSource = 'recalculated-ter';
            const terResult = getRateTER(slip.ptkp_status || 'TK/0', gross);
            rate = terResult.rate * 100; // rate sudah dalam desimal, kalikan 100 → persen
        } else {
            // Actual: ambil nilai PPh 21 yang benar-benar dipotong dari slip
            const pph21Amount = parseFloat(slip.pph21_amount || 0);
            rate = gross > 0 ? (pph21Amount / gross) * 100 : 0;
        }

        if (excludeZero && rate === 0) {
            skipped.push({ name: slip.nama_lengkap, reason: 'PPh 21 = 0, di-skip (exclude_zero=true)' });
            continue;
        }

        const counterpartOpt      = slip.is_foreign ? 'Foreign' : 'Resident';
        const karyawanNpwp        = formatNpwp(slip.karyawan_npwp);
        const ptkpStatus          = xmlEscape(slip.ptkp_status || 'TK/0');
        const jabatan             = xmlEscape(slip.jabatan || '');
        const taxObjectCode       = xmlEscape(deriveTaxObjectCode(slip.tax_object_code, slip.jenis_karyawan, slip.is_foreign));
        const passportTag         = (slip.is_foreign && slip.no_passport)
            ? `<CounterpartPassport>${xmlEscape(slip.no_passport)}</CounterpartPassport>`
            : `<CounterpartPassport />`;

        xmlItems +=
`    <MmPayroll>
      <TaxPeriodMonth>${period.bulan}</TaxPeriodMonth>
      <TaxPeriodYear>${period.tahun}</TaxPeriodYear>
      <CounterpartOpt>${counterpartOpt}</CounterpartOpt>
      ${passportTag}
      <CounterpartTin>${xmlEscape(karyawanNpwp)}</CounterpartTin>
      <StatusTaxExemption>${ptkpStatus}</StatusTaxExemption>
      <Position>${jabatan}</Position>
      <TaxCertificate>N/A</TaxCertificate>
      <TaxObjectCode>${taxObjectCode}</TaxObjectCode>
      <Gross>${Math.round(gross)}</Gross>
      <Rate>${rate.toFixed(2)}</Rate>
      <IDPlaceOfBusinessActivity>${xmlEscape(idTempatUsaha)}</IDPlaceOfBusinessActivity>
      <WithholdingDate>${withholdingDate}</WithholdingDate>
    </MmPayroll>\n`;

        totalRecords++;
    }

    // ── 5. Build full XML document ────────────────────────────────────────────
    const xml =
`<?xml version="1.0" encoding="utf-8"?>
<!-- eBupot Masa PPh 21 — Generated by Matrix ERP -->
<!-- Periode: ${period.label} | Records: ${totalRecords} | Tanggal Potong: ${withholdingDate} | Mode: ${recalculate ? 'recalc-TER (PMK 168/2023)' : 'actual-deductions'} -->
<MmPayrollBulk xsi:noNamespaceSchemaLocation="schema.xsd" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <TIN>${xmlEscape(companyNpwp)}</TIN>
  <ListOfMmPayroll>
${xmlItems}  </ListOfMmPayroll>
</MmPayrollBulk>`;

    // ── 6. Log ke audit trail ─────────────────────────────────────────────────
    await query(
        `INSERT INTO audit_trail (action, module, description, user_id, user_name, branch_id)
         VALUES ('export', 'hr', $1, $2, $3, $4)`,
        [
            `Export XML eBupot PPh 21: ${period.label} (${totalRecords} records, mode: ${recalculate ? 'recalculate' : 'actual'})`,
            req.user.id, req.user.name, req.user.branch_id,
        ]
    );

    // ── 7. Return XML file ────────────────────────────────────────────────────
    const filename = `bupot_pph21_${period.bulan}_${period.tahun}.xml`;
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Jika ada yang di-skip, sertakan info di header
    if (skipped.length > 0) {
        res.setHeader('X-Skipped-Records', skipped.length);
        res.setHeader('X-Skipped-Names', skipped.map(s => s.name).join(', ').substring(0, 200));
    }

    res.send(xml);
}));

module.exports = router;
