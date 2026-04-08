<template>
  <div class="sokpi-grid">

    <!-- Total SO -->
    <div class="sokpi-card" id="sokpi-total-so">
      <div class="sokpi-accent" style="background: #6366f1;"></div>
      <div class="sokpi-body">
        <div class="sokpi-label">Total SO</div>
        <div class="sokpi-value">
          <span v-if="loading" class="sokpi-skeleton"></span>
          <span v-else>{{ summary?.total_so ?? '—' }}</span>
        </div>
        <div class="sokpi-sub">dokumen</div>
      </div>
      <i class="bi bi-receipt sokpi-icon" style="color:#6366f1;"></i>
    </div>

    <!-- Nilai SO -->
    <div class="sokpi-card" id="sokpi-total-nilai">
      <div class="sokpi-accent" style="background: #3b82f6;"></div>
      <div class="sokpi-body">
        <div class="sokpi-label">Nilai SO</div>
        <div class="sokpi-value">
          <span v-if="loading" class="sokpi-skeleton"></span>
          <span v-else>{{ fmtRp(summary?.total_nilai) }}</span>
        </div>
        <div class="sokpi-sub">total nilai order</div>
      </div>
      <i class="bi bi-cash-stack sokpi-icon" style="color:#3b82f6;"></i>
    </div>

    <!-- SO Terbuka -->
    <div class="sokpi-card" id="sokpi-so-terbuka">
      <div class="sokpi-accent" style="background: #f59e0b;"></div>
      <div class="sokpi-body">
        <div class="sokpi-label">SO Terbuka</div>
        <div class="sokpi-value">
          <span v-if="loading" class="sokpi-skeleton"></span>
          <span v-else>{{ summary?.so_terbuka ?? '—' }}</span>
        </div>
        <div class="sokpi-sub">belum lunas</div>
      </div>
      <i class="bi bi-hourglass-split sokpi-icon" style="color:#f59e0b;"></i>
    </div>

    <!-- SO Terlambat -->
    <div class="sokpi-card" id="sokpi-so-terlambat">
      <div class="sokpi-accent" style="background: #ef4444;"></div>
      <div class="sokpi-body">
        <div class="sokpi-label">SO Terlambat</div>
        <div class="sokpi-value">
          <span v-if="loading" class="sokpi-skeleton"></span>
          <span v-else class="text-danger">{{ summary?.so_terlambat ?? '—' }}</span>
        </div>
        <div class="sokpi-sub">&gt; 7 hari terbuka</div>
      </div>
      <i class="bi bi-exclamation-triangle sokpi-icon" style="color:#ef4444;"></i>
    </div>

    <!-- SO Lunas -->
    <div class="sokpi-card" id="sokpi-so-lunas">
      <div class="sokpi-accent" style="background: #22c55e;"></div>
      <div class="sokpi-body">
        <div class="sokpi-label">SO Lunas</div>
        <div class="sokpi-value">
          <span v-if="loading" class="sokpi-skeleton"></span>
          <span v-else class="text-success">{{ summary?.so_lunas ?? '—' }}</span>
        </div>
        <div class="sokpi-sub">status paid</div>
      </div>
      <i class="bi bi-check-circle sokpi-icon" style="color:#22c55e;"></i>
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
.sokpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 0.85rem;
  margin-bottom: 1.25rem;
}

.sokpi-card {
  background: #fff;
  border-radius: 14px;
  border: 1px solid #e5e7eb;
  box-shadow: 0 1px 6px rgba(0,0,0,0.05);
  padding: 1rem 1rem 1rem 0;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  position: relative;
  overflow: hidden;
  transition: box-shadow 0.15s, transform 0.15s;
}
.sokpi-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.1); transform: translateY(-1px); }
:global([data-theme="dark"]) .sokpi-card { background: #1e2130; border-color: #2e3347; }

.sokpi-accent {
  width: 5px;
  align-self: stretch;
  border-radius: 0 4px 4px 0;
  flex-shrink: 0;
}

.sokpi-body { flex: 1; }
.sokpi-label {
  font-size: 0.72rem;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 0.2rem;
}
:global([data-theme="dark"]) .sokpi-label { color: #9ca3af; }

.sokpi-value {
  font-size: 1.35rem;
  font-weight: 800;
  color: #111827;
  line-height: 1.2;
}
:global([data-theme="dark"]) .sokpi-value { color: #f3f4f6; }

.sokpi-sub {
  font-size: 0.7rem;
  color: #9ca3af;
  margin-top: 0.15rem;
}

.sokpi-icon {
  font-size: 1.6rem;
  opacity: 0.12;
  position: absolute;
  right: 0.8rem;
  bottom: 0.6rem;
}

/* Skeleton loading */
.sokpi-skeleton {
  display: inline-block;
  width: 80px;
  height: 1.2rem;
  background: linear-gradient(90deg, #e5e7eb 25%, #f3f4f6 50%, #e5e7eb 75%);
  background-size: 200% 100%;
  animation: shimmer 1.2s infinite;
  border-radius: 6px;
}
@keyframes shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.text-danger  { color: #ef4444; }
.text-success { color: #22c55e; }
</style>
