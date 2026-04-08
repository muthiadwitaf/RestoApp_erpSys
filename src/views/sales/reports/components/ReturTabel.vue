<template>
  <div class="retur-tabel-wrapper">

    <!-- Tab navigation -->
    <ul class="retur-tab-list" role="tablist">
      <li>
        <button class="retur-tab-btn" :class="{ active: tab === 'produk' }"
                @click="tab = 'produk'" id="rtab-produk">
          <i class="bi bi-box-seam me-2"></i>Per Produk
          <span class="retur-tab-badge">{{ itemRows.length }}</span>
        </button>
      </li>
      <li>
        <button class="retur-tab-btn" :class="{ active: tab === 'pelanggan' }"
                @click="tab = 'pelanggan'" id="rtab-pelanggan">
          <i class="bi bi-people me-2"></i>Per Pelanggan
          <span class="retur-tab-badge">{{ customerRows.length }}</span>
        </button>
      </li>
      <li>
        <button class="retur-tab-btn" :class="{ active: tab === 'alasan' }"
                @click="tab = 'alasan'" id="rtab-alasan">
          <i class="bi bi-chat-left-text me-2"></i>Alasan Retur
          <span class="retur-tab-badge">{{ reasonRows.length }}</span>
        </button>
      </li>
    </ul>

    <!-- Loading skeleton -->
    <div v-if="loading" class="retur-tbl-loading">
      <div class="retur-skeleton-row" v-for="n in 5" :key="n"></div>
    </div>

    <!-- Tab: Per Produk -->
    <div v-else-if="tab === 'produk'">
      <template v-if="itemRows.length > 0">
        <div class="retur-tbl-scroll">
          <table class="retur-tbl">
            <thead>
              <tr>
                <th>#</th>
                <th>Produk</th>
                <th>Kategori</th>
                <th class="text-end">Qty Retur</th>
                <th class="text-end">Nilai Retur</th>
                <th class="text-end">% Total</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, i) in itemRows" :key="row.item_uuid">
                <td class="retur-tbl-rank">{{ i + 1 }}</td>
                <td>
                  <div class="retur-item-name">{{ row.item_name }}</div>
                  <div class="retur-item-code">{{ row.item_code }}</div>
                </td>
                <td>{{ row.category_name }}</td>
                <td class="text-end fw-semibold">{{ row.total_qty_retur.toLocaleString('id-ID') }}</td>
                <td class="text-end fw-semibold">{{ fmtRp(row.total_nilai_retur) }}</td>
                <td class="text-end">
                  <span class="retur-pct-badge">{{ row.pct_dari_total.toFixed(1) }}%</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
      <div v-else class="retur-empty">
        <i class="bi bi-inbox fs-2 d-block mb-2"></i>
        Tidak ada data retur per produk untuk periode ini.
      </div>
    </div>

    <!-- Tab: Per Pelanggan -->
    <div v-else-if="tab === 'pelanggan'">
      <template v-if="customerRows.length > 0">
        <div class="retur-tbl-scroll">
          <table class="retur-tbl">
            <thead>
              <tr>
                <th>#</th>
                <th>Pelanggan</th>
                <th class="text-end">Jml Dok</th>
                <th class="text-end">Nilai Retur</th>
                <th class="text-end">% Total</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, i) in customerRows" :key="row.customer_uuid ?? i">
                <td class="retur-tbl-rank">{{ i + 1 }}</td>
                <td>
                  <div class="retur-item-name">{{ row.customer_name }}</div>
                  <div class="retur-item-code">{{ row.customer_code }}</div>
                </td>
                <td class="text-end fw-semibold">{{ row.total_retur }}</td>
                <td class="text-end fw-semibold">{{ fmtRp(row.total_nilai_retur) }}</td>
                <td class="text-end">
                  <span class="retur-pct-badge">{{ row.pct_dari_total.toFixed(1) }}%</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
      <div v-else class="retur-empty">
        <i class="bi bi-inbox fs-2 d-block mb-2"></i>
        Tidak ada data retur per pelanggan untuk periode ini.
      </div>
    </div>

    <!-- Tab: Alasan -->
    <div v-else-if="tab === 'alasan'">
      <template v-if="reasonRows.length > 0">
        <div class="retur-tbl-scroll">
          <table class="retur-tbl">
            <thead>
              <tr>
                <th>Alasan</th>
                <th class="text-end">Frekuensi</th>
                <th class="text-end">Nilai Retur</th>
                <th class="text-end">% Frekuensi</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in reasonRows" :key="row.reason">
                <td>
                  <span class="retur-reason-badge">{{ row.reason }}</span>
                </td>
                <td class="text-end fw-semibold">{{ row.total_count }}</td>
                <td class="text-end fw-semibold">{{ fmtRp(row.total_nilai) }}</td>
                <td class="text-end">
                  <span class="retur-pct-badge">{{ freqPct(row.total_count) }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
      <div v-else class="retur-empty">
        <i class="bi bi-inbox fs-2 d-block mb-2"></i>
        Tidak ada data alasan retur untuk periode ini.
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  itemRows:     { type: Array, default: () => [] },
  customerRows: { type: Array, default: () => [] },
  reasonRows:   { type: Array, default: () => [] },
  loading:      { type: Boolean, default: false },
})

