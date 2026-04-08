/**
 * Goods Receive / Surat Jalan Print Utility
 * Opens a print-ready window with a proper letterhead (kop surat).
 *
 * @param {Object} options
 * @param {string} options.type - 'receive' | 'issue' | 'transfer'
 * @param {string} options.number - Document number
 * @param {string} options.date - ISO date string
 * @param {string} [options.companyName] - Company name for letterhead
 * @param {string} [options.companyAddress] - Company address
 * @param {string} [options.companyPhone] - Company phone
 * @param {string} [options.companyNpwp] - Company NPWP
 * @param {string} [options.from] - Origin (warehouse/supplier)
 * @param {string} [options.to] - Destination (warehouse)
 * @param {string} [options.warehouseName] - Warehouse name
 * @param {string} [options.supplierName] - Supplier name (for receive)
 * @param {string} [options.customerName] - Customer name (for issue)
 * @param {string} [options.customerAddress] - Customer address (for issue)
 * @param {string} [options.customerPhone] - Customer phone (for issue)
 * @param {string} [options.poNumber] - Related PO number
 * @param {string} [options.notes] - Notes
 * @param {string} [options.createdBy] - Created by
 * @param {Array}  options.lines - Array of { code, name, qty, uom, batch_no, expiry_date }
 */
