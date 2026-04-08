const router = require('express').Router();
const { query } = require('../../config/db');
const { authenticateToken, requirePermission } = require('../../middleware/auth');
const { asyncHandler, resolveUUID } = require('../../utils/helpers');

router.use(authenticateToken);

// ── Helper: get company fiscal config ────────────────────────────────────────
async function getFiscalConfig(companyId) {
    const r = await query(
        `SELECT fiscal_year_start_month, closing_deadline_day FROM companies WHERE id = $1`,
        [companyId]
    );
    return {
        startMonth: r.rows[0]?.fiscal_year_start_month || 1,
        deadlineDay: r.rows[0]?.closing_deadline_day || 5
    };
}

// ── Helper: calculate period deadline date ───────────────────────────────────
// Deadline = closing_deadline_day of the month AFTER period_end
function getDeadlineDate(periodEnd, deadlineDay) {
    const end = new Date(periodEnd);
    const nextMonth = new Date(end.getFullYear(), end.getMonth() + 1, 1);
    // Cap deadline day to last day of next month
    const lastDay = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate();
    const day = Math.min(deadlineDay, lastDay);
    return new Date(nextMonth.getFullYear(), nextMonth.getMonth(), day);
}

// ── Helper: format month name (Indonesian) ───────────────────────────────────
const BULAN = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

// ── GET /dashboard — Closing dashboard summary ──────────────────────────────
router.get('/dashboard', requirePermission('accounting:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const { branch_id } = req.query;

    let where = ['b.company_id = $1']; let values = [companyId]; let idx = 2;
    if (branch_id) {
        const rBranch = await resolveUUID(branch_id, 'branches', query);
        where.push(`cp.branch_id = $${idx++}`); values.push(rBranch);
    }
    const wc = 'WHERE ' + where.join(' AND ');

    // Get fiscal config for deadline calculation
    const fiscal = await getFiscalConfig(companyId);

    // Update overdue flags first
    await query(`
        UPDATE closing_periods cp
        SET is_overdue = TRUE
        FROM branches b
        JOIN companies c ON b.company_id = c.id
        WHERE cp.branch_id = b.id
          AND cp.status = 'open'
          AND cp.period_type = 'monthly'
          AND cp.is_overdue = FALSE
          AND NOW()::date > (cp.period_end + INTERVAL '1 month')::DATE
                            + ((COALESCE(c.closing_deadline_day, 5) - 1) || ' days')::INTERVAL
    `);

    const result = await query(`
        SELECT
            COUNT(*) FILTER (WHERE cp.status = 'open') AS open_count,
            COUNT(*) FILTER (WHERE cp.status = 'closed') AS closed_count,
            COUNT(*) FILTER (WHERE cp.is_overdue = TRUE AND cp.status = 'open') AS overdue_count,
            COUNT(*) AS total_count
        FROM closing_periods cp
        LEFT JOIN branches b ON cp.branch_id = b.id
        ${wc}
    `, values);

    // Get the current period (latest open) for this branch
    let currentPeriod = null;
    if (branch_id) {
        const rBranch = await resolveUUID(branch_id, 'branches', query);
        const cp = await query(`
            SELECT cp.uuid, cp.period_start, cp.period_end, cp.status, cp.fiscal_year, cp.fiscal_month, cp.is_overdue
            FROM closing_periods cp
            WHERE cp.branch_id = $1 AND cp.status = 'open' AND cp.period_type = 'monthly'
            ORDER BY cp.period_start ASC LIMIT 1
        `, [rBranch]);
        if (cp.rows.length > 0) {
            const p = cp.rows[0];
            const deadline = getDeadlineDate(p.period_end, fiscal.deadlineDay);
            const now = new Date();
            const diffDays = Math.ceil((deadline - now) / 86400000);
            currentPeriod = {
                ...p,
                deadline_date: deadline.toISOString().split('T')[0],
                days_remaining: diffDays,
                is_overdue: diffDays < 0
            };
        }
    }

    res.json({
        ...result.rows[0],
        fiscal_year_start_month: fiscal.startMonth,
        closing_deadline_day: fiscal.deadlineDay,
        current_period: currentPeriod
    });
}));

