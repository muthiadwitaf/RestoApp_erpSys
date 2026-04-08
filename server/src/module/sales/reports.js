/**
 * sales/reports.js
 * Laporan Rekap Penjualan — endpoint untuk SalesRekapView
 *
 * Endpoints:
 *   GET /api/sales/reports/rekap           → summary + trend data
 *   GET /api/sales/reports/rekap/salespersons → list salesperson untuk filter
 */
const router = require('express').Router();
const { query } = require('../../config/db');
const { authenticateToken, requirePermission } = require('../../middleware/auth');
const { asyncHandler } = require('../../utils/helpers');

router.use(authenticateToken);

const UNIFIED_POS_SQL = `
    (
        SELECT id, created_at, date, total, subtotal, discount_pct, cashier_id, branch_id, payment_method, items_json::jsonb AS items_json
        FROM pos_transactions
        UNION ALL
        SELECT id, paid_at AS created_at, paid_at::date AS date, total, subtotal, discount_pct, cashier_id, branch_id, payment_method, 
               (
                   SELECT COALESCE(jsonb_agg(json_build_object('uuid', ri.uuid, 'name', ri.item_name, 'price', ri.price, 'qty', ri.qty, 'subtotal', ri.subtotal)), '[]'::jsonb) 
                   FROM resto_order_items ri WHERE ri.order_id = resto_orders.id
               ) AS items_json
        FROM resto_orders WHERE status = 'paid'
    ) pt
`;

// ─────────────────────────────────────────────────────────────
// Helper: format label periode
// ─────────────────────────────────────────────────────────────
function buildPeriodExpr(period) {
    switch (period) {
        case 'weekly':  return `TO_CHAR(DATE_TRUNC('week', d::date), 'YYYY-"W"IW')`;
        case 'monthly': return `TO_CHAR(DATE_TRUNC('month', d::date), 'YYYY-MM')`;
        default:        return `TO_CHAR(d::date, 'YYYY-MM-DD')`; // daily
    }
}

// ─────────────────────────────────────────────────────────────
// Helper: hitung periode sebelumnya (untuk perbandingan growth)
// ─────────────────────────────────────────────────────────────
function shiftPeriod(dateFrom, dateTo) {
    const from = new Date(dateFrom);
    const to   = new Date(dateTo);
    const diff = to - from; // ms
    const prevTo   = new Date(from - 1);             // sehari sebelum from
    const prevFrom = new Date(prevTo - diff);        // same duration
    return {
        prevFrom: prevFrom.toISOString().split('T')[0],
        prevTo:   prevTo.toISOString().split('T')[0],
    };
}

// ─────────────────────────────────────────────────────────────
// GET /rekap
// Query: period (daily|weekly|monthly), date_from, date_to,
//        branch_id (uuid), created_by (username)
// ─────────────────────────────────────────────────────────────
router.get('/rekap', requirePermission('reportingsales:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const { period = 'monthly', date_from, date_to, branch_id, created_by } = req.query;

    // Default: bulan ini
    const now       = new Date();
    const fromDate  = date_from || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const toDate    = date_to   || now.toISOString().split('T')[0];

    // ── Build WHERE untuk SO ────────────────────────────────
    let soWhere = [
        `b.company_id = $1`,
        `so.status IN ('approved','partial','processed','paid')`,
        `so.date BETWEEN $2 AND $3`,
    ];
    let soVals = [companyId, fromDate, toDate];
    let idx = 4;

    if (branch_id) {
        soWhere.push(`b.uuid = $${idx++}`);
        soVals.push(branch_id);
    }
    if (created_by) {
        soWhere.push(`so.created_by = $${idx++}`);
        soVals.push(created_by);
    }
    const soWhereClause = 'WHERE ' + soWhere.join(' AND ');

    // ── Build WHERE untuk POS ───────────────────────────────
    let posWhere = [
        `b.company_id = $1`,
        `pt.created_at::date BETWEEN $2 AND $3`,
    ];
    let posVals = [companyId, fromDate, toDate];
    let pidx = 4;

    if (branch_id) {
        posWhere.push(`b.uuid = $${pidx++}`);
        posVals.push(branch_id);
    }
    if (created_by) {
        posWhere.push(`pt.cashier_id = (SELECT id FROM users WHERE username = $${pidx++} LIMIT 1)`);
        posVals.push(created_by);
    }
    const posWhereClause = 'WHERE ' + posWhere.join(' AND ');

    const periodExpr = buildPeriodExpr(period);

    // ── SO Trend ────────────────────────────────────────────
    const soTrendSql = `
        SELECT ${periodExpr.replace(/d::/g, 'so.date::')} AS label,
               COALESCE(SUM(
                   COALESCE((SELECT SUM(sol.qty * sol.price * (1 - COALESCE(sol.discount,0)/100))
                             FROM sales_order_lines sol WHERE sol.so_id = so.id), 0)
                   + COALESCE(so.tax_amount, 0)
               ), 0) AS omzet,
               COUNT(so.id) AS transaksi
        FROM sales_orders so
        JOIN branches b ON so.branch_id = b.id
        ${soWhereClause}
        GROUP BY 1 ORDER BY 1
    `;

    // ── POS Trend ───────────────────────────────────────────
    const posTrendSql = `
        SELECT ${periodExpr.replace(/d::/g, 'pt.created_at::')} AS label,
               COALESCE(SUM(pt.total), 0) AS omzet,
               COUNT(pt.id)               AS transaksi
        FROM ${UNIFIED_POS_SQL}
        JOIN branches b ON pt.branch_id = b.id
        ${posWhereClause}
        GROUP BY 1 ORDER BY 1
    `;

    const [soTrend, posTrend] = await Promise.all([
        query(soTrendSql, soVals),
        query(posTrendSql, posVals),
    ]);

    // ── Merge SO + POS per label ────────────────────────────
    const trendMap = {};
    for (const row of soTrend.rows) {
        trendMap[row.label] = {
            label: row.label,
            omzet: parseFloat(row.omzet) || 0,
            transaksi: parseInt(row.transaksi) || 0,
        };
    }
    for (const row of posTrend.rows) {
        if (trendMap[row.label]) {
            trendMap[row.label].omzet     += parseFloat(row.omzet) || 0;
            trendMap[row.label].transaksi += parseInt(row.transaksi) || 0;
        } else {
            trendMap[row.label] = {
                label: row.label,
                omzet: parseFloat(row.omzet) || 0,
                transaksi: parseInt(row.transaksi) || 0,
            };
        }
    }
    const trend = Object.values(trendMap).sort((a, b) => a.label.localeCompare(b.label));

    // ── Summary periode aktif ───────────────────────────────
    const totalOmzet      = trend.reduce((s, r) => s + r.omzet, 0);
    const totalTransaksi  = trend.reduce((s, r) => s + r.transaksi, 0);
    const rataRata        = totalTransaksi > 0 ? totalOmzet / totalTransaksi : 0;

    // ── Summary periode sebelumnya (untuk growth) ───────────
    const { prevFrom, prevTo } = shiftPeriod(fromDate, toDate);

    const prevSoSql = `
        SELECT COALESCE(SUM(
            COALESCE((SELECT SUM(sol.qty * sol.price * (1 - COALESCE(sol.discount,0)/100))
                      FROM sales_order_lines sol WHERE sol.so_id = so.id), 0)
            + COALESCE(so.tax_amount, 0)
        ), 0) AS omzet
        FROM sales_orders so JOIN branches b ON so.branch_id = b.id
        WHERE b.company_id = $1
          AND so.status IN ('approved','partial','processed','paid')
          AND so.date BETWEEN $2 AND $3
    `;
    const prevPosSql = `
        SELECT COALESCE(SUM(pt.total), 0) AS omzet
        FROM ${UNIFIED_POS_SQL} JOIN branches b ON pt.branch_id = b.id
        WHERE b.company_id = $1 AND pt.created_at::date BETWEEN $2 AND $3
    `;
    const [prevSo, prevPos] = await Promise.all([
        query(prevSoSql, [companyId, prevFrom, prevTo]),
        query(prevPosSql, [companyId, prevFrom, prevTo]),
    ]);
    const prevOmzet = (parseFloat(prevSo.rows[0]?.omzet) || 0) + (parseFloat(prevPos.rows[0]?.omzet) || 0);
    const growthPct = prevOmzet > 0
        ? Math.round(((totalOmzet - prevOmzet) / prevOmzet) * 10000) / 100
        : null; // null = tidak ada data pembanding

    res.json({
        summary: {
            total_omzet:     totalOmzet,
            total_transaksi: totalTransaksi,
            rata_rata:       rataRata,
            prev_omzet:      prevOmzet,
            growth_pct:      growthPct,
        },
        trend,
        filters: { period, date_from: fromDate, date_to: toDate },
    });
}));

