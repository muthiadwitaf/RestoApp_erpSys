<template>
  <div class="sotbl-wrapper">

    <!-- Header row: jumlah hasil + info -->
    <div class="sotbl-header">
      <span class="sotbl-count">
        <i class="bi bi-table me-1"></i>
        <template v-if="!loading">{{ rows.length }} Sales Order ditemukan</template>
        <template v-else>Memuat data…</template>
      </span>
    </div>

    <!-- Table -->
    <div class="sotbl-scroll">
      <table class="sotbl-table">
        <thead>
          <tr>
            <th>No. SO</th>
            <th>Tanggal</th>
            <th>Pelanggan</th>
            <th>Cabang</th>
            <th>Salesperson</th>
            <th class="text-right">Nilai SO</th>
            <th class="text-center" style="min-width:160px">Progress Kirim</th>
            <th class="text-center">Aging</th>
            <th class="text-center">Status</th>
          </tr>
        </thead>
        <tbody>
          <!-- Loading skeleton rows -->
          <template v-if="loading">
            <tr v-for="i in 7" :key="'sk-'+i" class="sotbl-skeleton-row">
              <td v-for="j in 9" :key="j"><span class="sotbl-skeleton"></span></td>
            </tr>
          </template>

          <!-- No data -->
          <tr v-else-if="rows.length === 0">
            <td colspan="9" class="sotbl-empty">
              <i class="bi bi-inbox" style="font-size:1.5rem;opacity:.35;"></i>
              <div>Tidak ada data SO untuk filter yang dipilih</div>
            </td>
          </tr>

          <!-- Data rows -->
          <template v-else>
            <tr v-for="row in rows" :key="row.uuid" class="sotbl-row">
              <!-- No. SO — link ke detail -->
              <td>
                <a :href="`/app/sales/orders/${row.uuid}`" class="sotbl-so-link" target="_blank">
                  {{ row.number }}
                </a>
              </td>
              <!-- Tanggal -->
              <td class="sotbl-date">{{ fmtDate(row.date) }}</td>
              <!-- Pelanggan -->
              <td class="sotbl-customer">{{ row.customer_name || '—' }}</td>
              <!-- Cabang -->
              <td class="sotbl-branch">{{ row.branch_name || '—' }}</td>
              <!-- Salesperson -->
              <td class="sotbl-sp">{{ row.salesperson || '—' }}</td>
              <!-- Nilai SO -->
              <td class="text-right sotbl-nilai">{{ fmtRp(row.nilai_so) }}</td>
              <!-- Progress bar -->
              <td class="sotbl-progress-cell">
                <div class="sotbl-progress-bar-wrap">
                  <div
                    class="sotbl-progress-bar-fill"
                    :style="{ width: row.pct_delivered + '%' }"
                    :class="progressClass(row.pct_delivered)"
                  ></div>
                </div>
                <span class="sotbl-progress-label">
                  {{ row.delivered_qty }} / {{ row.total_qty }} qty
                  <span class="sotbl-progress-pct">({{ row.pct_delivered }}%)</span>
                </span>
              </td>
              <!-- Aging -->
              <td class="text-center">
                <span v-if="row.aging_days === null" class="sotbl-aging-done">—</span>
                <span v-else-if="row.is_late" class="sotbl-badge sotbl-badge-red">
                  {{ row.aging_days }} hari
                </span>
                <span v-else class="sotbl-aging-ok">{{ row.aging_days }} hari</span>
              </td>
              <!-- Status badge -->
              <td class="text-center">
                <span class="sotbl-badge" :class="statusClass(row.status)">
                  {{ statusLabel(row.status) }}
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
defineProps({
  rows:    { type: Array,   default: () => [] },
  loading: { type: Boolean, default: false },
})

// ── Formatters ─────────────────────────────────────────────
function fmtRp(n) {
  if (n === null || n === undefined) return '—'
  return 'Rp ' + Math.round(n).toLocaleString('id-ID')
}
function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ── Status mapping ──────────────────────────────────────────
const STATUS_MAP = {
  draft:     { label: 'Draft',     cls: 'sotbl-badge-gray'  },
  pending:   { label: 'Pending',   cls: 'sotbl-badge-amber' },
  approved:  { label: 'Approved',  cls: 'sotbl-badge-blue'  },
  partial:   { label: 'Partial',   cls: 'sotbl-badge-indigo'},
  processed: { label: 'Diproses', cls: 'sotbl-badge-purple'},
  paid:      { label: 'Lunas',     cls: 'sotbl-badge-green' },
  rejected:  { label: 'Ditolak',  cls: 'sotbl-badge-red'   },
}
function statusLabel(s) { return STATUS_MAP[s]?.label || s }
function statusClass(s) { return STATUS_MAP[s]?.cls   || '' }

// ── Progress bar color ──────────────────────────────────────
function progressClass(pct) {
  if (pct >= 100) return 'fill-green'
  if (pct >= 50)  return 'fill-blue'
  if (pct > 0)    return 'fill-amber'
  return 'fill-gray'
}
</script>

