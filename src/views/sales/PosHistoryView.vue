<template>
  <div>
    <div class="page-header">
      <div><h1>Riwayat Transaksi Resto</h1><span class="breadcrumb-custom">Restoran / Riwayat Transaksi</span></div>
      <div class="d-flex gap-2">
        <button class="btn btn-danger" @click="exportPdf" :disabled="!filtered.length">
          <i class="bi bi-file-earmark-pdf me-1"></i>Export PDF
        </button>
        <button class="btn btn-success" @click="exportExcel" :disabled="!filtered.length">
          <i class="bi bi-file-earmark-excel me-1"></i>Export Excel
        </button>
      </div>
    </div>

    <!-- Filter Bar -- Uses only plain ASCII characters -->
    <div class="card mb-3">
      <div class="card-body py-2">
        <div class="row g-2 align-items-end">
          <div class="col-6 col-md-auto">
            <label class="form-label small mb-1 text-muted">Dari Tanggal</label>
            <input type="date" class="form-control form-control-sm" v-model="dateFrom" @change="loadData">
          </div>
          <div class="col-6 col-md-auto">
            <label class="form-label small mb-1 text-muted">Sampai Tanggal</label>
            <input type="date" class="form-control form-control-sm" v-model="dateTo" @change="loadData">
          </div>
          <div class="col-6 col-md-auto">
            <label class="form-label small mb-1 text-muted">Metode Bayar</label>
            <select class="form-select form-select-sm" v-model="filterPayment" @change="applyFilter">
              <option value="">Semua</option>
              <option value="cash">Cash</option>
              <option value="transfer">Transfer</option>
              <option value="qris">QRIS</option>
              <option value="debit">Debit</option>
            </select>
          </div>
          <div class="col-6 col-md-auto">
            <label class="form-label small mb-1 text-muted">Status</label>
            <select class="form-select form-select-sm" v-model="filterStatus" @change="applyFilter">
              <option value="">Semua Status</option>
              <option value="paid">PAID (Success)</option>
              <option value="refund">REFUND (Batal)</option>
            </select>
          </div>
          <div class="col-6 col-md-auto">
            <label class="form-label small mb-1 text-muted">Kasir</label>
            <select class="form-select form-select-sm" v-model="filterCashier" @change="applyFilter">
              <option value="">Semua Kasir</option>
              <option v-for="c in cashierList" :key="c" :value="c">{{ c }}</option>
            </select>
          </div>
          <div class="col-12 col-md">
            <label class="form-label small mb-1 text-muted">Cari</label>
            <input class="form-control form-control-sm" v-model="search" placeholder="No. transaksi / kasir...">
          </div>
          <div class="col-auto">
            <button class="btn btn-sm btn-outline-secondary" @click="resetFilter">
              <i class="bi bi-x-circle me-1"></i>Reset
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Summary Cards -->
    <div class="row g-3 mb-3" v-if="!loading">
      <div class="col-6 col-md-3">
        <div class="card border-0 shadow-sm h-100">
          <div class="card-body">
            <div class="d-flex align-items-center">
              <div class="rounded-circle bg-primary bg-opacity-10 p-3 me-3">
                <i class="bi bi-receipt text-primary fs-5"></i>
              </div>
              <div>
                <div class="text-muted small">Total Transaksi</div>
                <div class="fw-bold fs-4">{{ filtered.length }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="card border-0 shadow-sm h-100">
          <div class="card-body">
            <div class="d-flex align-items-center">
              <div class="rounded-circle bg-success bg-opacity-10 p-3 me-3">
                <i class="bi bi-cash-coin text-success fs-5"></i>
              </div>
              <div>
                <div class="text-muted small">Total Penjualan</div>
                <div class="fw-bold fs-5 text-success">{{ formatCurrency(totalSales) }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="card border-0 shadow-sm h-100">
          <div class="card-body">
            <div class="d-flex align-items-center">
              <div class="rounded-circle bg-info bg-opacity-10 p-3 me-3">
                <i class="bi bi-graph-up text-info fs-5"></i>
              </div>
              <div>
                <div class="text-muted small">Rata-rata / Transaksi</div>
                <div class="fw-bold fs-5">{{ formatCurrency(avgSales) }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="card border-0 shadow-sm h-100">
          <div class="card-body">
            <div class="d-flex align-items-center">
              <div class="rounded-circle bg-warning bg-opacity-10 p-3 me-3">
                <i class="bi bi-tag text-warning fs-5"></i>
              </div>
              <div>
                <div class="text-muted small">Total Diskon</div>
                <div class="fw-bold fs-5 text-warning">{{ formatCurrency(totalDiscount) }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="text-center py-5">
      <div class="spinner-border text-primary mb-2"></div>
      <div class="text-muted">Memuat data transaksi...</div>
    </div>

    <!-- Transaction List + Detail -->
    <div v-else>
      <div class="card shadow-sm border-0 mb-3">
        <div class="table-responsive">
          <table class="table table-hover align-middle mb-0">
            <thead class="table-light">
              <tr>
                <th class="ps-4">No. Transaksi</th>
                <th>Waktu</th>
                <th>Kasir</th>
                <th>Metode</th>
                <th>Status</th>
                <th class="text-end pe-4">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="tx in filteredPaged" :key="tx.uuid"
                  @click="selectTx(tx)" style="cursor:pointer"
                  :class="{ 'table-primary': selectedTx?.uuid === tx.uuid }">
                <td class="ps-4 fw-bold text-primary">{{ tx.number }}</td>
                <td class="text-muted small"><i class="bi bi-clock me-1"></i>{{ formatTimeOnly(tx.date) }}</td>
                <td>{{ tx.cashier_name || '-' }}</td>
                <td><span class="badge" :class="paymentBadge(tx.payment_method)">{{ paymentLabel(tx.payment_method).toUpperCase() }}</span></td>
                <td>
                  <span class="badge rounded-pill" :class="(tx.status==='refund'||tx.status==='cancelled') ? 'text-bg-danger' : 'text-bg-success'">
                    <i class="bi" :class="(tx.status==='refund'||tx.status==='cancelled') ? 'bi-x-circle' : 'bi-check-circle'"></i> 
                    {{ (tx.status==='refund'||tx.status==='cancelled') ? 'BATAL' : 'SUCCESS' }}
                  </span>
                </td>
                <td class="text-end pe-4 fw-semibold">{{ formatCurrency(tx.total) }}</td>
              </tr>
              <tr v-if="filteredPaged.length === 0">
                <td colspan="6" class="text-center py-5 text-muted border-0">
                  <i class="bi bi-receipt display-6 d-block mb-3 opacity-50"></i>
                  Tidak ada transaksi untuk filter terpilih
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <!-- Pagination -->
        <div class="card-footer d-flex justify-content-between align-items-center py-2" v-if="filtered.length > pageSize">
          <div class="text-muted small">Menampilkan {{ (currentPage-1)*pageSize+1 }}–{{ Math.min(currentPage*pageSize, filtered.length) }} dari {{ filtered.length }} transaksi</div>
          <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-secondary" :disabled="currentPage === 1" @click="currentPage--">‹</button>
            <button class="btn btn-outline-secondary" v-for="p in totalPages" :key="p" :class="{ active: p === currentPage }" @click="currentPage = p">{{ p }}</button>
            <button class="btn btn-outline-secondary" :disabled="currentPage === totalPages" @click="currentPage++">›</button>
          </div>
        </div>
      </div>

      <!-- Detail Panel -->
      <div class="card mt-3" v-if="selectedTx">
        <div class="card-header d-flex justify-content-between align-items-center">
          <span><i class="bi bi-receipt me-2"></i><strong>Detail Transaksi: {{ selectedTx.number }}</strong></span>
          <button class="btn btn-sm btn-outline-secondary" @click="selectedTx = null"><i class="bi bi-x-lg"></i></button>
        </div>
        <div class="card-body">
          <div class="row mb-3">
            <div class="col-md-3"><div class="text-muted small">Waktu</div><div class="fw-semibold">{{ formatDateTime(selectedTx.date) }}</div></div>
            <div class="col-md-3"><div class="text-muted small">Kasir</div><div class="fw-semibold">{{ selectedTx.cashier_name || '-' }}</div></div>
            <div class="col-md-2"><div class="text-muted small">Metode Bayar</div><span class="badge" :class="paymentBadge(selectedTx.payment_method)">{{ paymentLabel(selectedTx.payment_method) }}</span></div>
            <div class="col-md-2"><div class="text-muted small">Bayar</div><div class="fw-semibold">{{ formatCurrency(selectedTx.cash_paid) }}</div></div>
            <div class="col-md-2"><div class="text-muted small">Kembalian</div><div class="fw-semibold text-success">{{ formatCurrency(selectedTx.change) }}</div></div>
          </div>
          <h6 class="text-muted small fw-bold mb-2"><i class="bi bi-list-ul me-1"></i>ITEM TERJUAL</h6>
          <table class="table table-sm table-bordered mb-0">
            <thead class="table-light">
              <tr><th>#</th><th>Barang</th><th class="text-end">Qty</th><th class="text-end">Harga</th><th class="text-end">Diskon</th><th class="text-end">Subtotal</th></tr>
            </thead>
            <tbody>
              <tr v-for="(item, i) in parsedItems" :key="i">
                <td class="text-muted">{{ i+1 }}</td>
                <td>
                  <div class="fw-semibold">{{ item.item_name || item.name }}</div>
                  <div class="text-muted small" v-if="item.is_bundle"><i class="bi bi-box2 me-1"></i>Paket Bundling</div>
                </td>
                <td class="text-end">{{ item.qty }}</td>
                <td class="text-end">{{ formatCurrency(item.price) }}</td>
                <td class="text-end text-warning">{{ item.discount > 0 ? item.discount + '%' : '-' }}</td>
                <td class="text-end fw-semibold">{{ formatCurrency(item.qty * item.price * (1 - (item.discount||0)/100)) }}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr class="table-light">
                <td colspan="5" class="text-end fw-semibold">Subtotal</td>
                <td class="text-end">{{ formatCurrency(selectedTx.subtotal) }}</td>
              </tr>
              <tr v-if="selectedTx.discount_pct > 0" class="text-warning">
                <td colspan="5" class="text-end">Diskon {{ selectedTx.discount_pct }}%</td>
                <td class="text-end">-{{ formatCurrency(selectedTx.subtotal * selectedTx.discount_pct / 100) }}</td>
              </tr>
              <tr class="table-primary fw-bold">
                <td colspan="5" class="text-end">TOTAL</td>
                <td class="text-end fs-6">{{ formatCurrency(selectedTx.total) }}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useBranchStore } from '@/stores/branch'
import { useToast } from '@/composables/useToast'
import * as salesApi from '@/services/sales/api'
import { formatCurrency } from '@/utils/format'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const branchStore = useBranchStore()
const toast = useToast()

// ── State ─────────────────────────────────────────────
const allTx = ref([])
const loading = ref(false)
const dateFrom = ref(todayMinus(30))
const dateTo = ref(today())
const filterPayment = ref('')
const filterStatus = ref('')
const filterCashier = ref('')
const search = ref('')
const currentPage = ref(1)
const pageSize = 25

const selectedTx = ref(null)

function today() { return new Date().toISOString().split('T')[0] }
function todayMinus(days) { const d = new Date(); d.setDate(d.getDate() - days); return d.toISOString().split('T')[0] }

// ── Load Data ─────────────────────────────────────────
async function loadData() {
  loading.value = true
  selectedTx.value = null
  try {
    const { data } = await salesApi.getPosTransactions({
      branch_id: branchStore.currentBranchId,
      from: dateFrom.value,
      to: dateTo.value
    })
    allTx.value = data || []
  } catch(e) { toast.error('Gagal memuat data: ' + (e.response?.data?.error || e.message)) }
  loading.value = false
}

onMounted(loadData)

// ── Helpers ───────────────────────────────────────────
const cashierList = computed(() => [...new Set(allTx.value.map(t => t.cashier_name).filter(Boolean))])

const filtered = computed(() => {
  let list = allTx.value
  if (filterPayment.value) list = list.filter(t => t.payment_method === filterPayment.value)
  if (filterStatus.value) list = list.filter(t => (t.status || 'paid') === filterStatus.value)
  if (filterCashier.value) list = list.filter(t => t.cashier_name === filterCashier.value)
  if (search.value) {
    const q = search.value.toLowerCase()
    list = list.filter(t => t.number?.toLowerCase().includes(q) || t.cashier_name?.toLowerCase().includes(q))
  }
  return list
})

const totalPages = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize)))
const filteredPaged = computed(() => filtered.value.slice((currentPage.value-1)*pageSize, currentPage.value*pageSize))