// ─────────────────────────────────────────────────────────────
// GET /rekap/salespersons
// List user yang pernah buat SO di company ini → dropdown filter
// ─────────────────────────────────────────────────────────────
router.get('/rekap/salespersons', requirePermission('reportingsales:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const result = await query(
        `SELECT DISTINCT so.created_by AS username
         FROM sales_orders so
         JOIN branches b ON so.branch_id = b.id
         WHERE b.company_id = $1 AND so.created_by IS NOT NULL
         UNION
         SELECT DISTINCT u.username AS username
         FROM ${UNIFIED_POS_SQL}
         JOIN branches b ON pt.branch_id = b.id
         JOIN users u    ON u.id = pt.cashier_id
         WHERE b.company_id = $1 AND u.username IS NOT NULL
         ORDER BY username`,
        [companyId]
    );
    res.json(result.rows);
}));

// ─────────────────────────────────────────────────────────────
// GET /so-list
// Laporan daftar SO dengan status fulfillment, aging, dan KPI summary
// Query: date_from, date_to, branch_id (uuid), customer_id (uuid),
//        status (pipe-separated, e.g. "approved|partial"), salesperson
// ─────────────────────────────────────────────────────────────
router.get('/so-list', requirePermission('reportingsales:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const {
        date_from,
        date_to,
        branch_id,
        customer_id,
        status,     // bisa "approved|partial" — pipe-separated
        salesperson,
    } = req.query;

    // Default: bulan ini
    const now      = new Date();
    const fromDate = date_from || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const toDate   = date_to   || now.toISOString().split('T')[0];

    // ── Build WHERE ─────────────────────────────────────────
    let where   = ['b.company_id = $1', 'so.date BETWEEN $2 AND $3'];
    let values  = [companyId, fromDate, toDate];
    let idx     = 4;

    if (branch_id) {
        where.push(`b.uuid = $${idx++}`);
        values.push(branch_id);
    }
    if (customer_id) {
        where.push(`c.uuid = $${idx++}`);
        values.push(customer_id);
    }
    if (status) {
        // Support "approved|partial|processed" → IN ($N, $M, ...)
        const statuses = status.split('|').map(s => s.trim()).filter(Boolean);
        if (statuses.length > 0) {
            const placeholders = statuses.map(() => `$${idx++}`).join(', ');
            where.push(`so.status IN (${placeholders})`);
            values.push(...statuses);
        }
    }
    if (salesperson) {
        where.push(`so.created_by = $${idx++}`);
        values.push(salesperson);
    }

    const whereClause = 'WHERE ' + where.join(' AND ');

    // ── Main query — SO rows ────────────────────────────────
    // delivered_qty: total qty yang sudah dikirim via semua Goods Issue untuk SO ini
    // total_qty: total qty ordered di SO
    // aging_days: hari sejak tanggal SO (hanya relevan untuk SO belum selesai)
    const rowsSql = `
        SELECT
            so.uuid,
            so.number,
            so.date,
            so.status,
            so.created_by            AS salesperson,
            c.name                   AS customer_name,
            b.name                   AS branch_name,
            -- Nilai SO: subtotal lines + tax
            COALESCE(
                (SELECT SUM(sol.qty * sol.price * (1 - COALESCE(sol.discount,0)/100))
                 FROM sales_order_lines sol WHERE sol.so_id = so.id), 0
            ) + COALESCE(so.tax_amount, 0)  AS nilai_so,
            -- Total qty ordered
            COALESCE(
                (SELECT SUM(sol.qty) FROM sales_order_lines sol WHERE sol.so_id = so.id), 0
            )                               AS total_qty,
            -- Total qty sudah terkirim via Goods Issues
            COALESCE(
                (SELECT SUM(gil.qty)
                 FROM goods_issue_lines gil
                 JOIN goods_issues gi ON gi.id = gil.gi_id
                 WHERE gi.so_id = so.id), 0
            )                               AS delivered_qty,
            -- Aging: jumlah hari sejak tanggal SO
            (CURRENT_DATE - so.date::date)  AS aging_days
        FROM sales_orders so
        LEFT JOIN customers c ON so.customer_id = c.id
        LEFT JOIN branches  b ON so.branch_id  = b.id
        ${whereClause}
        ORDER BY so.date DESC, so.number DESC
    `;

    const rowsRes = await query(rowsSql, values);
    const rows = rowsRes.rows.map(r => {
        const totalQty     = parseFloat(r.total_qty)     || 0;
        const deliveredQty = parseFloat(r.delivered_qty) || 0;
        const pctDelivered = totalQty > 0
            ? Math.round((deliveredQty / totalQty) * 100)
            : 0;
        // Aging hanya tampil untuk SO yang belum selesai
        const isFinished  = ['paid', 'rejected'].includes(r.status);
        const agingDays   = isFinished ? null : parseInt(r.aging_days) || 0;
        const isLate      = !isFinished && agingDays !== null && agingDays > 7;

        return {
            uuid:          r.uuid,
            number:        r.number,
            date:          r.date,
            status:        r.status,
            salesperson:   r.salesperson,
            customer_name: r.customer_name,
            branch_name:   r.branch_name,
            nilai_so:      parseFloat(r.nilai_so)     || 0,
            total_qty:     totalQty,
            delivered_qty: deliveredQty,
            pct_delivered: pctDelivered,
            aging_days:    agingDays,
            is_late:       isLate,
        };
    });

    // ── Summary / KPI ───────────────────────────────────────
    const totalSO    = rows.length;
    const totalNilai = rows.reduce((s, r) => s + r.nilai_so, 0);
    const soTerbuka  = rows.filter(r => !['paid', 'rejected'].includes(r.status)).length;
    const soTerlambat = rows.filter(r => r.is_late).length;
    const soLunas    = rows.filter(r => r.status === 'paid').length;

    res.json({
        summary: {
            total_so:      totalSO,
            total_nilai:   totalNilai,
            so_terbuka:    soTerbuka,
            so_terlambat:  soTerlambat,
            so_lunas:      soLunas,
        },
        rows,
        filters: { date_from: fromDate, date_to: toDate },
    });
}));

