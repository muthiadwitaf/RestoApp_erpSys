<template>
  <div class="platform-page">
    <nav class="platform-navbar">
      <div class="platform-nav-brand"><i class="bi bi-box-seam-fill"></i> Platform Admin</div>
      <div class="platform-nav-links">
        <a class="platform-nav-link" href="#" @click.prevent="navigateTo('/platform/companies')"><i class="bi bi-buildings me-1"></i>Kelola Company</a>
        <a class="platform-nav-link" href="#" @click.prevent="navigateTo('/platform/cross-report')"><i class="bi bi-graph-up-arrow me-1"></i>Laporan Lintas</a>
        <a class="platform-nav-link" href="#" @click.prevent="navigateTo('/platform/super-admins')"><i class="bi bi-shield-lock me-1"></i>Super Admins</a>
        <a class="platform-nav-link active" href="#"><i class="bi bi-journal-text me-1"></i>Audit Trail</a>
      </div>
      <button class="btn btn-sm btn-outline-light" @click="handleLogout"><i class="bi bi-box-arrow-right me-1"></i>Logout</button>
    </nav>
    <div class="platform-content">
    <div class="page-header">
      <div><h1>Platform Audit Trail</h1><span class="breadcrumb-custom">Super Admin / Audit Trail</span></div>
    </div>

    <!-- Filters -->
    <div class="card mb-3">
      <div class="card-body py-3">
        <div class="row g-2 align-items-end">
          <div class="col-md-3">
            <label class="form-label small fw-semibold mb-1">Company</label>
            <select class="form-select form-select-sm" v-model="filters.company_id" @change="loadData">
              <option value="">Semua Company</option>
              <option v-for="c in companies" :key="c.uuid" :value="c.uuid">{{ c.code }} - {{ c.name }}</option>
            </select>
          </div>
          <div class="col-md-2">
            <label class="form-label small fw-semibold mb-1">Periode</label>
            <select class="form-select form-select-sm" v-model="filters.preset" @change="onPresetChange">
              <option value="">Custom</option>
              <option value="today">Hari Ini</option>
              <option value="week">7 Hari Terakhir</option>
              <option value="month">Bulan Ini</option>
            </select>
          </div>
          <div class="col-md-2">
            <label class="form-label small fw-semibold mb-1">Dari</label>
            <input type="date" class="form-control form-control-sm" v-model="filters.from" :disabled="!!filters.preset" @change="loadData">
          </div>
          <div class="col-md-2">
            <label class="form-label small fw-semibold mb-1">Sampai</label>
            <input type="date" class="form-control form-control-sm" v-model="filters.to" :disabled="!!filters.preset" @change="loadData">
          </div>
          <div class="col-md-3">
            <label class="form-label small fw-semibold mb-1">Cari</label>
            <div class="input-group input-group-sm">
              <input type="text" class="form-control" v-model="filters.search" placeholder="Cari deskripsi / user..." @keyup.enter="loadData">
              <button class="btn btn-primary" @click="loadData"><i class="bi bi-search"></i></button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-if="!hasActiveFilter && !loading" class="card">
      <div class="card-body text-center py-5">
        <i class="bi bi-journal-text d-block mb-3" style="font-size: 3rem; color: #94a3b8;"></i>
        <h5 class="text-muted">Pilih Filter untuk Melihat Audit Trail</h5>
        <p class="text-secondary small mb-3">Gunakan filter Company, Periode, atau Cari di atas untuk menampilkan data audit trail.</p>
        <div class="d-flex gap-2 justify-content-center flex-wrap">
          <button class="btn btn-outline-primary btn-sm" @click="applyPreset('today')"><i class="bi bi-calendar-day me-1"></i>Hari Ini</button>
          <button class="btn btn-outline-primary btn-sm" @click="applyPreset('week')"><i class="bi bi-calendar-week me-1"></i>7 Hari Terakhir</button>
          <button class="btn btn-outline-primary btn-sm" @click="applyPreset('month')"><i class="bi bi-calendar-month me-1"></i>Bulan Ini</button>
        </div>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="text-center py-5"><div class="spinner-border text-primary"></div></div>

    <!-- Results -->
    <div v-if="hasActiveFilter && !loading">
      <div class="d-flex justify-content-between align-items-center mb-2">
        <small class="text-muted">{{ total }} record ditemukan</small>
        <nav v-if="totalPages > 1">
          <ul class="pagination pagination-sm mb-0">
            <li class="page-item" :class="{ disabled: page <= 1 }"><a class="page-link" href="#" @click.prevent="goPage(page - 1)">&laquo;</a></li>
            <li v-for="p in visiblePages" :key="p" class="page-item" :class="{ active: p === page }">
              <a class="page-link" href="#" @click.prevent="goPage(p)">{{ p }}</a>
            </li>
            <li class="page-item" :class="{ disabled: page >= totalPages }"><a class="page-link" href="#" @click.prevent="goPage(page + 1)">&raquo;</a></li>
          </ul>
        </nav>
      </div>

      <div class="card">
        <div class="card-body p-0">
          <div class="table-responsive">
            <table class="table table-hover table-sm mb-0" id="audit-table">
              <thead class="table-light">
                <tr>
                  <th style="width: 155px">Waktu</th>
                  <th>Company</th>
                  <th>User</th>
                  <th>Email</th>
                  <th style="width: 80px">Aksi</th>
                  <th style="width: 100px">Modul</th>
                  <th>Deskripsi</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="a in auditData" :key="a.id">
                  <td class="text-nowrap"><small>{{ formatDate(a.timestamp) }}</small></td>
                  <td>
                    <span v-if="a.company_name" class="badge bg-light text-dark border"><small>{{ a.company_code }}</small> {{ a.company_name }}</span>
                    <span v-else class="text-muted">-</span>
                  </td>
                  <td class="fw-semibold">
                    {{ a.user_name || a.user_name_stored || '—' }}
                  </td>
                  <td class="small text-muted">{{ a.user_email || '—' }}</td>
                  <td><span class="badge" :class="actionBadge(a.action)">{{ a.action }}</span></td>
                  <td><small class="text-muted">{{ a.module }}</small></td>
                  <td><small>{{ a.description }}</small></td>
                </tr>
                <tr v-if="!auditData.length"><td colspan="7" class="text-center text-muted py-4"><i class="bi bi-inbox d-block mb-1" style="font-size: 1.5rem;"></i>Tidak ada data</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    </div><!-- platform-content -->
  </div><!-- platform-page -->
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import * as companyApi from '@/services/company/api'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()
function navigateTo(path) { window.location.href = path }
async function handleLogout() { await authStore.logout(); window.location.href = '/login' }

