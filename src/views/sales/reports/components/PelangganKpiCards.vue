<template>
  <div class="ppkpi-grid">

    <div class="ppkpi-card" id="ppkpi-total-customer">
      <div class="ppkpi-accent" style="background:#6366f1;"></div>
      <div class="ppkpi-body">
        <div class="ppkpi-label">Pelanggan Aktif</div>
        <div class="ppkpi-value">
          <span v-if="loading" class="ppkpi-skeleton"></span>
          <span v-else>{{ summary?.total_customer ?? '—' }}</span>
        </div>
        <div class="ppkpi-sub">dalam periode</div>
      </div>
      <i class="bi bi-people ppkpi-icon" style="color:#6366f1;"></i>
    </div>

    <div class="ppkpi-card" id="ppkpi-total-omzet">
      <div class="ppkpi-accent" style="background:#3b82f6;"></div>
      <div class="ppkpi-body">
        <div class="ppkpi-label">Total Omzet</div>
        <div class="ppkpi-value">
          <span v-if="loading" class="ppkpi-skeleton"></span>
          <span v-else>{{ fmtRp(summary?.total_omzet) }}</span>
        </div>
        <div class="ppkpi-sub">dari invoice terbuka + lunas</div>
      </div>
      <i class="bi bi-cash-stack ppkpi-icon" style="color:#3b82f6;"></i>
    </div>

    <div class="ppkpi-card" id="ppkpi-total-piutang">
      <div class="ppkpi-accent" style="background:#f59e0b;"></div>
      <div class="ppkpi-body">
        <div class="ppkpi-label">Total Piutang</div>
        <div class="ppkpi-value">
          <span v-if="loading" class="ppkpi-skeleton"></span>
          <span v-else>{{ fmtRp(summary?.total_piutang) }}</span>
        </div>
        <div class="ppkpi-sub">belum terbayar</div>
      </div>
      <i class="bi bi-clock-history ppkpi-icon" style="color:#f59e0b;"></i>
    </div>

    <div class="ppkpi-card" id="ppkpi-customer-overdue">
      <div class="ppkpi-accent" style="background:#ef4444;"></div>
      <div class="ppkpi-body">
        <div class="ppkpi-label">Piutang Overdue</div>
        <div class="ppkpi-value">
          <span v-if="loading" class="ppkpi-skeleton"></span>
          <span v-else class="text-danger">{{ summary?.customer_overdue ?? '—' }} pelanggan</span>
        </div>
        <div class="ppkpi-sub">melewati jatuh tempo</div>
      </div>
      <i class="bi bi-exclamation-triangle ppkpi-icon" style="color:#ef4444;"></i>
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
</script>

<style scoped>
.ppkpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 0.85rem; margin-bottom: 1.25rem;
}
.ppkpi-card {
  background: #fff; border-radius: 14px; border: 1px solid #e5e7eb;
  box-shadow: 0 1px 6px rgba(0,0,0,0.05); padding: 1rem 1rem 1rem 0;
  display: flex; align-items: center; gap: 0.75rem; position: relative;
  overflow: hidden; transition: box-shadow 0.15s, transform 0.15s;
}
.ppkpi-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.1); transform: translateY(-1px); }
:global([data-theme="dark"]) .ppkpi-card { background: #1e2130; border-color: #2e3347; }

.ppkpi-accent { width: 5px; align-self: stretch; border-radius: 0 4px 4px 0; flex-shrink: 0; }
.ppkpi-body { flex: 1; }
.ppkpi-label { font-size: 0.72rem; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 0.2rem; }
:global([data-theme="dark"]) .ppkpi-label { color: #9ca3af; }
.ppkpi-value { font-size: 1.3rem; font-weight: 800; color: #111827; line-height: 1.2; }
:global([data-theme="dark"]) .ppkpi-value { color: #f3f4f6; }
.ppkpi-sub { font-size: 0.7rem; color: #9ca3af; margin-top: 0.15rem; }
.ppkpi-icon { font-size: 1.6rem; opacity: 0.12; position: absolute; right: 0.8rem; bottom: 0.6rem; }
.ppkpi-skeleton {
  display: inline-block; width: 90px; height: 1.2rem;
  background: linear-gradient(90deg, #e5e7eb 25%, #f3f4f6 50%, #e5e7eb 75%);
  background-size: 200% 100%; animation: shimmer 1.2s infinite; border-radius: 6px;
}
:global([data-theme="dark"]) .ppkpi-skeleton {
  background: linear-gradient(90deg, #2e3347 25%, #374151 50%, #2e3347 75%);
  background-size: 200% 100%;
}
@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
.text-danger { color: #ef4444; }
</style>
