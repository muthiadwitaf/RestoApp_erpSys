<template>
  <div class="accounting-view">
    <div class="d-flex justify-content-between align-items-center mb-4 pb-2">
      <div>
        <h3 class="mb-1 text-gradient fw-bolder"><i class="bi bi-file-earmark-bar-graph me-2 text-primary"></i>Laporan Keuangan</h3>
        <span class="text-secondary small">Laba Rugi (P&L) dan Neraca (Balance Sheet) Realtime</span>
      </div>
      <div class="d-flex gap-2">
        <input type="date" v-model="startDate" class="form-control rounded-pill px-3 py-2 input-glass border-0 shadow-sm" />
        <span class="d-flex align-items-center fw-bold text-muted">-</span>
        <input type="date" v-model="endDate" class="form-control rounded-pill px-3 py-2 input-glass border-0 shadow-sm" />
        <button class="btn btn-primary rounded-pill px-4 btn-glow fw-semibold ms-2" @click="loadReports">
          <i class="bi bi-arrow-clockwise me-1"></i> Refresh
        </button>
      </div>
    </div>

    <!-- Navigation Tabs -->
    <ul class="nav nav-pills mb-4 gap-2">
      <li class="nav-item">
        <button class="nav-link rounded-pill px-4 fw-bold" :class="activeTab === 'pl' ? 'active shadow-sm' : 'text-secondary'" @click="activeTab = 'pl'">Laba Rugi</button>
      </li>
      <li class="nav-item">
        <button class="nav-link rounded-pill px-4 fw-bold" :class="activeTab === 'bs' ? 'active shadow-sm' : 'text-secondary'" @click="activeTab = 'bs'">Neraca</button>
      </li>
    </ul>

    <!-- Loading State -->
    <div v-if="loading" class="text-center py-5">
      <div class="spinner-border text-primary" role="status">
        <span class="visually-hidden">Loading...</span>
      </div>
      <p class="mt-3 text-muted">Menghitung laporan keuangan...</p>
    </div>

    <!-- Laba Rugi Tab -->
    <div v-else-if="activeTab === 'pl'">
      <div class="erp-card mb-5">
        <div class="card-header text-white py-3 border-0" style="background: linear-gradient(135deg, #3498db, #2980b9);">
          <h5 class="mb-0 fw-bold text-center">LAPORAN LABA RUGI</h5>
          <div class="text-center small opacity-75">Periode: {{ formatDate(startDate) }} s/d {{ formatDate(endDate) }}</div>
        </div>
        <div class="card-body px-5 py-4">
          
          <!-- Pendapatan -->
          <h6 class="fw-bold text-primary border-bottom pb-2 mb-3">PENDAPATAN</h6>
          <div v-for="item in profitLossData.revenue" :key="item.code" class="d-flex justify-content-between mb-2 ps-3">
            <span>{{ item.name }}</span>
            <span class="fw-bold">{{ formatMoney(item.amount) }}</span>
          </div>
          <div class="d-flex justify-content-between fw-bold bg-light p-2 mt-3 mb-4 rounded">
            <span>Total Pendapatan</span>
            <span class="text-success">{{ formatMoney(profitLossData.totalRevenue) }}</span>
          </div>

          <!-- Beban Pokok (HPP) -->
          <h6 class="fw-bold text-danger border-bottom pb-2 mb-3">HARGA POKOK PENJUALAN (HPP)</h6>
          <div v-for="item in profitLossData.cogs" :key="item.code" class="d-flex justify-content-between mb-2 ps-3 text-muted">
            <span>{{ item.name }}</span>
            <span>({{ formatMoney(item.amount) }})</span>
          </div>
          <div class="d-flex justify-content-between fw-bold bg-light p-2 mt-3 mb-4 rounded">
            <span>Laba Kotor</span>
            <span class="text-primary">{{ formatMoney(profitLossData.grossProfit) }}</span>
          </div>

          <!-- Beban Operasional -->
          <h6 class="fw-bold text-danger border-bottom pb-2 mb-3">BEBAN OPERASIONAL</h6>
          <div v-for="item in profitLossData.expenses" :key="item.code" class="d-flex justify-content-between mb-2 ps-3 text-muted">
            <span>{{ item.name }}</span>
            <span>({{ formatMoney(item.amount) }})</span>
          </div>

          <!-- Net Profit -->
          <div class="d-flex justify-content-between fs-5 fw-bold bg-primary text-white p-3 mt-4 rounded shadow-sm">
            <span>LABA/RUGI BERSIH</span>
            <span>{{ formatMoney(profitLossData.netProfit) }}</span>
          </div>

        </div>
      </div>
    </div>

    <!-- Neraca Tab -->
    <div v-else-if="activeTab === 'bs'">
       <div class="erp-card mb-5">
        <div class="card-header text-white py-3 border-0" style="background: linear-gradient(135deg, #10b981, #059669);">
          <h5 class="mb-0 fw-bold text-center">NERACA (BALANCE SHEET)</h5>
          <div class="text-center small opacity-75">Per Tanggal: {{ formatDate(endDate) }}</div>
        </div>
        <div class="card-body">
          <div class="row g-5 p-3">
            <!-- Left Side: Aset -->
            <div class="col-md-6 border-end">
              <h5 class="fw-bold text-center border-bottom pb-2 text-success">ASET (AKTIVA)</h5>
              <div v-for="item in balanceSheetData.assets" :key="item.code" class="d-flex justify-content-between mb-2 ps-2">
                <span>{{ item.name }}</span>
                <span>{{ formatMoney(item.amount) }}</span>
              </div>
              <div class="d-flex justify-content-between fw-bold bg-light p-2 mt-3 border rounded fs-6">
                <span>Total Aset</span>
                <span class="text-success">{{ formatMoney(balanceSheetData.totalAssets) }}</span>
              </div>
            </div>

            <!-- Right Side: Kewajiban & Ekuitas -->
            <div class="col-md-6">
              <h5 class="fw-bold text-center border-bottom pb-2 text-warning">KEWAJIBAN & EKUITAS (PASIVA)</h5>
              
              <!-- Kewajiban -->
              <h6 class="fw-bold mt-3">Kewajiban</h6>
              <div v-for="item in balanceSheetData.liabilities" :key="item.code" class="d-flex justify-content-between mb-2 ps-2 text-muted">
                <span>{{ item.name }}</span>
                <span>{{ formatMoney(item.amount) }}</span>
              </div>
              
              <!-- Ekuitas -->
              <h6 class="fw-bold mt-4">Ekuitas</h6>
              <div v-for="item in balanceSheetData.equity" :key="item.code" class="d-flex justify-content-between mb-2 ps-2 text-muted">
                <span>{{ item.name }}</span>
                <span>{{ formatMoney(item.amount) }}</span>
              </div>

              <div class="d-flex justify-content-between fw-bold bg-light p-2 mt-4 border rounded fs-6">
                <span>Total Kewajiban & Ekuitas</span>
                <span class="text-warning">{{ formatMoney(balanceSheetData.totalLiabilitiesEquity) }}</span>
              </div>
            </div>
          </div>
        </div>
       </div>
    </div>

  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import * as api from '@/services/accounting/api'

