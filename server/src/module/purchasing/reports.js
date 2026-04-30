/**
 * purchasing/reports.js
 * Laporan Rekap Pembelian — endpoint untuk RekapPembelianView
 *
 * Endpoints:
 *   GET /api/purchasing/reports/rekap  → summary + trend + top suppliers
 */
const router = require('express').Router();
const { query } = require('../../config/db');
const { requirePermission } = require('../../middleware/auth');
const { asyncHandler } = require('../../utils/helpers');

// ─────────────────────────────────────────────────────────────
// Helper: format label periode
// ─────────────────────────────────────────────────────────────
function buildPeriodExpr(period, col) {
    switch (period) {
        case 'weekly':  return `TO_CHAR(DATE_TRUNC('week', ${col}::date), 'YYYY-"W"IW')`;
        case 'monthly': return `TO_CHAR(DATE_TRUNC('month', ${col}::date), 'YYYY-MM')`;
        default:        return `TO_CHAR(${col}::date, 'YYYY-MM-DD')`; // daily
    }
}

// ─────────────────────────────────────────────────────────────
// Helper: hitung periode sebelumnya (untuk perbandingan growth)
// ─────────────────────────────────────────────────────────────
function shiftPeriod(dateFrom, dateTo) {
    const from = new Date(dateFrom);
    const to   = new Date(dateTo);
    const diff = to - from; // ms
    const prevTo   = new Date(from - 1);          // sehari sebelum from
    const prevFrom = new Date(prevTo - diff);     // same duration
    return {
        prevFrom: prevFrom.toISOString().split('T')[0],
        prevTo:   prevTo.toISOString().split('T')[0],
    };
}

// ─────────────────────────────────────────────────────────────
// Helper: hitung total nilai PO (subtotal lines setelah disc +
//         extra_discount + tax_amount)
// ─────────────────────────────────────────────────────────────
const PO_VALUE_EXPR = `
    ROUND(
        COALESCE((SELECT SUM(pol.qty * pol.price * (1 - COALESCE(pol.discount,0)/100))
                  FROM purchase_order_lines pol WHERE pol.po_id = po.id), 0)
        * (1 - COALESCE(po.extra_discount,0)/100)
        + COALESCE(po.tax_amount, 0)
    )
`;

const PO_VALID_STATUSES = `('approved','partial','processed','billed','paid')`;