const totalSales = computed(() => filtered.value.reduce((s, t) => s + parseFloat(t.total||0), 0))
const totalDiscount = computed(() => filtered.value.reduce((s, t) => s + (parseFloat(t.subtotal||0) - parseFloat(t.total||0)), 0))
const avgSales = computed(() => filtered.value.length ? totalSales.value / filtered.value.length : 0)

function applyFilter() { currentPage.value = 1 }
function resetFilter() { filterPayment.value = ''; filterStatus.value = ''; filterCashier.value = ''; search.value = ''; currentPage.value = 1 }

function paymentLabel(m) { return { cash: 'Cash', transfer: 'Transfer', qris: 'QRIS', debit: 'Debit' }[m] || m || '-' }
function paymentBadge(m) { return { cash: 'bg-success', transfer: 'bg-primary', qris: 'bg-info text-dark', debit: 'bg-secondary' }[m] || 'bg-secondary' }
function formatDateTime(ts) { return ts ? new Date(ts).toLocaleString('id-ID', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '-' }
function formatTimeOnly(ts) { return ts ? new Date(ts).toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' }) : '-' }

const parsedItems = computed(() => {
  if (!selectedTx.value?.items_json) return []
  try {
    const items = typeof selectedTx.value.items_json === 'string'
      ? JSON.parse(selectedTx.value.items_json) : selectedTx.value.items_json
    return items || []
  } catch { return [] }
})

function selectTx(tx) {
  if (selectedTx.value?.uuid === tx.uuid) { selectedTx.value = null; return }
  selectedTx.value = tx
}

// ── Excel Export ──────────────────────────────────────
function exportExcel() {
  const wb = XLSX.utils.book_new()
  const restoName = localStorage.getItem('resto_local_name') || 'Smart POS'
  const now = new Date()
  const periodeLabel = `${dateFrom.value} s/d ${dateTo.value}`

  // ── Sheet 1: Ringkasan ─────────────────────────────
  const summaryData = [
    ['LAPORAN RIWAYAT PENJUALAN POS'],
    [`Resto: ${restoName}`],
    [`Periode: ${periodeLabel}`],
    [`Dicetak: ${now.toLocaleString('id-ID')}`],
    [],
    ['RINGKASAN'],
    ['Total Transaksi', filtered.value.length],
    ['Total Penjualan', totalSales.value],
    ['Total Diskon', totalDiscount.value],
    ['Rata-rata / Transaksi', avgSales.value],
    [],
    ['Breakdown Metode Pembayaran'],
    ['Metode', 'Jumlah Transaksi', 'Total Nilai'],
    ...['cash','transfer','qris','debit'].map(m => {
      const list = filtered.value.filter(t => t.payment_method === m)
      return [paymentLabel(m), list.length, list.reduce((s,t) => s + parseFloat(t.total||0), 0)]
    }).filter(r => r[1] > 0)
  ]
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData)
  wsSummary['!merges'] = [
    { s: { r:0, c:0 }, e: { r:0, c:3 } },
    { s: { r:1, c:0 }, e: { r:1, c:3 } },
    { s: { r:2, c:0 }, e: { r:2, c:3 } },
    { s: { r:3, c:0 }, e: { r:3, c:3 } },
  ]
  wsSummary['!cols'] = [{ wch:30 }, { wch:20 }, { wch:20 }, { wch:20 }]
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Ringkasan')

  // ── Sheet 2: Daftar Transaksi ──────────────────────
  const headers = ['No. Transaksi', 'Tanggal', 'Waktu', 'Kasir', 'Metode Bayar', 'Subtotal', 'Diskon (%)', 'Total', 'Dibayar', 'Kembalian', 'Jml Item']
  const rows = filtered.value.map(tx => {
    const dt = new Date(tx.date)
    let items = []
    try { items = typeof tx.items_json === 'string' ? JSON.parse(tx.items_json) : (tx.items_json || []) } catch {}
    const itemCount = items.reduce((s, i) => s + (i.qty||0), 0)
    return [
      tx.number,
      dt.toLocaleDateString('id-ID'),
      dt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
      tx.cashier_name || '-',
      paymentLabel(tx.payment_method),
      parseFloat(tx.subtotal||0),
      parseFloat(tx.discount_pct||0),
      parseFloat(tx.total||0),
      parseFloat(tx.cash_paid||0),
      parseFloat(tx.change||0),
      itemCount
    ]
  })
  // Footer row
  const footerRow = ['TOTAL', '', '', '', '', totalSales.value + totalDiscount.value, '', totalSales.value, '', '', '']
  const txData = [
    ['DAFTAR TRANSAKSI POS'],
    [`Resto: ${restoName}  |  Periode: ${periodeLabel}`],
    [],
    headers,
    ...rows,
    [],
    footerRow
  ]
  const wsTx = XLSX.utils.aoa_to_sheet(txData)
  wsTx['!merges'] = [
    { s: { r:0, c:0 }, e: { r:0, c:10 } },
    { s: { r:1, c:0 }, e: { r:1, c:10 } },
  ]
  wsTx['!cols'] = [{ wch:18 }, { wch:13 }, { wch:8 }, { wch:18 }, { wch:13 }, { wch:15 }, { wch:10 }, { wch:15 }, { wch:15 }, { wch:13 }, { wch:10 }]
  XLSX.utils.book_append_sheet(wb, wsTx, 'Daftar Transaksi')

  // ── Sheet 3: Detail Item ───────────────────────────
  const itemHeaders = ['No. Transaksi', 'Tanggal', 'Kasir', 'Nama Barang', 'Tipe', 'Qty', 'Harga Satuan', 'Diskon Item (%)', 'Subtotal']
  const itemRows = []
  for (const tx of filtered.value) {
    let items = []
    try { items = typeof tx.items_json === 'string' ? JSON.parse(tx.items_json) : (tx.items_json || []) } catch {}
    for (const item of items) {
      const sub = item.qty * item.price * (1 - (item.discount||0)/100)
      itemRows.push([
        tx.number,
        new Date(tx.date).toLocaleDateString('id-ID'),
        tx.cashier_name || '-',
        item.name || item.item_name || '-',
        item.is_bundle ? 'Bundle' : 'Satuan',
        item.qty,
        parseFloat(item.price||0),
        parseFloat(item.discount||0),
        sub
      ])
    }
  }
  const detailData = [
    ['DETAIL ITEM TERJUAL'],
    [`Resto: ${restoName}  |  Periode: ${periodeLabel}`],
    [],
    itemHeaders,
    ...itemRows
  ]
  const wsDetail = XLSX.utils.aoa_to_sheet(detailData)
  wsDetail['!merges'] = [
    { s: { r:0, c:0 }, e: { r:0, c:8 } },
    { s: { r:1, c:0 }, e: { r:1, c:8 } },
  ]
  wsDetail['!cols'] = [{ wch:18 }, { wch:13 }, { wch:16 }, { wch:28 }, { wch:10 }, { wch:6 }, { wch:15 }, { wch:14 }, { wch:15 }]
  XLSX.utils.book_append_sheet(wb, wsDetail, 'Detail Item')

  const fileName = `POS_Penjualan_${restoName.replace(/\s+/g,'_')}_${dateFrom.value}_${dateTo.value}.xlsx`
  XLSX.writeFile(wb, fileName)
  toast.success(`File "${fileName}" berhasil diunduh`)
}

// ── PDF Export ────────────────────────────────────────
function exportPdf() {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const restoName = localStorage.getItem('resto_local_name') || 'Smart POS'
  const periodeLabel = dateFrom.value + ' s/d ' + dateTo.value
  const now = new Date().toLocaleString('id-ID')
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const NAVY   = [27, 47, 78]
  const BLUE   = [41, 128, 185]
  const GREEN  = [39, 174, 96]
  const DARK   = [44, 62, 80]
  const BGROW  = [245, 247, 250]
  const STRIPE = [230, 236, 245]

  // ── Header blok ─────────────────────────────────
  doc.setFillColor(...NAVY)
  doc.rect(0, 0, pageW, 20, 'F')
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255)
  doc.text('LAPORAN RIWAYAT PENJUALAN POS', pageW / 2, 9, { align: 'center' })
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(190, 210, 235)
  doc.text(
    'Resto: ' + restoName + '   |   Periode: ' + periodeLabel + '   |   Dicetak: ' + now,
    pageW / 2, 16, { align: 'center' }
  )
  doc.setTextColor(...DARK)

  // ── Label seksi ──────────────────────────────────
  const sectionLabel = (text, x, y) => {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...NAVY)
    doc.text(text, x, y)
    doc.setDrawColor(...BLUE)
    doc.setLineWidth(0.4)
    doc.line(x, y + 0.8, x + doc.getTextWidth(text), y + 0.8)
    doc.setTextColor(0)
  }

  // ── Ringkasan ─────────────────────────────────────
  sectionLabel('Ringkasan', 14, 27)
  autoTable(doc, {
    startY: 29,
    head: [['Keterangan', 'Nilai']],
    body: [
      ['Total Transaksi', String(filtered.value.length)],
      ['Total Penjualan', formatCurrency(totalSales.value)],
      ['Total Diskon', formatCurrency(totalDiscount.value)],
      ['Rata-rata / Transaksi', formatCurrency(avgSales.value)],
    ],
    theme: 'plain',
    headStyles: { fillColor: BLUE, textColor: 255, fontSize: 8, fontStyle: 'bold', cellPadding: 2 },
    bodyStyles: { fontSize: 8, cellPadding: 2, textColor: DARK },
    alternateRowStyles: { fillColor: BGROW },
    columnStyles: {
      0: { cellWidth: 55 },
      1: { cellWidth: 35, halign: 'right', fontStyle: 'bold' }
    },
    tableWidth: 90,
    margin: { left: 14 }
  })

  // ── Breakdown Metode Pembayaran ───────────────────
  const paymentBreakdown = ['cash', 'transfer', 'qris', 'debit'].map(m => {
    const list = filtered.value.filter(t => t.payment_method === m)
    if (!list.length) return null
    return [paymentLabel(m), String(list.length), formatCurrency(list.reduce((s, t) => s + parseFloat(t.total || 0), 0))]
  }).filter(Boolean)

  const afterSummaryY = doc.lastAutoTable.finalY
  sectionLabel('Breakdown Metode Pembayaran', 115, 27)
  autoTable(doc, {
    startY: 29,
    head: [['Metode', 'Jml Transaksi', 'Total Nilai']],
    body: paymentBreakdown,
    theme: 'plain',
    headStyles: { fillColor: GREEN, textColor: 255, fontSize: 8, fontStyle: 'bold', cellPadding: 2 },
    bodyStyles: { fontSize: 8, cellPadding: 2, textColor: DARK },
    alternateRowStyles: { fillColor: BGROW },
    columnStyles: {
      0: { cellWidth: 30 },
      1: { cellWidth: 30, halign: 'center' },
      2: { cellWidth: 30, halign: 'right', fontStyle: 'bold' }
    },
    tableWidth: 90,
    margin: { left: 115 }
  })

  // ── Separator sebelum tabel transaksi ─────────────
  const startTxY = Math.max(afterSummaryY, doc.lastAutoTable.finalY) + 7
  doc.setDrawColor(...NAVY)
  doc.setLineWidth(0.25)
  doc.line(14, startTxY - 3, pageW - 14, startTxY - 3)
  sectionLabel('Daftar Transaksi', 14, startTxY)

  // Kolom: # | Kasir | No.Transaksi | Waktu | Metode | Subtotal | Diskon | Total | Dibayar | Kembalian | Item
  const txRows = filtered.value.map((tx, idx) => {
    const dt = new Date(tx.date)
    let items = []
    try { items = typeof tx.items_json === 'string' ? JSON.parse(tx.items_json) : (tx.items_json || []) } catch {}
    const itemCount = items.reduce((s, i) => s + (i.qty || 0), 0)
    return [
      idx + 1,                                                                                    // 0  #
      tx.cashier_name || '-',                                                                     // 1  Kasir
      tx.number,                                                                                  // 2  No. Transaksi
      dt.toLocaleDateString('id-ID') + ' ' + dt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }), // 3  Waktu
      paymentLabel(tx.payment_method),                                                            // 4  Metode
      formatCurrency(tx.subtotal),                                                               // 5  Subtotal
      tx.discount_pct > 0 ? tx.discount_pct + '%' : '-',                                        // 6  Diskon
      formatCurrency(tx.total),                                                                  // 7  Total
      formatCurrency(tx.cash_paid),                                                              // 8  Dibayar
      formatCurrency(tx.change),                                                                 // 9  Kembalian
      itemCount                                                                                   // 10 Item
    ]
  })

  autoTable(doc, {
    startY: startTxY + 3,
    head: [['#', 'Kasir', 'No. Transaksi', 'Waktu', 'Metode', 'Subtotal', 'Diskon', 'Total', 'Dibayar', 'Kembalian', 'Item']],
    body: txRows,
    foot: [['', '', 'TOTAL', '', '', formatCurrency(totalSales.value + totalDiscount.value), '', formatCurrency(totalSales.value), '', '', '']],
    theme: 'plain',
    styles: { overflow: 'ellipsize', valign: 'middle', lineColor: [220, 225, 235], lineWidth: 0.1 },
    headStyles: {
      fillColor: NAVY, textColor: 255, fontSize: 8, fontStyle: 'bold',
      cellPadding: { top: 3, bottom: 3, left: 2, right: 2 }
    },
    bodyStyles: { fontSize: 7.5, cellPadding: { top: 2, bottom: 2, left: 2, right: 2 }, textColor: DARK },
    alternateRowStyles: { fillColor: BGROW },
    footStyles: {
      fillColor: [210, 220, 235], textColor: NAVY,
      fontStyle: 'bold', fontSize: 8,
      cellPadding: { top: 3, bottom: 3, left: 2, right: 2 }
    },
    columnStyles: {
      0:  { halign: 'center', cellWidth: 7 },           // #
      1:  { cellWidth: 24 },                            // Kasir
      2:  { cellWidth: 46 },                            // No. Transaksi
      3:  { cellWidth: 20, halign: 'center' },          // Waktu
      4:  { cellWidth: 18, halign: 'center' },          // Metode
      5:  { cellWidth: 24, halign: 'right' },           // Subtotal
      6:  { cellWidth: 13, halign: 'center' },          // Diskon
      7:  { cellWidth: 24, halign: 'right', fontStyle: 'bold' }, // Total
      8:  { cellWidth: 24, halign: 'right' },           // Dibayar
      9:  { cellWidth: 24, halign: 'right' },           // Kembalian
      10: { cellWidth: 10, halign: 'center' }           // Item
    },
    margin: { left: 14, right: 14 },
    didDrawPage: (data) => {
      // Re-gambar header di halaman berikutnya
      if (data.pageNumber > 1) {
        doc.setFillColor(...NAVY)
        doc.rect(0, 0, pageW, 10, 'F')
        doc.setFontSize(8)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(255, 255, 255)
        doc.text('LAPORAN RIWAYAT PENJUALAN POS', pageW / 2, 6.5, { align: 'center' })
        doc.setTextColor(0)
      }
      // Footer halaman
      doc.setFillColor(240, 243, 248)
      doc.rect(0, pageH - 7, pageW, 7, 'F')
      doc.setFontSize(7)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(100, 110, 130)
      doc.text(
        restoName + '  |  Periode: ' + periodeLabel + '  |  Halaman ' + data.pageNumber,
        pageW / 2, pageH - 2, { align: 'center' }
      )
      doc.setTextColor(...DARK)
    }
  })

  const fileName = 'POS_Penjualan_' + restoName.replace(/\s+/g,'_') + '_' + dateFrom.value + '_' + dateTo.value + '.pdf'
  doc.save(fileName)
  toast.success('File "' + fileName + '" berhasil diunduh')
}
</script>
