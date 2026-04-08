/**
 * views/sales/reports/utils/soListPdf.js
 *
 * Generator PDF untuk Laporan Sales Order.
 * Menggunakan jsPDF + jspdf-autotable (sudah tersedia di project).
 *
 * Ekspor: exportSOListPdf({ filters, summary, rows, companyName })
 */
import jsPDF    from 'jspdf'
import autoTable from 'jspdf-autotable'

// ── Warna (mirror dari salesRekapPdf.js) ──────────────────────
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

// ── Helpers ────────────────────────────────────────────────────
function fmtRp(n) {
    if (n === null || n === undefined) return '—'
    return 'Rp ' + Math.round(n).toLocaleString('id-ID')
}
function fmtDate(d) {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}
const STATUS_LABEL = {
    draft: 'Draft', pending: 'Pending', approved: 'Approved',
    partial: 'Partial', processed: 'Diproses', paid: 'Lunas', rejected: 'Ditolak',
}

// ── Main export ────────────────────────────────────────────────
export function exportSOListPdf({ filters = {}, summary = {}, rows = [], companyName = '' }) {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    const W   = doc.internal.pageSize.getWidth()   // 297mm landscape
    let   y   = 0

    // ── Header gradient block ──────────────────────────────
    const hH = 38
    doc.setFillColor(...COLOR.indigo)
    doc.rect(0, 0, W / 2 + 10, hH, 'F')
    doc.setFillColor(...COLOR.purple)
    doc.rect(W / 2, 0, W / 2 + 1, hH, 'F')
    for (let i = 0; i <= 30; i++) {
        const a  = i / 30
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
    doc.text('Laporan Sales Order', 15, 14)
    doc.setFontSize(8.5)
    doc.setFont('helvetica', 'normal')
    if (companyName) doc.text(companyName, 15, 21)
    const f = filters
    const filterStr = [
        `Tanggal: ${f.date_from || '—'} s/d ${f.date_to || '—'}`,
        f.status      ? `Status: ${f.status}`           : '',
        f.salesperson ? `Salesperson: ${f.salesperson}`  : '',
    ].filter(Boolean).join('   |   ')
    doc.setFontSize(7.5)
    doc.text(filterStr, 15, 28)
    const cetakStr = `Dicetak: ${new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`
    doc.text(cetakStr, W - 15, 28, { align: 'right' })

    y = hH + 8

    // ── KPI Strip ──────────────────────────────────────────
    const kpiItems = [
        { label: 'Total SO',      value: String(summary.total_so     ?? '—'), accent: COLOR.indigo },
        { label: 'Nilai SO',      value: fmtRp(summary.total_nilai),          accent: COLOR.blue   },
        { label: 'SO Terbuka',    value: String(summary.so_terbuka   ?? '—'), accent: COLOR.amber  },
        { label: 'SO Terlambat',  value: String(summary.so_terlambat ?? '—'), accent: COLOR.red    },
        { label: 'SO Lunas',      value: String(summary.so_lunas     ?? '—'), accent: COLOR.green  },
    ]
    const boxW = (W - 30 - 16) / 5
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

    // ── Tabel utama (landscape A4) ─────────────────────────
    const tableBody = rows.map(r => [
        r.number,
        fmtDate(r.date),
        r.customer_name || '—',
        r.branch_name   || '—',
        r.salesperson   || '—',
        fmtRp(r.nilai_so),
        `${r.delivered_qty} / ${r.total_qty} (${r.pct_delivered}%)`,
        r.aging_days !== null ? `${r.aging_days} hari` : '—',
        STATUS_LABEL[r.status] || r.status,
    ])

    // Totals
    const totNilai = rows.reduce((s, r) => s + r.nilai_so, 0)

    autoTable(doc, {
        startY: y,
        head:   [['No. SO', 'Tanggal', 'Pelanggan', 'Cabang', 'Salesperson', 'Nilai SO', 'Progress Kirim', 'Aging', 'Status']],
        body:   tableBody,
        foot:   [['TOTAL', '', '', '', '', fmtRp(totNilai), '', '', '']],
        showFoot: 'lastPage',
        styles: {
            fontSize:    7.5,
            cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 },
            textColor:   COLOR.black,
            lineColor:   COLOR.gray300,
            lineWidth:   0.1,
        },
        headStyles: {
            fillColor:  COLOR.indigo,
            textColor:  COLOR.white,
            fontStyle:  'bold',
            fontSize:   7,
        },
        footStyles: {
            fillColor:  COLOR.gray100,
            textColor:  COLOR.black,
            fontStyle:  'bold',
        },
        alternateRowStyles: { fillColor: [245, 243, 255] },
        columnStyles: {
            0: { fontStyle: 'bold', cellWidth: 32 },
            5: { halign: 'right' },
            6: { halign: 'center', cellWidth: 34 },
            7: { halign: 'center', cellWidth: 20 },
            8: { halign: 'center', cellWidth: 22 },
        },
        // Warna aging & status per baris
        didDrawCell: (data) => {
            if (data.section !== 'body') return
            const row = rows[data.row.index]
            if (!row) return
            // Aging — merah jika terlambat
            if (data.column.index === 7 && row.is_late) {
                doc.setTextColor(...COLOR.red)
                doc.setFont('helvetica', 'bold')
                doc.text(
                    `${row.aging_days} hari`,
                    data.cell.x + data.cell.width / 2,
                    data.cell.y + data.cell.height / 2 + 1,
                    { align: 'center' }
                )
                doc.setTextColor(...COLOR.black)
            }
        },
        margin: { left: 15, right: 15 },
    })

    // ── Page footer ────────────────────────────────────────
    const pageCount = doc.internal.getNumberOfPages()
    for (let p = 1; p <= pageCount; p++) {
        doc.setPage(p)
        const footY = doc.internal.pageSize.getHeight() - 7
        doc.setDrawColor(...COLOR.gray300)
        doc.setLineWidth(0.3)
        doc.line(15, footY - 3, W - 15, footY - 3)
        doc.setTextColor(...COLOR.gray700)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(6.5)
        doc.text(companyName ? `${companyName} — Laporan Sales Order` : 'Laporan Sales Order', 15, footY)
        doc.text(`Halaman ${p} / ${pageCount}`, W - 15, footY, { align: 'right' })
    }

    // ── Download ───────────────────────────────────────────
    const safeFrom = (f.date_from || '').replace(/-/g, '')
    const safeTo   = (f.date_to   || '').replace(/-/g, '')
    doc.save(`Laporan_SO_${safeFrom}-${safeTo}.pdf`)
}
