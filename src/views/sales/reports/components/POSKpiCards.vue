<template>
  <div class="pos-kpi-grid">

    <!-- Total Omzet POS -->
    <div class="pos-kpi-card">
      <div class="pos-kpi-icon" style="background:linear-gradient(135deg,#6366f1,#7c3aed)">
        <i class="bi bi-cash-stack"></i>
      </div>
      <div class="pos-kpi-body">
        <div class="pos-kpi-label">Total Omzet POS</div>
        <div class="pos-kpi-value" v-if="!loading">{{ fmtRp(summary?.total_omzet) }}</div>
        <div class="pos-kpi-skeleton" v-else></div>
      </div>
    </div>

    <!-- Total Transaksi -->
    <div class="pos-kpi-card">
      <div class="pos-kpi-icon" style="background:linear-gradient(135deg,#2563eb,#1d4ed8)">
        <i class="bi bi-receipt"></i>
      </div>
      <div class="pos-kpi-body">
        <div class="pos-kpi-label">Total Transaksi</div>
        <div class="pos-kpi-value" v-if="!loading">
          {{ summary?.total_trx?.toLocaleString('id-ID') ?? '—' }}
        </div>
        <div class="pos-kpi-skeleton" v-else></div>
      </div>
    </div>

    <!-- Rata-rata / Transaksi -->
    <div class="pos-kpi-card">
      <div class="pos-kpi-icon" style="background:linear-gradient(135deg,#059669,#047857)">
        <i class="bi bi-graph-up-arrow"></i>
      </div>
      <div class="pos-kpi-body">
        <div class="pos-kpi-label">Avg / Transaksi</div>
        <div class="pos-kpi-value" v-if="!loading">{{ fmtRp(summary?.avg_trx) }}</div>
        <div class="pos-kpi-skeleton" v-else></div>
      </div>
    </div>

    <!-- Total Diskon -->
    <div class="pos-kpi-card">
      <div class="pos-kpi-icon" style="background:linear-gradient(135deg,#d97706,#b45309)">
        <i class="bi bi-tag"></i>
      </div>
      <div class="pos-kpi-body">
        <div class="pos-kpi-label">Total Diskon</div>
        <div class="pos-kpi-value" v-if="!loading">{{ fmtRp(summary?.total_diskon) }}</div>
        <div class="pos-kpi-skeleton" v-else></div>
      </div>
    </div>

  </div>
</template>

<script setup>
defineProps({
  summary: { type: Object, default: null },
  loading: { type: Boolean, default: false },
})

function fmtRp(n) {
  if (n == null || isNaN(n)) return '—'
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)} M`
  if (n >= 1_000_000)     return `Rp ${(n / 1_000_000).toFixed(1)} jt`
  return 'Rp ' + Math.round(n).toLocaleString('id-ID')
}
</script>

<style scoped>
.pos-kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}
.pos-kpi-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  padding: 1rem 1.25rem;
  display: flex;
  align-items: center;
  gap: 1rem;
  box-shadow: 0 1px 6px rgba(0,0,0,0.05);
  transition: box-shadow 0.2s;
}
.pos-kpi-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.08); }
:global([data-theme="dark"]) .pos-kpi-card { background: #1e2130; border-color: #2e3347; }

.pos-kpi-icon {
  width: 46px; height: 46px;
  border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  color: #fff; font-size: 1.3rem;
}
.pos-kpi-body { flex: 1; min-width: 0; }
.pos-kpi-label {
  font-size: 0.72rem; font-weight: 600;
  color: #6b7280; text-transform: uppercase; letter-spacing: 0.04em;
  margin-bottom: 0.3rem;
}
:global([data-theme="dark"]) .pos-kpi-label { color: #9ca3af; }
.pos-kpi-value {
  font-size: 1.25rem; font-weight: 800;
  color: #111827; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
:global([data-theme="dark"]) .pos-kpi-value { color: #f1f5f9; }
.pos-kpi-skeleton {
  height: 1.5rem; border-radius: 6px;
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
}
@keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
</style>
