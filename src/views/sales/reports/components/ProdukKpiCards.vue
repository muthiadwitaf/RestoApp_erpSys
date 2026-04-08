<template>
  <div class="pkkpi-grid">

    <div class="pkkpi-card" id="pkkpi-total-sku">
      <div class="pkkpi-accent" style="background:#6366f1;"></div>
      <div class="pkkpi-body">
        <div class="pkkpi-label">Total SKU Terjual</div>
        <div class="pkkpi-value">
          <span v-if="loading" class="pkkpi-skeleton"></span>
          <span v-else>{{ summary?.total_sku ?? '—' }}</span>
        </div>
        <div class="pkkpi-sub">produk dalam periode</div>
      </div>
      <i class="bi bi-box-seam pkkpi-icon" style="color:#6366f1;"></i>
    </div>

    <div class="pkkpi-card" id="pkkpi-total-omzet">
      <div class="pkkpi-accent" style="background:#3b82f6;"></div>
      <div class="pkkpi-body">
        <div class="pkkpi-label">Total Omzet</div>
        <div class="pkkpi-value">
          <span v-if="loading" class="pkkpi-skeleton"></span>
          <span v-else>{{ fmtRp(summary?.total_omzet) }}</span>
        </div>
        <div class="pkkpi-sub">gabungan SO + POS</div>
      </div>
      <i class="bi bi-cash-stack pkkpi-icon" style="color:#3b82f6;"></i>
    </div>

    <div class="pkkpi-card" id="pkkpi-avg-margin">
      <div class="pkkpi-accent" style="background:#22c55e;"></div>
      <div class="pkkpi-body">
        <div class="pkkpi-label">Avg Margin</div>
        <div class="pkkpi-value">
          <span v-if="loading" class="pkkpi-skeleton"></span>
          <span v-else class="pkkpi-margin" :class="marginClass(summary?.avg_margin_pct)">
            {{ summary?.avg_margin_pct != null ? summary.avg_margin_pct.toFixed(1) + ' %' : '—' }}
          </span>
        </div>
        <div class="pkkpi-sub">bobot omzet</div>
      </div>
      <i class="bi bi-graph-up-arrow pkkpi-icon" style="color:#22c55e;"></i>
    </div>

    <div class="pkkpi-card" id="pkkpi-total-retur">
      <div class="pkkpi-accent" style="background:#f59e0b;"></div>
      <div class="pkkpi-body">
        <div class="pkkpi-label">Total Retur</div>
        <div class="pkkpi-value">
          <span v-if="loading" class="pkkpi-skeleton"></span>
          <span v-else>{{ fmtRp(summary?.total_retur_omzet) }}</span>
        </div>
        <div class="pkkpi-sub">semua produk, periode ini</div>
      </div>
      <i class="bi bi-arrow-counterclockwise pkkpi-icon" style="color:#f59e0b;"></i>
    </div>

  </div>
</template>

<script setup>
defineProps({
  summary: { type: Object, default: null },
  loading: { type: Boolean, default: false },
})

function fmtRp(n) {
  if (n === null || n === undefined) return '—'
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)} M`
  if (n >= 1_000_000)     return `Rp ${(n / 1_000_000).toFixed(1)} jt`
  return 'Rp ' + Math.round(n).toLocaleString('id-ID')
}

function marginClass(pct) {
  if (pct == null) return ''
  if (pct >= 30) return 'mg-good'
  if (pct >= 15) return 'mg-warn'
  return 'mg-bad'
}
</script>

<style scoped>
.pkkpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 0.85rem; margin-bottom: 1.25rem;
}
.pkkpi-card {
  background: #fff; border-radius: 14px; border: 1px solid #e5e7eb;
  box-shadow: 0 1px 6px rgba(0,0,0,0.05); padding: 1rem 1rem 1rem 0;
  display: flex; align-items: center; gap: 0.75rem; position: relative;
  overflow: hidden; transition: box-shadow 0.15s, transform 0.15s;
}
.pkkpi-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.1); transform: translateY(-1px); }
:global([data-theme="dark"]) .pkkpi-card { background: #1e2130; border-color: #2e3347; }

.pkkpi-accent { width: 5px; align-self: stretch; border-radius: 0 4px 4px 0; flex-shrink: 0; }
.pkkpi-body   { flex: 1; }
.pkkpi-label  { font-size: 0.72rem; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 0.2rem; }
:global([data-theme="dark"]) .pkkpi-label { color: #9ca3af; }
.pkkpi-value  { font-size: 1.3rem; font-weight: 800; color: #111827; line-height: 1.2; }
:global([data-theme="dark"]) .pkkpi-value { color: #f3f4f6; }
.pkkpi-sub    { font-size: 0.7rem; color: #9ca3af; margin-top: 0.15rem; }
.pkkpi-icon   { font-size: 1.6rem; opacity: 0.12; position: absolute; right: 0.8rem; bottom: 0.6rem; }

.mg-good { color: #16a34a; }
.mg-warn { color: #d97706; }
.mg-bad  { color: #dc2626; }

.pkkpi-skeleton {
  display: inline-block; width: 90px; height: 1.2rem;
  background: linear-gradient(90deg, #e5e7eb 25%, #f3f4f6 50%, #e5e7eb 75%);
  background-size: 200% 100%; animation: shimmer 1.2s infinite; border-radius: 6px;
}
:global([data-theme="dark"]) .pkkpi-skeleton {
  background: linear-gradient(90deg, #2e3347 25%, #374151 50%, #2e3347 75%);
  background-size: 200% 100%;
}
@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
</style>
