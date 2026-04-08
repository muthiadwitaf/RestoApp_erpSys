<template>
  <div class="platform-page">
    <nav class="platform-navbar">
      <div class="platform-nav-brand"><i class="bi bi-box-seam-fill"></i> Platform Admin</div>
      <div class="platform-nav-links">
        <a class="platform-nav-link active" href="#"><i class="bi bi-buildings me-1"></i>Kelola Company</a>
        <a class="platform-nav-link" href="#" @click.prevent="navigateTo('/platform/cross-report')"><i class="bi bi-graph-up-arrow me-1"></i>Laporan Lintas</a>
        <a class="platform-nav-link" href="#" @click.prevent="navigateTo('/platform/super-admins')"><i class="bi bi-shield-lock me-1"></i>Super Admins</a>
        <a class="platform-nav-link" href="#" @click.prevent="navigateTo('/platform/audit')"><i class="bi bi-journal-text me-1"></i>Audit Trail</a>
      </div>
      <button class="btn btn-sm btn-outline-light" @click="handleLogout"><i class="bi bi-box-arrow-right me-1"></i>Logout</button>
    </nav>
    <div class="platform-content">
    <div class="page-header">
      <div><h1>Kelola Company</h1><span class="breadcrumb-custom">Super Admin / Company Management</span></div>
      <button class="btn btn-primary" @click="openCreateModal" id="btn-add-company">
        <i class="bi bi-plus-lg me-1"></i>Tambah Company
      </button>
    </div>

    <!-- Company Cards Grid -->
    <div class="company-grid mb-3">
      <div v-for="c in companies" :key="c.uuid" class="company-card-wrapper"
           :class="{ active: selectedCompany?.uuid === c.uuid }" @click="selectCompany(c)">
        <div class="company-card-inner">
          <div class="company-card-header">
            <div class="company-icon-lg"><i class="bi bi-buildings"></i></div>
            <div class="company-status" :class="c.is_active ? 'active' : 'inactive'">
              {{ c.is_active ? 'Aktif' : 'Nonaktif' }}
            </div>
          </div>
          <h5 class="company-name">{{ c.name }}</h5>
          <div class="company-code text-muted">{{ c.short_name || c.code }}</div>
          <div class="company-meta">
            <span><i class="bi bi-building me-1"></i>{{ c.branch_count }} cabang</span>
            <span><i class="bi bi-people me-1"></i>{{ c.user_count }} user</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Detail Panel -->
    <div class="card" v-if="selectedCompany">
      <div class="card-header d-flex justify-content-between align-items-center">
        <span class="fw-bold"><i class="bi bi-buildings me-2"></i>{{ selectedCompany.name }}</span>
        <div class="d-flex gap-2">
          <button class="btn btn-sm btn-outline-primary" @click="editCompany(selectedCompany)"><i class="bi bi-pencil me-1"></i>Edit</button>
          <button class="btn btn-sm btn-outline-danger" @click="toggleActiveStatus(selectedCompany)">
            <i class="bi me-1" :class="selectedCompany.is_active ? 'bi-x-circle' : 'bi-check-circle'"></i>
            {{ selectedCompany.is_active ? 'Nonaktifkan' : 'Aktifkan' }}
          </button>
          <button class="btn btn-sm btn-outline-secondary" @click="selectedCompany = null"><i class="bi bi-x-lg"></i></button>
        </div>
      </div>
      <div class="card-body">
        <div class="row mb-3">
          <div class="col-md-3"><small class="text-muted">Kode</small><div class="fw-semibold">{{ companyDetail?.code }}</div></div>
          <div class="col-md-3"><small class="text-muted">NPWP</small><div>{{ companyDetail?.npwp || '-' }}</div></div>
          <div class="col-md-3"><small class="text-muted">Alamat</small><div>{{ companyDetail?.address || '-' }}</div></div>
          <div class="col-md-3"><small class="text-muted">Telepon</small><div>{{ companyDetail?.phone || '-' }}</div></div>
        </div>

        <!-- Cabang -->
        <h6 class="fw-semibold text-secondary mt-2 mb-3"><i class="bi bi-building me-1"></i>Cabang</h6>

        <div>
          <table class="table table-sm table-bordered mb-0">
            <thead class="table-light"><tr><th>Kode</th><th>Nama Cabang</th><th>Alamat</th><th>Telepon</th><th class="text-center">Gudang</th></tr></thead>
            <tbody>
              <tr v-for="b in companyDetail?.branches" :key="b.uuid">
                <td class="fw-semibold text-primary">{{ b.code }}</td>
                <td>{{ b.name }}</td>
                <td>{{ b.address || '-' }}</td>
                <td>{{ b.phone || '-' }}</td>
                <td class="text-center"><span class="badge bg-info">{{ b.warehouse_count }}</span></td>
              </tr>
              <tr v-if="!companyDetail?.branches?.length"><td colspan="5" class="text-center text-muted py-3">Belum ada cabang</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Create/Edit Modal -->
    <div v-if="showModal" class="modal fade show d-block" tabindex="-1">
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title"><i class="bi bi-buildings me-2"></i>{{ editingId ? 'Edit Company' : 'Tambah Company Baru' }}</h5>
            <button type="button" class="btn-close" @click="closeModal"></button>
          </div>
          <div class="modal-body">
            <!-- Company Info Section -->
            <div class="section-label mb-2"><i class="bi bi-building me-1"></i>Informasi Perusahaan</div>
            <div class="mb-3">
              <label class="form-label fw-semibold">Nama Company <span class="text-danger">*</span></label>
              <input class="form-control" v-model="form.name" placeholder="PT Nama Perusahaan" :class="{'is-invalid': formErrors.name}">
              <div class="invalid-feedback">{{ formErrors.name }}</div>
            </div>
            <div class="row g-3 mb-3">
              <div class="col-md-3">
                <label class="form-label fw-semibold">Kode Company <span class="text-danger">*</span></label>
                <div class="input-group">
                  <input class="form-control font-monospace" v-model="form.code" :readonly="!!editingId"
                    :class="{'is-invalid': formErrors.code, 'bg-light': !!editingId}" placeholder="PTXXX">
                  <span class="input-group-text" v-if="loadingCode"><span class="spinner-border spinner-border-sm"></span></span>
                </div>
                <div class="invalid-feedback">{{ formErrors.code }}</div>
                <div class="form-text" v-if="!editingId"><i class="bi bi-magic me-1"></i>Auto dari nama. Bisa diubah.</div>
                <div class="form-text text-warning" v-if="editingId"><i class="bi bi-lock me-1"></i>Kode tidak bisa diubah.</div>
              </div>
              <div class="col-md-3">
                <label class="form-label fw-semibold">Singkatan</label>
                <input class="form-control" v-model="form.short_name" placeholder="PT-XXX" maxlength="30">
                <div class="form-text">Tampil di Company Picker.</div>
              </div>
            </div>
            <div class="row g-3 mb-3">
              <div class="col-md-6">
                <label class="form-label fw-semibold">NPWP</label>
                <input class="form-control font-monospace" v-model="form.npwp" @input="formatNpwp" placeholder="XX.XXX.XXX.X-XXX.000" maxlength="20">
                <div class="form-text">15 digit, otomatis diformat</div>
              </div>
              <div class="col-md-6">
                <label class="form-label fw-semibold">Telepon</label>
                <input class="form-control" v-model="form.phone" placeholder="021-XXXXXXXX">
              </div>
            </div>
            <div class="mb-3">
              <label class="form-label fw-semibold">Alamat</label>
              <textarea class="form-control" v-model="form.address" rows="2" placeholder="Jl. Nama Jalan No.X, Kota"></textarea>
            </div>

            <!-- PKP Section -->
            <div class="row g-3 mb-3">
              <div class="col-md-6">
                <div class="form-check form-switch">
                  <input class="form-check-input" type="checkbox" v-model="form.is_pkp" id="createPkpSwitch">
                  <label class="form-check-label fw-semibold" for="createPkpSwitch">Pengusaha Kena Pajak (PKP)</label>
                </div>
                <div class="form-text">Centang jika perusahaan terdaftar sebagai PKP</div>
              </div>
              <div class="col-md-6" v-if="form.is_pkp">
                <label class="form-label fw-semibold">Terdaftar PKP Sejak</label>
                <input type="date" class="form-control" v-model="form.pkp_since">
              </div>
            </div>

            <!-- Admin IT Section (only for create) -->
            <template v-if="!editingId">
              <hr class="my-3">
              <div class="section-label mb-2"><i class="bi bi-person-gear me-1"></i>Admin IT (Opsional)</div>
              <div class="form-text text-muted mb-3">
                Jika diisi, sistem akan otomatis membuat user Admin IT yang bisa langsung login ke ERP company ini.
                Kosongkan jika tidak diperlukan.
              </div>
              <div class="row g-3 mb-3">
                <div class="col-md-6">
                  <label class="form-label fw-semibold">Email Admin IT <span class="text-danger">*</span></label>
                  <input class="form-control" type="email" v-model="form.admin_email" placeholder="admin@company.co.id" :class="{'is-invalid': formErrors.admin_email}">
                  <div class="invalid-feedback">{{ formErrors.admin_email }}</div>
                  <div class="form-text">Digunakan untuk login. Username akan di-generate otomatis.</div>
                </div>
                <div class="col-md-6">
                  <label class="form-label fw-semibold">Password</label>
                  <input class="form-control" type="password" v-model="form.admin_password" placeholder="Min. 6 karakter" :class="{'is-invalid': formErrors.admin_password}">
                  <div class="invalid-feedback">{{ formErrors.admin_password }}</div>
                  <div class="form-text">Default: <code>password123</code>. Bisa diubah setelah login.</div>
                </div>
              </div>
              <div class="row g-3 mb-3">
                <div class="col-md-6">
                  <label class="form-label fw-semibold">Nama Lengkap</label>
                  <input class="form-control" v-model="form.admin_name" placeholder="Nama Admin IT">
                </div>
              </div>
              <div class="alert alert-info py-2 small mb-0" v-if="form.admin_email">
                <i class="bi bi-info-circle me-1"></i>Sistem akan otomatis membuat: 15 roles, 27 akun COA, 3 pajak untuk company ini. Kategori dan satuan dimulai kosong.
              </div>
            </template>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" @click="closeModal">Batal</button>
            <button class="btn btn-primary" @click="submitCompany" :disabled="submitting || !form.code?.trim() || !form.name?.trim()">
              <span v-if="submitting" class="spinner-border spinner-border-sm me-1"></span>
              <i v-else class="bi bi-check-lg me-1"></i>{{ editingId ? 'Update' : 'Buat Company' }}
            </button>
          </div>
        </div>
      </div>
    </div>
    <div class="modal-backdrop fade show" v-if="showModal" @click="closeModal"></div>
    </div><!-- platform-content -->
  </div><!-- platform-page -->
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import * as companyApi from '@/services/company/api'
import { useToast } from '@/composables/useToast'
import { useConfirm } from '@/composables/useConfirm'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()
const toast = useToast()
const { confirm } = useConfirm()

