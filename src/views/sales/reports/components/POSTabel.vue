<template>
  <div class="pos-tabel-wrap">

    <!-- Tab Nav -->
    <div class="pos-tabs">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="pos-tab-btn"
        :class="{ active: activeTab === tab.id }"
        @click="activeTab = tab.id"
        :id="`pos-tab-${tab.id}`"
      >
        <i :class="tab.icon + ' me-1'"></i>{{ tab.label }}
      </button>
    </div>

    <!-- Loading skeleton -->
    <div v-if="loading" class="pos-skeleton-rows">
      <div class="pos-sk-row" v-for="n in 5" :key="n"></div>
    </div>

    <!-- Tab: Per Kasir -->
    <div v-else-if="activeTab === 'kasir'">
      <div class="pos-table-note" v-if="!kasirRows.length">
        Tidak ada data untuk periode ini.
      </div>
      <table v-else class="pos-table">
        <thead>
          <tr>
            <th>Kasir</th>
            <th class="num">Omzet</th>
            <th class="num"># Trx</th>
            <th class="num">Avg / Trx</th>
            <th class="num">Diskon</th>
            <th class="num">Kontribusi</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(r, i) in kasirRows" :key="i">
            <td class="kasir-name">{{ r.cashier_name }}</td>
            <td class="num">{{ fmtRp(r.total_omzet) }}</td>
            <td class="num">{{ r.total_trx.toLocaleString('id-ID') }}</td>
            <td class="num">{{ fmtRp(r.avg_trx) }}</td>
            <td class="num diskon">{{ r.total_diskon > 0 ? fmtRp(r.total_diskon) : '—' }}</td>
            <td class="num">
              <div class="pct-bar-wrap">
                <div class="pct-bar" :style="{ width: r.pct_kontribusi + '%' }"></div>
                <span class="pct-label">{{ r.pct_kontribusi }}%</span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Tab: Metode Bayar -->
    <div v-else-if="activeTab === 'payment'">
      <div class="pos-table-note" v-if="!paymentRows.length">
        Tidak ada data untuk periode ini.
      </div>
      <div v-else class="payment-grid">
        <div
          v-for="(r, i) in paymentRows"
          :key="i"
          class="payment-card"
          :style="{ '--accent': paymentColor(r.metode) }"
        >
          <div class="payment-icon">
            <i :class="paymentIcon(r.metode)"></i>
          </div>
          <div class="payment-info">
            <div class="payment-method">{{ paymentLabel(r.metode) }}</div>
            <div class="payment-omzet">{{ fmtRp(r.total_omzet) }}</div>
            <div class="payment-meta">{{ r.total_trx }} trx &bull; {{ r.pct_kontribusi }}% total</div>
            <div class="payment-bar-bg">
              <div class="payment-bar-fill" :style="{ width: r.pct_kontribusi + '%' }"></div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Tab: Top Produk POS -->
    <div v-else-if="activeTab === 'produk'">
      <div class="pos-table-note" v-if="!produkRows.length">
        Tidak ada data untuk periode ini.
      </div>
      <table v-else class="pos-table">
        <thead>
          <tr>
            <th class="rank-col">#</th>
            <th>Produk</th>
            <th class="num">Qty Terjual</th>
            <th class="num">Total Omzet</th>
            <th class="num">Kontribusi</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(r, i) in produkRows" :key="i">
            <td class="rank-col">
              <span class="rank-badge" :class="i < 3 ? 'top' : ''">{{ i + 1 }}</span>
            </td>
            <td>
              <div class="item-name">{{ r.item_name }}</div>
              <div class="item-code">{{ r.item_code }}</div>
            </td>
            <td class="num">{{ r.total_qty.toLocaleString('id-ID') }}</td>
            <td class="num">{{ fmtRp(r.total_omzet) }}</td>
            <td class="num">
              <div class="pct-bar-wrap">
                <div class="pct-bar" :style="{ width: r.pct_kontribusi + '%' }"></div>
                <span class="pct-label">{{ r.pct_kontribusi }}%</span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

  </div>
</template>

<script setup>
import { ref } from 'vue'

defineProps({
  kasirRows:   { type: Array,   default: () => [] },
  paymentRows: { type: Array,   default: () => [] },
  produkRows:  { type: Array,   default: () => [] },
  loading:     { type: Boolean, default: false },
})

const activeTab = ref('kasir')

const tabs = [
  { id: 'kasir',   label: 'Per Kasir',         icon: 'bi bi-person-badge' },
  { id: 'payment', label: 'Metode Pembayaran',  icon: 'bi bi-credit-card' },
  { id: 'produk',  label: '🔥 Best Seller Menu', icon: 'bi bi-trophy' },
]

