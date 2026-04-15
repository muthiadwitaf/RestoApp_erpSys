<template>
  <div class="resto-daily-report">
    <!-- Header & Filter -->
    <div class="page-header d-flex justify-content-between align-items-end flex-wrap gap-3">
      <div>
        <h1 class="mb-1"><i class="bi bi-bar-chart-fill me-2 text-primary"></i>Laporan Harian Resto</h1>
        <span class="breadcrumb-custom">Restoran / Laporan Laba &amp; Transaksi Harian</span>
      </div>
      <div class="d-flex align-items-center gap-2">
        <label class="form-label small mb-0 fw-bold">Tanggal Laporan:</label>
        <input type="date" class="form-control" v-model="filterDate" @change="loadReport" style="max-width:200px" />
        <button class="btn btn-primary" @click="loadReport" :disabled="loading">
          <i class="bi bi-arrow-clockwise" :class="{'spin': loading}"></i> Refresh
        </button>
      </div>
    </div>

    <div v-if="loading" class="text-center py-5">
      <div class="spinner-border text-primary" style="width: 3rem; height: 3rem;"></div>
      <div class="mt-3 text-muted">Menganalisis data laporan...</div>
    </div>

    <div v-else-if="!reportData" class="text-center py-5 text-muted">
      <i class="bi bi-file-earmark-x display-1 d-block mb-3"></i>
      <h5>Gagal memuat laporan.</h5>
      <p>Periksa koneksi atau coba tanggal lain.</p>
    </div>

    <div v-else class="report-content">
      <!-- 1. DASHBOARD SUMMARY METRICS -->
      <div class="row g-3 mb-4">
        <div class="col-md-4">
          <div class="card border-0 shadow-sm metric-card h-100" style="background: linear-gradient(135deg, #10b981, #059669); color: #fff;">
            <div class="card-body">
              <div class="d-flex justify-content-between align-items-start">
                <div>
                  <h6 class="text-white-50 text-uppercase fw-bold mb-1">Total Penjualan</h6>
                  <h3 class="fw-bold mb-0">{{ formatCurrency(reportData.summary.total_sales) }}</h3>
                </div>
                <div class="icon-wrap bg-white bg-opacity-25 rounded-circle p-3"><i class="bi bi-cash-stack fs-4"></i></div>
              </div>
            </div>
          </div>
        </div>
        <div class="col-md-4">
          <div class="card border-0 shadow-sm metric-card h-100" style="background: linear-gradient(135deg, #3b82f6, #2563eb); color: #fff;">
            <div class="card-body">
              <div class="d-flex justify-content-between align-items-start">
                <div>
                  <h6 class="text-white-50 text-uppercase fw-bold mb-1">Total Transaksi</h6>
                  <h3 class="fw-bold mb-0">{{ reportData.summary.total_transactions }} <small class="fs-6 fw-normal text-white-50">Struk</small></h3>
                </div>
                <div class="icon-wrap bg-white bg-opacity-25 rounded-circle p-3"><i class="bi bi-receipt fs-4"></i></div>
              </div>
            </div>
          </div>
        </div>
        <div class="col-md-4">
          <div class="card border-0 shadow-sm metric-card h-100" style="background: linear-gradient(135deg, #f59e0b, #d97706); color: #fff;">
            <div class="card-body">
              <div class="d-flex justify-content-between align-items-start">
                <div>
                  <h6 class="text-white-50 text-uppercase fw-bold mb-1">Rata-rata Transaksi</h6>
                  <h3 class="fw-bold mb-0">{{ formatCurrency(reportData.summary.average_transaction) }}</h3>
                </div>
                <div class="icon-wrap bg-white bg-opacity-25 rounded-circle p-3"><i class="bi bi-graph-up-arrow fs-4"></i></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="row g-4 mb-4">
        <!-- 2. PAYMENT BREAKDOWN -->
        <div class="col-lg-4">
          <div class="card border-0 shadow-sm h-100">
            <div class="card-header bg-white py-3">
              <h6 class="fw-bold mb-0"><i class="bi bi-pie-chart-fill text-primary me-2"></i>Komposisi Pembayaran</h6>
            </div>
            <div class="card-body p-0">
              <div class="list-group list-group-flush">
                <div class="list-group-item d-flex justify-content-between align-items-center py-3">
                  <div class="d-flex align-items-center gap-3">
                    <span class="badge bg-success bg-opacity-10 text-success p-2 rounded-circle"><i class="bi bi-cash fs-5"></i></span>
                    <span class="fw-semibold">Tunai (Cash)</span>
                  </div>
                  <span class="fw-bold fs-5">{{ formatCurrency(reportData.payment_breakdown.cash) }}</span>
                </div>
                <div class="list-group-item d-flex justify-content-between align-items-center py-3">
                  <div class="d-flex align-items-center gap-3">
                    <span class="badge bg-info bg-opacity-10 text-info p-2 rounded-circle"><i class="bi bi-qr-code-scan fs-5"></i></span>
                    <span class="fw-semibold">QRIS</span>
                  </div>
                  <span class="fw-bold fs-5">{{ formatCurrency(reportData.payment_breakdown.qris) }}</span>
                </div>
                <div class="list-group-item d-flex justify-content-between align-items-center py-3 border-bottom-0">
                  <div class="d-flex align-items-center gap-3">
                    <span class="badge bg-primary bg-opacity-10 text-primary p-2 rounded-circle"><i class="bi bi-credit-card fs-5"></i></span>
                    <span class="fw-semibold">Transfer / Kartu</span>
                  </div>
                  <span class="fw-bold fs-5">{{ formatCurrency(reportData.payment_breakdown.transfer) }}</span>
                </div>
                <div class="list-group-item d-flex justify-content-between align-items-center py-3 border-bottom-0">
                  <div class="d-flex align-items-center gap-3">
                    <span class="badge bg-warning bg-opacity-10 text-warning p-2 rounded-circle"><i class="bi bi-credit-card fs-5"></i></span>
                    <span class="fw-semibold">Debit / EDC</span>
                  </div>
                  <span class="fw-bold fs-5">{{ formatCurrency(reportData.payment_breakdown.debit) }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 3. BEST SELLING ITEMS -->
        <div class="col-lg-4">
          <div class="card border-0 shadow-sm h-100">
            <div class="card-header bg-white py-3">
              <h6 class="fw-bold mb-0"><i class="bi bi-star-fill text-warning me-2"></i>Menu Terlaris (Top 10)</h6>
            </div>
            <div class="card-body p-0 pb-3">
              <div v-if="reportData.best_selling.length === 0" class="p-4 text-center text-muted">
                Belum ada data penjualan menu.
              </div>
              <template v-else>
                <ul class="list-group list-group-flush list-group-numbered">
                  <li v-for="(item, idx) in reportData.best_selling.slice(0, showAllBestSellers ? 10 : 5)" :key="idx" 
                      class="list-group-item d-flex justify-content-between align-items-start py-2 border-0">
                    <div class="ms-2 me-auto fw-semibold text-truncate">{{ item.name }}</div>
                    <span class="badge bg-primary rounded-pill">{{ item.qty }} porsi</span>
                  </li>
                </ul>
                <div class="text-center px-3" v-if="reportData.best_selling.length > 5">
                  <button class="btn btn-sm btn-outline-primary w-100 mt-2" @click="showAllBestSellers = !showAllBestSellers">
                    <i class="bi" :class="showAllBestSellers ? 'bi-chevron-up' : 'bi-chevron-down'"></i>
                    {{ showAllBestSellers ? 'Tutup' : `Lihat ${reportData.best_selling.length - 5} lainnya...` }}
                  </button>
                </div>
              </template>
            </div>
          </div>
        </div>

        <!-- 4. PEAK HOURS -->
        <div class="col-lg-4">
          <div class="card border-0 shadow-sm h-100">
            <div class="card-header bg-white py-3">
              <h6 class="fw-bold mb-0"><i class="bi bi-clock-history text-danger me-2"></i>Jam Sibuk (Peak Hours)</h6>
            </div>
            <div class="card-body p-0" style="max-height: 250px; overflow-y: auto;">
              <div v-if="reportData.peak_hours.length === 0" class="p-4 text-center text-muted">
                Belum ada data transaksi tercatat masuk.
              </div>
              <table v-else class="table table-hover table-sm mb-0">
                <thead class="table-light position-sticky top-0">
                  <tr>
                    <th class="ps-3 width-40">Waktu</th>
                    <th class="text-center">Pesanan</th>
                    <th class="text-end pe-3">Sales</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="ph in reportData.peak_hours" :key="ph.hour">
                    <td class="ps-3 fw-semibold">
                      {{ String(ph.hour).padStart(2, '0') }}:00 - {{ String(ph.hour + 1).padStart(2, '0') }}:00
                    </td>
                    <td class="text-center"><span class="badge bg-secondary">{{ ph.count }}</span></td>
                    <td class="text-end pe-3 fw-semibold text-success">{{ formatCurrency(ph.sales) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <!-- 5. CASH SUMMARY LEDGER -->
      <div class="card border-0 shadow-sm mb-5">
        <div class="card-header bg-white py-3 border-bottom">
          <h6 class="fw-bold mb-0"><i class="bi bi-wallet-fill text-success me-2"></i>Buku Kas Harian (Akumulasi Sesi &amp; Shift)</h6>
        </div>
        <div class="card-body">
          <div class="row align-items-center">
            <div class="col-md-5">
              <div class="d-flex justify-content-between mb-3 border-bottom pb-2">
                <span class="text-muted"><i class="bi bi-box-arrow-in-right text-success me-1"></i>Modal / Kas Awal</span>
                <span class="fw-bold">{{ formatCurrency(reportData.cash_summary.opening_cash) }}</span>
              </div>
              <div class="d-flex justify-content-between mb-3 border-bottom pb-2">
                <span class="text-muted"><i class="bi bi-arrow-down-circle text-primary me-1"></i>Kas Masuk (In)</span>
                <span class="fw-bold text-success">+ {{ formatCurrency(reportData.cash_summary.total_cash_in) }}</span>
              </div>
              <div class="d-flex justify-content-between mb-3 pb-2">
                <span class="text-muted"><i class="bi bi-arrow-up-circle text-danger me-1"></i>Kas Keluar (Out)</span>
                <span class="fw-bold text-danger">- {{ formatCurrency(reportData.cash_summary.total_cash_out) }}</span>
              </div>
            </div>
            
            <div class="col-md-2 d-none d-md-flex justify-content-center">
              <div style="width:1px; background:#e5e7eb; height: 120px;"></div>
            </div>
            
            <div class="col-md-5">
              <div class="p-3 rounded-3 bg-light border mb-3">
                <div class="d-flex justify-content-between align-items-center mb-1">
                  <span class="fw-semibold text-secondary">Kas Diharapkan (Sistem)</span>
                  <span class="fs-5 fw-bold">{{ formatCurrency(reportData.cash_summary.expected_cash) }}</span>
                </div>
                <div class="d-flex justify-content-between align-items-center">
                  <span class="fw-semibold text-secondary">Total Fisik Aktual</span>
                  <span class="fs-5 fw-bold">{{ formatCurrency(reportData.cash_summary.actual_cash) }}</span>
                </div>
              </div>
              
              <div class="p-3 rounded-3" :class="reportData.cash_summary.difference < 0 ? 'bg-danger bg-opacity-10 border border-danger' : 'bg-success bg-opacity-10 border border-success'">
                <div class="d-flex justify-content-between align-items-center">
                  <span class="fw-bold" :class="reportData.cash_summary.difference < 0 ? 'text-danger' : 'text-success'">
                    Selisih Total (Kerugian / Kelebihan)
                  </span>
                  <span class="fs-4 fw-bold" :class="reportData.cash_summary.difference < 0 ? 'text-danger' : 'text-success'">
                    {{ formatCurrency(reportData.cash_summary.difference) }}
                  </span>
                </div>
              </div>
            </div>
            
          </div>
        </div>
      </div>

      <!-- 6. WAITER PERFORMANCE REPORT -->
      <div class="card border-0 shadow-sm mb-5 mt-4">
        <div class="card-header bg-white py-3 border-bottom d-flex justify-content-between align-items-center">
          <h6 class="fw-bold mb-0"><i class="bi bi-people-fill text-warning me-2"></i>Laporan Performa & Insentif Karyawan (Waiter)</h6>
          <span class="badge bg-light text-dark border"><i class="bi bi-percent me-1"></i>Tingkat Komisi: {{ commissionRate }}%</span>
        </div>
        <div class="card-body p-0">
          <div v-if="waitersReport && waitersReport.length > 0" class="table-responsive">
            <table class="table table-hover table-sm align-middle mb-0">
              <thead class="table-light">
                <tr>
                  <th class="ps-4 py-3">Nama Karyawan/Waiter</th>
                  <th class="text-center py-3">Pesanan Ditangani</th>
                  <th class="text-end py-3">Total Omset Dikelola</th>
                  <th class="text-end pe-4 py-3 text-success">Estimasi Komisi Disetujui</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="w in waitersReport" :key="w.uuid">
                  <td class="ps-4 py-3 fw-bold">
                    <div class="d-flex align-items-center gap-2">
                       <div class="bg-primary bg-opacity-10 text-primary rounded-circle d-flex align-items-center justify-content-center" style="width: 32px; height: 32px;">
                          <i class="bi bi-person"></i>
                       </div>
                       {{ w.waiter_name }}
                    </div>
                  </td>
                  <td class="text-center py-3"><span class="badge bg-secondary">{{ w.total_orders }} Transaksi</span></td>
                  <td class="text-end py-3">{{ formatCurrency(w.total_sales) }}</td>
                  <td class="text-end pe-4 py-3 fw-bold text-success">{{ formatCurrency(w.total_sales * (getWaiterCommRate(w) / 100)) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else class="text-center py-5 text-muted">
            <i class="bi bi-person-badge display-4 d-block mb-3" style="opacity: 0.25;"></i>
            <h6 class="fw-semibold">Belum Ada Data Waiter</h6>
            <p class="small mb-0">Belum ada pesanan yang ditangani waiter pada tanggal ini.<br>Pastikan kasir memilih waiter saat mencatat pesanan di layar POS.</p>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { getRestoDailyReport, getWaitersReport, getRestoOrder, getRestoOrders } from '@/services/sales/restoApi'
import * as salesApi from '@/services/sales/api'
import { useToast } from '@/composables/useToast'
import { formatCurrency } from '@/utils/format'

const toast = useToast()
const loading = ref(true)
const reportData = ref(null)
const waitersReport = ref([])
const showAllBestSellers = ref(false)
const commissionRate = ref(0)


// Init to today's date YYYY-MM-DD
const filterDate = ref(new Date().toISOString().split('T')[0])

onMounted(() => {
  loadReport()
})

async function loadReport() {
  if (!filterDate.value) return
  loading.value = true
  try {
    const [{ data }, waitersRes, settingsRes] = await Promise.all([
      getRestoDailyReport({ date: filterDate.value }).catch(() => ({ data: null })),
      getWaitersReport({ from: filterDate.value, to: filterDate.value }).catch(() => ({ data: [] })),
      salesApi.getPosSettings().catch(() => ({ data: {} }))
    ])
    
    waitersReport.value = waitersRes.data || []
    commissionRate.value = parseFloat(settingsRes.data?.pos_waiter_commission_pct || 0)

    // FETCH CLIENT SIDE ORDERS (since backend report may be removed/failing)
    let orders = []
    try {
      const ordersRes = await getRestoOrders({ from: filterDate.value, to: filterDate.value })
      orders = (ordersRes.data || []).filter(o => o.status === 'paid')
    } catch (e) {
      console.warn('Failed to fetch orders for report, continuing with empty list:', e.message)
    }

    let totalSales = 0, totalTrx = orders.length, cash = 0, qris = 0, transfer = 0, debit = 0
    const peakFreq = {};
    const menuCount = {}; // for best selling items

    // Fetch item details for each paid order (for best-selling items)
    let orderDetails = []
    try {
      const orderDetailsPromises = orders.map(o =>
        getRestoOrder(o.uuid).then(r => r.data).catch(() => null)
      )
      orderDetails = await Promise.all(orderDetailsPromises)
    } catch (e) {
      console.warn('Failed to fetch order details for best-selling:', e.message)
    }

    orders.forEach((o, i) => {
       const t = parseFloat(o.total || 0)
       totalSales += t
       if (o.payment_method === 'cash') cash += t
       else if (o.payment_method === 'qris') qris += t
       else if (o.payment_method === 'transfer') transfer += t
       else if (o.payment_method === 'debit') debit += t
       else transfer += t  // fallback: split/other go to transfer

       // peak hours (from paid_at)
       const d = new Date(o.paid_at || o.ordered_at)
       const h = d.getHours()
       if (!peakFreq[h]) peakFreq[h] = { count: 0, sales: 0 }
       peakFreq[h].count++
       peakFreq[h].sales += t

       // best-selling items from order details
       const detail = orderDetails[i]
       if (detail && detail.items) {
         detail.items.forEach(item => {
           if (item.status === 'cancelled') return
           const key = item.item_name || item.name || 'Unknown'
           if (!menuCount[key]) menuCount[key] = { name: key, qty: 0, revenue: 0 }
           menuCount[key].qty += parseInt(item.qty) || 0
           menuCount[key].revenue += (parseFloat(item.price) || 0) * (parseInt(item.qty) || 0)
         })
       }
    })

    const bestSelling = Object.values(menuCount).sort((a, b) => b.qty - a.qty).slice(0, 10)

    const expectedHours = Object.keys(peakFreq).map(k => ({
         hour: parseInt(k),
         count: peakFreq[k].count,
         sales: peakFreq[k].sales
    })).sort((a,b) => b.count - a.count)

    // LOCAL SHIFT MERGE
    let cashSummary = { opening_cash: 0, total_cash_in: cash, total_cash_out: 0, expected_cash: cash, actual_cash: 0, difference: 0 }
    
    // Try find closed shift for today
    const localClosed = localStorage.getItem(`resto_shift_${filterDate.value}`)
    // If not closed, check active shift if looking at today
    const isToday = filterDate.value === new Date().toISOString().split('T')[0]
    const localActive = isToday ? localStorage.getItem('resto_shift_data') : null

    const sData = localClosed ? JSON.parse(localClosed) : (localActive ? JSON.parse(localActive) : null)
    
    if (sData) {
       // sData.total_cash_in ALREADY contains ALL cash paid by customer + Adjustments IN.
       // sData.total_cash_out ALREADY contains ALL cash change given + Adjustments OUT.
       // expected = opening + in - out.
       const exp = (parseFloat(sData.opening_cash)||0) + (parseFloat(sData.total_cash_in)||0) - (parseFloat(sData.total_cash_out)||0)
       cashSummary = {
          opening_cash: parseFloat(sData.opening_cash) || 0,
          total_cash_in: parseFloat(sData.total_cash_in) || 0,
          total_cash_out: parseFloat(sData.total_cash_out) || 0,
          expected_cash: exp,
          actual_cash: parseFloat(sData.actual_cash) || 0,
          difference: parseFloat(sData.difference) || 0
       }
       if (localActive && !localClosed) {
          // If shift is still active, difference is 0 and actual_cash is 0
          cashSummary.actual_cash = 0;
          cashSummary.difference = 0;
       }
    }

    reportData.value = {
       summary: {
           total_sales: totalSales,
           total_transactions: totalTrx,
           average_transaction: totalTrx > 0 ? totalSales / totalTrx : 0
       },
       payment_breakdown: { cash, qris, transfer, debit },
       peak_hours: expectedHours,
       best_selling: bestSelling,
       cash_summary: cashSummary
    }
  } catch (e) {
    toast.error('Gagal menghitung laporan harian secara lokal.')
    console.error('Report loadReport error:', e, e?.response?.data, e?.stack)
    reportData.value = null
  } finally {
    loading.value = false
  }
}

function getWaiterCommRate(w) {
  // Use waiter's own commission_pct override if available, otherwise fall back to global rate
  if (w.waiter_commission_pct != null && w.waiter_commission_pct !== '') {
    return parseFloat(w.waiter_commission_pct)
  }
  return commissionRate.value
}
</script>

<style scoped>
.resto-daily-report {
  animation: fadeIn 0.4s ease;
}
.metric-card {
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.metric-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 10px 20px rgba(0,0,0,0.1) !important;
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
.spin {
  animation: spin 1s linear infinite;
}
@keyframes spin { 100% { transform: rotate(360deg); } }
</style>