export function printSuratJalan(options) {
  const {
    type, number, date,
    companyName = 'ERPsys',
    companyAddress = '',
    companyPhone = '',
    companyNpwp = '',
    from, to, warehouseName,
    supplierName, poNumber,
    customerName, customerAddress, customerPhone,
    notes, createdBy,
    lines = []
  } = options

  const typeLabels = {
    receive: 'BUKTI PENERIMAAN BARANG',
    issue: 'SURAT JALAN PENGELUARAN',
    transfer: 'SURAT JALAN TRANSFER'
  }
  const title = typeLabels[type] || 'SURAT JALAN'
  const formattedDate = date
    ? new Date(date).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })
    : '-'
  const printDate = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })

  const totalQty = lines.reduce((s, l) => s + (Number(l.qty) || 0), 0)
  const hasBatch = lines.some(l => l.batch_no || l.expiry_date)

  const tableHeaders = hasBatch
    ? `<th class="tc" style="width:36px">No</th><th>Kode</th><th>Nama Barang</th><th class="tc" style="width:70px">Qty</th><th style="width:60px">Satuan</th><th style="width:110px">No. Batch</th><th style="width:90px">Tgl Exp.</th>`
    : `<th class="tc" style="width:36px">No</th><th>Kode</th><th>Nama Barang</th><th class="tc" style="width:70px">Qty</th><th style="width:60px">Satuan</th>`

  const tableRows = lines.map((l, i) => {
    const fmtExp = l.expiry_date
      ? new Date(l.expiry_date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
      : '-'
    if (hasBatch) {
      return `<tr><td class="tc">${i + 1}</td><td class="mono">${l.code || '-'}</td><td>${l.name || '-'}</td><td class="tc bold">${l.qty || 0}</td><td>${l.uom || '-'}</td><td class="mono small">${l.batch_no || '-'}</td><td class="small">${fmtExp}</td></tr>`
    }
    return `<tr><td class="tc">${i + 1}</td><td class="mono">${l.code || '-'}</td><td>${l.name || '-'}</td><td class="tc bold">${l.qty || 0}</td><td>${l.uom || '-'}</td></tr>`
  }).join('')

  const colspanTotal = hasBatch ? 3 : 3

  const html = `<!DOCTYPE html>
<html lang="id"><head><meta charset="utf-8">
<title>${title} ${number}</title>
<style>
  @page { size: A4 portrait; margin: 12mm 15mm 15mm 15mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Arial', sans-serif; font-size: 11px; color: #1a1a1a; background: #fff; }

  /* ── KOP SURAT ── */
  .kop { display: flex; align-items: flex-start; gap: 16px; padding-bottom: 10px; border-bottom: 3px double #1a3a6b; margin-bottom: 12px; }
  .kop-logo { width: 56px; height: 56px; background: #1a3a6b; border-radius: 8px;
    display: flex; align-items: center; justify-content: center;
    font-size: 22px; font-weight: 900; color: #fff; letter-spacing: -1px; flex-shrink: 0; }
  .kop-info { flex: 1; }
  .kop-company { font-size: 17px; font-weight: 800; color: #1a3a6b; letter-spacing: 0.3px; line-height: 1.2; }
  .kop-address { font-size: 10px; color: #555; margin-top: 3px; line-height: 1.5; }
  .kop-right { text-align: right; }
  .doc-title { font-size: 13px; font-weight: 800; color: #1a3a6b; letter-spacing: 1px; text-transform: uppercase; }
  .doc-number { font-size: 11px; font-weight: 700; color: #333; margin-top: 3px; }
  .doc-date { font-size: 10px; color: #777; margin-top: 2px; }

  /* ── INFO GRID ── */
  .info-section { display: grid; grid-template-columns: 1fr 1fr; gap: 0; margin-bottom: 12px; border: 1px solid #d0d7e3; border-radius: 4px; overflow: hidden; }
  .info-box { padding: 8px 12px; }
  .info-box:first-child { border-right: 1px solid #d0d7e3; }
  .info-box-title { font-size: 9px; font-weight: 700; color: #888; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 4px; }
  .info-row { display: flex; gap: 0; margin-bottom: 2px; font-size: 10.5px; }
  .info-label { min-width: 90px; color: #666; }
  .info-value { font-weight: 600; color: #1a1a1a; }

  /* ── TABLE ── */
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  thead th { background: #1a3a6b; color: #fff; padding: 7px 8px; font-size: 10px;
    font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; border: 1px solid #1a3a6b; }
  tbody td { padding: 6px 8px; border: 1px solid #d0d7e3; font-size: 11px; vertical-align: middle; }
  tbody tr:nth-child(even) { background: #f5f7fb; }
  tbody tr:hover { background: #edf1fa; }
  .total-row td { background: #e8ecf5; font-weight: 700; border-top: 2px solid #1a3a6b; }
  .tc { text-align: center; }
  .bold { font-weight: 700; }
  .mono { font-family: 'Courier New', monospace; font-size: 10px; }
  .small { font-size: 10px; }

  /* ── CATATAN ── */
  .notes-box { background: #fffbeb; border: 1px solid #f0d060; border-radius: 4px; padding: 6px 10px; margin-bottom: 12px; font-size: 10.5px; color: #5a4500; }
  .notes-box strong { color: #8a6200; }

  /* ── TANDA TANGAN ── */
  .sig-section { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 24px; margin-top: 8px; }
  .sig-box { text-align: center; }
  .sig-title { font-size: 10.5px; font-weight: 700; color: #1a3a6b; margin-bottom: 4px; }
  .sig-role { font-size: 9.5px; color: #888; margin-bottom: 0; }
  .sig-space { height: 64px; border-bottom: 1px solid #333; margin: 0 8px; }
  .sig-name { font-size: 10px; color: #555; margin-top: 4px; }

  /* ── FOOTER ── */
  .footer { margin-top: 16px; padding-top: 8px; border-top: 1px solid #d0d7e3; display: flex; justify-content: space-between; font-size: 9px; color: #aaa; }

  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head><body>

<!-- KOP SURAT -->
<div class="kop">
  <div class="kop-logo">${(companyName || 'ERP').replace(/^(PT\.?\s*|CV\.?\s*)/i, '').split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()}</div>
  <div class="kop-info">
    <div class="kop-company">${companyName}</div>
    <div class="kop-address">
      ${companyAddress ? companyAddress + '<br>' : ''}
      ${companyPhone ? 'Telp: ' + companyPhone + (companyNpwp ? '&nbsp;&nbsp;|&nbsp;&nbsp;' : '') : ''}
      ${companyNpwp ? 'NPWP: ' + companyNpwp : ''}
    </div>
  </div>
  <div class="kop-right">
    <div class="doc-title">${title}</div>
    <div class="doc-number">${number}</div>
    <div class="doc-date">Tanggal: ${formattedDate}</div>
  </div>
</div>

<!-- INFO PANEL -->
<div class="info-section">
  <div class="info-box">
    <div class="info-box-title">${type === 'issue' ? 'Informasi Pengeluaran' : type === 'transfer' ? 'Informasi Transfer' : 'Informasi Penerimaan'}</div>
    ${poNumber ? `<div class="info-row"><span class="info-label">${type === 'issue' ? 'No. SO' : 'No. PO'}</span><span class="info-value">${poNumber}</span></div>` : ''}
    ${supplierName ? `<div class="info-row"><span class="info-label">Supplier</span><span class="info-value">${supplierName}</span></div>` : ''}
    ${type === 'issue' && (customerName || to) ? `<div class="info-row"><span class="info-label">Customer / Tujuan</span><span class="info-value">${customerName || to}</span></div>` : ''}
    ${type !== 'issue' && from && !supplierName ? `<div class="info-row"><span class="info-label">Dari Gudang</span><span class="info-value">${from}</span></div>` : ''}
    ${type !== 'issue' && (warehouseName || to) ? `<div class="info-row"><span class="info-label">Gudang Tujuan</span><span class="info-value">${warehouseName || to}</span></div>` : ''}
    ${type !== 'issue' ? `<div class="info-row"><span class="info-label">Tanggal Terima</span><span class="info-value">${formattedDate}</span></div>` : `<div class="info-row"><span class="info-label">Tanggal Keluar</span><span class="info-value">${formattedDate}</span></div>`}
  </div>
  <div class="info-box">
    ${type === 'issue' && customerName ? `
    <div class="info-box-title">Data Customer / Penerima</div>
    <div class="info-row"><span class="info-label">Nama</span><span class="info-value">${customerName}</span></div>
    ${customerAddress ? `<div class="info-row"><span class="info-label">Alamat</span><span class="info-value">${customerAddress}</span></div>` : ''}
    ${customerPhone ? `<div class="info-row"><span class="info-label">No. Telp</span><span class="info-value">${customerPhone}</span></div>` : ''}
    <div class="info-row"><span class="info-label">Tgl Cetak</span><span class="info-value">${printDate}</span></div>
    ` : `
    <div class="info-box-title">Dibuat Oleh</div>
    ${createdBy ? `<div class="info-row"><span class="info-label">Nama</span><span class="info-value">${createdBy}</span></div>` : ''}
    <div class="info-row"><span class="info-label">Tgl Cetak</span><span class="info-value">${printDate}</span></div>
    <div class="info-row"><span class="info-label">Sistem</span><span class="info-value">ERPsys</span></div>
    `}
  </div>
</div>

${notes ? `<div class="notes-box"><strong>Catatan:</strong> ${notes}</div>` : ''}

<!-- TABEL BARANG -->
<table>
  <thead><tr>${tableHeaders}</tr></thead>
  <tbody>
    ${tableRows || `<tr><td colspan="${hasBatch ? 7 : 5}" style="text-align:center;color:#aaa;padding:16px">Tidak ada data</td></tr>`}
    <tr class="total-row">
      <td colspan="${hasBatch ? 3 : 3}" style="text-align:right">TOTAL BARANG ${type === 'issue' ? 'DIKELUARKAN' : 'DITERIMA'}</td>
      <td class="tc">${totalQty}</td>
      <td colspan="${hasBatch ? 3 : 1}"></td>
    </tr>
  </tbody>
</table>

<!-- TANDA TANGAN -->
<div class="sig-section">
  <div class="sig-box">
    <div class="sig-title">${type === 'issue' ? 'Dikirim Oleh' : type === 'transfer' ? 'Diserahkan Oleh' : 'Dikirim Oleh'}</div>
    <div class="sig-role">${type === 'issue' ? '(Petugas Gudang)' : type === 'transfer' ? '(Gudang Pengirim)' : '(Pengirim / Supplier)'}</div>
    <div class="sig-space"></div>
    <div class="sig-name">Nama &amp; Tanda Tangan</div>
  </div>
  <div class="sig-box">
    <div class="sig-title">Diterima Oleh</div>
    <div class="sig-role">${type === 'issue' ? '(Customer / Pembeli)' : type === 'transfer' ? '(Gudang Penerima)' : '(Petugas Gudang)'}</div>
    <div class="sig-space"></div>
    <div class="sig-name">Nama &amp; Tanda Tangan</div>
  </div>
  <div class="sig-box">
    <div class="sig-title">Diketahui Oleh</div>
    <div class="sig-role">(Kepala Gudang / Manager)</div>
    <div class="sig-space"></div>
    <div class="sig-name">Nama &amp; Tanda Tangan</div>
  </div>
</div>

<div class="footer">
  <span>Dokumen ini dicetak dari sistem ERPsys &mdash; ${companyName}</span>
  <span>Dicetak: ${new Date().toLocaleString('id-ID')}</span>
</div>

</body></html>`

  const w = window.open('', '_blank', 'width=900,height=700')
  if (!w) { alert('Popup blocked. Izinkan popup untuk mencetak.'); return }
  w.document.write(html)
  w.document.close()
  w.focus()
  setTimeout(() => w.print(), 400)
}
