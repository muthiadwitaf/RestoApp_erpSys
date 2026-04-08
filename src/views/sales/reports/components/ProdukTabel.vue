<template>
  <div class="pktbl-wrapper">

    <div class="pktbl-header">
      <span class="pktbl-count">
        <i class="bi bi-table me-1"></i>
        <template v-if="!loading">{{ rows.length }} produk ditemukan</template>
        <template v-else>Memuat data…</template>
      </span>
      <span class="pktbl-sort-hint">Klik header kolom untuk pengurutan</span>
    </div>

    <div class="pktbl-scroll">
      <table class="pktbl-table">
        <thead>
          <tr>
            <th @click="sort('rank')" class="sortable text-center" style="width:50px">
              # <i :class="sortIcon('rank')"></i>
            </th>
            <th>Produk</th>
            <th>Kategori</th>
            <th @click="sort('total_qty')" class="sortable text-center">
              Qty <i :class="sortIcon('total_qty')"></i>
            </th>
            <th @click="sort('total_omzet')" class="sortable text-right">
              Total Omzet <i :class="sortIcon('total_omzet')"></i>
            </th>
            <th class="text-right">HPP Cost</th>
            <th @click="sort('margin_pct')" class="sortable text-right">
              Margin <i :class="sortIcon('margin_pct')"></i>
            </th>
            <th class="text-center" style="min-width:110px">Channel</th>
            <th class="text-center">Status</th>
          </tr>
        </thead>
        <tbody>
          <!-- Skeleton -->
          <template v-if="loading">
            <tr v-for="i in 8" :key="'sk-'+i" class="pktbl-skeleton-row">
              <td v-for="j in 9" :key="j"><span class="pktbl-skeleton"></span></td>
            </tr>
          </template>

          <!-- Empty -->
          <tr v-else-if="sortedRows.length === 0">
            <td colspan="9" class="pktbl-empty">
              <i class="bi bi-inbox" style="font-size:1.5rem;opacity:.35;"></i>
              <div>Tidak ada data produk untuk filter yang dipilih</div>
            </td>
          </tr>

          <!-- Data -->
          <template v-else>
            <tr v-for="row in sortedRows" :key="row.item_uuid" class="pktbl-row">
              <!-- Rank -->
              <td class="text-center">
                <span class="pktbl-rank" :class="rankClass(row.rank)">
                  #{{ row.rank }}
                </span>
              </td>
              <!-- Produk -->
              <td>
                <div class="pktbl-item-name">{{ row.item_name }}</div>
                <div class="pktbl-item-code">{{ row.item_code }}</div>
              </td>
              <!-- Kategori -->
              <td class="pktbl-dim">{{ row.category_name }}</td>
              <!-- Qty -->
              <td class="text-center pktbl-bold">{{ fmtQty(row.total_qty) }}</td>
              <!-- Omzet -->
              <td class="text-right pktbl-bold">{{ fmtRp(row.total_omzet) }}</td>
              <!-- HPP Cost -->
              <td class="text-right pktbl-dim">{{ row.hpp_cost > 0 ? fmtRp(row.hpp_cost) : '—' }}</td>
              <!-- Margin -->
              <td class="text-right">
                <div class="pktbl-margin-val" :class="marginClass(row.margin_pct)">
                  {{ row.total_omzet > 0 ? row.margin_pct.toFixed(1) + '%' : '—' }}
                </div>
                <div class="pktbl-margin-bar" v-if="row.total_omzet > 0">
                  <div class="pktbl-margin-fill" :class="marginClass(row.margin_pct)"
                       :style="{ width: Math.min(Math.max(row.margin_pct, 0), 100) + '%' }"></div>
                </div>
              </td>
              <!-- Channel breakdown -->
              <td class="pktbl-channel-cell">
                <template v-if="row.total_omzet > 0">
                  <div class="pktbl-channel-bar">
                    <div class="pktbl-ch-so" :style="{ width: chanPct(row, 'so') + '%' }"
                         :title="`SO: ${fmtRp(row.omzet_so)}`"></div>
                    <div class="pktbl-ch-pos" :style="{ width: chanPct(row, 'pos') + '%' }"
                         :title="`POS: ${fmtRp(row.omzet_pos)}`"></div>
                  </div>
                  <div class="pktbl-channel-legend">
                    <span v-if="row.omzet_so  > 0" class="leg-so">SO</span>
                    <span v-if="row.omzet_pos > 0" class="leg-pos">POS</span>
                  </div>
                </template>
                <span v-else class="pktbl-dim">—</span>
              </td>
              <!-- Status badge -->
              <td class="text-center">
                <span v-if="row.rank <= 10 && !row.is_slow_moving" class="pktbl-badge pktbl-badge-hot">
                  🔥 Terlaris
                </span>
                <span v-else-if="row.is_slow_moving" class="pktbl-badge pktbl-badge-slow">
                  🐢 Slow
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
const sortKey = ref('rank')
const sortDir = ref('asc')