const tab = ref('produk')

const totalFreq = computed(() =>
  props.reasonRows.reduce((s, r) => s + (r.total_count || 0), 0)
)

function freqPct(count) {
  if (!totalFreq.value) return '—'
  return ((count / totalFreq.value) * 100).toFixed(1) + '%'
}

function fmtRp(n) {
  if (n == null || isNaN(n)) return '—'
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)} M`
  if (n >= 1_000_000)     return `Rp ${(n / 1_000_000).toFixed(1)} jt`
  return 'Rp ' + Math.round(n).toLocaleString('id-ID')
}
</script>

<style scoped>
.retur-tabel-wrapper {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  padding: 0;
  box-shadow: 0 1px 6px rgba(0,0,0,0.05);
  overflow: hidden;
}
:global([data-theme="dark"]) .retur-tabel-wrapper { background: #1e2130; border-color: #2e3347; }

/* Tab list */
.retur-tab-list {
  list-style: none; margin: 0; padding: 0;
  display: flex; gap: 0;
  border-bottom: 1px solid #e5e7eb;
  background: #f9fafb;
}
:global([data-theme="dark"]) .retur-tab-list { background: #252840; border-color: #2e3347; }

.retur-tab-btn {
  background: none; border: none;
  padding: 0.75rem 1.25rem;
  font-size: 0.82rem; font-weight: 600;
  color: #6b7280; cursor: pointer;
  display: flex; align-items: center;
  border-bottom: 2px solid transparent;
  transition: all 0.15s;
}
.retur-tab-btn:hover { color: #6366f1; }
.retur-tab-btn.active {
  color: #6366f1;
  border-bottom-color: #6366f1;
  background: #fff;
}
:global([data-theme="dark"]) .retur-tab-btn.active { background: #1e2130; }
.retur-tab-badge {
  margin-left: 0.4rem;
  background: #e0e7ff; color: #4338ca;
  border-radius: 10px; padding: 0.1rem 0.5rem;
  font-size: 0.68rem; font-weight: 700;
}
.retur-tab-btn.active .retur-tab-badge { background: #6366f1; color: #fff; }

/* Table */
.retur-tbl-scroll { overflow-x: auto; }
.retur-tbl {
  width: 100%; border-collapse: collapse;
  font-size: 0.83rem;
}
.retur-tbl th {
  background: #f9fafb; color: #6b7280;
  font-size: 0.72rem; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.04em; padding: 0.65rem 1rem;
  border-bottom: 1px solid #e5e7eb; white-space: nowrap;
}
:global([data-theme="dark"]) .retur-tbl th { background: #252840; color: #9ca3af; border-color: #2e3347; }
.retur-tbl td {
  padding: 0.65rem 1rem;
  border-bottom: 1px solid #f3f4f6;
  color: #374151;
}
:global([data-theme="dark"]) .retur-tbl td { color: #d1d5db; border-color: #2e3347; }
.retur-tbl tbody tr:hover { background: #f9fafb; }
:global([data-theme="dark"]) .retur-tbl tbody tr:hover { background: #252840; }
.retur-tbl tbody tr:last-child td { border-bottom: none; }

.retur-tbl-rank {
  width: 32px; text-align: center;
  color: #9ca3af; font-weight: 700; font-size: 0.78rem;
}
.retur-item-name { font-weight: 600; color: #111827; }
:global([data-theme="dark"]) .retur-item-name { color: #f1f5f9; }
.retur-item-code { font-size: 0.72rem; color: #9ca3af; margin-top: 1px; }

.retur-pct-badge {
  background: #fef3c7; color: #92400e;
  border-radius: 8px; padding: 0.15rem 0.55rem;
  font-size: 0.72rem; font-weight: 700;
}
.retur-reason-badge {
  display: inline-block;
  background: #fee2e2; color: #991b1b;
  border-radius: 8px; padding: 0.2rem 0.65rem;
  font-size: 0.78rem; font-weight: 600;
}

/* Loading skeletons */
.retur-tbl-loading { padding: 1rem; }
.retur-skeleton-row {
  height: 2.2rem; border-radius: 8px; margin-bottom: 0.5rem;
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
}
@keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }

.retur-empty {
  text-align: center; padding: 2.5rem 1rem;
  color: #9ca3af; font-size: 0.88rem;
}
.text-end  { text-align: right; }
.fw-semibold { font-weight: 600; }
</style>
