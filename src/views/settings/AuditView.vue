<template>
  <div>
    <div class="page-header">
      <div><h1>Audit Trail</h1><span class="breadcrumb-custom">Settings / Audit Log</span></div>
      <button class="btn btn-outline-success btn-sm" @click="exportExcel" :disabled="allAudit.length === 0">
        <i class="bi bi-file-earmark-spreadsheet me-1"></i>Export Excel
      </button>
    </div>
    <!-- Filters -->
    <div class="card mb-3">
      <div class="card-body py-2">
        <div class="row g-2 align-items-center">
          <div class="col-md-3">
            <div class="input-group input-group-sm">
              <span class="input-group-text"><i class="bi bi-search"></i></span>
              <input type="text" class="form-control" v-model="search" placeholder="Cari user / deskripsi...">
            </div>
          </div>
          <div class="col-md-2">
            <select class="form-select form-select-sm" v-model="filterModule">
              <option value="">Semua Modul</option>
              <option v-for="m in modules" :key="m" :value="m">{{ moduleLabel(m) }}</option>
            </select>
          </div>
          <div class="col-md-2">
            <select class="form-select form-select-sm" v-model="filterAction">
              <option value="">Semua Aksi</option>
              <option v-for="a in actions" :key="a" :value="a">{{ a }}</option>
            </select>
          </div>
          <div class="col-md-2"><input type="date" class="form-control form-control-sm" v-model="dateFrom" placeholder="Dari"></div>
          <div class="col-md-2"><input type="date" class="form-control form-control-sm" v-model="dateTo" placeholder="Sampai"></div>
          <div class="col-md-1 text-end"><span class="badge bg-secondary">{{ totalCount }}</span></div>
        </div>
      </div>
    </div>
    <!-- Table -->
    <div class="card">
      <div class="card-body p-0">
        <div class="table-wrapper">
          <table class="table table-hover mb-0" id="audit-table">
            <thead><tr><th>Waktu</th><th>User</th><th>Email</th><th>Aksi</th><th>Modul</th><th>Deskripsi</th><th>Detail Perubahan</th></tr></thead>
            <tbody>
              <tr v-for="a in allAudit" :key="a.uuid">
                <td class="small text-nowrap">{{ formatDateTime(a.timestamp) }}</td>
                <td class="fw-semibold">{{ a.user_name }}</td>
                <td class="small text-muted">{{ a.user_email || '-' }}</td>
                <td><span class="badge" :class="actionBadge(a.action)">{{ a.action }}</span></td>
                <td><span class="badge bg-light text-dark border">{{ moduleLabel(a.module) }}</span></td>
                <td>{{ a.description }}</td>
                <td class="small text-muted">
                  <span v-if="a.details_json?.field">{{ a.details_json.field }}: <del>{{ a.details_json.oldValue }}</del> → <strong>{{ a.details_json.newValue }}</strong></span>
                  <span v-else-if="a.details_json?.reason" class="text-danger">{{ a.details_json.reason }}</span>
                  <span v-else>-</span>
                </td>
              </tr>
              <tr v-if="allAudit.length === 0">
                <td colspan="7" class="text-center text-muted py-4"><i class="bi bi-clipboard-x display-6 d-block mb-2"></i>Tidak ada data audit trail</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
    <!-- Pagination -->
    <nav v-if="totalPages > 1" class="mt-3 d-flex justify-content-center">
      <ul class="pagination pagination-sm mb-0">
        <li class="page-item" :class="{ disabled: currentPage === 1 }"><a class="page-link" href="#" @click.prevent="currentPage--">‹</a></li>
        <li v-for="p in totalPages" :key="p" class="page-item" :class="{ active: p === currentPage }"><a class="page-link" href="#" @click.prevent="currentPage = p">{{ p }}</a></li>
        <li class="page-item" :class="{ disabled: currentPage === totalPages }"><a class="page-link" href="#" @click.prevent="currentPage++">›</a></li>
      </ul>
    </nav>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useBranchStore } from '@/stores/branch'