// ─────────────────────────────────────────────────────────────
// GET /customer-perf
// Performa per pelanggan: omzet, frekuensi SO, aging piutang,
// retur, recency, dan RFM label
// Query: date_from, date_to, branch_id (uuid), group_id (uuid)
// ─────────────────────────────────────────────────────────────
router.get('/customer-perf', requirePermission('reportingsales:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const { date_from, date_to, branch_id, group_id } = req.query;

    const now      = new Date();
    const fromDate = date_from || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const toDate   = date_to   || now.toISOString().split('T')[0];

    // ── Build dynamic WHERE fragments ───────────────────────
    let baseWhere = [`b.company_id = $1`];
    let baseVals  = [companyId];
    let idx       = 2;

    if (branch_id) {
        baseWhere.push(`b.uuid = $${idx++}`);
        baseVals.push(branch_id);
    }
    if (group_id) {
        baseWhere.push(`cg.uuid = $${idx++}`);
        baseVals.push(group_id);
    }
    const baseWhereClause = 'WHERE ' + baseWhere.join(' AND ');

    // ── Core: omzet + SO count + last order per customer ────
    // Menggunakan invoices sebagai sumber omzet (bukan SO langsung)
    // agar angka sesuai tagihan yang diterbitkan (real revenue)
    const perfSql = `
        SELECT
            c.uuid                              AS customer_uuid,
            c.name                              AS customer_name,
            c.code                              AS customer_code,
            COALESCE(cg.name, '—')              AS group_name,
            b.name                              AS branch_name,
            -- Omzet: SUM invoice total (SO-linked, dalam range tanggal SO)
            COALESCE(SUM(
                CASE WHEN so.date::date BETWEEN $${idx} AND $${idx + 1}
                     THEN inv.total ELSE 0 END
            ), 0)                               AS total_omzet,
            -- Frekuensi SO dalam range
            COUNT(DISTINCT CASE
                WHEN so.date::date BETWEEN $${idx} AND $${idx + 1}
                THEN so.id END)                AS total_so,
            -- Tanggal SO terakhir (tanpa batasan range → untuk recency)
            MAX(so.date::date)                  AS last_order_date,
            -- Piutang terbuka saat ini (invoice belum lunas, tanpa batasan range)
            COALESCE(SUM(
                CASE WHEN inv2.status != 'paid'
                     THEN (COALESCE(inv2.total,0) - COALESCE(inv2.amount_paid,0))
                     ELSE 0 END
            ), 0)                               AS total_piutang,
            -- Aging bucket berdasarkan due_date (invoice overdue saat ini)
            COALESCE(SUM(CASE
                WHEN inv2.status != 'paid'
                  AND inv2.due_date IS NOT NULL
                  AND (CURRENT_DATE - inv2.due_date::date) BETWEEN 1 AND 30
                THEN (COALESCE(inv2.total,0) - COALESCE(inv2.amount_paid,0))
                ELSE 0 END), 0)                AS aging_1_30,
            COALESCE(SUM(CASE
                WHEN inv2.status != 'paid'
                  AND inv2.due_date IS NOT NULL
                  AND (CURRENT_DATE - inv2.due_date::date) BETWEEN 31 AND 60
                THEN (COALESCE(inv2.total,0) - COALESCE(inv2.amount_paid,0))
                ELSE 0 END), 0)                AS aging_31_60,
            COALESCE(SUM(CASE
                WHEN inv2.status != 'paid'
                  AND inv2.due_date IS NOT NULL
                  AND (CURRENT_DATE - inv2.due_date::date) BETWEEN 61 AND 90
                THEN (COALESCE(inv2.total,0) - COALESCE(inv2.amount_paid,0))
                ELSE 0 END), 0)                AS aging_61_90,
            COALESCE(SUM(CASE
                WHEN inv2.status != 'paid'
                  AND inv2.due_date IS NOT NULL
                  AND (CURRENT_DATE - inv2.due_date::date) > 90
                THEN (COALESCE(inv2.total,0) - COALESCE(inv2.amount_paid,0))
                ELSE 0 END), 0)                AS aging_over_90,
            -- Total retur (nilai) per customer
            COALESCE((
                SELECT SUM(sr.total)
                FROM sales_returns sr
                WHERE sr.customer_id = c.id
                  AND sr.status NOT IN ('rejected', 'draft')
                  AND sr.date::date BETWEEN $${idx} AND $${idx + 1}
            ), 0)                               AS total_retur
        FROM customers c
        LEFT JOIN customer_groups cg ON c.group_id = cg.id
        LEFT JOIN branches b         ON c.branch_id = b.id
        LEFT JOIN sales_orders so    ON so.customer_id = c.id
        LEFT JOIN invoices inv       ON inv.so_id = so.id
        -- join kedua ke invoices tanpa filter range (untuk piutang/aging aktual)
        LEFT JOIN invoices inv2      ON inv2.so_id = so.id
        ${baseWhereClause}
        GROUP BY c.uuid, c.id, c.name, c.code, cg.name, b.name
        HAVING SUM(CASE WHEN so.date::date BETWEEN $${idx} AND $${idx + 1} THEN 1 ELSE 0 END) > 0
            OR COALESCE(SUM(CASE WHEN inv2.status != 'paid'
                THEN (COALESCE(inv2.total,0) - COALESCE(inv2.amount_paid,0)) ELSE 0 END), 0) > 0
        ORDER BY total_omzet DESC
    `;

    // Push date params setelah base params
    const perfVals = [...baseVals, fromDate, toDate];

    const perfRes = await query(perfSql, perfVals);

    // ── RFM label (computed in app layer) ───────────────────
    // Threshold sederhana: tidak perlu ML
    // Champion : recency ≤ 30  AND so ≥ 5
    // Loyal    : recency ≤ 60  AND so ≥ 3
    // At Risk  : recency ≤ 120
    // Lost     : recency  > 120 atau tidak pernah order
    function rfmLabel(recencyDays, totalSo) {
        if (recencyDays === null) return 'Lost';
        if (recencyDays <= 30 && totalSo >= 5) return 'Champion';
        if (recencyDays <= 60 && totalSo >= 3) return 'Loyal';
        if (recencyDays <= 120)                return 'At Risk';
        return 'Lost';
    }

    const today = now.toISOString().split('T')[0];
    const rows  = perfRes.rows.map(r => {
        const recencyDays = r.last_order_date
            ? Math.floor((new Date(today) - new Date(r.last_order_date)) / 86_400_000)
            : null;
        const totalSo  = parseInt(r.total_so)    || 0;
        const totalOmzet = parseFloat(r.total_omzet) || 0;
        return {
            customer_uuid:  r.customer_uuid,
            customer_name:  r.customer_name,
            customer_code:  r.customer_code,
            group_name:     r.group_name,
            branch_name:    r.branch_name,
            total_omzet:    totalOmzet,
            total_so:       totalSo,
            rata_rata_so:   totalSo > 0 ? Math.round(totalOmzet / totalSo) : 0,
            last_order_date: r.last_order_date,
            recency_days:   recencyDays,
            total_piutang:  parseFloat(r.total_piutang)  || 0,
            aging_1_30:     parseFloat(r.aging_1_30)     || 0,
            aging_31_60:    parseFloat(r.aging_31_60)    || 0,
            aging_61_90:    parseFloat(r.aging_61_90)    || 0,
            aging_over_90:  parseFloat(r.aging_over_90)  || 0,
            total_retur:    parseFloat(r.total_retur)    || 0,
            rfm_label:      rfmLabel(recencyDays, totalSo),
        };
    });

    // ── Summary KPI ─────────────────────────────────────────
    const totalCustomer   = rows.length;
    const totalOmzet      = rows.reduce((s, r) => s + r.total_omzet, 0);
    const totalPiutang    = rows.reduce((s, r) => s + r.total_piutang, 0);
    const customerOverdue = rows.filter(r =>
        r.aging_1_30 > 0 || r.aging_31_60 > 0 || r.aging_61_90 > 0 || r.aging_over_90 > 0
    ).length;

    res.json({
        summary: {
            total_customer:   totalCustomer,
            total_omzet:      totalOmzet,
            total_piutang:    totalPiutang,
            customer_overdue: customerOverdue,
        },
        rows,
        filters: { date_from: fromDate, date_to: toDate },
    });
}));