// ── GET / — all closing periods (enhanced) ──────────────────────────────────
router.get('/', requirePermission('accounting:view'), asyncHandler(async (req, res) => {
    const { branch_id, fiscal_year } = req.query;
    const companyId = req.user.company_id;
    let where = ['b.company_id = $1']; let values = [companyId]; let idx = 2;
    if (branch_id) {
        const rBranch = await resolveUUID(branch_id, 'branches', query);
        where.push(`cp.branch_id = $${idx++}`); values.push(rBranch);
    }
    if (fiscal_year) {
        where.push(`cp.fiscal_year = $${idx++}`); values.push(parseInt(fiscal_year));
    }
    const wc = 'WHERE ' + where.join(' AND ');

    // Get deadline config
    const fiscal = await getFiscalConfig(companyId);

    const result = await query(
        `SELECT cp.id, cp.uuid, cp.period_type, cp.period_start, cp.period_end,
                cp.status, cp.closed_by, cp.closed_at, cp.notes,
                cp.fiscal_year, cp.fiscal_month, cp.is_overdue, cp.company_id,
                b.name as branch_name, b.uuid as branch_id
         FROM closing_periods cp
         LEFT JOIN branches b ON cp.branch_id = b.id
         ${wc} ORDER BY cp.period_start ASC`, values
    );

    // Enrich with deadline info
    const rows = result.rows.map(p => {
        if (p.period_type === 'monthly' && p.period_end) {
            const deadline = getDeadlineDate(p.period_end, fiscal.deadlineDay);
            const now = new Date();
            const diffDays = Math.ceil((deadline - now) / 86400000);
            p.deadline_date = deadline.toISOString().split('T')[0];
            p.days_remaining = diffDays;
            if (p.status === 'open' && diffDays < 0) p.is_overdue = true;
        }
        return p;
    });

    res.json(rows);
}));

// ── GET /stats — outstanding items before closing ───────────────────────────
router.get('/stats', requirePermission('accounting:view'), asyncHandler(async (req, res) => {
    const { branch_id, period_start, period_end } = req.query;
    if (!branch_id || !period_start || !period_end) return res.status(400).json({ error: 'branch_id, period_start, period_end required' });
    const rBranch = await resolveUUID(branch_id, 'branches', query);

    // Hitung semua transaksi outstanding yang dibuat SAMPAI DENGAN akhir periode
    // (termasuk carry-over dari periode sebelumnya yang belum selesai)
    const [unpaidPO, unpaidInvoices, pendingOpname, pendingTransfer] = await Promise.all([
        query(`SELECT COUNT(*) as count FROM purchase_orders WHERE branch_id=$1 AND status NOT IN ('paid','rejected') AND date <= $2`, [rBranch, period_end]),
        query(`SELECT COUNT(*) as count FROM invoices WHERE branch_id=$1 AND status != 'paid' AND date <= $2`, [rBranch, period_end]),
        query(`SELECT COUNT(*) as count FROM stock_opnames WHERE branch_id=$1 AND status IN ('draft','pending') AND date <= $2`, [rBranch, period_end]),
        query(`SELECT COUNT(*) as count FROM stock_transfers WHERE branch_id=$1 AND status NOT IN ('received') AND date <= $2`, [rBranch, period_end]),
    ]);

    res.json({
        unpaid_po: parseInt(unpaidPO.rows[0].count),
        unpaid_invoices: parseInt(unpaidInvoices.rows[0].count),
        pending_opname: parseInt(pendingOpname.rows[0].count),
        pending_transfer: parseInt(pendingTransfer.rows[0].count),
    });
}));