import * as settingsApi from '@/services/settings/api'
import * as XLSX from 'xlsx'

const branchStore = useBranchStore()
const search = ref('')
const filterModule = ref('')
const filterAction = ref('')
const dateFrom = ref('')
const dateTo = ref('')
const currentPage = ref(1)
const pageSize = 20
const allAudit = ref([])
const totalCount = ref(0)

const modules = ['sales', 'purchasing', 'inventory', 'accounting', 'settings', 'pos']
const actions = ['create', 'edit', 'update', 'delete', 'approve', 'reject', 'submit', 'pay']

function moduleLabel(m) {
  return { sales: 'Penjualan', purchasing: 'Pembelian', inventory: 'Inventori', accounting: 'Akuntansi', settings: 'Pengaturan', pos: 'POS' }[m] || m
}

async function loadAudit() {
  try {
    const params = { page: currentPage.value, limit: pageSize, branch_id: branchStore.currentBranchId }
    if (filterModule.value) params.module = filterModule.value
    if (filterAction.value) params.action = filterAction.value
    if (dateFrom.value) params.from = dateFrom.value
    if (dateTo.value) params.to = dateTo.value
    if (search.value.trim()) params.search = search.value.trim()
    const { data } = await settingsApi.getAuditTrail(params)
    allAudit.value = data.data || data
    totalCount.value = data.total || allAudit.value.length
  } catch (e) { /* ignore */ }
}

onMounted(loadAudit)
watch([filterModule, filterAction, dateFrom, dateTo, currentPage], loadAudit)
watch(search, () => { currentPage.value = 1; loadAudit() })

const totalPages = computed(() => Math.ceil(totalCount.value / pageSize) || 1)

function formatDateTime(ts) { return new Date(ts).toLocaleString('id-ID') }
function actionBadge(action) {
  return { create: 'bg-success', edit: 'bg-warning text-dark', update: 'bg-warning text-dark', delete: 'bg-danger', approve: 'bg-primary', reject: 'bg-danger', submit: 'bg-info text-dark', pay: 'bg-success' }[action] || 'bg-secondary'
}

function exportExcel() {
  const now = new Date()
  const branchName = branchStore.currentBranch?.name || 'All'
  const titleRows = [['AUDIT TRAIL REPORT'], [`Cabang: ${branchName}`], [`Diekspor: ${now.toLocaleString('id-ID')}`],
    [`Filter: ${filterModule.value ? moduleLabel(filterModule.value) : 'Semua Modul'} | ${filterAction.value || 'Semua Aksi'}${dateFrom.value ? ' | Dari: ' + dateFrom.value : ''}${dateTo.value ? ' | Sampai: ' + dateTo.value : ''}`], []]
  const headers = ['No', 'Waktu', 'User', 'Email', 'Aksi', 'Modul', 'Deskripsi', 'Detail Perubahan']
  const rows = allAudit.value.map((a, i) => [i + 1, formatDateTime(a.timestamp), a.user_name, a.user_email || '-', a.action.charAt(0).toUpperCase() + a.action.slice(1), moduleLabel(a.module), a.description,
    a.details_json?.field ? `${a.details_json.field}: ${a.details_json.oldValue} → ${a.details_json.newValue}` : (a.details_json?.reason || '-')])
  const wsData = [...titleRows, headers, ...rows]
  const ws = XLSX.utils.aoa_to_sheet(wsData)
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 7 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: 7 } }, { s: { r: 2, c: 0 }, e: { r: 2, c: 7 } }, { s: { r: 3, c: 0 }, e: { r: 3, c: 7 } }]
  ws['!cols'] = [{ wch: 5 }, { wch: 22 }, { wch: 18 }, { wch: 28 }, { wch: 10 }, { wch: 14 }, { wch: 45 }, { wch: 35 }]
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Audit Trail')
  XLSX.writeFile(wb, `Audit_Trail_${branchName}_${now.toISOString().split('T')[0]}.xlsx`)
}
</script>