// ─────────────────────────────────────────────────────────────
// GET /product-perf/categories
// Daftar kategori untuk dropdown filter
// ─────────────────────────────────────────────────────────────
router.get('/product-perf/categories', requirePermission('reportingsales:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const result = await query(
        `SELECT c.uuid, c.name
         FROM categories c
         WHERE c.company_id = $1
         ORDER BY c.name`,
        [companyId]
    );
    res.json(result.rows);
}));

// ─────────────────────────────────────────────────────────────
// GET /product-perf
// Performa per produk/SKU: qty terjual, omzet, HPP cost, margin,
// channel breakdown (SO vs POS), rank, slow-moving flag
// Query: date_from, date_to, branch_id (uuid), category_id (uuid)
// ─────────────────────────────────────────────────────────────
router.get('/product-perf', requirePermission('reportingsales:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const { date_from, date_to, branch_id, category_id } = req.query;

    const now      = new Date();
    const fromDate = date_from || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const toDate   = date_to   || now.toISOString().split('T')[0];

    // ── Build dynamic WHERE fragments (shared params: $1=companyId, $2=fromDate, $3=toDate) ──
    let soExtra  = [];
    let posExtra = [];
    let extraVals = [];
    let idx = 4;

    if (branch_id) {
        soExtra.push(`b.uuid = $${idx}`);
        posExtra.push(`b.uuid = $${idx}`);
        extraVals.push(branch_id);
        idx++;
    }
    if (category_id) {
        soExtra.push(`cat.uuid = $${idx}`);
        posExtra.push(`icat.uuid = $${idx}`);
        extraVals.push(category_id);
        idx++;
    }

    const soExtraClause  = soExtra.length  ? 'AND ' + soExtra.join(' AND ')  : '';
    const posExtraClause = posExtra.length ? 'AND ' + posExtra.join(' AND ') : '';

    const vals = [companyId, fromDate, toDate, ...extraVals];

    // ── SO lines per item ────────────────────────────────────
    const soSql = `
        SELECT
            i.uuid            AS item_uuid,
            i.code            AS item_code,
            i.name            AS item_name,
            i.hpp             AS hpp_unit,
            COALESCE(cat.name, '—')  AS category_name,
            SUM(sol.qty)      AS qty_so,
            SUM(sol.qty * sol.price * (1 - COALESCE(sol.discount, 0) / 100))  AS omzet_so
        FROM sales_order_lines sol
        JOIN sales_orders so ON so.id = sol.so_id
        JOIN items i         ON i.id  = sol.item_id
        LEFT JOIN categories cat ON cat.id = i.category_id
        JOIN branches b      ON b.id  = so.branch_id
        WHERE b.company_id = $1
          AND so.status IN ('approved', 'partial', 'processed', 'paid')
          AND so.date::date BETWEEN $2 AND $3
          ${soExtraClause}
        GROUP BY i.uuid, i.id, i.code, i.name, i.hpp, cat.name
    `;

    // ── POS items via jsonb_array_elements ───────────────────
    // items_json elements contain: item_id (uuid), name, qty, price
    // Regular items only (bundles have bundleItems sub-array — skip those for now to avoid double count)
    const posSql = `
        SELECT
            i.uuid            AS item_uuid,
            i.code            AS item_code,
            i.name            AS item_name,
            i.hpp             AS hpp_unit,
            COALESCE(icat.name, '—') AS category_name,
            SUM((elem->>'qty')::numeric)                                        AS qty_pos,
            SUM((elem->>'qty')::numeric * (elem->>'price')::numeric)            AS omzet_pos
        FROM ${UNIFIED_POS_SQL}
        JOIN branches b ON b.id = pt.branch_id
        JOIN LATERAL jsonb_array_elements(pt.items_json) AS elem ON true
        LEFT JOIN items i    ON i.uuid::text = COALESCE(NULLIF(elem->>'item_id',''), elem->>'uuid')
        LEFT JOIN categories icat ON icat.id = i.category_id
        WHERE b.company_id = $1
          AND pt.created_at::date BETWEEN $2 AND $3
          AND (elem->>'bundleItems') IS NULL   -- skip bundle header rows
          AND i.uuid IS NOT NULL               -- skip unresolvable legacy items
          ${posExtraClause}
        GROUP BY i.uuid, i.id, i.code, i.name, i.hpp, icat.name
    `;

    // ── Total retur omzet (summary-level, no per-SKU breakdown) ──
    const returSql = `
        SELECT COALESCE(SUM(sr.total), 0) AS total_retur
        FROM sales_returns sr
        JOIN branches b ON b.id = sr.branch_id
        WHERE b.company_id = $1
          AND sr.status NOT IN ('rejected', 'draft')
          AND sr.date::date BETWEEN $2 AND $3
    `;

    const [soRes, posRes, returRes] = await Promise.all([
        query(soSql, vals),
        query(posSql, vals),
        query(returSql, [companyId, fromDate, toDate]),
    ]);

    // ── Merge SO + POS per item_uuid (app-layer union) ──────
    const map = {};

    for (const r of soRes.rows) {
        const key = r.item_uuid;
        if (!map[key]) {
            map[key] = {
                item_uuid:     r.item_uuid,
                item_code:     r.item_code,
                item_name:     r.item_name,
                category_name: r.category_name,
                hpp_unit:      parseFloat(r.hpp_unit) || 0,
                qty_so:        0,
                omzet_so:      0,
                qty_pos:       0,
                omzet_pos:     0,
            };
        }
        map[key].qty_so   += parseFloat(r.qty_so)   || 0;
        map[key].omzet_so += parseFloat(r.omzet_so) || 0;
    }

    for (const r of posRes.rows) {
        const key = r.item_uuid;
        if (!map[key]) {
            map[key] = {
                item_uuid:     r.item_uuid,
                item_code:     r.item_code,
                item_name:     r.item_name,
                category_name: r.category_name,
                hpp_unit:      parseFloat(r.hpp_unit) || 0,
                qty_so:        0,
                omzet_so:      0,
                qty_pos:       0,
                omzet_pos:     0,
            };
        }
        map[key].qty_pos   += parseFloat(r.qty_pos)   || 0;
        map[key].omzet_pos += parseFloat(r.omzet_pos) || 0;
    }

    // ── Compute derived metrics ──────────────────────────────
    let rows = Object.values(map).map(r => {
        const totalQty    = r.qty_so + r.qty_pos;
        const totalOmzet  = r.omzet_so + r.omzet_pos;
        const hppCost     = r.hpp_unit * totalQty;
        const marginAmt   = totalOmzet - hppCost;
        const marginPct   = totalOmzet > 0
            ? Math.round((marginAmt / totalOmzet) * 10000) / 100
            : 0;
        return { ...r, total_qty: totalQty, total_omzet: totalOmzet, hpp_cost: hppCost, margin_amt: marginAmt, margin_pct: marginPct };
    });

    // ── Sort by omzet desc, assign rank ─────────────────────
    rows.sort((a, b) => b.total_omzet - a.total_omzet);
    rows = rows.map((r, i) => ({
        item_uuid:     r.item_uuid,
        item_code:     r.item_code,
        item_name:     r.item_name,
        category_name: r.category_name,
        total_qty:     r.total_qty,
        total_omzet:   r.total_omzet,
        hpp_cost:      r.hpp_cost,
        margin_amt:    r.margin_amt,
        margin_pct:    r.margin_pct,
        qty_so:        r.qty_so,
        qty_pos:       r.qty_pos,
        omzet_so:      r.omzet_so,
        omzet_pos:     r.omzet_pos,
        rank:          i + 1,
        // Slow-moving: bottom 20% AND total_qty > 0
        is_slow_moving: false, // set below after full sort
    }));

    // Mark bottom 20% by qty (at least 1 item must be sold) as slow-moving
    const bottomCutoff = Math.ceil(rows.length * 0.8);
    for (let i = bottomCutoff; i < rows.length; i++) {
        if (rows[i].total_qty > 0) rows[i].is_slow_moving = true;
    }

    // ── Summary KPIs ─────────────────────────────────────────
    const totalOmzetAll  = rows.reduce((s, r) => s + r.total_omzet, 0);
    const totalQtyAll    = rows.reduce((s, r) => s + r.total_qty,   0);
    const totalMarginAmt = rows.reduce((s, r) => s + r.margin_amt,  0);
    const avgMarginPct   = totalOmzetAll > 0
        ? Math.round((totalMarginAmt / totalOmzetAll) * 10000) / 100
        : 0;

    res.json({
        summary: {
            total_sku:         rows.length,
            total_omzet:       totalOmzetAll,
            total_qty:         totalQtyAll,
            avg_margin_pct:    avgMarginPct,
            total_retur_omzet: parseFloat(returRes.rows[0]?.total_retur) || 0,
        },
        rows,
        filters: { date_from: fromDate, date_to: toDate },
    });
}));
// ─────────────────────────────────────────────────────────────
// GET /pos/cashiers
// List kasir yang pernah buat transaksi POS → dropdown filter
// ─────────────────────────────────────────────────────────────
router.get('/pos/cashiers', requirePermission('reportingsales:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const result = await query(
        `SELECT DISTINCT pt.cashier_id AS cashier_id, u.name AS cashier_name
         FROM pos_transactions pt
         JOIN branches b ON b.id = pt.branch_id
         LEFT JOIN users u ON u.id = pt.cashier_id
         WHERE b.company_id = $1 AND u.name IS NOT NULL
         ORDER BY u.name`,
        [companyId]
    );
    res.json(result.rows);
}));

