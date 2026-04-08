<template>
  <div class="pptbl-wrapper">

    <div class="pptbl-header">
      <span class="pptbl-count">
        <i class="bi bi-table me-1"></i>
        <template v-if="!loading">{{ rows.length }} pelanggan ditemukan</template>
        <template v-else>Memuat data…</template>
      </span>
      <span class="pptbl-sort-hint">Klik header kolom untuk pengurutan</span>
    </div>

    <div class="pptbl-scroll">
      <table class="pptbl-table">
        <thead>
          <tr>
            <th @click="sort('customer_name')" class="sortable">
              Pelanggan <i :class="sortIcon('customer_name')"></i>
            </th>
            <th>Grup</th>
            <th @click="sort('total_omzet')" class="sortable text-right">
              Total Omzet <i :class="sortIcon('total_omzet')"></i>
            </th>
            <th @click="sort('total_so')" class="sortable text-center">
              Jml SO <i :class="sortIcon('total_so')"></i>
            </th>
            <th class="text-right">Rata-rata SO</th>
            <th @click="sort('total_piutang')" class="sortable text-right">
              Piutang <i :class="sortIcon('total_piutang')"></i>
            </th>
            <th class="text-center" style="min-width:140px">Aging Piutang</th>
            <th class="text-right">Retur</th>
            <th @click="sort('recency_days')" class="sortable text-center">
              Last Order <i :class="sortIcon('recency_days')"></i>
            </th>
            <th class="text-center">RFM</th>
          </tr>
        </thead>
        <tbody>
          <!-- Skeleton -->
          <template v-if="loading">
            <tr v-for="i in 8" :key="'sk-'+i" class="pptbl-skeleton-row">
              <td v-for="j in 10" :key="j"><span class="pptbl-skeleton"></span></td>
            </tr>
          </template>

          <!-- Empty -->
          <tr v-else-if="sortedRows.length === 0">
            <td colspan="10" class="pptbl-empty">
              <i class="bi bi-inbox" style="font-size:1.5rem;opacity:.35;"></i>
              <div>Tidak ada data pelanggan untuk filter yang dipilih</div>
            </td>
          </tr>

          <!-- Data -->
          <template v-else>
            <tr v-for="row in sortedRows" :key="row.customer_uuid" class="pptbl-row">
              <!-- Pelanggan -->
              <td>
                <a :href="`/app/sales/customers`" class="pptbl-cust-name">
                  {{ row.customer_name }}
                </a>
                <div class="pptbl-cust-code">{{ row.customer_code }}</div>
              </td>
              <!-- Grup -->
              <td class="pptbl-dim">{{ row.group_name }}</td>
              <!-- Omzet -->
              <td class="text-right pptbl-bold">{{ fmtRp(row.total_omzet) }}</td>
              <!-- Jml SO -->
              <td class="text-center">{{ row.total_so }}</td>
              <!-- Rata-rata -->
              <td class="text-right pptbl-dim">{{ fmtRp(row.rata_rata_so) }}</td>
              <!-- Piutang -->
              <td class="text-right" :class="row.total_piutang > 0 ? 'pptbl-danger' : 'pptbl-dim'">
                {{ row.total_piutang > 0 ? fmtRp(row.total_piutang) : '—' }}
              </td>
              <!-- Aging bar -->
              <td class="pptbl-aging-cell">
                <template v-if="row.total_piutang > 0">
                  <div class="pptbl-aging-bar">
                    <div class="pptbl-seg pptbl-seg-green"
                         :style="{ width: agingPct(row, 'aging_1_30') + '%' }"
                         :title="`1-30 hari: ${fmtRp(row.aging_1_30)}`"></div>
                    <div class="pptbl-seg pptbl-seg-amber"
                         :style="{ width: agingPct(row, 'aging_31_60') + '%' }"
                         :title="`31-60 hari: ${fmtRp(row.aging_31_60)}`"></div>
                    <div class="pptbl-seg pptbl-seg-orange"
                         :style="{ width: agingPct(row, 'aging_61_90') + '%' }"
                         :title="`61-90 hari: ${fmtRp(row.aging_61_90)}`"></div>
                    <div class="pptbl-seg pptbl-seg-red"
                         :style="{ width: agingPct(row, 'aging_over_90') + '%' }"
                         :title="`>90 hari: ${fmtRp(row.aging_over_90)}`"></div>
                  </div>
                  <div class="pptbl-aging-legend">
                    <span v-if="row.aging_1_30 > 0" class="leg-green">1-30</span>
                    <span v-if="row.aging_31_60 > 0" class="leg-amber">31-60</span>
                    <span v-if="row.aging_61_90 > 0" class="leg-orange">61-90</span>
                    <span v-if="row.aging_over_90 > 0" class="leg-red">&gt;90</span>
                  </div>
                </template>
                <span v-else class="pptbl-dim">—</span>
              </td>
              <!-- Retur -->
              <td class="text-right pptbl-dim">
                {{ row.total_retur > 0 ? fmtRp(row.total_retur) : '—' }}
              </td>
              <!-- Last Order + Recency -->
              <td class="text-center">
                <div class="pptbl-date">{{ fmtDate(row.last_order_date) }}</div>
                <div class="pptbl-recency" v-if="row.recency_days !== null">
                  {{ row.recency_days }} hari lalu
                </div>
              </td>
              <!-- RFM badge -->
              <td class="text-center">
                <span class="pptbl-rfm-badge" :class="rfmClass(row.rfm_label)">
                  {{ row.rfm_label }}
                </span>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  rows:    { type: Array,   default: () => [] },
  loading: { type: Boolean, default: false },
})