// ─────────────────────────────────────────────────────────────
// GET /rekap
// Query: period (daily|weekly|monthly), date_from, date_to,
//        branch_id (uuid)
// ─────────────────────────────────────────────────────────────
router.get('/rekap', requirePermission('purchasing:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const { period = 'monthly', date_from, date_to, branch_id } = req.query;

    // Default: bulan ini
    const now      = new Date();
    const fromDate = date_from || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const toDate   = date_to   || now.toISOString().split('T')[0];

    // ── Build WHERE ─────────────────────────────────────────
    let where = [
        `b.company_id = $1`,
        `po.status IN ${PO_VALID_STATUSES}`,
        `po.date BETWEEN $2 AND $3`,
    ];
    let vals = [companyId, fromDate, toDate];
    let idx = 4;

    if (branch_id) {
        where.push(`b.uuid = $${idx++}`);
        vals.push(branch_id);
    }
    const whereClause = 'WHERE ' + where.join(' AND ');

    const periodExpr = buildPeriodExpr(period, 'po.date');

    // ── Trend per periode ───────────────────────────────────
    const trendSql = `
        SELECT ${periodExpr} AS label,
               COALESCE(SUM(${PO_VALUE_EXPR}), 0) AS total_value,
               COUNT(po.id) AS transaksi
        FROM purchase_orders po
        JOIN branches b ON po.branch_id = b.id
        ${whereClause}
        GROUP BY 1 ORDER BY 1
    `;

    // ── Top 5 Suppliers ─────────────────────────────────────
    const topSupplierSql = `
        SELECT s.name AS supplier_name,
               COALESCE(SUM(${PO_VALUE_EXPR}), 0) AS total_value
        FROM purchase_orders po
        JOIN branches b   ON po.branch_id   = b.id
        JOIN suppliers s  ON po.supplier_id = s.id
        ${whereClause}
        GROUP BY s.id, s.name
        ORDER BY total_value DESC
        LIMIT 5
    `;

    const [trendRes, topSupRes] = await Promise.all([
        query(trendSql, vals),
        query(topSupplierSql, vals),
    ]);

    const trend = trendRes.rows.map(r => ({
        label:       r.label,
        total_value: parseFloat(r.total_value) || 0,
        transaksi:   parseInt(r.transaksi)     || 0,
    }));

    // ── Summary periode aktif ───────────────────────────────
    const totalPOValue   = trend.reduce((s, r) => s + r.total_value, 0);
    const totalTransaksi = trend.reduce((s, r) => s + r.transaksi, 0);
    const rataRata       = totalTransaksi > 0 ? totalPOValue / totalTransaksi : 0;

    // ── Top suppliers (with percentage) ─────────────────────
    const maxSupVal = parseFloat(topSupRes.rows[0]?.total_value) || 1;
    const topSuppliers = topSupRes.rows.map(r => ({
        supplier_name: r.supplier_name,
        total_value:   parseFloat(r.total_value) || 0,
        pct:           Math.round((parseFloat(r.total_value) || 0) / maxSupVal * 100),
    }));

    // ── Growth vs periode sebelumnya ────────────────────────
    const { prevFrom, prevTo } = shiftPeriod(fromDate, toDate);
    let prevWhere = [
        `b.company_id = $1`,
        `po.status IN ${PO_VALID_STATUSES}`,
        `po.date BETWEEN $2 AND $3`,
    ];
    let prevVals = [companyId, prevFrom, prevTo];

    const prevSql = `
        SELECT COALESCE(SUM(${PO_VALUE_EXPR}), 0) AS total_value
        FROM purchase_orders po
        JOIN branches b ON po.branch_id = b.id
        WHERE ${prevWhere.join(' AND ')}
    `;
    const prevRes = await query(prevSql, prevVals);
    const prevTotal = parseFloat(prevRes.rows[0]?.total_value) || 0;
    const growthPct = prevTotal > 0
        ? Math.round(((totalPOValue - prevTotal) / prevTotal) * 10000) / 100
        : null;

    res.json({
        summary: {
            total_po_value:  totalPOValue,
            total_transaksi: totalTransaksi,
            rata_rata:       rataRata,
            prev_total:      prevTotal,
            growth_pct:      growthPct,
        },
        trend,
        top_suppliers: topSuppliers,
        filters: { period, date_from: fromDate, date_to: toDate },
    });
}));

// ─────────────────────────────────────────────────────────────
// GET /suppliers
// List supplier yang pernah ada PO → dropdown filter
// ─────────────────────────────────────────────────────────────
router.get('/suppliers', requirePermission('purchasing:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const result = await query(
        `SELECT DISTINCT s.uuid, s.name
         FROM suppliers s
         JOIN purchase_orders po ON po.supplier_id = s.id
         JOIN branches b        ON po.branch_id   = b.id
         WHERE b.company_id = $1 AND s.name IS NOT NULL
         ORDER BY s.name`,
        [companyId]
    );
    res.json(result.rows);
}));

