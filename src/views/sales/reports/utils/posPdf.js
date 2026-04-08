/**
 * views/sales/reports/utils/posPdf.js
 * PDF Landscape A4 untuk Laporan Kasir POS
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
    blue:    [37,  99,  235],
    red:     [220, 38,  38],
}

function fmtRp(n) {
    if (!n && n !== 0) return '—'
    if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)} M`
    if (n >= 1_000_000)     return `Rp ${(n / 1_000_000).toFixed(1)} jt`
    return 'Rp ' + Math.round(n).toLocaleString('id-ID')
}

const PAYMENT_LABELS = {
    cash:     'Tunai (Cash)',
    qris:     'QRIS',
    transfer: 'Transfer Bank',
    debit:    'Debit Card',
}

export function exportPosPdf({
    filters     = {},
    summary     = {},
    kasirRows   = [],
    paymentRows = [],
    produkRows  = [],
    companyName = '',
}) {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    const W   = doc.internal.pageSize.getWidth()
    let   y   = 0

    // ── Header gradient ──────────────────────────────────────
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
    doc.text('Laporan Kasir POS', 15, 14)
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
        { label: 'Total Omzet POS',  value: fmtRp(summary.total_omzet),   accent: COLOR.indigo },
        { label: 'Total Transaksi',  value: String(summary.total_trx ?? '—'), accent: COLOR.blue  },
        { label: 'Avg / Transaksi',  value: fmtRp(summary.avg_trx),         accent: COLOR.green  },
        { label: 'Total Diskon',     value: fmtRp(summary.total_diskon),     accent: COLOR.amber  },
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

    // ── Tabel 1: Rekap Per Kasir ─────────────────────────────
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...COLOR.black)
    doc.text('Rekap Per Kasir', 15, y)
    y += 4

    autoTable(doc, {
        startY: y,
        head:   [['Kasir', 'Omzet', '# Trx', 'Avg / Trx', 'Diskon', 'Kontribusi']],
        body:   kasirRows.map(r => [
            r.cashier_name,
            fmtRp(r.total_omzet),
            r.total_trx.toLocaleString('id-ID'),
            fmtRp(r.avg_trx),
            r.total_diskon > 0 ? fmtRp(r.total_diskon) : '—',
            `${r.pct_kontribusi}%`,
        ]),
        styles: {
            fontSize: 7.5, cellPadding: { top: 2, bottom: 2, left: 3, right: 3 },
            textColor: COLOR.black, lineColor: COLOR.gray300, lineWidth: 0.1,
        },
        headStyles:         { fillColor: COLOR.indigo, textColor: COLOR.white, fontStyle: 'bold', fontSize: 7 },
        alternateRowStyles: { fillColor: [245, 243, 255] },
        columnStyles: {
            0: { cellWidth: 50 },
            1: { halign: 'right' }, 2: { halign: 'right' },
            3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' },
        },
        margin: { left: 15, right: 15 },
    })
    y = doc.lastAutoTable.finalY + 10

    // ── Tabel 2: Breakdown Metode Bayar ─────────────────────
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...COLOR.black)
    doc.text('Breakdown Metode Pembayaran', 15, y)
    y += 4

    autoTable(doc, {
        startY: y,
        head:   [['Metode', 'Total Omzet', '# Transaksi', '% Kontribusi']],
        body:   paymentRows.map(r => [
            PAYMENT_LABELS[r.metode] || r.metode,
            fmtRp(r.total_omzet),
            r.total_trx.toLocaleString('id-ID'),
            `${r.pct_kontribusi}%`,
        ]),
        styles: {
            fontSize: 7.5, cellPadding: { top: 2, bottom: 2, left: 3, right: 3 },
            textColor: COLOR.black, lineColor: COLOR.gray300, lineWidth: 0.1,
        },
        headStyles:         { fillColor: COLOR.blue, textColor: COLOR.white, fontStyle: 'bold', fontSize: 7 },
        alternateRowStyles: { fillColor: [243, 249, 255] },
        columnStyles: {
            1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' },
        },
        margin: { left: 15, right: 15 },
    })
    y = doc.lastAutoTable.finalY + 10

    // ── Tabel 3: Top 10 Produk POS ───────────────────────────
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...COLOR.black)
    doc.text('🔥 Top 10 Best Seller Menu Resto', 15, y)
    y += 4

    autoTable(doc, {
        startY: y,
        head:   [['#', 'Produk', 'Kode', 'Qty Terjual', 'Total Omzet', '% Kontribusi']],
        body:   produkRows.map((r, i) => [
            String(i + 1),
            r.item_name,
            r.item_code,
            r.total_qty.toLocaleString('id-ID'),
            fmtRp(r.total_omzet),
            `${r.pct_kontribusi}%`,
        ]),
        styles: {
            fontSize: 7.5, cellPadding: { top: 2, bottom: 2, left: 3, right: 3 },
            textColor: COLOR.black, lineColor: COLOR.gray300, lineWidth: 0.1,
        },
        headStyles:         { fillColor: COLOR.green, textColor: COLOR.white, fontStyle: 'bold', fontSize: 7 },
        alternateRowStyles: { fillColor: [240, 253, 244] },
        columnStyles: {
            0: { halign: 'center', cellWidth: 10 },
            3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' },
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
        doc.text(companyName ? `${companyName} — Laporan Kasir POS` : 'Laporan Kasir POS', 15, footY)
        doc.text(`Halaman ${p} / ${pageCount}`, W - 15, footY, { align: 'right' })
    }

    const safeFrom = (filters.date_from || '').replace(/-/g, '')
    const safeTo   = (filters.date_to   || '').replace(/-/g, '')
    doc.save(`LaporanPOS_${safeFrom}-${safeTo}.pdf`)
}