// ─────────────────────────────────────────────────────────────
// GET /pos
// Laporan Kasir POS: summary KPI, rekap per kasir, breakdown
// metode bayar, top 10 produk POS, dan trend harian.
// Query: date_from, date_to, branch_id (uuid), cashier_id (int)
// ─────────────────────────────────────────────────────────────
router.get('/pos', requirePermission('reportingsales:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const { date_from, date_to, branch_id, cashier_id } = req.query;

    const now      = new Date();
    const fromDate = date_from || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const toDate   = date_to   || now.toISOString().split('T')[0];

    // ── Build shared WHERE ────────────────────────────────────
    let where = [
        `b.company_id = $1`,
        `pt.created_at::date BETWEEN $2 AND $3`,
    ];
    let vals = [companyId, fromDate, toDate];
    let idx  = 4;

    if (branch_id) {
        where.push(`b.uuid = $${idx++}`);
        vals.push(branch_id);
    }
    if (cashier_id) {
        where.push(`pt.cashier_id = $${idx++}`);
        vals.push(cashier_id);
    }
    const wc = 'WHERE ' + where.join(' AND ');

    // ── Summary KPI ───────────────────────────────────────────
    const summarySql = `
        SELECT
            COALESCE(SUM(pt.total), 0)                                              AS total_omzet,
            COUNT(pt.id)                                                             AS total_trx,
            CASE WHEN COUNT(pt.id) > 0 THEN SUM(pt.total) / COUNT(pt.id) ELSE 0 END AS avg_trx,
            COALESCE(SUM(pt.subtotal * COALESCE(pt.discount_pct, 0) / 100), 0)      AS total_diskon
        FROM ${UNIFIED_POS_SQL}
        JOIN branches b ON b.id = pt.branch_id
        ${wc}
    `;

    // ── Rekap per Kasir ───────────────────────────────────────
    const kasirSql = `
        SELECT
            COALESCE(u.name, 'Kasir Tak Dikenal')                                    AS cashier_name,
            COALESCE(SUM(pt.total), 0)                                               AS total_omzet,
            COUNT(pt.id)                                                              AS total_trx,
            CASE WHEN COUNT(pt.id) > 0 THEN SUM(pt.total) / COUNT(pt.id) ELSE 0 END  AS avg_trx,
            COALESCE(SUM(pt.subtotal * COALESCE(pt.discount_pct, 0) / 100), 0)       AS total_diskon
        FROM ${UNIFIED_POS_SQL}
        JOIN branches b ON b.id = pt.branch_id
        LEFT JOIN users u ON u.id = pt.cashier_id
        ${wc}
        GROUP BY u.id, u.name
        ORDER BY total_omzet DESC
    `;

    // ── Breakdown Metode Bayar ────────────────────────────────
    const paymentSql = `
        SELECT
            LOWER(COALESCE(pt.payment_method, 'cash')) AS metode,
            COALESCE(SUM(pt.total), 0)                  AS total_omzet,
            COUNT(pt.id)                                 AS total_trx
        FROM ${UNIFIED_POS_SQL}
        JOIN branches b ON b.id = pt.branch_id
        ${wc}
        GROUP BY LOWER(COALESCE(pt.payment_method, 'cash'))
        ORDER BY total_omzet DESC
    `;

    // ── Top 10 Produk POS (via items_json) ───────────────────
    // Baca dari JSONB array, skip bundle header rows
    const produkSql = `
        SELECT
            COALESCE(i.name, elem->>'name', '—')            AS item_name,
            COALESCE(i.code, '—')                            AS item_code,
            SUM((elem->>'qty')::numeric)                     AS total_qty,
            SUM((elem->>'qty')::numeric * (elem->>'price')::numeric) AS total_omzet
        FROM ${UNIFIED_POS_SQL}
        JOIN branches b ON b.id = pt.branch_id
        JOIN LATERAL jsonb_array_elements(pt.items_json) AS elem ON true
        LEFT JOIN items i
               ON i.uuid::text = COALESCE(NULLIF(elem->>'item_id',''), elem->>'uuid')
        ${wc}
          AND (elem->>'bundleItems') IS NULL
        GROUP BY COALESCE(i.name, elem->>'name', '—'), COALESCE(i.code, '—')
        ORDER BY total_omzet DESC
        LIMIT 10
    `;

    // ── Trend Harian ──────────────────────────────────────────
    const trendSql = `
        SELECT
            pt.created_at::date                AS tanggal,
            COALESCE(SUM(pt.total), 0)          AS total_omzet,
            COUNT(pt.id)                         AS total_trx
        FROM ${UNIFIED_POS_SQL}
        JOIN branches b ON b.id = pt.branch_id
        ${wc}
        GROUP BY 1
        ORDER BY 1
    `;

    const [summaryRes, kasirRes, paymentRes, produkRes, trendRes] = await Promise.all([
        query(summarySql, vals),
        query(kasirSql,   vals),
        query(paymentSql, vals),
        query(produkSql,  vals),
        query(trendSql,   vals),
    ]);

    const s          = summaryRes.rows[0] || {};
    const totalOmzet = parseFloat(s.total_omzet) || 0;

    const kasirRows = kasirRes.rows.map(r => ({
        cashier_name:   r.cashier_name,
        total_omzet:    parseFloat(r.total_omzet) || 0,
        total_trx:      parseInt(r.total_trx)     || 0,
        avg_trx:        parseFloat(r.avg_trx)     || 0,
        total_diskon:   parseFloat(r.total_diskon) || 0,
        pct_kontribusi: totalOmzet > 0
            ? Math.round((parseFloat(r.total_omzet) / totalOmzet) * 10000) / 100
            : 0,
    }));

    const paymentRows = paymentRes.rows.map(r => ({
        metode:         r.metode,
        total_omzet:    parseFloat(r.total_omzet) || 0,
        total_trx:      parseInt(r.total_trx)     || 0,
        pct_kontribusi: totalOmzet > 0
            ? Math.round((parseFloat(r.total_omzet) / totalOmzet) * 10000) / 100
            : 0,
    }));

    const produkRows = produkRes.rows.map(r => ({
        item_name:      r.item_name,
        item_code:      r.item_code,
        total_qty:      parseFloat(r.total_qty)   || 0,
        total_omzet:    parseFloat(r.total_omzet) || 0,
        pct_kontribusi: totalOmzet > 0
            ? Math.round((parseFloat(r.total_omzet) / totalOmzet) * 10000) / 100
            : 0,
    }));

    const trendRows = trendRes.rows.map(r => ({
        tanggal:     r.tanggal,
        total_omzet: parseFloat(r.total_omzet) || 0,
        total_trx:   parseInt(r.total_trx)     || 0,
    }));

    res.json({
        summary: {
            total_omzet:  totalOmzet,
            total_trx:    parseInt(s.total_trx)     || 0,
            avg_trx:      parseFloat(s.avg_trx)     || 0,
            total_diskon: parseFloat(s.total_diskon) || 0,
        },
        kasir_rows:   kasirRows,
        payment_rows: paymentRows,
        produk_rows:  produkRows,
        trend_rows:   trendRows,
        filters: { date_from: fromDate, date_to: toDate },
    });
}));

