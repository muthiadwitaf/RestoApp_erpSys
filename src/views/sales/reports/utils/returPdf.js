/**
 * views/sales/reports/utils/returPdf.js
 * PDF Landscape A4 untuk Laporan Retur Penjualan
 */
import jsPDF    from 'jspdf'
import autoTable from 'jspdf-autotable'

const COLOR = {
    red:     [220, 38,  38],
    darkred: [185, 28,  28],
    amber:   [217, 119, 6],
    indigo:  [99,  102, 241],
    green:   [5,   150, 105],
    white:   [255, 255, 255],
    gray50:  [249, 250, 251],
    gray100: [243, 244, 246],
    gray300: [209, 213, 219],
    gray700: [55,  65,  81],
    black:   [17,  24,  39],
}

function fmtRp(n) {
    if (!n && n !== 0) return '—'
    if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)} M`
    if (n >= 1_000_000)     return `Rp ${(n / 1_000_000).toFixed(1)} jt`
    return 'Rp ' + Math.round(n).toLocaleString('id-ID')
}

export function exportReturPdf({
    filters      = {},
    summary      = {},
    itemRows     = [],
    customerRows = [],
    reasonRows   = [],
    companyName  = '',
}) {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    const W   = doc.internal.pageSize.getWidth()
    let   y   = 0

    // ── Header gradient (red palette) ────────────────────────
    const hH = 38
    doc.setFillColor(...COLOR.red)
    doc.rect(0, 0, W / 2 + 10, hH, 'F')
    doc.setFillColor(...COLOR.darkred)
    doc.rect(W / 2, 0, W / 2 + 1, hH, 'F')
    for (let i = 0; i <= 30; i++) {
        const a = i / 30
        doc.setFillColor(
            Math.round(COLOR.red[0] * (1 - a) + COLOR.darkred[0] * a),
            Math.round(COLOR.red[1] * (1 - a) + COLOR.darkred[1] * a),
            Math.round(COLOR.red[2] * (1 - a) + COLOR.darkred[2] * a),
        )
        doc.rect(W / 2 - 15 + i, 0, 1.2, hH, 'F')
    }

    doc.setTextColor(...COLOR.white)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(15)
    doc.text('Laporan Retur Penjualan', 15, 14)
    doc.setFontSize(8.5)
    doc.setFont('helvetica', 'normal')
    if (companyName) doc.text(companyName, 15, 21)
    doc.setFontSize(7.5)
    doc.text(`Periode: ${filters.date_from || '—'} s/d ${filters.date_to || '—'}`, 15, 28)
    const cetakStr = `Dicetak: ${new Date().toLocaleDateString('id-ID', {
        day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })}`
    doc.text(cetakStr, W - 15, 28, { align: 'right' })
    y = hH + 8

    // ── KPI Strip ────────────────────────────────────────────
    const kpiItems = [
        { label: 'Total Retur',  value: `${summary.total_retur ?? '—'} dok`,      accent: COLOR.red    },
        { label: 'Nilai Retur',  value: fmtRp(summary.total_nilai),                accent: COLOR.amber  },
        { label: 'Return Rate',  value: summary.return_rate_pct != null
            ? `${summary.return_rate_pct.toFixed(2)}%` : '—',                       accent: COLOR.indigo },
        { label: 'Selesai',      value: `${summary.completed_count ?? '—'} dok`,   accent: COLOR.green  },
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

    // ── Tabel 1: Top Produk Retur ─────────────────────────────
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...COLOR.black)
    doc.text('Rekap Per Produk (Top 20)', 15, y)
    y += 4

    autoTable(doc, {
        startY: y,
        head:   [['#', 'Produk', 'Kode', 'Kategori', 'Qty Retur', 'Nilai Retur', '% Total']],
        body:   itemRows.slice(0, 20).map((r, i) => [
            String(i + 1),
            r.item_name,
            r.item_code,
            r.category_name,
            r.total_qty_retur.toLocaleString('id-ID'),
            fmtRp(r.total_nilai_retur),
            `${r.pct_dari_total.toFixed(1)}%`,
        ]),
        styles: {
            fontSize: 7.5, cellPadding: { top: 2, bottom: 2, left: 3, right: 3 },
            textColor: COLOR.black, lineColor: COLOR.gray300, lineWidth: 0.1,
        },
        headStyles:         { fillColor: COLOR.red, textColor: COLOR.white, fontStyle: 'bold', fontSize: 7 },
        alternateRowStyles: { fillColor: [255, 245, 245] },
        columnStyles: {
            0: { halign: 'center', cellWidth: 8 },
            4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' },
        },
        margin: { left: 15, right: 15 },
    })
    y = doc.lastAutoTable.finalY + 10

    // ── Tabel 2: Top Pelanggan Retur ──────────────────────────
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...COLOR.black)
    doc.text('Rekap Per Pelanggan (Top 20)', 15, y)
    y += 4

    autoTable(doc, {
        startY: y,
        head:   [['#', 'Pelanggan', 'Kode', 'Jml Dok', 'Nilai Retur', '% Total']],
        body:   customerRows.slice(0, 20).map((r, i) => [
            String(i + 1),
            r.customer_name,
            r.customer_code,
            String(r.total_retur),
            fmtRp(r.total_nilai_retur),
            `${r.pct_dari_total.toFixed(1)}%`,
        ]),
        styles: {
            fontSize: 7.5, cellPadding: { top: 2, bottom: 2, left: 3, right: 3 },
            textColor: COLOR.black, lineColor: COLOR.gray300, lineWidth: 0.1,
        },
        headStyles:         { fillColor: COLOR.amber, textColor: COLOR.white, fontStyle: 'bold', fontSize: 7 },
        alternateRowStyles: { fillColor: [255, 251, 235] },
        columnStyles: {
            0: { halign: 'center', cellWidth: 8 },
            3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' },
        },
        margin: { left: 15, right: 15 },
    })
    y = doc.lastAutoTable.finalY + 10

    // ── Tabel 3: Distribusi Alasan Retur ─────────────────────
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...COLOR.black)
    doc.text('Distribusi Alasan Retur', 15, y)
    y += 4

    const totalFreq = reasonRows.reduce((s, r) => s + (r.total_count || 0), 0)
    autoTable(doc, {
        startY: y,
        head:   [['Alasan', 'Frekuensi', 'Nilai Retur', '% Frekuensi']],
        body:   reasonRows.map(r => [
            r.reason,
            String(r.total_count),
            fmtRp(r.total_nilai),
            totalFreq > 0 ? `${((r.total_count / totalFreq) * 100).toFixed(1)}%` : '—',
        ]),
        styles: {
            fontSize: 7.5, cellPadding: { top: 2, bottom: 2, left: 3, right: 3 },
            textColor: COLOR.black, lineColor: COLOR.gray300, lineWidth: 0.1,
        },
        headStyles:         { fillColor: COLOR.indigo, textColor: COLOR.white, fontStyle: 'bold', fontSize: 7 },
        alternateRowStyles: { fillColor: [245, 243, 255] },
        columnStyles: {
            1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' },
        },
        margin: { left: 15, right: 15 },
    })

    // ── Page footer ──────────────────────────────────────────
    const pageCount = doc.internal.getNumberOfPages()
    for (let p = 1; p <= pageCount; p++) {
        doc.setPage(p)
        const footY = doc.internal.pageSize.getHeight() - 7
        doc.setDrawColor(...COLOR.gray300); doc.setLineWidth(0.3)
        doc.line(15, footY - 3, W - 15, footY - 3)
        doc.setTextColor(...COLOR.gray700); doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5)
        doc.text(
            companyName ? `${companyName} — Laporan Retur Penjualan` : 'Laporan Retur Penjualan',
            15, footY
        )
        doc.text(`Halaman ${p} / ${pageCount}`, W - 15, footY, { align: 'right' })
    }

    const safeFrom = (filters.date_from || '').replace(/-/g, '')
    const safeTo   = (filters.date_to   || '').replace(/-/g, '')
    doc.save(`LaporanRetur_${safeFrom}-${safeTo}.pdf`)
}