<style scoped>
.sotbl-wrapper {
  background: #fff;
  border-radius: 14px;
  border: 1px solid #e5e7eb;
  box-shadow: 0 1px 6px rgba(0,0,0,0.05);
  overflow: hidden;
}
:global([data-theme="dark"]) .sotbl-wrapper { background: #1e2130; border-color: #2e3347; }

/* Header */
.sotbl-header {
  padding: 0.75rem 1.25rem;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  align-items: center;
}
:global([data-theme="dark"]) .sotbl-header { border-color: #2e3347; }
.sotbl-count { font-size: 0.8rem; font-weight: 600; color: #6b7280; }
:global([data-theme="dark"]) .sotbl-count { color: #9ca3af; }

/* Scroll + table */
.sotbl-scroll { overflow-x: auto; }
.sotbl-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.82rem;
}
.sotbl-table thead tr {
  background: #f3f4f6;
}
:global([data-theme="dark"]) .sotbl-table thead tr { background: #252840; }
.sotbl-table th {
  padding: 0.65rem 1rem;
  font-size: 0.72rem;
  font-weight: 700;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  white-space: nowrap;
  border-bottom: 1px solid #e5e7eb;
}
:global([data-theme="dark"]) .sotbl-table th { border-color: #2e3347; color: #9ca3af; }
.sotbl-table td {
  padding: 0.65rem 1rem;
  border-bottom: 1px solid #f3f4f6;
  color: #1f2937;
  vertical-align: middle;
}
:global([data-theme="dark"]) .sotbl-table td { border-color: #2e3347; color: #e2e8f0; }
.sotbl-row:hover td { background: #f9fafb; }
:global([data-theme="dark"]) .sotbl-row:hover td { background: #252840; }

/* Link SO */
.sotbl-so-link {
  color: #6366f1;
  font-weight: 700;
  text-decoration: none;
  font-size: 0.8rem;
}
.sotbl-so-link:hover { text-decoration: underline; }

/* Text alignment helpers */
.text-right  { text-align: right; }
.text-center { text-align: center; }

.sotbl-nilai { font-weight: 700; white-space: nowrap; }
.sotbl-date  { white-space: nowrap; color: #6b7280; }
:global([data-theme="dark"]) .sotbl-date { color: #9ca3af; }
.sotbl-branch, .sotbl-sp { font-size: 0.78rem; color: #6b7280; }
:global([data-theme="dark"]) .sotbl-branch,
:global([data-theme="dark"]) .sotbl-sp { color: #9ca3af; }

/* Progress bar */
.sotbl-progress-cell { min-width: 160px; }
.sotbl-progress-bar-wrap {
  height: 6px;
  background: #e5e7eb;
  border-radius: 99px;
  overflow: hidden;
  margin-bottom: 3px;
}
:global([data-theme="dark"]) .sotbl-progress-bar-wrap { background: #374151; }
.sotbl-progress-bar-fill {
  height: 100%;
  border-radius: 99px;
  transition: width 0.4s ease;
}
.fill-green  { background: #22c55e; }
.fill-blue   { background: #3b82f6; }
.fill-amber  { background: #f59e0b; }
.fill-gray   { background: #9ca3af; }

.sotbl-progress-label {
  font-size: 0.72rem;
  color: #6b7280;
  white-space: nowrap;
}
:global([data-theme="dark"]) .sotbl-progress-label { color: #9ca3af; }
.sotbl-progress-pct { font-weight: 700; color: #374151; }
:global([data-theme="dark"]) .sotbl-progress-pct { color: #d1d5db; }

/* Aging */
.sotbl-aging-ok   { font-size: 0.78rem; color: #6b7280; }
.sotbl-aging-done { font-size: 0.78rem; color: #d1d5db; }
:global([data-theme="dark"]) .sotbl-aging-done { color: #4b5563; }

/* Status badges */
.sotbl-badge {
  display: inline-block;
  padding: 0.2rem 0.6rem;
  border-radius: 99px;
  font-size: 0.7rem;
  font-weight: 700;
  white-space: nowrap;
}
.sotbl-badge-gray   { background: #f3f4f6; color: #6b7280; }
.sotbl-badge-amber  { background: #fef3c7; color: #d97706; }
.sotbl-badge-blue   { background: #dbeafe; color: #2563eb; }
.sotbl-badge-indigo { background: #e0e7ff; color: #4338ca; }
.sotbl-badge-purple { background: #f3e8ff; color: #7c3aed; }
.sotbl-badge-green  { background: #dcfce7; color: #16a34a; }
.sotbl-badge-red    { background: #fee2e2; color: #dc2626; }
:global([data-theme="dark"]) .sotbl-badge-gray   { background: #374151; color: #9ca3af; }
:global([data-theme="dark"]) .sotbl-badge-amber  { background: #451a03; color: #fbbf24; }
:global([data-theme="dark"]) .sotbl-badge-blue   { background: #1e3a5f; color: #60a5fa; }
:global([data-theme="dark"]) .sotbl-badge-indigo { background: #1e1b4b; color: #818cf8; }
:global([data-theme="dark"]) .sotbl-badge-purple { background: #3b0764; color: #c084fc; }
:global([data-theme="dark"]) .sotbl-badge-green  { background: #052e16; color: #4ade80; }
:global([data-theme="dark"]) .sotbl-badge-red    { background: #450a0a; color: #f87171; }

/* Skeleton */
.sotbl-skeleton-row td { padding: 0.8rem 1rem; }
.sotbl-skeleton {
  display: inline-block;
  width: 80%;
  height: 0.75rem;
  background: linear-gradient(90deg, #e5e7eb 25%, #f3f4f6 50%, #e5e7eb 75%);
  background-size: 200% 100%;
  animation: shimmer 1.2s infinite;
  border-radius: 6px;
}
:global([data-theme="dark"]) .sotbl-skeleton {
  background: linear-gradient(90deg, #2e3347 25%, #374151 50%, #2e3347 75%);
  background-size: 200% 100%;
}
@keyframes shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* Empty state */
.sotbl-empty {
  text-align: center;
  padding: 3rem 1rem !important;
  color: #9ca3af;
  font-size: 0.85rem;
  display: table-cell;
}
.sotbl-empty i { display: block; margin-bottom: 0.5rem; }
</style>