// ── Sort state ──────────────────────────────────────────────
const sortKey = ref('total_omzet')
const sortDir = ref('desc')

function sort(key) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortKey.value = key
    sortDir.value = 'desc'
  }
}
function sortIcon(key) {
  if (sortKey.value !== key) return 'bi bi-arrow-down-up text-muted'
  return sortDir.value === 'asc' ? 'bi bi-sort-up' : 'bi bi-sort-down'
}

const sortedRows = computed(() => {
  return [...props.rows].sort((a, b) => {
    const va = a[sortKey.value] ?? 0
    const vb = b[sortKey.value] ?? 0
    if (typeof va === 'string') {
      return sortDir.value === 'asc'
        ? va.localeCompare(vb)
        : vb.localeCompare(va)
    }
    return sortDir.value === 'asc' ? va - vb : vb - va
  })
})

// ── Formatters ──────────────────────────────────────────────
function fmtRp(n) {
  if (n === null || n === undefined || n === 0) return '—'
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)} M`
  if (n >= 1_000_000)     return `Rp ${(n / 1_000_000).toFixed(1)} jt`
  return 'Rp ' + Math.round(n).toLocaleString('id-ID')
}
function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ── Aging bar helper ────────────────────────────────────────
function agingPct(row, bucket) {
  if (!row.total_piutang) return 0
  return Math.round((row[bucket] / row.total_piutang) * 100)
}

// ── RFM badge class ─────────────────────────────────────────
const RFM_CLASS = {
  Champion: 'rfm-champion',
  Loyal:    'rfm-loyal',
  'At Risk':'rfm-atrisk',
  Lost:     'rfm-lost',
}
function rfmClass(label) { return RFM_CLASS[label] || '' }
</script>

<style scoped>
.pptbl-wrapper {
  background: #fff; border-radius: 14px; border: 1px solid #e5e7eb;
  box-shadow: 0 1px 6px rgba(0,0,0,0.05); overflow: hidden;
}
:global([data-theme="dark"]) .pptbl-wrapper { background: #1e2130; border-color: #2e3347; }

/* Header */
.pptbl-header {
  padding: 0.75rem 1.25rem; border-bottom: 1px solid #e5e7eb;
  display: flex; align-items: center; justify-content: space-between;
}
:global([data-theme="dark"]) .pptbl-header { border-color: #2e3347; }
.pptbl-count     { font-size: 0.8rem; font-weight: 600; color: #6b7280; }
.pptbl-sort-hint { font-size: 0.7rem; color: #9ca3af; }

/* Scroll + table */
.pptbl-scroll { overflow-x: auto; }
.pptbl-table  { width: 100%; border-collapse: collapse; font-size: 0.82rem; }

.pptbl-table thead tr { background: #f3f4f6; }
:global([data-theme="dark"]) .pptbl-table thead tr { background: #252840; }

.pptbl-table th {
  padding: 0.65rem 0.85rem; font-size: 0.72rem; font-weight: 700;
  color: #6b7280; text-transform: uppercase; letter-spacing: 0.04em;
  white-space: nowrap; border-bottom: 1px solid #e5e7eb; user-select: none;
}
:global([data-theme="dark"]) .pptbl-table th { border-color: #2e3347; color: #9ca3af; }
.pptbl-table th.sortable { cursor: pointer; }
.pptbl-table th.sortable:hover { color: #6366f1; }

.pptbl-table td {
  padding: 0.65rem 0.85rem; border-bottom: 1px solid #f3f4f6;
  color: #1f2937; vertical-align: middle;
}
:global([data-theme="dark"]) .pptbl-table td { border-color: #2e3347; color: #e2e8f0; }
.pptbl-row:hover td { background: #f9fafb; }
:global([data-theme="dark"]) .pptbl-row:hover td { background: #252840; }

/* Customer name */
.pptbl-cust-name {
  color: #6366f1; font-weight: 700; text-decoration: none; font-size: 0.82rem;
  display: block;
}
.pptbl-cust-name:hover { text-decoration: underline; }
.pptbl-cust-code { font-size: 0.7rem; color: #9ca3af; margin-top: 1px; }

/* Alignment helpers */
.text-right   { text-align: right; }
.text-center  { text-align: center; }
.pptbl-bold   { font-weight: 700; }
.pptbl-dim    { color: #9ca3af; }
:global([data-theme="dark"]) .pptbl-dim { color: #6b7280; }
.pptbl-danger { color: #ef4444; font-weight: 700; }
.text-muted   { opacity: 0.4; }

/* Aging 4-segment bar */
.pptbl-aging-cell { min-width: 140px; }
.pptbl-aging-bar  {
  height: 7px; border-radius: 99px; overflow: hidden;
  background: #e5e7eb; display: flex; margin-bottom: 3px;
}
:global([data-theme="dark"]) .pptbl-aging-bar { background: #374151; }
.pptbl-seg { height: 100%; transition: width 0.3s; }
.pptbl-seg-green  { background: #22c55e; }
.pptbl-seg-amber  { background: #f59e0b; }
.pptbl-seg-orange { background: #f97316; }
.pptbl-seg-red    { background: #ef4444; }

.pptbl-aging-legend { display: flex; gap: 4px; font-size: 0.62rem; font-weight: 700; }
.leg-green  { color: #16a34a; }
.leg-amber  { color: #d97706; }
.leg-orange { color: #c2410c; }
.leg-red    { color: #dc2626; }

/* Last order */
.pptbl-date    { font-size: 0.78rem; }
.pptbl-recency { font-size: 0.68rem; color: #9ca3af; margin-top: 1px; }

/* RFM badges */
.pptbl-rfm-badge {
  display: inline-block; padding: 0.2rem 0.65rem; border-radius: 99px;
  font-size: 0.7rem; font-weight: 700; white-space: nowrap;
}
.rfm-champion { background: #fef9c3; color: #854d0e; border: 1px solid #fde047; }
.rfm-loyal    { background: #dbeafe; color: #1d4ed8; }
.rfm-atrisk   { background: #fef3c7; color: #d97706; }
.rfm-lost     { background: #fee2e2; color: #dc2626; }
:global([data-theme="dark"]) .rfm-champion { background: #422006; color: #fde047; border-color: #713f12; }
:global([data-theme="dark"]) .rfm-loyal    { background: #1e3a5f; color: #60a5fa; }
:global([data-theme="dark"]) .rfm-atrisk   { background: #451a03; color: #fbbf24; }
:global([data-theme="dark"]) .rfm-lost     { background: #450a0a; color: #f87171; }

/* Skeleton + empty */
.pptbl-skeleton-row td { padding: 0.8rem 0.85rem; }
.pptbl-skeleton {
  display: inline-block; width: 75%; height: 0.75rem; border-radius: 6px;
  background: linear-gradient(90deg, #e5e7eb 25%, #f3f4f6 50%, #e5e7eb 75%);
  background-size: 200% 100%; animation: shimmer 1.2s infinite;
}
:global([data-theme="dark"]) .pptbl-skeleton {
  background: linear-gradient(90deg, #2e3347 25%, #374151 50%, #2e3347 75%);
  background-size: 200% 100%;
}
@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
.pptbl-empty {
  text-align: center; padding: 3rem 1rem !important;
  color: #9ca3af; font-size: 0.85rem;
}
.pptbl-empty i { display: block; margin-bottom: 0.5rem; }
</style>
