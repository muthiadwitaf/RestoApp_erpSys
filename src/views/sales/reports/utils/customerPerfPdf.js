/**
 * views/sales/reports/utils/customerPerfPdf.js
 * PDF Landscape A4 untuk Laporan Performa Pelanggan
 */
import jsPDF    from 'jspdf'
import autoTable from 'jspdf-autotable'

const COLOR = {
    indigo:  [99,  102, 241],
    purple:  [124, 58,  237],
    white:   [255, 255, 255],
    gray50:  [249, 250, 251],
    gray100: [243, 244, 246],
    gray300: [209, 213, 219],
    gray700: [55,  65,  81],
    black:   [17,  24,  39],
    green:   [22,  163, 74],
    amber:   [217, 119, 6],
    red:     [220, 38,  38],
    blue:    [37,  99,  235],
}

function fmtRp(n) {
    if (!n) return '—'
    if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)} M`
    if (n >= 1_000_000)     return `Rp ${(n / 1_000_000).toFixed(1)} jt`
    return 'Rp ' + Math.round(n).toLocaleString('id-ID')
}
function fmtDate(d) {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function exportCustomerPerfPdf({ filters = {}, summary = {}, rows = [], companyName = '' }) {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    const W   = doc.internal.pageSize.getWidth()
    let   y   = 0

    // ── Header gradient ────────────────────────────────────
    const hH = 38
    doc.setFillColor(...COLOR.indigo)
    doc.rect(0, 0, W / 2 + 10, hH, 'F')
    doc.setFillColor(...COLOR.purple)
    doc.rect(W / 2, 0, W / 2 + 1, hH, 'F')
    for (let i = 0; i <= 30; i++) {
        const a = i / 30
        doc.setFillColor(
            Math.round(COLOR.indigo[0] * (1 - a) + COLOR.purple[0] * a),
            Math.round(COLOR.indigo[1] * (1 - a) + COLOR.purple[1] * a),
            Math.round(COLOR.indigo[2] * (1 - a) + COLOR.purple[2] * a),
        )
        doc.rect(W / 2 - 15 + i, 0, 1.2, hH, 'F')
    }

    doc.setTextColor(...COLOR.white)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(15)
    doc.text('Laporan Performa Pelanggan', 15, 14)
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
        { label: 'Pelanggan Aktif', value: String(summary.total_customer ?? '—'),  accent: COLOR.indigo },
        { label: 'Total Omzet',     value: fmtRp(summary.total_omzet),             accent: COLOR.blue   },
        { label: 'Total Piutang',   value: fmtRp(summary.total_piutang),            accent: COLOR.amber  },
        { label: 'Piutang Overdue', value: `${summary.customer_overdue ?? '—'} cust`, accent: COLOR.red },
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
        `${r.customer_name}\n${r.customer_code}`,
        r.group_name || '—',
        fmtRp(r.total_omzet),
        String(r.total_so),
        fmtRp(r.rata_rata_so),
        r.total_piutang > 0 ? fmtRp(r.total_piutang) : '—',
        [
            r.aging_1_30   > 0 ? `1-30: ${fmtRp(r.aging_1_30)}`     : '',
            r.aging_31_60  > 0 ? `31-60: ${fmtRp(r.aging_31_60)}`   : '',
            r.aging_61_90  > 0 ? `61-90: ${fmtRp(r.aging_61_90)}`   : '',
            r.aging_over_90> 0 ? `>90: ${fmtRp(r.aging_over_90)}`   : '',
        ].filter(Boolean).join('\n') || '—',
        r.total_retur > 0 ? fmtRp(r.total_retur) : '—',
        r.last_order_date ? `${fmtDate(r.last_order_date)}\n(${r.recency_days} hari)` : '—',
        r.rfm_label,
    ])

    autoTable(doc, {
        startY: y,
        head:   [['Pelanggan', 'Grup', 'Omzet', 'SO', 'Avg SO', 'Piutang', 'Aging Bucket', 'Retur', 'Last Order', 'RFM']],
        body:   tableBody,
        styles: {
            fontSize:    7,
            cellPadding: { top: 2, bottom: 2, left: 3, right: 3 },
            textColor:   COLOR.black,
            lineColor:   COLOR.gray300,
            lineWidth:   0.1,
        },
        headStyles:  { fillColor: COLOR.indigo, textColor: COLOR.white, fontStyle: 'bold', fontSize: 6.5 },
        alternateRowStyles: { fillColor: [245, 243, 255] },
        columnStyles: {
            0: { cellWidth: 36 },
            2: { halign: 'right' },
            3: { halign: 'center', cellWidth: 12 },
            4: { halign: 'right' },
            5: { halign: 'right' },
            6: { cellWidth: 38, fontSize: 6 },
            7: { halign: 'right' },
            8: { cellWidth: 28, halign: 'center' },
            9: { halign: 'center', cellWidth: 20 },
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
        doc.text(companyName ? `${companyName} — Performa Pelanggan` : 'Laporan Performa Pelanggan', 15, footY)
        doc.text(`Halaman ${p} / ${pageCount}`, W - 15, footY, { align: 'right' })
    }

    const safeFrom = (filters.date_from || '').replace(/-/g, '')
    const safeTo   = (filters.date_to   || '').replace(/-/g, '')
    doc.save(`Performa_Pelanggan_${safeFrom}-${safeTo}.pdf`)
}