function fmtRp(n) {
  if (n == null || isNaN(n)) return '—'
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)} M`
  if (n >= 1_000_000)     return `Rp ${(n / 1_000_000).toFixed(1)} jt`
  return 'Rp ' + Math.round(n).toLocaleString('id-ID')
}

const paymentMeta = {
  cash:     { label: 'Tunai (Cash)',  icon: 'bi bi-cash-coin',    color: '#6366f1' },
  qris:     { label: 'QRIS',          icon: 'bi bi-qr-code',       color: '#059669' },
  transfer: { label: 'Transfer Bank', icon: 'bi bi-bank',           color: '#2563eb' },
  debit:    { label: 'Debit Card',    icon: 'bi bi-credit-card-2-front', color: '#d97706' },
}
function paymentLabel(m) { return paymentMeta[m]?.label || m }
function paymentIcon(m)  { return paymentMeta[m]?.icon  || 'bi bi-cash' }
function paymentColor(m) { return paymentMeta[m]?.color || '#6b7280' }
</script>

<style scoped>
.pos-tabel-wrap {
  background: #fff; border-radius: 14px; border: 1px solid #e5e7eb;
  padding: 1.25rem; box-shadow: 0 1px 6px rgba(0,0,0,0.05);
}
:global([data-theme="dark"]) .pos-tabel-wrap { background: #1e2130; border-color: #2e3347; }

/* ── Tabs ─────────────────────────────────────────────────────── */
.pos-tabs {
  display: flex; gap: 0.4rem; margin-bottom: 1.25rem;
  border-bottom: 1px solid #e5e7eb; padding-bottom: 0.75rem; flex-wrap: wrap;
}
:global([data-theme="dark"]) .pos-tabs { border-color: #2e3347; }
.pos-tab-btn {
  border: 1px solid #e5e7eb; background: #f9fafb; color: #6b7280;
  border-radius: 9px; padding: 0.35rem 1rem; font-size: 0.8rem; font-weight: 600;
  cursor: pointer; display: flex; align-items: center; transition: all 0.15s;
}
.pos-tab-btn:hover { border-color: #6366f1; color: #6366f1; }
.pos-tab-btn.active {
  background: linear-gradient(135deg, #6366f1, #7c3aed);
  color: #fff; border-color: transparent;
  box-shadow: 0 2px 8px rgba(99,102,241,0.3);
}
:global([data-theme="dark"]) .pos-tab-btn { background: #252840; border-color: #3a3f5c; color: #9ca3af; }
:global([data-theme="dark"]) .pos-tab-btn.active { border-color: transparent; }

/* ── Table ───────────────────────────────────────────────────── */
.pos-table-note { padding: 2rem; text-align: center; color: #9ca3af; font-size: 0.85rem; }
.pos-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
.pos-table th {
  padding: 0.55rem 0.75rem; font-size: 0.7rem; font-weight: 700;
  color: #6b7280; text-transform: uppercase; letter-spacing: 0.04em;
  border-bottom: 2px solid #e5e7eb; text-align: left;
}
.pos-table th.num, .pos-table td.num { text-align: right; }
:global([data-theme="dark"]) .pos-table th { color: #9ca3af; border-color: #2e3347; }
.pos-table td { padding: 0.55rem 0.75rem; border-bottom: 1px solid #f3f4f6; color: #1f2937; }
:global([data-theme="dark"]) .pos-table td { border-color: #252840; color: #e2e8f0; }
.pos-table tbody tr:hover { background: #f5f3ff; }
:global([data-theme="dark"]) .pos-table tbody tr:hover { background: #252840; }

.kasir-name { font-weight: 600; }
.diskon { color: #d97706; }
.rank-col { width: 42px; text-align: center !important; }
.rank-badge {
  display: inline-block; width: 22px; height: 22px; border-radius: 50%;
  background: #f3f4f6; color: #6b7280; font-size: 0.72rem; font-weight: 700;
  line-height: 22px; text-align: center;
}
.rank-badge.top { background: linear-gradient(135deg,#f59e0b,#d97706); color: #fff; }
.item-name { font-weight: 600; color: #1f2937; }
:global([data-theme="dark"]) .item-name { color: #f1f5f9; }
.item-code { font-size: 0.7rem; color: #9ca3af; }

/* ── Progress bar ────────────────────────────────────────────── */
.pct-bar-wrap {
  display: flex; align-items: center; gap: 0.4rem; justify-content: flex-end;
}
.pct-bar {
  height: 6px; border-radius: 3px; max-width: 80px;
  background: linear-gradient(90deg, #6366f1, #7c3aed);
}
.pct-label { font-size: 0.72rem; font-weight: 700; color: #6b7280; min-width: 36px; text-align: right; }

/* ── Loading skeleton ─────────────────────────────────────────── */
.pos-skeleton-rows { display: flex; flex-direction: column; gap: 0.6rem; padding: 0.5rem 0; }
.pos-sk-row {
  height: 38px; border-radius: 8px;
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
}
@keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }

/* ── Payment Cards ─────────────────────────────────────────────── */
.payment-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 1rem;
}
.payment-card {
  border: 1px solid #e5e7eb; border-radius: 12px;
  padding: 1rem; display: flex; gap: 0.85rem;
  align-items: flex-start; transition: box-shadow 0.15s;
}
.payment-card:hover { box-shadow: 0 4px 14px rgba(0,0,0,0.08); }
:global([data-theme="dark"]) .payment-card { border-color: #2e3347; }
.payment-icon {
  width: 42px; height: 42px; border-radius: 10px;
  background: var(--accent); display: flex; align-items: center;
  justify-content: center; color: #fff; font-size: 1.2rem; flex-shrink: 0;
}
.payment-info { flex: 1; }
.payment-method { font-size: 0.72rem; font-weight: 700; color: #6b7280; text-transform: uppercase; }
.payment-omzet  { font-size: 1.05rem; font-weight: 800; color: #111827; margin: 0.2rem 0; }
:global([data-theme="dark"]) .payment-omzet { color: #f1f5f9; }
.payment-meta   { font-size: 0.72rem; color: #9ca3af; margin-bottom: 0.5rem; }
.payment-bar-bg { height: 5px; background: #f3f4f6; border-radius: 3px; overflow: hidden; }
:global([data-theme="dark"]) .payment-bar-bg { background: #2e3347; }
.payment-bar-fill {
  height: 100%; border-radius: 3px;
  background: var(--accent);
  transition: width 0.5s ease;
}
</style>
