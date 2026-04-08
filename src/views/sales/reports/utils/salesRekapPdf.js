/**
 * views/sales/reports/utils/salesRekapPdf.js
 *
 * Generator PDF untuk Laporan Rekap Penjualan.
 * Menggunakan jsPDF + jspdf-autotable (sudah tersedia di project).
 *
 * Ekspor: exportSalesRekapPdf({ filters, summary, trend, companyName })
 */
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// ── Konstanta warna (hexadecimal tanpa #) ─────────────────────
const COLOR = {
    indigo:     [99,  102, 241],
    indigoDark: [67,  56,  202],
    purple:     [124, 58,  237],
    white:      [255, 255, 255],
    gray50:     [249, 250, 251],
    gray100:    [243, 244, 246],
    gray300:    [209, 213, 219],
    gray700:    [55,  65,  81],
    green:      [22,  163, 74],
    red:        [220, 38,  38],
    black:      [17,  24,  39],
}

// ── Format helpers ─────────────────────────────────────────────
function fmtRp(n) {
    if (!n && n !== 0) return '-'
    return 'Rp ' + Math.round(n).toLocaleString('id-ID')
}
function fmtShort(n) {
    if (!n) return '-'
    if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)} M`
    if (n >= 1_000_000)     return `Rp ${(n / 1_000_000).toFixed(1)} jt`
    return fmtRp(n)
}
function periodLabel(p) {
    return { daily: 'Harian', weekly: 'Mingguan', monthly: 'Bulanan' }[p] || p
}

// ── Main export function ───────────────────────────────────────
export function exportSalesRekapPdf({ filters = {}, summary = {}, trend = [], companyName = '' }) {
    const doc  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const W    = doc.internal.pageSize.getWidth()   // 210mm
    let   y    = 0                                  // cursor vertical

    // ╔══════════════════════════════════════════════════════════╗
    // ║  HEADER GRADIENT BLOCK                                   ║
    // ╚══════════════════════════════════════════════════════════╝
    const hH = 42  // tinggi header
    // Gradient: kiri indigo → kanan purple (approx via 2 rects)
    doc.setFillColor(...COLOR.indigo)
    doc.rect(0, 0, W / 2 + 10, hH, 'F')
    doc.setFillColor(...COLOR.purple)
    doc.rect(W / 2, 0, W / 2 + 1, hH, 'F')
    // Blend strip
    for (let i = 0; i <= 30; i++) {
        const alpha  = i / 30
        const r = Math.round(COLOR.indigo[0] * (1 - alpha) + COLOR.purple[0] * alpha)
        const g = Math.round(COLOR.indigo[1] * (1 - alpha) + COLOR.purple[1] * alpha)
        const b = Math.round(COLOR.indigo[2] * (1 - alpha) + COLOR.purple[2] * alpha)
        doc.setFillColor(r, g, b)
        doc.rect(W / 2 - 15 + i, 0, 1.2, hH, 'F')
    }

    // Bar dekoratif bawah
    doc.setFillColor(255, 255, 255, 0.15)
    doc.setFillColor(255, 255, 255)
    doc.setGState(doc.GState({ opacity: 0.12 }))
    doc.rect(0, hH - 4, W, 4, 'F')
    doc.setGState(doc.GState({ opacity: 1 }))

    // Judul laporan
    doc.setTextColor(...COLOR.white)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.text('Laporan Rekap Penjualan', 15, 16)

    // Sub-judul: company
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    if (companyName) doc.text(companyName, 15, 23)

    // Info filter aktif
    const prd  = periodLabel(filters.period)
    const from = filters.date_from || '-'
    const to   = filters.date_to   || '-'
    const filterStr = `Periode: ${prd}  |  Tanggal: ${from} s/d ${to}`
    doc.setFontSize(8)
    doc.text(filterStr, 15, 30)

    // Tanggal cetak (pojok kanan atas)
    const cetakStr = `Dicetak: ${new Date().toLocaleDateString('id-ID', { day:'2-digit', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' })}`
    doc.setFontSize(7.5)
    doc.text(cetakStr, W - 15, 30, { align: 'right' })

    y = hH + 10

    // ╔══════════════════════════════════════════════════════════╗
    // ║  KPI STRIP — 4 BOX SEJAJAR                              ║
    // ╚══════════════════════════════════════════════════════════╝
    const kpiItems = [
        { label: 'Total Omzet',      value: fmtShort(summary.total_omzet),    accent: COLOR.indigo },
        { label: 'Jml Transaksi',    value: `${summary.total_transaksi || 0} trx`, accent: COLOR.purple },
        { label: 'Rata-rata / Trx',  value: fmtShort(summary.rata_rata),      accent: [124, 58, 237] },
        { label: 'Growth vs Lalu',
          value: summary.growth_pct !== null && summary.growth_pct !== undefined
                   ? `${summary.growth_pct >= 0 ? '+' : ''}${summary.growth_pct}%`
                   : 'N/A',
          accent: (summary.growth_pct || 0) >= 0 ? COLOR.green : COLOR.red
        },
    ]

    const boxW  = (W - 30 - 9) / 4  // 4 boxes + 3 gaps + margins
    const boxH  = 20
    const boxY  = y
    kpiItems.forEach((k, i) => {
        const bx = 15 + i * (boxW + 3)
        // Box background
        doc.setFillColor(...COLOR.gray50)
        doc.roundedRect(bx, boxY, boxW, boxH, 3, 3, 'F')
        // Accent left bar
        doc.setFillColor(...k.accent)
        doc.roundedRect(bx, boxY, 3, boxH, 1, 1, 'F')
        // Label
        doc.setTextColor(...COLOR.gray700)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(7)
        doc.text(k.label, bx + 6, boxY + 6)
        // Value
        doc.setTextColor(...COLOR.black)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(9.5)
        doc.text(k.value, bx + 6, boxY + 14)
    })

    y = boxY + boxH + 10

    // ╔══════════════════════════════════════════════════════════╗
    // ║  TABEL DETAIL                                            ║
    // ╚══════════════════════════════════════════════════════════╝

    // Enrich trend dengan growth
    const enriched = trend.map((row, i) => {
        const prev   = i > 0 ? trend[i - 1] : null
        const growth = prev && prev.omzet > 0
            ? `${((row.omzet - prev.omzet) / prev.omzet * 100).toFixed(1)}%`
            : (i === 0 ? '—' : '0%')
        const growthNum = prev && prev.omzet > 0
            ? (row.omzet - prev.omzet) / prev.omzet * 100
            : null
        return {
            label:    row.label,
            omzet:    fmtRp(row.omzet),
            transaksi: String(row.transaksi),
            rata:     row.transaksi > 0 ? fmtRp(row.omzet / row.transaksi) : '—',
            growth,
            growthNum,
        }
    })

    // Totals row
    const totOmzet = trend.reduce((s, r) => s + r.omzet, 0)
    const totTrx   = trend.reduce((s, r) => s + r.transaksi, 0)

    autoTable(doc, {
        startY: y,
        head: [['Periode', 'Omzet', 'Transaksi', 'Rata-rata / Trx', 'Growth']],
        body: enriched.map(r => [r.label, r.omzet, r.transaksi, r.rata, r.growth]),
        foot: [['TOTAL', fmtRp(totOmzet), String(totTrx), totTrx > 0 ? fmtRp(totOmzet / totTrx) : '—', '']],
        showFoot: 'lastPage',

        styles: {
            fontSize: 8,
            cellPadding: { top: 3, bottom: 3, left: 4, right: 4 },
            textColor: COLOR.black,
            lineColor: COLOR.gray300,
            lineWidth: 0.1,
        },
        headStyles: {
            fillColor: COLOR.indigo,
            textColor: COLOR.white,
            fontStyle: 'bold',
            fontSize: 7.5,
        },
        footStyles: {
            fillColor: COLOR.gray100,
            textColor: COLOR.black,
            fontStyle: 'bold',
            fontSize: 8,
        },
        alternateRowStyles: {
            fillColor: [245, 243, 255],  // indigo-50
        },
        columnStyles: {
            0: { fontStyle: 'bold' },
            1: { halign: 'right' },
            2: { halign: 'center' },
            3: { halign: 'right' },
            4: {
                halign: 'center',
                // Warna growth per baris — via didDrawCell
            },
        },
        didDrawCell: (data) => {
            // Growth column color
            if (data.section === 'body' && data.column.index === 4) {
                const row = enriched[data.row.index]
                if (row && row.growthNum !== null) {
                    doc.setTextColor(...(row.growthNum >= 0 ? COLOR.green : COLOR.red))
                    doc.setFont('helvetica', 'bold')
                    doc.text(
                        row.growth,
                        data.cell.x + data.cell.width / 2,
                        data.cell.y + data.cell.height / 2 + 1,
                        { align: 'center' }
                    )
                    doc.setTextColor(...COLOR.black)
                }
            }
        },
        margin: { left: 15, right: 15 },
    })

    // ╔══════════════════════════════════════════════════════════╗
    // ║  FOOTER SETIAP HALAMAN                                   ║
    // ╚══════════════════════════════════════════════════════════╝
    const pageCount = doc.internal.getNumberOfPages()
    for (let p = 1; p <= pageCount; p++) {
        doc.setPage(p)
        const footY = doc.internal.pageSize.getHeight() - 8
        doc.setDrawColor(...COLOR.gray300)
        doc.setLineWidth(0.3)
        doc.line(15, footY - 3, W - 15, footY - 3)
        doc.setTextColor(...COLOR.gray700)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(7)
        doc.text(companyName ? `${companyName} — Laporan Rekap Penjualan` : 'Laporan Rekap Penjualan', 15, footY)
        doc.text(`Halaman ${p} / ${pageCount}`, W - 15, footY, { align: 'right' })
    }

    // ── Download ───────────────────────────────────────────────
    const safeFrom = (filters.date_from || '').replace(/-/g, '')
    const safeTo   = (filters.date_to   || '').replace(/-/g, '')
    doc.save(`Rekap_Penjualan_${safeFrom}-${safeTo}.pdf`)
}