function navigateTo(path) { window.location.href = path }
async function handleLogout() {
  await authStore.logout()
  window.location.href = '/login'
}

onMounted(loadCompanies)

const companies = ref([])
const selectedCompany = ref(null)
const companyDetail = ref(null)
const activeTab = ref('branches')

// CRUD
const showModal = ref(false)
const editingId = ref(null)
const form = reactive({ code: '', short_name: '', name: '', npwp: '', address: '', phone: '', is_pkp: false, pkp_since: '', admin_email: '', admin_password: 'password123', admin_name: '' })
const formErrors = reactive({ code: '', name: '', admin_email: '', admin_password: '' })
const submitting = ref(false)
const loadingCode = ref(false)

// Auto-suggest code & short_name dari nama company (debounce 450ms)
let debounceTimer = null
watch(() => form.name, (newName) => {
  if (editingId.value) return // jangan auto-fill saat edit
  clearTimeout(debounceTimer)
  if (!newName || newName.trim().length < 3) return
  debounceTimer = setTimeout(async () => {
    loadingCode.value = true
    try {
      const { data } = await companyApi.getCompanyNextCode(newName.trim())
      form.code = data.code
      form.short_name = data.short_name
    } catch (e) { /* biarkan kosong */ }
    finally { loadingCode.value = false }
  }, 450)
})