const companies = ref([])
const auditData = ref([])
const total = ref(0)
const page = ref(1)
const limit = ref(25)
const loading = ref(false)

const filters = reactive({
  company_id: '',
  preset: '',
  from: '',
  to: '',
  search: '',
})

const hasActiveFilter = computed(() => !!(filters.company_id || filters.from || filters.to || filters.preset || filters.search))
const totalPages = computed(() => Math.ceil(total.value / limit.value))
const visiblePages = computed(() => {
  const pages = []
  const start = Math.max(1, page.value - 2)
  const end = Math.min(totalPages.value, page.value + 2)
  for (let i = start; i <= end; i++) pages.push(i)
  return pages
})

onMounted(async () => {
  // Load companies for filter dropdown
  try {
    const { data } = await companyApi.getPlatformAudit({})
    companies.value = data.companies || []
  } catch (e) { console.error(e) }
})

function onPresetChange() {
  if (filters.preset) { filters.from = ''; filters.to = '' }
  loadData()
}
function applyPreset(p) { filters.preset = p; loadData() }

async function loadData() {
  if (!hasActiveFilter.value) return
  loading.value = true
  try {
    const params = { page: page.value, limit: limit.value }
    if (filters.company_id) params.company_id = filters.company_id
    if (filters.preset) params.preset = filters.preset
    if (filters.from) params.from = filters.from
    if (filters.to) params.to = filters.to
    if (filters.search) params.search = filters.search
    const { data } = await companyApi.getPlatformAudit(params)
    auditData.value = data.data
    total.value = data.total
    if (data.companies?.length) companies.value = data.companies
  } catch (e) { console.error(e) }
  loading.value = false
}

function goPage(p) {
  if (p < 1 || p > totalPages.value) return
  page.value = p
  loadData()
}

function formatDate(d) {
  return new Date(d).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function actionBadge(action) {
  const map = { create: 'bg-success', update: 'bg-primary', delete: 'bg-danger', approve: 'bg-info', login: 'bg-warning text-dark' }
  return map[action] || 'bg-secondary'
}
</script>

<style scoped>
/* Platform Layout */
.platform-page { min-height: 100vh; background: #f1f5f9; }
.platform-navbar {
  display: flex; align-items: center; gap: 1rem;
  background: linear-gradient(135deg, #1e1b4b 0%, #312e81 100%);
  padding: 0.6rem 1.5rem; color: #fff;
}
.platform-nav-brand { font-weight: 700; font-size: 1.1rem; margin-right: 1.5rem; white-space: nowrap; }
.platform-nav-brand i { margin-right: 0.4rem; }
.platform-nav-links { display: flex; gap: 0.25rem; flex: 1; }
.platform-nav-link {
  color: rgba(255,255,255,0.7); text-decoration: none; padding: 0.4rem 0.85rem;
  border-radius: 8px; font-size: 0.88rem; font-weight: 500; transition: all 0.2s;
}
.platform-nav-link:hover { color: #fff; background: rgba(255,255,255,0.1); }
.platform-nav-link.active, .platform-nav-link.router-link-active { color: #fff; background: rgba(255,255,255,0.15); font-weight: 600; }
.platform-content { padding: 1.5rem 2rem; max-width: 1400px; margin: 0 auto; }
</style>