// ─────────────────────────────────────────────────────────────
// GET /retur
// Laporan Retur Penjualan: summary KPI, rekap per produk,
// per pelanggan, distribusi alasan, dan trend harian/bulanan.
// Query: date_from, date_to, branch_id (uuid), customer_id (uuid),
//        period (daily|monthly), status (pipe-sep)
// ─────────────────────────────────────────────────────────────
router.get('/retur', requirePermission('reportingsales:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const { date_from, date_to, branch_id, customer_id, period = 'monthly', status } = req.query;

    const now      = new Date();
    const fromDate = date_from || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const toDate   = date_to   || now.toISOString().split('T')[0];

    // ── Build shared WHERE ────────────────────────────────────
    // Params: $1=companyId, $2=fromDate, $3=toDate [+ optional branch/customer/status]
    let where  = ['b.company_id = $1', `sr.date::date BETWEEN $2 AND $3`];
    let vals   = [companyId, fromDate, toDate];
    let idx    = 4;

    if (branch_id) {
        where.push(`b.uuid = $${idx++}`);
        vals.push(branch_id);
    }
    if (customer_id) {
        where.push(`c.uuid = $${idx++}`);
        vals.push(customer_id);
    }
    if (status) {
        const statuses = status.split('|').map(s => s.trim()).filter(Boolean);
        if (statuses.length > 0) {
            const ph = statuses.map(() => `$${idx++}`).join(', ');
            where.push(`sr.status IN (${ph})`);
            vals.push(...statuses);
        }
    }

    // For the analytics sub-queries (per-produk, per-pelanggan, reason, trend)
    // we always exclude draft & rejected to show only actionable returns
    const analyticsWhere  = [...where, `sr.status NOT IN ('draft','rejected')`];
    const analyticsVals   = [...vals];

    const wc         = 'WHERE ' + where.join(' AND ');
    const analyticsWc = 'WHERE ' + analyticsWhere.join(' AND ');

    // ── 1. Summary KPI ────────────────────────────────────────
    const summarySql = `
        SELECT
            COUNT(sr.id)                                                    AS total_retur,
            COALESCE(SUM(sr.total), 0)                                      AS total_nilai,
            COUNT(CASE WHEN sr.status = 'completed' THEN 1 END)            AS completed_count,
            COUNT(CASE WHEN sr.status = 'draft'     THEN 1 END)            AS draft_count,
            COUNT(CASE WHEN sr.resolution_type = 'refund_cash'     THEN 1 END) AS refund_cash_count,
            COUNT(CASE WHEN sr.resolution_type = 'refund_transfer' THEN 1 END) AS refund_transfer_count,
            COUNT(CASE WHEN sr.resolution_type = 'replacement'     THEN 1 END) AS replacement_count
        FROM sales_returns sr
        JOIN branches b    ON b.id = sr.branch_id
        LEFT JOIN customers c ON c.id = sr.customer_id
        ${wc}
    `;

    // ── 2. Per-item breakdown ─────────────────────────────────
    const itemSql = `
        SELECT
            i.uuid                  AS item_uuid,
            i.code                  AS item_code,
            i.name                  AS item_name,
            COALESCE(cat.name, '—') AS category_name,
            SUM(srl.qty)            AS total_qty_retur,
            SUM(srl.qty * srl.price) AS total_nilai_retur
        FROM sales_return_lines srl
        JOIN sales_returns sr  ON sr.id  = srl.return_id
        JOIN items i           ON i.id   = srl.item_id
        LEFT JOIN categories cat ON cat.id = i.category_id
        JOIN branches b        ON b.id   = sr.branch_id
        LEFT JOIN customers c  ON c.id   = sr.customer_id
        ${analyticsWc}
        GROUP BY i.uuid, i.id, i.code, i.name, cat.name
        ORDER BY total_nilai_retur DESC
    `;

    // ── 3. Per-customer breakdown ─────────────────────────────
    const customerSql = `
        SELECT
            c.uuid              AS customer_uuid,
            c.name              AS customer_name,
            c.code              AS customer_code,
            COUNT(sr.id)        AS total_retur,
            SUM(sr.total)       AS total_nilai_retur
        FROM sales_returns sr
        JOIN branches b     ON b.id = sr.branch_id
        LEFT JOIN customers c ON c.id = sr.customer_id
        ${analyticsWc}
        GROUP BY c.uuid, c.id, c.name, c.code
        ORDER BY total_nilai_retur DESC
    `;

    // ── 4. Reason distribution ────────────────────────────────
    const reasonSql = `
        SELECT
            COALESCE(sr.reason, 'Tidak Disebutkan') AS reason,
            COUNT(*)                                  AS total_count,
            COALESCE(SUM(sr.total), 0)               AS total_nilai
        FROM sales_returns sr
        JOIN branches b    ON b.id = sr.branch_id
        LEFT JOIN customers c ON c.id = sr.customer_id
        ${analyticsWc}
        GROUP BY sr.reason
        ORDER BY total_count DESC
    `;

    // ── 5. Trend (reuse buildPeriodExpr helper) ───────────────
    const periodExpr = buildPeriodExpr(period);
    const trendSql = `
        SELECT
            ${periodExpr.replace(/d::/g, 'sr.date::')} AS label,
            COUNT(sr.id)             AS total_retur,
            COALESCE(SUM(sr.total), 0) AS total_nilai
        FROM sales_returns sr
        JOIN branches b    ON b.id = sr.branch_id
        LEFT JOIN customers c ON c.id = sr.customer_id
        ${analyticsWc}
        GROUP BY 1
        ORDER BY 1
    `;

    // ── Reference omzet (SO + POS) untuk return rate ─────────
    const omzetSoSql = `
        SELECT COALESCE(SUM(
            COALESCE((SELECT SUM(sol.qty * sol.price * (1 - COALESCE(sol.discount,0)/100))
                      FROM sales_order_lines sol WHERE sol.so_id = so.id), 0)
            + COALESCE(so.tax_amount, 0)
        ), 0) AS omzet
        FROM sales_orders so JOIN branches b ON b.id = so.branch_id
        WHERE b.company_id = $1
          AND so.status IN ('approved','partial','processed','paid')
          AND so.date::date BETWEEN $2 AND $3
    `;
    const omzetPosSql = `
        SELECT COALESCE(SUM(pt.total), 0) AS omzet
        FROM pos_transactions pt JOIN branches b ON b.id = pt.branch_id
        WHERE b.company_id = $1 AND pt.created_at::date BETWEEN $2 AND $3
    `;

    const [summaryRes, itemRes, customerRes, reasonRes, trendRes, omzetSoRes, omzetPosRes] =
        await Promise.all([
            query(summarySql, vals),
            query(itemSql,     analyticsVals),
            query(customerSql, analyticsVals),
            query(reasonSql,   analyticsVals),
            query(trendSql,    analyticsVals),
            query(omzetSoSql,  [companyId, fromDate, toDate]),
            query(omzetPosSql, [companyId, fromDate, toDate]),
        ]);

    const s          = summaryRes.rows[0] || {};
    const totalNilai = parseFloat(s.total_nilai) || 0;
    const omzetTotal = (parseFloat(omzetSoRes.rows[0]?.omzet) || 0)
                     + (parseFloat(omzetPosRes.rows[0]?.omzet) || 0);
    const returnRatePct = omzetTotal > 0
        ? Math.round((totalNilai / omzetTotal) * 10000) / 100
        : null;

    const itemRows = itemRes.rows.map(r => ({
        item_uuid:         r.item_uuid,
        item_code:         r.item_code,
        item_name:         r.item_name,
        category_name:     r.category_name,
        total_qty_retur:   parseFloat(r.total_qty_retur)   || 0,
        total_nilai_retur: parseFloat(r.total_nilai_retur) || 0,
        pct_dari_total:    totalNilai > 0
            ? Math.round((parseFloat(r.total_nilai_retur) / totalNilai) * 10000) / 100
            : 0,
    }));

    const customerRows = customerRes.rows.map(r => ({
        customer_uuid:     r.customer_uuid,
        customer_name:     r.customer_name      || '(Walk-in)',
        customer_code:     r.customer_code      || '—',
        total_retur:       parseInt(r.total_retur)            || 0,
        total_nilai_retur: parseFloat(r.total_nilai_retur)   || 0,
        pct_dari_total:    totalNilai > 0
            ? Math.round((parseFloat(r.total_nilai_retur) / totalNilai) * 10000) / 100
            : 0,
    }));

    const reasonRows = reasonRes.rows.map(r => ({
        reason:      r.reason,
        total_count: parseInt(r.total_count) || 0,
        total_nilai: parseFloat(r.total_nilai) || 0,
    }));

    const trendRows = trendRes.rows.map(r => ({
        label:       r.label,
        total_retur: parseInt(r.total_retur) || 0,
        total_nilai: parseFloat(r.total_nilai) || 0,
    }));

    res.json({
        summary: {
            total_retur:          parseInt(s.total_retur)          || 0,
            total_nilai:          totalNilai,
            completed_count:      parseInt(s.completed_count)      || 0,
            draft_count:          parseInt(s.draft_count)          || 0,
            refund_cash_count:    parseInt(s.refund_cash_count)    || 0,
            refund_transfer_count:parseInt(s.refund_transfer_count)|| 0,
            replacement_count:    parseInt(s.replacement_count)    || 0,
            return_rate_pct:      returnRatePct,
        },
        item_rows:     itemRows,
        customer_rows: customerRows,
        reason_rows:   reasonRows,
        trend_rows:    trendRows,
        filters: { date_from: fromDate, date_to: toDate, period },
    });
}));

module.exports = router;