// NPWP auto-format: XX.XXX.XXX.X-XXX.XXX
function formatNpwp() {
  const digits = form.npwp.replace(/\D/g, '').slice(0, 15)
  let formatted = ''
  for (let i = 0; i < digits.length; i++) {
    if (i === 2 || i === 5 || i === 8 || i === 12) formatted += '.'
    if (i === 9) formatted += '-'
    formatted += digits[i]
  }
  form.npwp = formatted
}






async function loadCompanies() {
  try { const { data } = await companyApi.getCompanies(); companies.value = data } catch (e) { console.error(e) }
}

async function selectCompany(c) {
  if (selectedCompany.value?.uuid === c.uuid) { selectedCompany.value = null; companyDetail.value = null; return }
  selectedCompany.value = c
  activeTab.value = 'branches'
  try { const { data } = await companyApi.getCompany(c.uuid); companyDetail.value = data } catch (e) { companyDetail.value = c }
}



// CRUD
function openCreateModal() {
  editingId.value = null
  Object.assign(form, { code: '', short_name: '', name: '', npwp: '', address: '', phone: '', is_pkp: false, pkp_since: '', admin_email: '', admin_password: 'password123', admin_name: '' })
  Object.assign(formErrors, { code: '', name: '', admin_email: '', admin_password: '' })
  showModal.value = true
}
function editCompany(c) {
  editingId.value = c.uuid
  Object.assign(form, { code: c.code, short_name: c.short_name || '', name: c.name, npwp: c.npwp || '', address: c.address || '', phone: c.phone || '', is_pkp: c.is_pkp || false, pkp_since: c.pkp_since || '', admin_email: '', admin_password: '', admin_name: '' })
  Object.assign(formErrors, { code: '', name: '', admin_email: '', admin_password: '' })
  showModal.value = true
}
function closeModal() { showModal.value = false; editingId.value = null; submitting.value = false }

