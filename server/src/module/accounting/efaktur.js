/**
 * accounting/efaktur.js -- e-Faktur Export API
 *
 * All company data (name, npwp, is_pkp, efaktur_*) comes from `companies` table.
 *
 * GET  /api/accounting/efaktur/next-number   -- get next faktur pajak serial number
 * POST /api/accounting/efaktur/claim-number  -- increment and claim next number
 * GET  /api/accounting/efaktur/export        -- export CSV format DJP
 */
const router = require('express').Router();
const { query } = require('../../config/db');
const { requirePermission } = require('../../middleware/auth');
const { asyncHandler } = require('../../utils/helpers');

// Helper: format nomor seri faktur pajak
// Format DJP: PREFIX-YY.XXXXXXXXXX (misal: 010-25.00000001)
function formatFakturNumber(prefix, year2digit, number) {
    const padded = String(number).padStart(8, '0');
    return `${prefix}-${year2digit}.${padded}`;
}

// GET next faktur number (preview)
router.get('/next-number', requirePermission('accounting:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    if (!companyId) return res.status(400).json({ error: 'Company context diperlukan.' });

    const cs = await query(`SELECT efaktur_series_prefix, efaktur_last_number, is_pkp FROM companies WHERE id = $1`, [companyId]);
    if (cs.rows.length === 0 || !cs.rows[0].is_pkp) {
        return res.status(400).json({ error: 'Perusahaan bukan PKP atau belum dikonfigurasi. Isi data di Pengaturan - Profil Perusahaan.' });
    }

    const { efaktur_series_prefix, efaktur_last_number } = cs.rows[0];
    const nextNum = (efaktur_last_number || 0) + 1;
    const year2 = String(new Date().getFullYear()).slice(-2);
    const nextFormatted = formatFakturNumber(efaktur_series_prefix, year2, nextNum);

    res.json({ next_number: nextFormatted, current_last: efaktur_last_number, prefix: efaktur_series_prefix });
}));

// POST claim next number (actually increment)
router.post('/claim-number', requirePermission('accounting:create'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    if (!companyId) return res.status(400).json({ error: 'Company context diperlukan.' });

    // Increment and return
    const cs = await query(
        `UPDATE companies SET efaktur_last_number = efaktur_last_number + 1, updated_at = NOW()
         WHERE id = $1 RETURNING efaktur_series_prefix, efaktur_last_number`,
        [companyId]
    );
    if (cs.rows.length === 0) return res.status(400).json({ error: 'Company tidak ditemukan.' });
    const { efaktur_series_prefix, efaktur_last_number } = cs.rows[0];
    const year2 = String(new Date().getFullYear()).slice(-2);
    const formatted = formatFakturNumber(efaktur_series_prefix, year2, efaktur_last_number);
    res.json({ faktur_number: formatted, number: efaktur_last_number });
}));

