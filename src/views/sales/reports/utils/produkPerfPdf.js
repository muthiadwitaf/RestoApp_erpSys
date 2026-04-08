/**
 * views/sales/reports/utils/produkPerfPdf.js
 * PDF Landscape A4 untuk Laporan Performa Produk
 */
import jsPDF    from 'jspdf'
import autoTable from 'jspdf-autotable'

const COLOR = {
    green:   [22,  163, 74],
    teal:    [20,  184, 166],
    white:   [255, 255, 255],
    gray50:  [249, 250, 251],
    gray100: [243, 244, 246],
    gray300: [209, 213, 219],
    gray700: [55,  65,  81],
    black:   [17,  24,  39],
    blue:    [37,  99,  235],
    amber:   [217, 119, 6],
    red:     [220, 38,  38],
    indigo:  [99,  102, 241],
}

function fmtRp(n) {
    if (!n && n !== 0) return '—'
    if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)} M`
    if (n >= 1_000_000)     return `Rp ${(n / 1_000_000).toFixed(1)} jt`
    return 'Rp ' + Math.round(n).toLocaleString('id-ID')
}
function fmtQty(n) {
    if (!n) return '0'
    return Number(n).toLocaleString('id-ID')
}

export function exportProdukPerfPdf({ filters = {}, summary = {}, rows = [], companyName = '' }) {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    const W   = doc.internal.pageSize.getWidth()
    let   y   = 0

    // ── Header gradient (green → teal) ──────────────────────
    const hH = 38
    doc.setFillColor(...COLOR.green)
    doc.rect(0, 0, W / 2 + 10, hH, 'F')
    doc.setFillColor(...COLOR.teal)
    doc.rect(W / 2, 0, W / 2 + 1, hH, 'F')
    for (let i = 0; i <= 30; i++) {
        const a = i / 30
        doc.setFillColor(
            Math.round(COLOR.green[0] * (1 - a) + COLOR.teal[0] * a),
            Math.round(COLOR.green[1] * (1 - a) + COLOR.teal[1] * a),
            Math.round(COLOR.green[2] * (1 - a) + COLOR.teal[2] * a),
        )
        doc.rect(W / 2 - 15 + i, 0, 1.2, hH, 'F')
    }

    doc.setTextColor(...COLOR.white)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(15)
    doc.text('Laporan Performa Produk', 15, 14)
    doc.setFontSize(8.5)
    doc.setFont('helvetica', 'normal')
    if (companyName) doc.text(companyName, 15, 21)
    doc.setFontSize(7.5)
    doc.text(`Tanggal: ${filters.date_from || '—'} s/d ${filters.date_to || '—'}`, 15, 28)
    const cetakStr = `Dicetak: ${new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`
    doc.text(cetakStr, W - 15, 28, { align: 'right' })
    y = hH + 8

    // ── KPI Strip ──────────────────────────────────────────
    const kpiItems = [
        { label: 'Total SKU Terjual', value: String(summary.total_sku ?? '—'),                   accent: COLOR.indigo },
        { label: 'Total Omzet',       value: fmtRp(summary.total_omzet),                          accent: COLOR.blue   },
        { label: 'Avg Margin',        value: summary.avg_margin_pct != null ? summary.avg_margin_pct.toFixed(1) + '%' : '—', accent: COLOR.green },
        { label: 'Total Retur',       value: fmtRp(summary.total_retur_omzet),                    accent: COLOR.amber  },
    ]
    const boxW = (W - 30 - 12) / 4
    const boxH = 18
    kpiItems.forEach((k, i) => {
        const bx = 15 + i * (boxW + 4)
        doc.setFillColor(...COLOR.gray50)
        doc.roundedRect(bx, y, boxW, boxH, 2, 2, 'F')
        doc.setFillColor(...k.accent)
        doc.roundedRect(bx, y, 3, boxH, 1, 1, 'F')
        doc.setTextColor(...COLOR.gray700)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(6.5)
        doc.text(k.label, bx + 6, y + 5.5)
        doc.setTextColor(...COLOR.black)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(9)
        doc.text(k.value, bx + 6, y + 13)
    })
    y += boxH + 8

    // ── Tabel ──────────────────────────────────────────────
    const tableBody = rows.map(r => [
        String(r.rank),
        `${r.item_name}\n${r.item_code}`,
        r.category_name || '—',
        fmtQty(r.total_qty),
        fmtRp(r.total_omzet),
        r.hpp_cost > 0 ? fmtRp(r.hpp_cost) : '—',
        r.total_omzet > 0 ? r.margin_pct.toFixed(1) + '%' : '—',
        [
            r.omzet_so  > 0 ? `SO: ${fmtRp(r.omzet_so)}`  : '',
            r.omzet_pos > 0 ? `POS: ${fmtRp(r.omzet_pos)}` : '',
        ].filter(Boolean).join('\n') || '—',
        r.rank <= 10 && !r.is_slow_moving ? 'Terlaris' : r.is_slow_moving ? 'Slow' : '',
    ])

    autoTable(doc, {
        startY: y,
        head:   [['#', 'Produk', 'Kategori', 'Qty', 'Omzet', 'HPP Cost', 'Margin', 'Channel', 'Status']],
        body:   tableBody,
        styles: {
            fontSize:    7,
            cellPadding: { top: 2, bottom: 2, left: 3, right: 3 },
            textColor:   COLOR.black,
            lineColor:   COLOR.gray300,
            lineWidth:   0.1,
        },
        headStyles:  { fillColor: COLOR.green, textColor: COLOR.white, fontStyle: 'bold', fontSize: 6.5 },
        alternateRowStyles: { fillColor: [240, 253, 244] },
        columnStyles: {
            0: { halign: 'center', cellWidth: 10 },
            1: { cellWidth: 38 },
            3: { halign: 'center', cellWidth: 14 },
            4: { halign: 'right' },
            5: { halign: 'right' },
            6: { halign: 'right', cellWidth: 16 },
            7: { cellWidth: 36, fontSize: 6 },
            8: { halign: 'center', cellWidth: 18 },
        },
        margin: { left: 15, right: 15 },
    })

    // ── Page footer ────────────────────────────────────────
    const pageCount = doc.internal.getNumberOfPages()
    for (let p = 1; p <= pageCount; p++) {
        doc.setPage(p)
        const footY = doc.internal.pageSize.getHeight() - 7
        doc.setDrawColor(...COLOR.gray300); doc.setLineWidth(0.3)
        doc.line(15, footY - 3, W - 15, footY - 3)
        doc.setTextColor(...COLOR.gray700); doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5)
        doc.text(companyName ? `${companyName} — Performa Produk` : 'Laporan Performa Produk', 15, footY)
        doc.text(`Halaman ${p} / ${pageCount}`, W - 15, footY, { align: 'right' })
    }

    const safeFrom = (filters.date_from || '').replace(/-/g, '')
    const safeTo   = (filters.date_to   || '').replace(/-/g, '')
    doc.save(`Performa_Produk_${safeFrom}-${safeTo}.pdf`)
}