function validateForm() {
  let valid = true
  Object.assign(formErrors, { code: '', name: '', admin_email: '', admin_password: '' })
  if (!form.code?.trim()) { formErrors.code = 'Kode wajib diisi'; valid = false }
  if (!form.name?.trim()) { formErrors.name = 'Nama wajib diisi'; valid = false }
  if (!editingId.value && form.admin_email?.trim()) {
    if (!form.admin_password || form.admin_password.length < 6) {
      formErrors.admin_password = 'Password minimal 6 karakter'; valid = false
    }
  }
  return valid
}

async function submitCompany() {
  if (!validateForm()) return
  submitting.value = true
  try {
    if (editingId.value) {
      await companyApi.updateCompany(editingId.value, { short_name: form.short_name, name: form.name, npwp: form.npwp, address: form.address, phone: form.phone, is_pkp: form.is_pkp, pkp_since: form.pkp_since || null })
      toast.success('Company berhasil diupdate')
    } else {
      const payload = { code: form.code, short_name: form.short_name || null, name: form.name, npwp: form.npwp, address: form.address, phone: form.phone, is_pkp: form.is_pkp, pkp_since: form.pkp_since || null }
      if (form.admin_email?.trim()) {
        payload.admin_email = form.admin_email.trim()
        payload.admin_password = form.admin_password || 'password123'
        payload.admin_name = form.admin_name?.trim() || ''
      }
      const { data } = await companyApi.createCompany(payload)
      let msg = `Company ${data.name} berhasil dibuat!`
      if (data.setup) msg += ` (${data.setup.roles} roles, ${data.setup.coa} akun COA, ${data.setup.taxes} pajak, ${data.setup.units} satuan)`
      if (data.admin_user) msg += ` + Admin IT: ${data.admin_user.email}`
      toast.success(msg)
    }
    await loadCompanies()
    closeModal()
    if (selectedCompany.value) { const { data } = await companyApi.getCompany(selectedCompany.value.uuid); companyDetail.value = data }
  } catch (e) { toast.error('Gagal: ' + (e.response?.data?.error || e.message)) }
  finally { submitting.value = false }
}

async function toggleActiveStatus(c) {
  const action = c.is_active ? 'Nonaktifkan' : 'Aktifkan'
  const ok = await confirm({ title: `${action} Company`, message: `Yakin ${action.toLowerCase()} ${c.name}?`, confirmText: action, variant: c.is_active ? 'danger' : 'success' })
  if (!ok) return
  try {
    await companyApi.updateCompany(c.uuid, { is_active: !c.is_active })
    toast.success(`Company ${action.toLowerCase()} berhasil`)
    await loadCompanies()
    if (selectedCompany.value?.uuid === c.uuid) { const { data } = await companyApi.getCompany(c.uuid); companyDetail.value = data; selectedCompany.value = { ...selectedCompany.value, is_active: !c.is_active } }
  } catch (e) { toast.error('Gagal: ' + (e.response?.data?.error || e.message)) }
}
</script>

