<template>
  <div class="rkc-grid">
    <div
      v-for="card in cards" :key="card.key"
      class="rkc-card"
      :class="card.colorClass"
    >
      <!-- Skeleton -->
      <template v-if="loading">
        <div class="rkc-skeleton-icon"></div>
        <div class="rkc-skeleton-val"></div>
        <div class="rkc-skeleton-label"></div>
      </template>

      <!-- Data -->
      <template v-else>
        <div class="rkc-icon-wrap">
          <i :class="card.icon"></i>
        </div>
        <div class="rkc-value">{{ card.display }}</div>
        <div class="rkc-label">{{ card.label }}</div>
        <!-- Growth badge — hanya untuk omzet -->
        <div v-if="card.key === 'omzet' && growthPct !== null" class="rkc-badge" :class="growthPct >= 0 ? 'up' : 'down'">
          <i :class="growthPct >= 0 ? 'bi bi-arrow-up-short' : 'bi bi-arrow-down-short'"></i>
          {{ Math.abs(growthPct) }}% vs periode lalu
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { formatCurrency } from '@/utils/format'

const props = defineProps({
  summary: { type: Object, default: null },
  loading: { type: Boolean, default: false },
})

const growthPct = computed(() => props.summary?.growth_pct ?? null)

function fmt(n) { return formatCurrency(n || 0) }
function fmtShort(n) {
  if (!n) return '--'
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)}M`
  if (n >= 1_000_000)     return `Rp ${(n / 1_000_000).toFixed(1)}jt`
  return fmt(n)
}

const cards = computed(() => [
  {
    key:        'omzet',
    label:      'Total Omzet',
    icon:       'bi bi-graph-up-arrow',
    colorClass: 'rkc--indigo',
    display:    fmtShort(props.summary?.total_omzet),
  },
  {
    key:        'transaksi',
    label:      'Jumlah Transaksi',
    icon:       'bi bi-receipt',
    colorClass: 'rkc--blue',
    display:    props.summary ? `${props.summary.total_transaksi} trx` : '--',
  },
  {
    key:        'rata',
    label:      'Rata-rata / Trx',
    icon:       'bi bi-calculator',
    colorClass: 'rkc--purple',
    display:    fmtShort(props.summary?.rata_rata),
  },
  {
    key:        'growth',
    label:      'Growth vs Periode Lalu',
    icon:       'bi bi-bar-chart-line',
    colorClass: growthPct.value === null ? 'rkc--gray'
                : growthPct.value >= 0   ? 'rkc--green'
                                         : 'rkc--red',
    display:    growthPct.value === null
                  ? 'N/A'
                  : `${growthPct.value >= 0 ? '+' : ''}${growthPct.value}%`,
  },
])
</script>

<style scoped>
.rkc-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1rem;
  margin-bottom: 1.25rem;
}
@media (max-width: 900px) { .rkc-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 500px) { .rkc-grid { grid-template-columns: 1fr; } }

.rkc-card {
  border-radius: 14px;
  padding: 1.15rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  border: 1px solid transparent;
  position: relative;
  overflow: hidden;
  transition: transform 0.15s, box-shadow 0.15s;
}
.rkc-card:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,0.1); }

/* Color variants */
.rkc--indigo { background: linear-gradient(135deg,#ede9fe,#e0e7ff); border-color: #c4b5fd; }
.rkc--blue   { background: linear-gradient(135deg,#dbeafe,#e0f2fe); border-color: #93c5fd; }
.rkc--purple { background: linear-gradient(135deg,#f3e8ff,#ede9fe); border-color: #d8b4fe; }
.rkc--green  { background: linear-gradient(135deg,#dcfce7,#d1fae5); border-color: #86efac; }
.rkc--red    { background: linear-gradient(135deg,#fee2e2,#fecaca); border-color: #fca5a5; }
.rkc--gray   { background: linear-gradient(135deg,#f1f5f9,#e2e8f0); border-color: #cbd5e1; }

/* Dark mode */
:global([data-theme="dark"]) .rkc--indigo { background: linear-gradient(135deg,#2e1f5e,#1e1b4b); border-color:#4338ca; }
:global([data-theme="dark"]) .rkc--blue   { background: linear-gradient(135deg,#1e3a5f,#0c2548); border-color:#2563eb; }
:global([data-theme="dark"]) .rkc--purple { background: linear-gradient(135deg,#3b0764,#4a044e); border-color:#7e22ce; }
:global([data-theme="dark"]) .rkc--green  { background: linear-gradient(135deg,#052e16,#064e3b); border-color:#16a34a; }
:global([data-theme="dark"]) .rkc--red    { background: linear-gradient(135deg,#450a0a,#3f0606); border-color:#dc2626; }
:global([data-theme="dark"]) .rkc--gray   { background: linear-gradient(135deg,#1e2130,#151827); border-color:#374151; }

.rkc-icon-wrap {
  font-size: 1.4rem;
  margin-bottom: 0.2rem;
}
.rkc--indigo .rkc-icon-wrap { color: #6366f1; }
.rkc--blue   .rkc-icon-wrap { color: #2563eb; }
.rkc--purple .rkc-icon-wrap { color: #9333ea; }
.rkc--green  .rkc-icon-wrap { color: #16a34a; }
.rkc--red    .rkc-icon-wrap { color: #dc2626; }
.rkc--gray   .rkc-icon-wrap { color: #64748b; }

.rkc-value {
  font-size: 1.4rem;
  font-weight: 800;
  color: #111827;
  letter-spacing: -0.02em;
  line-height: 1.1;
}
:global([data-theme="dark"]) .rkc-value { color: #f1f5f9; }

.rkc-label  { font-size: 0.75rem; font-weight: 600; color: #6b7280; }
:global([data-theme="dark"]) .rkc-label { color: #9ca3af; }

.rkc-badge {
  display: inline-flex;
  align-items: center;
  border-radius: 20px;
  padding: 2px 8px;
  font-size: 0.7rem;
  font-weight: 700;
  margin-top: 0.15rem;
  width: fit-content;
}
.rkc-badge.up   { background: #dcfce7; color: #16a34a; }
.rkc-badge.down { background: #fee2e2; color: #dc2626; }

/* Skeleton */
.rkc-skeleton-icon, .rkc-skeleton-val, .rkc-skeleton-label {
  border-radius: 6px;
  background: rgba(0,0,0,0.08);
  animation: rkc-pulse 1.4s infinite;
}
.rkc-skeleton-icon  { width: 2rem; height: 2rem; border-radius: 50%; margin-bottom: 0.2rem; }
.rkc-skeleton-val   { height: 1.6rem; width: 70%; }
.rkc-skeleton-label { height: 0.75rem; width: 50%; }

@keyframes rkc-pulse {
  0%,100% { opacity: 1; }
  50%     { opacity: 0.35; }
}
</style>