function sort(key) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortKey.value = key
    sortDir.value = key === 'rank' ? 'asc' : 'desc'
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
      return sortDir.value === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
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
function fmtQty(n) {
  if (!n) return '0'
  return Number(n).toLocaleString('id-ID')
}

// ── Rank badge ───────────────────────────────────────────────
function rankClass(rank) {
  if (rank === 1) return 'rank-gold'
  if (rank === 2) return 'rank-silver'
  if (rank === 3) return 'rank-bronze'
  return ''
}

// ── Margin class ─────────────────────────────────────────────
function marginClass(pct) {
  if (pct >= 30) return 'mg-good'
  if (pct >= 15) return 'mg-warn'
  return 'mg-bad'
}

// ── Channel bar helper ───────────────────────────────────────
function chanPct(row, channel) {
  if (!row.total_omzet) return 0
  const val = channel === 'so' ? row.omzet_so : row.omzet_pos
  return Math.round((val / row.total_omzet) * 100)
}
</script>

<style scoped>
.pktbl-wrapper {
  background: #fff; border-radius: 14px; border: 1px solid #e5e7eb;
  box-shadow: 0 1px 6px rgba(0,0,0,0.05); overflow: hidden;
}
:global([data-theme="dark"]) .pktbl-wrapper { background: #1e2130; border-color: #2e3347; }

.pktbl-header {
  padding: 0.75rem 1.25rem; border-bottom: 1px solid #e5e7eb;
  display: flex; align-items: center; justify-content: space-between;
}
:global([data-theme="dark"]) .pktbl-header { border-color: #2e3347; }
.pktbl-count     { font-size: 0.8rem; font-weight: 600; color: #6b7280; }
.pktbl-sort-hint { font-size: 0.7rem; color: #9ca3af; }

.pktbl-scroll { overflow-x: auto; }
.pktbl-table  { width: 100%; border-collapse: collapse; font-size: 0.82rem; }

.pktbl-table thead tr { background: #f3f4f6; }
:global([data-theme="dark"]) .pktbl-table thead tr { background: #252840; }
.pktbl-table th {
  padding: 0.65rem 0.85rem; font-size: 0.72rem; font-weight: 700;
  color: #6b7280; text-transform: uppercase; letter-spacing: 0.04em;
  white-space: nowrap; border-bottom: 1px solid #e5e7eb; user-select: none;
}
:global([data-theme="dark"]) .pktbl-table th { border-color: #2e3347; color: #9ca3af; }
.pktbl-table th.sortable { cursor: pointer; }
.pktbl-table th.sortable:hover { color: #22c55e; }

.pktbl-table td {
  padding: 0.65rem 0.85rem; border-bottom: 1px solid #f3f4f6;
  color: #1f2937; vertical-align: middle;
}
:global([data-theme="dark"]) .pktbl-table td { border-color: #2e3347; color: #e2e8f0; }
.pktbl-row:hover td { background: #f0fdf4; }
:global([data-theme="dark"]) .pktbl-row:hover td { background: #1a2e1f; }

/* Rank badge */
.pktbl-rank {
  display: inline-block; padding: 0.15rem 0.5rem; border-radius: 99px;
  font-size: 0.72rem; font-weight: 800; background: #f3f4f6; color: #6b7280;
}
:global([data-theme="dark"]) .pktbl-rank { background: #252840; color: #9ca3af; }
.rank-gold   { background: #fef9c3; color: #854d0e; border: 1px solid #fde047; }
.rank-silver { background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; }
.rank-bronze { background: #fef3c7; color: #92400e; border: 1px solid #fcd34d; }

/* Item name */
.pktbl-item-name { font-weight: 700; font-size: 0.82rem; color: #111827; }
:global([data-theme="dark"]) .pktbl-item-name { color: #f3f4f6; }
.pktbl-item-code { font-size: 0.7rem; color: #9ca3af; margin-top: 1px; }

/* Alignment */
.text-right   { text-align: right; }
.text-center  { text-align: center; }
.pktbl-bold   { font-weight: 700; }
.pktbl-dim    { color: #9ca3af; }
:global([data-theme="dark"]) .pktbl-dim { color: #6b7280; }
.text-muted   { opacity: 0.4; }

/* Margin bar */
.pktbl-margin-val { font-weight: 700; font-size: 0.82rem; margin-bottom: 3px; }
.pktbl-margin-bar {
  height: 5px; border-radius: 99px; background: #e5e7eb; overflow: hidden; width: 60px; float: right;
}
:global([data-theme="dark"]) .pktbl-margin-bar { background: #374151; }
.pktbl-margin-fill { height: 100%; border-radius: 99px; transition: width 0.3s; }
.mg-good .pktbl-margin-fill, .mg-good { color: #16a34a; }
.mg-warn .pktbl-margin-fill, .mg-warn { color: #d97706; }
.mg-bad  .pktbl-margin-fill, .mg-bad  { color: #dc2626; }
.mg-good.pktbl-margin-fill { background: #22c55e; }
.mg-warn.pktbl-margin-fill { background: #f59e0b; }
.mg-bad.pktbl-margin-fill  { background: #ef4444; }

/* Channel bar */
.pktbl-channel-cell { min-width: 110px; }
.pktbl-channel-bar  {
  height: 7px; border-radius: 99px; overflow: hidden;
  background: #e5e7eb; display: flex; margin-bottom: 3px;
}
:global([data-theme="dark"]) .pktbl-channel-bar { background: #374151; }
.pktbl-ch-so  { background: #3b82f6; height: 100%; transition: width 0.3s; }
.pktbl-ch-pos { background: #8b5cf6; height: 100%; transition: width 0.3s; }
.pktbl-channel-legend { display: flex; gap: 4px; font-size: 0.62rem; font-weight: 700; }
.leg-so  { color: #2563eb; }
.leg-pos { color: #7c3aed; }

/* Status badge */
.pktbl-badge {
  display: inline-block; padding: 0.2rem 0.6rem; border-radius: 99px;
  font-size: 0.68rem; font-weight: 700; white-space: nowrap;
}
.pktbl-badge-hot  { background: #fef3c7; color: #92400e; border: 1px solid #fcd34d; }
.pktbl-badge-slow { background: #f1f5f9; color: #64748b; border: 1px solid #cbd5e1; }
:global([data-theme="dark"]) .pktbl-badge-hot  { background: #422006; color: #fde047; border-color: #713f12; }
:global([data-theme="dark"]) .pktbl-badge-slow { background: #1e293b; color: #94a3b8; border-color: #334155; }

/* Skeleton + empty */
.pktbl-skeleton-row td { padding: 0.8rem 0.85rem; }
.pktbl-skeleton {
  display: inline-block; width: 75%; height: 0.75rem; border-radius: 6px;
  background: linear-gradient(90deg, #e5e7eb 25%, #f3f4f6 50%, #e5e7eb 75%);
  background-size: 200% 100%; animation: shimmer 1.2s infinite;
}
:global([data-theme="dark"]) .pktbl-skeleton {
  background: linear-gradient(90deg, #2e3347 25%, #374151 50%, #2e3347 75%);
  background-size: 200% 100%;
}
@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
.pktbl-empty {
  text-align: center; padding: 3rem 1rem !important;
  color: #9ca3af; font-size: 0.85rem;
}
.pktbl-empty i { display: block; margin-bottom: 0.5rem; }
</style>
