<template>
  <div class="rt-card">
    <div class="rt-header">
      <div class="rt-title"><i class="bi bi-table me-2"></i>Detail Per Periode</div>
      <span class="rt-count" v-if="trend.length">{{ trend.length }} periode</span>
    </div>

    <!-- Empty -->
    <div v-if="!trend.length" class="rt-empty">
      <i class="bi bi-inbox opacity-25"></i>
      <span>Belum ada data</span>
    </div>

    <!-- Table -->
    <div v-else class="rt-table-wrap">
      <table class="rt-table">
        <thead>
          <tr>
            <th>Periode</th>
            <th class="text-end">Omzet</th>
            <th class="text-end">Transaksi</th>
            <th class="text-end">Rata-rata / Trx</th>
            <th class="text-end">Growth</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, i) in enriched" :key="row.label">
            <td class="rt-label">{{ row.label }}</td>
            <td class="text-end fw-semibold">{{ fmt(row.omzet) }}</td>
            <td class="text-end">{{ row.transaksi }}</td>
            <td class="text-end text-muted">{{ row.transaksi > 0 ? fmt(row.omzet / row.transaksi) : '—' }}</td>
            <td class="text-end">
              <span v-if="i === 0" class="rt-badge rt-badge--gray">—</span>
              <span v-else-if="row.growth >= 0" class="rt-badge rt-badge--up">
                <i class="bi bi-arrow-up-short"></i>{{ row.growth }}%
              </span>
              <span v-else class="rt-badge rt-badge--down">
                <i class="bi bi-arrow-down-short"></i>{{ Math.abs(row.growth) }}%
              </span>
            </td>
          </tr>
        </tbody>
        <!-- Footer total -->
        <tfoot v-if="trend.length > 1">
          <tr>
            <td class="fw-bold">Total</td>
            <td class="text-end fw-bold text-primary">{{ fmt(totalOmzet) }}</td>
            <td class="text-end fw-bold">{{ totalTrx }}</td>
            <td class="text-end text-muted">{{ totalTrx > 0 ? fmt(totalOmzet / totalTrx) : '—' }}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { formatCurrency } from '@/utils/format'

const props = defineProps({
  trend: { type: Array, default: () => [] },
})

const fmt = (n) => formatCurrency(n || 0)

const totalOmzet = computed(() => props.trend.reduce((s, r) => s + r.omzet, 0))
const totalTrx   = computed(() => props.trend.reduce((s, r) => s + r.transaksi, 0))

const enriched = computed(() =>
  props.trend.map((row, i) => {
    const prev   = i > 0 ? props.trend[i - 1] : null
    const growth = prev && prev.omzet > 0
      ? Math.round(((row.omzet - prev.omzet) / prev.omzet) * 1000) / 10
      : null
    return { ...row, growth }
  })
)
</script>

<style scoped>
.rt-card {
  background: #fff;
  border-radius: 14px;
  border: 1px solid #e5e7eb;
  box-shadow: 0 1px 6px rgba(0,0,0,0.05);
  padding: 1.1rem 1.25rem;
  margin-bottom: 1.25rem;
}
:global([data-theme="dark"]) .rt-card { background: #1e2130; border-color: #2e3347; }

.rt-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.85rem;
}
.rt-title { font-size: 0.85rem; font-weight: 700; color: #374151; }
:global([data-theme="dark"]) .rt-title { color: #e2e8f0; }
.rt-count { font-size: 0.75rem; color: #9ca3af; }

.rt-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
  padding: 2rem;
  color: #9ca3af;
  font-size: 0.85rem;
}
.rt-empty i { font-size: 2rem; }

.rt-table-wrap { border-radius: 10px; overflow: hidden; border: 1px solid #e5e7eb; }
:global([data-theme="dark"]) .rt-table-wrap { border-color: #2e3347; }

.rt-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.83rem;
}
.rt-table thead th {
  background: #f5f3ff;
  color: #6366f1;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 0.55rem 0.75rem;
  border-bottom: 2px solid #ede9fe;
}
:global([data-theme="dark"]) .rt-table thead th { background: #252840; border-color: #312e81; color: #818cf8; }

.rt-table tbody tr:nth-child(even) { background: #fafafe; }
:global([data-theme="dark"]) .rt-table tbody tr:nth-child(even) { background: #252840; }
.rt-table tbody tr:hover { background: #f5f3ff; }
:global([data-theme="dark"]) .rt-table tbody tr:hover { background: #2e2e50; }

.rt-table tbody td,
.rt-table tfoot td {
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid #f0f0f5;
  color: #1f2937;
}
:global([data-theme="dark"]) .rt-table tbody td,
:global([data-theme="dark"]) .rt-table tfoot td { border-color: #2e3347; color: #e2e8f0; }

.rt-table tfoot td {
  background: #f9f8ff;
  border-top: 2px solid #ede9fe;
  border-bottom: none;
}
:global([data-theme="dark"]) .rt-table tfoot td { background: #252840; border-color: #312e81; }

.rt-label { font-weight: 600; color: #374151; }
:global([data-theme="dark"]) .rt-label { color: #e2e8f0; }

/* Growth badges */
.rt-badge {
  display: inline-flex;
  align-items: center;
  border-radius: 20px;
  padding: 2px 7px;
  font-size: 0.7rem;
  font-weight: 700;
}
.rt-badge--up   { background: #dcfce7; color: #16a34a; }
.rt-badge--down { background: #fee2e2; color: #dc2626; }
.rt-badge--gray { background: #f1f5f9; color: #64748b; }
</style>
