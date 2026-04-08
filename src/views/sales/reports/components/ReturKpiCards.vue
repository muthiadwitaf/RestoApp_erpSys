<template>
  <div class="retur-kpi-grid">

    <!-- Total Retur Dokumen -->
    <div class="retur-kpi-card">
      <div class="retur-kpi-icon" style="background:linear-gradient(135deg,#dc2626,#b91c1c)">
        <i class="bi bi-arrow-return-left"></i>
      </div>
      <div class="retur-kpi-body">
        <div class="retur-kpi-label">Total Retur</div>
        <div class="retur-kpi-value" v-if="!loading">
          {{ summary?.total_retur?.toLocaleString('id-ID') ?? '—' }} dok
        </div>
        <div class="retur-kpi-skeleton" v-else></div>
      </div>
    </div>

    <!-- Nilai Retur -->
    <div class="retur-kpi-card">
      <div class="retur-kpi-icon" style="background:linear-gradient(135deg,#d97706,#b45309)">
        <i class="bi bi-currency-exchange"></i>
      </div>
      <div class="retur-kpi-body">
        <div class="retur-kpi-label">Nilai Retur</div>
        <div class="retur-kpi-value" v-if="!loading">{{ fmtRp(summary?.total_nilai) }}</div>
        <div class="retur-kpi-skeleton" v-else></div>
      </div>
    </div>

    <!-- Return Rate -->
    <div class="retur-kpi-card">
      <div class="retur-kpi-icon" style="background:linear-gradient(135deg,#7c3aed,#6d28d9)">
        <i class="bi bi-percent"></i>
      </div>
      <div class="retur-kpi-body">
        <div class="retur-kpi-label">Return Rate</div>
        <div class="retur-kpi-value" v-if="!loading">
          <template v-if="summary?.return_rate_pct != null">
            {{ summary.return_rate_pct.toFixed(2) }}%
          </template>
          <template v-else>—</template>
        </div>
        <div class="retur-kpi-skeleton" v-else></div>
      </div>
    </div>

    <!-- Selesai / Completed -->
    <div class="retur-kpi-card">
      <div class="retur-kpi-icon" style="background:linear-gradient(135deg,#059669,#047857)">
        <i class="bi bi-check2-circle"></i>
      </div>
      <div class="retur-kpi-body">
        <div class="retur-kpi-label">Selesai</div>
        <div class="retur-kpi-value" v-if="!loading">
          {{ summary?.completed_count?.toLocaleString('id-ID') ?? '—' }} dok
        </div>
        <div class="retur-kpi-skeleton" v-else></div>
      </div>
    </div>

  </div>

  <!-- Resolution breakdown pills (only when data is loaded) -->
  <div class="retur-resolution-row" v-if="!loading && summary && summary.total_retur > 0">
    <span class="retur-pill retur-pill-cash">
      <i class="bi bi-cash me-1"></i>
      Refund Tunai: {{ summary.refund_cash_count }}
    </span>
    <span class="retur-pill retur-pill-transfer">
      <i class="bi bi-bank me-1"></i>
      Refund Transfer: {{ summary.refund_transfer_count }}
    </span>
    <span class="retur-pill retur-pill-replace">
      <i class="bi bi-arrow-repeat me-1"></i>
      Tukar Barang: {{ summary.replacement_count }}
    </span>
    <span class="retur-pill retur-pill-draft">
      <i class="bi bi-hourglass-split me-1"></i>
      Pending: {{ summary.draft_count }}
    </span>
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
.retur-kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 1rem;
  margin-bottom: 0.75rem;
}
.retur-kpi-card {
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
.retur-kpi-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.08); }
:global([data-theme="dark"]) .retur-kpi-card { background: #1e2130; border-color: #2e3347; }

.retur-kpi-icon {
  width: 46px; height: 46px;
  border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  color: #fff; font-size: 1.3rem;
}
.retur-kpi-body { flex: 1; min-width: 0; }
.retur-kpi-label {
  font-size: 0.72rem; font-weight: 600;
  color: #6b7280; text-transform: uppercase; letter-spacing: 0.04em;
  margin-bottom: 0.3rem;
}
:global([data-theme="dark"]) .retur-kpi-label { color: #9ca3af; }
.retur-kpi-value {
  font-size: 1.25rem; font-weight: 800;
  color: #111827; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
:global([data-theme="dark"]) .retur-kpi-value { color: #f1f5f9; }
.retur-kpi-skeleton {
  height: 1.5rem; border-radius: 6px;
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
}
@keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }

/* Resolution pills */
.retur-resolution-row {
  display: flex; flex-wrap: wrap; gap: 0.5rem;
  margin-bottom: 1.25rem;
}
.retur-pill {
  display: inline-flex; align-items: center;
  padding: 0.28rem 0.8rem; border-radius: 20px;
  font-size: 0.75rem; font-weight: 600;
}
.retur-pill-cash     { background: #fef9c3; color: #854d0e; }
.retur-pill-transfer { background: #dbeafe; color: #1e40af; }
.retur-pill-replace  { background: #d1fae5; color: #065f46; }
.retur-pill-draft    { background: #f3f4f6; color: #6b7280; }
</style>
