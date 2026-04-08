<template>
  <div class="platform-page">
    <nav class="platform-navbar">
      <div class="platform-nav-brand"><i class="bi bi-box-seam-fill"></i> Platform Admin</div>
      <div class="platform-nav-links">
        <a class="platform-nav-link" href="#" @click.prevent="navigateTo('/platform/companies')"><i class="bi bi-buildings me-1"></i>Kelola Company</a>
        <a class="platform-nav-link active" href="#"><i class="bi bi-graph-up-arrow me-1"></i>Laporan Lintas</a>
        <a class="platform-nav-link" href="#" @click.prevent="navigateTo('/platform/super-admins')"><i class="bi bi-shield-lock me-1"></i>Super Admins</a>
        <a class="platform-nav-link" href="#" @click.prevent="navigateTo('/platform/audit')"><i class="bi bi-journal-text me-1"></i>Audit Trail</a>
      </div>
      <button class="btn btn-sm btn-outline-light" @click="handleLogout"><i class="bi bi-box-arrow-right me-1"></i>Logout</button>
    </nav>
    <div class="platform-content">
    <div class="page-header">
      <div>
        <h1>Laporan Lintas Company</h1>
        <span class="breadcrumb-custom">Super Admin / Cross-Company Report</span>
      </div>
      <div class="d-flex gap-2 align-items-center">
        <select class="form-select form-select-sm" v-model="period" @change="loadStats" style="width: auto">
          <option value="month">Bulan Ini</option>
          <option value="quarter">Kuartal Ini</option>
          <option value="year">Tahun Ini</option>
        </select>
      </div>
    </div>

    <div v-if="loading" class="text-center py-5"><div class="spinner-border text-primary"></div></div>

    <div v-else>
      <!-- Global Stats Cards -->
      <div class="stats-row mb-4">
        <div class="stat-card-report">
          <div class="stat-icon" style="background: linear-gradient(135deg, #6366f1, #818cf8)"><i class="bi bi-buildings"></i></div>
          <div class="stat-info">
            <div class="stat-value">{{ stats?.totals?.total_companies || 0 }}</div>
            <div class="stat-label">Total Company</div>
          </div>
        </div>
        <div class="stat-card-report">
          <div class="stat-icon" style="background: linear-gradient(135deg, #3b82f6, #60a5fa)"><i class="bi bi-building"></i></div>
          <div class="stat-info">
            <div class="stat-value">{{ stats?.totals?.total_branches || 0 }}</div>
            <div class="stat-label">Total Cabang</div>
          </div>
        </div>
        <div class="stat-card-report">
          <div class="stat-icon" style="background: linear-gradient(135deg, #10b981, #34d399)"><i class="bi bi-people"></i></div>
          <div class="stat-info">
            <div class="stat-value">{{ stats?.totals?.total_users || 0 }}</div>
            <div class="stat-label">Total User</div>
          </div>
        </div>
        <div class="stat-card-report">
          <div class="stat-icon" style="background: linear-gradient(135deg, #f59e0b, #fbbf24)"><i class="bi bi-boxes"></i></div>
          <div class="stat-info">
            <div class="stat-value">{{ stats?.totals?.total_warehouses || 0 }}</div>
            <div class="stat-label">Total Gudang</div>
          </div>
        </div>
      </div>

      <!-- Charts Row -->
      <div class="row g-3 mb-4">
        <!-- Bar Chart: Revenue per Company -->
        <div class="col-lg-7">
          <div class="card h-100">
            <div class="card-header fw-bold"><i class="bi bi-bar-chart-fill me-2 text-primary"></i>Perbandingan Revenue per Company</div>
            <div class="card-body">
              <div class="chart-container" ref="barChartRef">
                <div class="bar-chart">
                  <div v-for="(c, i) in stats?.companies" :key="c.uuid" class="bar-group">
                    <div class="bar-label">{{ c.code }}</div>
                    <div class="bar-wrapper">
                      <div class="bar invoice" :style="{ width: barWidth(c.invoice_revenue) }"
                           :title="`Invoice: ${fmt(c.invoice_revenue)}`">
                        <span class="bar-value" v-if="c.invoice_revenue > 0">{{ fmtShort(c.invoice_revenue) }}</span>
                      </div>
                      <div class="bar pos" :style="{ width: barWidth(c.pos_revenue) }"
                           :title="`POS: ${fmt(c.pos_revenue)}`">
                        <span class="bar-value" v-if="c.pos_revenue > 0">{{ fmtShort(c.pos_revenue) }}</span>
                      </div>
                    </div>
                    <div class="bar-total">{{ fmt(c.total_revenue) }}</div>
                  </div>
                </div>
                <div class="chart-legend mt-3">
                  <span class="legend-item"><span class="legend-dot invoice"></span>Invoice</span>
                  <span class="legend-item"><span class="legend-dot pos"></span>POS</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Pie Chart: Transaction Distribution -->
        <div class="col-lg-5">
          <div class="card h-100">
            <div class="card-header fw-bold"><i class="bi bi-pie-chart-fill me-2 text-success"></i>Distribusi Transaksi</div>
            <div class="card-body d-flex flex-column align-items-center justify-content-center">
              <div class="pie-chart-wrapper">
                <svg viewBox="0 0 120 120" class="pie-chart">
                  <circle v-for="(seg, i) in pieSegments" :key="i"
                    cx="60" cy="60" r="50" fill="none"
                    :stroke="seg.color" stroke-width="20"
                    :stroke-dasharray="seg.dashArray"
                    :stroke-dashoffset="seg.dashOffset"
                    :class="{ 'pie-hover': hoveredPie === i }"
                    @mouseenter="hoveredPie = i" @mouseleave="hoveredPie = null"
                  />
                  <text x="60" y="55" text-anchor="middle" class="pie-center-label">{{ totalTransactions }}</text>
                  <text x="60" y="70" text-anchor="middle" class="pie-center-sub">Transaksi</text>
                </svg>
              </div>
              <div class="pie-legend mt-3">
                <div v-for="(c, i) in stats?.companies" :key="c.uuid" class="pie-legend-item"
                     :class="{ highlight: hoveredPie === i }" @mouseenter="hoveredPie = i" @mouseleave="hoveredPie = null">
                  <span class="pie-legend-dot" :style="{ background: pieColors[i] }"></span>
                  <span class="pie-legend-name">{{ c.name }}</span>
                  <span class="pie-legend-count fw-semibold">{{ c.total_transactions }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Table: Per-Company Summary -->
      <div class="card">
        <div class="card-header fw-bold"><i class="bi bi-table me-2 text-info"></i>Ringkasan per Company</div>
        <div class="card-body p-0">
          <div class="table-responsive">
            <table class="table table-hover table-sm mb-0">
              <thead class="table-light">
                <tr>
                  <th>Company</th>
                  <th class="text-center">User</th>
                  <th class="text-center">Cabang</th>
                  <th class="text-center">Gudang</th>
                  <th class="text-end">Revenue Invoice</th>
                  <th class="text-end">Revenue POS</th>
                  <th class="text-end">Total Revenue</th>
                  <th class="text-end">Biaya Pembelian</th>
                  <th class="text-end">Gross Profit</th>
                  <th class="text-center"># Invoice</th>
                  <th class="text-center"># POS</th>
                  <th class="text-center"># PO</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="c in stats?.companies" :key="c.uuid">
                  <td class="fw-semibold">{{ c.name }}<br><small class="text-muted">{{ c.code }}</small></td>
                  <td class="text-center"><span class="badge bg-light text-dark">{{ c.user_count }}</span></td>
                  <td class="text-center"><span class="badge bg-light text-dark">{{ c.branch_count }}</span></td>
                  <td class="text-center"><span class="badge bg-light text-dark">{{ c.warehouse_count }}</span></td>
                  <td class="text-end">{{ fmt(c.invoice_revenue) }}</td>
                  <td class="text-end">{{ fmt(c.pos_revenue) }}</td>
                  <td class="text-end fw-bold text-primary">{{ fmt(c.total_revenue) }}</td>
                  <td class="text-end text-danger">{{ fmt(c.purchase_cost) }}</td>
                  <td class="text-end fw-bold" :class="c.gross_profit >= 0 ? 'text-success' : 'text-danger'">
                    {{ fmt(c.gross_profit) }}
                  </td>
                  <td class="text-center">{{ c.invoice_count }}</td>
                  <td class="text-center">{{ c.pos_count }}</td>
                  <td class="text-center">{{ c.po_count }}</td>
                </tr>
              </tbody>
              <tfoot class="table-light">
                <tr class="fw-bold">
                  <td>Grand Total</td>
                  <td class="text-end">{{ fmt(grandTotals.invoiceRevenue) }}</td>
                  <td class="text-end">{{ fmt(grandTotals.posRevenue) }}</td>
                  <td class="text-end text-primary">{{ fmt(grandTotals.totalRevenue) }}</td>
                  <td class="text-end text-danger">{{ fmt(grandTotals.purchaseCost) }}</td>
                  <td class="text-end" :class="grandTotals.grossProfit >= 0 ? 'text-success' : 'text-danger'">
                    {{ fmt(grandTotals.grossProfit) }}
                  </td>
                  <td class="text-center">{{ grandTotals.invoiceCount }}</td>
                  <td class="text-center">{{ grandTotals.posCount }}</td>
                  <td class="text-center">{{ grandTotals.poCount }}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </div>
    </div><!-- platform-content -->
  </div><!-- platform-page -->
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import * as companyApi from '@/services/company/api'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()

function navigateTo(path) { window.location.href = path }
async function handleLogout() {
  await authStore.logout()
  window.location.href = '/login'
}

const period = ref('month')
const loading = ref(false)
const stats = ref(null)
const hoveredPie = ref(null)

const pieColors = ['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']

onMounted(loadStats)

async function loadStats() {
  loading.value = true
  try { const { data } = await companyApi.getCompanyStats(period.value); stats.value = data }
  catch (e) { console.error(e) }
  loading.value = false
}

function fmt(v) { return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(v || 0) }
function fmtShort(v) {
  if (v >= 1e9) return (v / 1e9).toFixed(1) + 'M'
  if (v >= 1e6) return (v / 1e6).toFixed(1) + 'jt'
  if (v >= 1e3) return (v / 1e3).toFixed(0) + 'rb'
  return v.toString()
}

// Bar chart
const maxRevenue = computed(() => Math.max(...(stats.value?.companies || []).map(c => c.total_revenue), 1))
function barWidth(v) { return `${Math.max((v / maxRevenue.value) * 100, 0)}%` }

// Pie chart
const totalTransactions = computed(() => (stats.value?.companies || []).reduce((s, c) => s + c.total_transactions, 0))
const pieSegments = computed(() => {
  const companies = stats.value?.companies || []
  const total = totalTransactions.value || 1
  const circumference = 2 * Math.PI * 50 // r=50
  let accumulated = 0
  return companies.map((c, i) => {
    const fraction = c.total_transactions / total
    const length = fraction * circumference
    const seg = {
      color: pieColors[i % pieColors.length],
      dashArray: `${length} ${circumference - length}`,
      dashOffset: -accumulated + circumference / 4, // start from top
    }
    accumulated += length
    return seg
  })
})

// Grand totals
const grandTotals = computed(() => {
  const companies = stats.value?.companies || []
  return {
    invoiceRevenue: companies.reduce((s, c) => s + c.invoice_revenue, 0),
    posRevenue: companies.reduce((s, c) => s + c.pos_revenue, 0),
    totalRevenue: companies.reduce((s, c) => s + c.total_revenue, 0),
    purchaseCost: companies.reduce((s, c) => s + c.purchase_cost, 0),
    grossProfit: companies.reduce((s, c) => s + c.gross_profit, 0),
    invoiceCount: companies.reduce((s, c) => s + c.invoice_count, 0),
    posCount: companies.reduce((s, c) => s + c.pos_count, 0),
    poCount: companies.reduce((s, c) => s + c.po_count, 0),
  }
})
</script>

<style scoped>
/* Stats Cards */
.stats-row { display: flex; flex-wrap: wrap; gap: 1rem; }
.stat-card-report {
  flex: 1 1 200px; display: flex; align-items: center; gap: 1rem;
  background: var(--card-bg, #fff); border: 1px solid var(--border-subtle, #e2e8f0);
  border-radius: 16px; padding: 1.25rem; transition: transform 0.2s;
}
.stat-card-report:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,0.06); }
.stat-icon { width: 52px; height: 52px; border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; color: #fff; flex-shrink: 0; }
.stat-info { min-width: 0; }
.stat-value { font-size: 1.75rem; font-weight: 800; line-height: 1.1; color: var(--text-primary); }
.stat-label { font-size: 0.8rem; color: var(--text-secondary, #64748b); font-weight: 500; }

/* Bar Chart */
.bar-chart { display: flex; flex-direction: column; gap: 1rem; }
.bar-group { display: flex; align-items: center; gap: 0.75rem; }
.bar-label { width: 70px; font-weight: 700; font-size: 0.85rem; color: var(--text-secondary, #64748b); text-align: right; flex-shrink: 0; }
.bar-wrapper { flex: 1; display: flex; gap: 4px; height: 32px; }
.bar {
  height: 100%; border-radius: 6px; display: flex; align-items: center; justify-content: center;
  font-size: 0.7rem; color: #fff; font-weight: 700; min-width: 0;
  transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}
.bar.invoice { background: linear-gradient(135deg, #6366f1, #818cf8); }
.bar.pos { background: linear-gradient(135deg, #10b981, #34d399); }
.bar-value { white-space: nowrap; padding: 0 6px; overflow: hidden; text-overflow: ellipsis; }
.bar-total { width: 100px; font-weight: 700; font-size: 0.8rem; color: var(--text-primary); text-align: right; flex-shrink: 0; }
.chart-legend { display: flex; gap: 1.5rem; justify-content: center; }
.legend-item { display: flex; align-items: center; gap: 6px; font-size: 0.8rem; color: var(--text-secondary, #64748b); }
.legend-dot { width: 12px; height: 12px; border-radius: 3px; }
.legend-dot.invoice { background: #6366f1; }
.legend-dot.pos { background: #10b981; }

/* Pie Chart */
.pie-chart-wrapper { width: 200px; height: 200px; }
.pie-chart { width: 100%; height: 100%; transform: rotate(0deg); }
.pie-chart circle { transition: all 0.3s; cursor: pointer; }
.pie-chart circle.pie-hover { stroke-width: 24; filter: brightness(1.1); }
.pie-center-label { font-size: 24px; font-weight: 800; fill: var(--text-primary, #1e293b); }
.pie-center-sub { font-size: 10px; fill: var(--text-secondary, #64748b); }
.pie-legend { display: flex; flex-direction: column; gap: 0.4rem; width: 100%; }
.pie-legend-item {
  display: flex; align-items: center; gap: 0.5rem; padding: 0.3rem 0.5rem;
  border-radius: 8px; transition: background 0.2s; cursor: pointer;
}
.pie-legend-item.highlight { background: #f1f5f9; }
.pie-legend-dot { width: 10px; height: 10px; border-radius: 3px; flex-shrink: 0; }
.pie-legend-name { flex: 1; font-size: 0.82rem; }
.pie-legend-count { font-size: 0.82rem; color: var(--text-primary); }

@media (max-width: 768px) {
  .stat-card-report { flex: 1 1 100%; }
  .bar-label { width: 50px; font-size: 0.75rem; }
  .bar-total { width: 80px; font-size: 0.7rem; }
}

/* Platform Layout */
.platform-page { min-height: 100vh; background: #f1f5f9; }
.platform-navbar {
  display: flex; align-items: center; gap: 1rem;
  background: linear-gradient(135deg, #1e1b4b 0%, #312e81 100%);
  padding: 0.6rem 1.5rem; color: #fff;
}
.platform-nav-brand { font-weight: 700; font-size: 1.1rem; margin-right: 1.5rem; white-space: nowrap; }
.platform-nav-brand i { margin-right: 0.4rem; }
.platform-nav-links { display: flex; gap: 0.25rem; flex: 1; }
.platform-nav-link {
  color: rgba(255,255,255,0.7); text-decoration: none; padding: 0.4rem 0.85rem;
  border-radius: 8px; font-size: 0.88rem; font-weight: 500; transition: all 0.2s;
}
.platform-nav-link:hover { color: #fff; background: rgba(255,255,255,0.1); }
.platform-nav-link.active, .platform-nav-link.router-link-active { color: #fff; background: rgba(255,255,255,0.15); font-weight: 600; }
.platform-content { padding: 1.5rem 2rem; max-width: 1400px; margin: 0 auto; }
</style>