// GET export CSV e-Faktur (format DJP -- bisa diimport ke app e-Faktur DJP)
router.get('/export', requirePermission('accounting:export'), asyncHandler(async (req, res) => {
    const { month, year, branch_id } = req.query;
    if (!month || !year) return res.status(400).json({ error: 'Parameter month dan year wajib diisi' });

    const companyId = req.user.company_id;
    if (!companyId) return res.status(400).json({ error: 'Company context diperlukan.' });

    // Get company info for seller data
    const csResult = await query(
        `SELECT name as company_name, npwp, is_pkp, pkp_since, efaktur_series_prefix, address, phone
         FROM companies WHERE id = $1`, [companyId]);
    const cs = csResult.rows[0];
    if (!cs || !cs.is_pkp) return res.status(400).json({ error: 'Perusahaan bukan PKP atau belum dikonfigurasi.' });

    // Resolve branch internal id for invoice filter
    let bId = null;
    if (branch_id) {
        const isUuid = typeof branch_id === 'string' && branch_id.includes('-');
        const col = isUuid ? 'uuid' : 'id';
        const br = await query(`SELECT id FROM branches WHERE ${col} = $1`, [branch_id]);
        bId = br.rows[0]?.id;
    }

    // Get invoices for the month with e-Faktur data
    const invResult = await query(
        `SELECT i.*, so.number as so_number,
                c.name as customer_name, c.address as customer_address, c.npwp as customer_npwp, c.kode_transaksi,
                b.name as branch_name
         FROM invoices i
         LEFT JOIN sales_orders so ON i.so_id = so.id
         LEFT JOIN customers c ON so.customer_id = c.id
         LEFT JOIN branches b ON i.branch_id = b.id
         WHERE i.branch_id = $1
           AND EXTRACT(MONTH FROM i.date) = $2
           AND EXTRACT(YEAR FROM i.date) = $3
           AND i.faktur_pajak_number IS NOT NULL
         ORDER BY i.date, i.id`,
        [bId, parseInt(month), parseInt(year)]
    );

    const invoices = invResult.rows;

    // Get invoice line items
    const invoiceLines = [];
    for (const inv of invoices) {
        const lines = await query(
            `SELECT sol.*, it.code as item_code, it.name as item_name
             FROM sales_order_lines sol
             JOIN items it ON sol.item_id = it.id
             WHERE sol.so_id = $1 AND it.is_taxable = TRUE`,
            [inv.so_id]
        );
        invoiceLines.push({ invoice: inv, lines: lines.rows });
    }

    // Build CSV e-Faktur format DJP
    const csvRows = [];
    csvRows.push('FK'); // Faktur Keluaran header marker

    // Column headers
    csvRows.push([
        'Kode Transaksi', 'Keterangan Tambahan', 'Nomor Faktur Pajak',
        'Masa Pajak', 'Tahun Pajak', 'Tanggal Faktur',
        'NPWP Pembeli', 'Nama Pembeli', 'Alamat Pembeli',
        'Jumlah DPP', 'Jumlah PPN',
        'Nama Barang', 'Harga Satuan', 'Jumlah Barang', 'Harga Total', 'Diskon', 'DPP', 'PPN'
    ].join(','));

    for (const { invoice, lines } of invoiceLines) {
        if (lines.length === 0) continue;
        const tgl = new Date(invoice.date);
        const tglStr = `${String(tgl.getDate()).padStart(2, '0')}/${String(tgl.getMonth() + 1).padStart(2, '0')}/${tgl.getFullYear()}`;
        const npwp = invoice.npwp_pembeli || '000000000000000';
        const nama = (invoice.nama_pembeli || invoice.customer_name || '').replace(/,/g, ' ');
        const kode = invoice.kode_transaksi || '01';

        for (const [idx, line] of lines.entries()) {
            const harga = parseFloat(line.price) || 0;
            const qty = parseInt(line.qty) || 0;
            const diskon = parseFloat(line.discount) || 0;
            const total = harga * qty - diskon;
            const dpp = total;
            const ppn = Math.round(dpp * (parseFloat(invoice.tax_rate) || 12) / 100);

            csvRows.push([
                idx === 0 ? kode : '',
                '',
                idx === 0 ? invoice.faktur_pajak_number : '',
                tgl.getMonth() + 1,
                tgl.getFullYear(),
                idx === 0 ? tglStr : '',
                idx === 0 ? npwp : '',
                idx === 0 ? `"${nama}"` : '',
                '',
                idx === 0 ? Math.round(parseFloat(invoice.subtotal || 0) - parseFloat(invoice.extra_discount || 0)) : '',
                idx === 0 ? Math.round(parseFloat(invoice.tax_amount || 0)) : '',
                `"${(line.item_name || '').replace(/,/g, ' ')}"`,
                Math.round(harga),
                qty,
                Math.round(total),
                Math.round(diskon),
                Math.round(dpp),
                ppn
            ].join(','));
        }
    }

    // Return as CSV download
    const csvContent = csvRows.join('\n');
    const filename = `efaktur_${year}${String(month).padStart(2, '0')}_${cs.efaktur_series_prefix}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('\uFEFF' + csvContent); // BOM untuk Excel
}));

module.exports = router;