// ─────────────────────────────────────────────────────────────
// GET /po-list
// Laporan daftar PO dengan status penerimaan, aging, dan KPI summary
// Query: date_from, date_to, branch_id (uuid), supplier_id (uuid),
//        status (pipe-separated, e.g. "approved|partial")
// ─────────────────────────────────────────────────────────────
router.get('/po-list', requirePermission('purchasing:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const {
        date_from,
        date_to,
        branch_id,
        supplier_id,
        status,     // bisa "approved|partial" — pipe-separated
    } = req.query;

    // Default: bulan ini
    const now      = new Date();
    const fromDate = date_from || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const toDate   = date_to   || now.toISOString().split('T')[0];

    // ── Build WHERE ─────────────────────────────────────────
    let where   = ['b.company_id = $1', 'po.date BETWEEN $2 AND $3'];
    let values  = [companyId, fromDate, toDate];
    let idx     = 4;

    if (branch_id) {
        where.push(`b.uuid = $${idx++}`);
        values.push(branch_id);
    }
    if (supplier_id) {
        where.push(`s.uuid = $${idx++}`);
        values.push(supplier_id);
    }
    if (status) {
        const statuses = status.split('|').map(s => s.trim()).filter(Boolean);
        if (statuses.length > 0) {
            const placeholders = statuses.map(() => `$${idx++}`).join(', ');
            where.push(`po.status IN (${placeholders})`);
            values.push(...statuses);
        }
    }

    const whereClause = 'WHERE ' + where.join(' AND ');

    // ── Main query — PO rows ────────────────────────────────
    const rowsSql = `
        SELECT
            po.uuid,
            po.number,
            po.date,
            po.status,
            po.created_by,
            s.name                   AS supplier_name,
            b.name                   AS branch_name,
            -- Nilai PO: subtotal lines after disc + extra disc + tax
            ROUND(
                COALESCE((SELECT SUM(pol.qty * pol.price * (1 - COALESCE(pol.discount,0)/100))
                          FROM purchase_order_lines pol WHERE pol.po_id = po.id), 0)
                * (1 - COALESCE(po.extra_discount,0)/100)
                + COALESCE(po.tax_amount, 0)
            )                               AS nilai_po,
            -- Total qty ordered
            COALESCE(
                (SELECT SUM(pol.qty) FROM purchase_order_lines pol WHERE pol.po_id = po.id), 0
            )                               AS total_qty,
            -- Total qty sudah diterima via Goods Receives
            COALESCE(
                (SELECT SUM(grl.qty)
                 FROM goods_receive_lines grl
                 JOIN goods_receives gr ON gr.id = grl.gr_id
                 WHERE gr.po_id = po.id), 0
            )                               AS received_qty,
            -- Aging: jumlah hari sejak tanggal PO
            (CURRENT_DATE - po.date::date)  AS aging_days
        FROM purchase_orders po
        LEFT JOIN suppliers s ON po.supplier_id = s.id
        LEFT JOIN branches  b ON po.branch_id   = b.id
        ${whereClause}
        ORDER BY po.date DESC, po.number DESC
    `;

    const rowsRes = await query(rowsSql, values);
    const rows = rowsRes.rows.map(r => {
        const totalQty    = parseFloat(r.total_qty)    || 0;
        const receivedQty = parseFloat(r.received_qty) || 0;
        const pctReceived = totalQty > 0
            ? Math.round((receivedQty / totalQty) * 100)
            : 0;
        // Aging hanya untuk PO yang belum selesai
        const isFinished = ['paid', 'billed', 'rejected', 'closed'].includes(r.status);
        const agingDays  = isFinished ? null : parseInt(r.aging_days) || 0;
        const isLate     = !isFinished && agingDays !== null && agingDays > 7;

        return {
            uuid:          r.uuid,
            number:        r.number,
            date:          r.date,
            status:        r.status,
            created_by:    r.created_by,
            supplier_name: r.supplier_name,
            branch_name:   r.branch_name,
            nilai_po:      parseFloat(r.nilai_po)     || 0,
            total_qty:     totalQty,
            received_qty:  receivedQty,
            pct_received:  pctReceived,
            aging_days:    agingDays,
            is_late:       isLate,
        };
    });

    // ── Summary / KPI ───────────────────────────────────────
    const totalPO     = rows.length;
    const totalNilai  = rows.reduce((s, r) => s + r.nilai_po, 0);
    const poTerbuka   = rows.filter(r => !['paid', 'billed', 'rejected', 'closed'].includes(r.status)).length;
    const poTerlambat = rows.filter(r => r.is_late).length;
    const poSelesai   = rows.filter(r => ['paid', 'billed', 'closed'].includes(r.status)).length;

    res.json({
        summary: {
            total_po:       totalPO,
            total_nilai:    totalNilai,
            po_terbuka:     poTerbuka,
            po_terlambat:   poTerlambat,
            po_selesai:     poSelesai,
        },
        rows,
        filters: { date_from: fromDate, date_to: toDate },
    });
}));

module.exports = router;