<style scoped>
.company-grid { display: flex; flex-wrap: wrap; gap: 1rem; }
.company-card-wrapper {
  flex: 1 1 280px; max-width: 360px; cursor: pointer;
  border: 2px solid var(--border-subtle, #e2e8f0); border-radius: 16px;
  background: var(--card-bg, #fff); transition: all 0.25s;
  overflow: hidden;
}
.company-card-wrapper:hover { border-color: #6366f1; transform: translateY(-2px); box-shadow: 0 8px 25px rgba(99,102,241,0.15); }
.company-card-wrapper.active { border-color: #6366f1; box-shadow: 0 4px 20px rgba(99,102,241,0.2); }
.company-card-inner { padding: 1.25rem; }
.company-card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; }
.company-icon-lg { font-size: 2rem; color: #6366f1; }
.company-status { font-size: 0.7rem; font-weight: 600; padding: 0.2em 0.6em; border-radius: 30px; }
.company-status.active { background: #dcfce7; color: #166534; }
.company-status.inactive { background: #fef2f2; color: #991b1b; }
.company-name { font-weight: 700; font-size: 1.1rem; margin: 0; color: var(--text-primary); }
.company-code { font-size: 0.85rem; margin-bottom: 0.75rem; }
.company-meta { display: flex; gap: 1rem; font-size: 0.85rem; color: var(--text-secondary, #64748b); }

/* Section labels for modal */
.section-label { font-weight: 700; font-size: 0.95rem; color: var(--text-primary, #1e293b); display: flex; align-items: center; gap: 0.25rem; }

/* Drag & Drop */
.dnd-container { display: flex; gap: 1rem; min-height: 350px; }
.dnd-panel { flex: 1; border: 2px solid var(--border-subtle, #e2e8f0); border-radius: 12px; display: flex; flex-direction: column; overflow: hidden; }
.dnd-panel-header { padding: 0.75rem 1rem; font-weight: 700; font-size: 0.9rem; }
.dnd-panel-header.available { background: linear-gradient(135deg, #f0fdf4, #dcfce7); color: #166534; }
.dnd-panel-header.assigned { background: linear-gradient(135deg, #eef2ff, #e0e7ff); color: #3730a3; }
.dnd-search { padding: 0.5rem; border-bottom: 1px solid var(--border-subtle, #e2e8f0); }
.dnd-list { flex: 1; padding: 0.5rem; overflow-y: auto; min-height: 200px; }
.dnd-item {
  display: flex; align-items: center; gap: 0.75rem; padding: 0.6rem 0.75rem;
  border-radius: 10px; margin-bottom: 0.4rem; cursor: grab; transition: all 0.2s;
  background: var(--card-bg, #fff); border: 1px solid transparent;
}
.dnd-item:hover { background: #f8f9fa; border-color: #e2e8f0; }
.dnd-item.dragging { opacity: 0.5; transform: scale(0.95); }
.dnd-item.assigned .dnd-item-avatar { color: #6366f1; }
.dnd-item-avatar { font-size: 1.5rem; color: #94a3b8; }
.dnd-item-info { flex: 1; min-width: 0; }
.dnd-item-name { font-weight: 600; font-size: 0.88rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dnd-item-role { font-size: 0.75rem; color: var(--text-secondary, #94a3b8); }
.dnd-quick-btn { padding: 0.15rem 0.4rem; font-size: 0.75rem; opacity: 0; transition: opacity 0.2s; }
.dnd-item:hover .dnd-quick-btn { opacity: 1; }
.dnd-separator { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 0 0.5rem; color: #94a3b8; font-size: 1.5rem; }
.dnd-empty { text-align: center; color: #94a3b8; padding: 2rem; font-size: 0.85rem; }

@media (max-width: 768px) {
  .company-card-wrapper { max-width: 100%; }
  .dnd-container { flex-direction: column; }
  .dnd-separator { flex-direction: row; padding: 0.5rem 0; }
}

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