// ── POST /generate-year — Auto-generate 12 monthly periods ──────────────────
router.post('/generate-year', requirePermission('accounting:create'), asyncHandler(async (req, res) => {
    const { year, branch_id } = req.body;
    if (!year || !branch_id) return res.status(400).json({ error: 'year dan branch_id wajib diisi' });

    const companyId = req.user.company_id;
    const rBranch = await resolveUUID(branch_id, 'branches', query);
    const fiscal = await getFiscalConfig(companyId);

    // Check for existing periods in this year for this branch
    const existing = await query(
        `SELECT fiscal_month FROM closing_periods
         WHERE branch_id = $1 AND fiscal_year = $2 AND period_type = 'monthly' AND status != 'cancelled'`,
        [rBranch, year]
    );
    const existingMonths = new Set(existing.rows.map(r => r.fiscal_month));

    const created = [];
    for (let i = 0; i < 12; i++) {
        // Calculate actual month based on fiscal year start
        const actualMonth = ((fiscal.startMonth - 1 + i) % 12); // 0-indexed
        const calYear = fiscal.startMonth + i > 12 ? year + 1 : year;
        const adjustedYear = actualMonth < (fiscal.startMonth - 1) ? year + 1 : year;
        const fiscalMonth = i + 1; // 1-12 within fiscal year

        // Skip if already exists
        if (existingMonths.has(fiscalMonth)) continue;

        // Calculate period start/end (calendar month)
        // Manual formatting to avoid timezone shift dari toISOString()
        const month1 = actualMonth + 1; // 1-indexed
        const lastDay = new Date(adjustedYear, actualMonth + 1, 0).getDate();
        const startStr = `${adjustedYear}-${String(month1).padStart(2, '0')}-01`;
        const endStr = `${adjustedYear}-${String(month1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

        const result = await query(
            `INSERT INTO closing_periods (period_type, period_start, period_end, branch_id, company_id,
                                          status, fiscal_year, fiscal_month, created_by)
             VALUES ('monthly', $1, $2, $3, $4, 'open', $5, $6, $7)
             RETURNING uuid, period_start, period_end, fiscal_year, fiscal_month`,
            [startStr, endStr, rBranch, companyId, year, fiscalMonth, req.user.name]
        );
        created.push(result.rows[0]);
    }

    if (created.length === 0) {
        return res.status(400).json({ error: `Semua 12 periode untuk tahun fiskal ${year} sudah ada` });
    }

    res.status(201).json({
        message: `${created.length} periode berhasil dibuat untuk tahun fiskal ${year}`,
        created
    });
}));

// ── POST / — create single closing period (existing, enhanced) ──────────────
router.post('/', requirePermission('accounting:create'), asyncHandler(async (req, res) => {
    const { period_type, period_start, period_end, branch_id, notes } = req.body;
    if (!period_type || !period_start || !period_end || !branch_id) {
        return res.status(400).json({ error: 'period_type, period_start, period_end, branch_id required' });
    }
    const companyId = req.user.company_id;
    const rBranch = await resolveUUID(branch_id, 'branches', query);

    // Check for overlapping periods
    const overlap = await query(
        `SELECT id FROM closing_periods WHERE branch_id=$1 AND period_type=$2 AND status != 'cancelled'
         AND (period_start <= $4 AND period_end >= $3)`,
        [rBranch, period_type, period_start, period_end]
    );
    if (overlap.rows.length > 0) return res.status(400).json({ error: 'Sudah ada periode tutup buku yang overlap' });

    // Derive fiscal_year and fiscal_month
    const startDate = new Date(period_start);
    const fiscalYear = startDate.getFullYear();
    const fiscalMonth = startDate.getMonth() + 1;

    const result = await query(
        `INSERT INTO closing_periods (period_type, period_start, period_end, branch_id, company_id,
                                      status, notes, created_by, fiscal_year, fiscal_month)
         VALUES ($1, $2, $3, $4, $5, 'open', $6, $7, $8, $9)
         RETURNING uuid, period_type, period_start, period_end, status, fiscal_year, fiscal_month`,
        [period_type, period_start, period_end, rBranch, companyId, notes || null, req.user.name, fiscalYear, fiscalMonth]
    );
    res.status(201).json(result.rows[0]);
}));

// ── PUT /:uuid/close — close period (with sequential lock) ──────────────────
router.put('/:uuid/close', requirePermission('accounting:create'), asyncHandler(async (req, res) => {
    // Get the period being closed
    const period = await query(
        `SELECT cp.id, cp.branch_id, cp.period_start, cp.period_end, cp.status,
                cp.fiscal_year, cp.fiscal_month, cp.period_type
         FROM closing_periods cp WHERE cp.uuid = $1`,
        [req.params.uuid]
    );
    if (period.rows.length === 0) return res.status(404).json({ error: 'Periode tidak ditemukan' });

    const p = period.rows[0];
    if (p.status !== 'open') return res.status(400).json({ error: 'Periode sudah ditutup atau dibatalkan' });

    // Sequential lock: check if previous month is closed (for monthly periods)
    if (p.period_type === 'monthly' && p.fiscal_month > 1) {
        const prevPeriod = await query(
            `SELECT cp.status, cp.period_start, cp.period_end
             FROM closing_periods cp
             WHERE cp.branch_id = $1 AND cp.fiscal_year = $2 AND cp.fiscal_month = $3
               AND cp.period_type = 'monthly' AND cp.status != 'cancelled'
             LIMIT 1`,
            [p.branch_id, p.fiscal_year, p.fiscal_month - 1]
        );
        if (prevPeriod.rows.length > 0 && prevPeriod.rows[0].status !== 'closed') {
            const prevStart = new Date(prevPeriod.rows[0].period_start);
            const monthName = BULAN[prevStart.getMonth()];
            return res.status(400).json({
                error: `Tidak bisa menutup periode ini. Periode sebelumnya (${monthName} ${prevStart.getFullYear()}) belum ditutup.`,
                code: 'SEQUENTIAL_LOCK'
            });
        }
    }

    const result = await query(
        `UPDATE closing_periods SET status='closed', closed_by=$1, closed_at=NOW(), is_overdue=FALSE, updated_at=NOW()
         WHERE uuid=$2 AND status='open' RETURNING uuid, status, closed_by, closed_at`,
        [req.user.name, req.params.uuid]
    );
    if (result.rows.length === 0) return res.status(400).json({ error: 'Gagal menutup periode' });
    res.json(result.rows[0]);
}));

// ── PUT /:uuid/reopen — reopen a closed period ─────────────────────────────
router.put('/:uuid/reopen', requirePermission('accounting:create'), asyncHandler(async (req, res) => {
    const result = await query(
        `UPDATE closing_periods SET status='open', closed_by=NULL, closed_at=NULL, updated_at=NOW()
         WHERE uuid=$1 AND status='closed' RETURNING uuid, status`,
        [req.params.uuid]
    );
    if (result.rows.length === 0) return res.status(400).json({ error: 'Periode tidak ditemukan atau sudah open' });
    res.json(result.rows[0]);
}));

module.exports = router;