const activeTab = ref('pl')
const loading = ref(false)

const startDate = ref(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0])
const endDate = ref(new Date().toISOString().split('T')[0])

// Mock UI Schema mapped to real data concepts. 
// A typical backend payload for P&L would map straight into this schema.
const profitLossData = ref({
  revenue: [], totalRevenue: 0,
  cogs: [], grossProfit: 0,
  expenses: [], netProfit: 0
})

const balanceSheetData = ref({
  assets: [], totalAssets: 0,
  liabilities: [], equity: [], totalLiabilitiesEquity: 0
})

async function loadReports() {
  loading.value = true
  try {
    const params = { start_date: startDate.value, end_date: endDate.value }
    const [resPL, resBS] = await Promise.all([
      api.getProfitLoss(params),
      api.getBalanceSheet(params)
    ])
    
    // Inject the real data if structured directly, or define robust fallbacks
    if(resPL.data) profitLossData.value = resPL.data
    if(resBS.data) balanceSheetData.value = resBS.data
  } catch (error) {
    console.error('Failed to load reports', error)
  } finally {
    loading.value = false
  }
}

function formatMoney(val) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(val || 0)
}
function formatDate(d) {
  if (!d) return '-'
  return new Date(d).toLocaleDateString('id-ID', { day:'numeric', month:'short', year:'numeric' })
}

onMounted(() => {
  loadReports()
})
</script>

<style scoped>
.accounting-view {
  padding: 2rem 2.5rem;
  background-color: #f8faff;
  min-height: 100vh;
}
[data-theme="dark"] .accounting-view {
  background-color: #1a1d23;
}
</style>
