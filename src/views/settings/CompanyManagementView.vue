<template>
  <div class="platform-page">
    <nav class="platform-navbar">
      <div class="platform-nav-brand"><i class="bi bi-box-seam-fill"></i> Platform Admin</div>
      <div class="platform-nav-links">
        <a class="platform-nav-link active" href="#"><i class="bi bi-buildings me-1"></i>Kelola Company</a>
        <a class="platform-nav-link" href="#" @click.prevent="navigateTo('/platform/cross-report')"><i class="bi bi-graph-up-arrow me-1"></i>Laporan Lintas</a>
        <a class="platform-nav-link" :class="{ active: showSASection }" href="#" @click.prevent="toggleSASection"><i class="bi bi-shield-lock me-1"></i>Super Admins</a>
      </div>
      <button class="btn btn-sm btn-outline-light" @click="goBack"><i class="bi bi-arrow-left me-1"></i>Kembali</button>
    </nav>
    <div class="platform-content">
    <div class="page-header">
      <div><h1>Kelola Company</h1><span class="breadcrumb-custom">Super Admin / Company Management</span></div>
      <button class="btn btn-primary" @click="openCreateModal" id="btn-add-company">
        <i class="bi bi-plus-lg me-1"></i>Tambah Company
      </button>
    </div>

    <!-- Super Admin Management Section -->
    <div class="card mb-4" v-if="showSASection">
      <div class="card-header d-flex justify-content-between align-items-center" style="background: linear-gradient(135deg, #1e1b4b, #312e81); color: #fff;">
        <span class="fw-bold"><i class="bi bi-shield-lock me-2"></i>Super Admin Users <span class="badge bg-light text-dark ms-2">{{ superAdmins.length }}</span></span>
        <button class="btn btn-sm btn-outline-light" @click="openSAModal()" id="btn-add-sa">
          <i class="bi bi-plus-lg me-1"></i>Tambah Super Admin
        </button>
      </div>
      <div class="card-body p-0">
        <div class="table-wrapper">
          <table class="table table-hover mb-0">
            <thead class="table-light"><tr><th>Username</th><th>Nama</th><th>Email</th><th>Status</th><th>Dibuat</th><th class="text-center">Aksi</th></tr></thead>
            <tbody>
              <tr v-for="sa in superAdmins" :key="sa.uuid">
                <td class="fw-semibold text-primary">{{ sa.username }}</td>
                <td>{{ sa.name }}</td>
                <td>{{ sa.email || '-' }}</td>
                <td><span class="badge" :class="sa.is_active ? 'bg-success' : 'bg-danger'">{{ sa.is_active ? 'Aktif' : 'Nonaktif' }}</span></td>
                <td>{{ new Date(sa.created_at).toLocaleDateString('id-ID') }}</td>
                <td class="text-center">
                  <button class="btn btn-sm btn-outline-primary me-1" @click="openSAModal(sa)" title="Edit"><i class="bi bi-pencil"></i></button>
                  <button class="btn btn-sm btn-outline-danger" @click="deactivateSA(sa)" title="Nonaktifkan" v-if="sa.is_active"><i class="bi bi-x-circle"></i></button>
                </td>
              </tr>
              <tr v-if="!superAdmins.length"><td colspan="6" class="text-center text-muted py-3">Belum ada Super Admin</td></tr>
            </tbody>
          </table>
        </div>
      </div>
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
          <div class="company-code text-muted">{{ c.code }}</div>
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

        <!-- Tabs -->
        <ul class="nav nav-tabs mb-3">
          <li class="nav-item"><a class="nav-link" :class="{ active: activeTab === 'branches' }" href="#" @click.prevent="activeTab = 'branches'"><i class="bi bi-building me-1"></i>Cabang</a></li>
          <li class="nav-item"><a class="nav-link" :class="{ active: activeTab === 'users' }" href="#" @click.prevent="activeTab = 'users'; loadCompanyUsers()"><i class="bi bi-people me-1"></i>User Assignment</a></li>
        </ul>

        <!-- Branches Tab -->
        <div v-if="activeTab === 'branches'">
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

        <!-- Users Tab — Drag & Drop -->
        <div v-if="activeTab === 'users'">
          <div class="dnd-container">
            <!-- Available Users (Left) -->
            <div class="dnd-panel">
              <div class="dnd-panel-header available">
                <i class="bi bi-person-plus me-1"></i>User Tersedia
                <span class="badge bg-secondary ms-1">{{ availableUsers.length }}</span>
              </div>
              <div class="dnd-search">
                <input class="form-control form-control-sm" placeholder="Cari user..." v-model="searchAvailable">
              </div>
              <div class="dnd-list" @dragover.prevent @drop="dropToAvailable($event)">
                <div v-for="u in filteredAvailable" :key="u.uuid" class="dnd-item"
                     draggable="true" @dragstart="dragStart($event, u, 'available')" @dragend="dragEnd">
                  <div class="dnd-item-avatar"><i class="bi bi-person-circle"></i></div>
                  <div class="dnd-item-info">
                    <div class="dnd-item-name">{{ u.name }}</div>
                    <div class="dnd-item-role">{{ u.role_name || 'No Role' }}</div>
                  </div>
                  <button class="btn btn-sm btn-outline-success dnd-quick-btn" @click="assignUser(u)" title="Assign">
                    <i class="bi bi-arrow-right"></i>
                  </button>
                </div>
                <div v-if="filteredAvailable.length === 0" class="dnd-empty">
                  <i class="bi bi-search d-block mb-1"></i>Tidak ada user tersedia
                </div>
              </div>
            </div>

            <!-- Arrow Separator -->
            <div class="dnd-separator">
              <i class="bi bi-arrow-left-right"></i>
              <div class="small text-muted mt-1">Drag & Drop</div>
            </div>

            <!-- Assigned Users (Right) -->
            <div class="dnd-panel">
              <div class="dnd-panel-header assigned">
                <i class="bi bi-person-check me-1"></i>Assigned ke {{ selectedCompany.name }}
                <span class="badge bg-primary ms-1">{{ assignedUsers.length }}</span>
              </div>
              <div class="dnd-search">
                <input class="form-control form-control-sm" placeholder="Cari user..." v-model="searchAssigned">
              </div>
              <div class="dnd-list" @dragover.prevent @drop="dropToAssigned($event)">
                <div v-for="u in filteredAssigned" :key="u.uuid" class="dnd-item assigned"
                     draggable="true" @dragstart="dragStart($event, u, 'assigned')" @dragend="dragEnd">
                  <button class="btn btn-sm btn-outline-danger dnd-quick-btn" @click="unassignUser(u)" title="Unassign">
                    <i class="bi bi-arrow-left"></i>
                  </button>
                  <div class="dnd-item-avatar"><i class="bi bi-person-check-fill"></i></div>
                  <div class="dnd-item-info">
                    <div class="dnd-item-name">{{ u.name }}</div>
                    <div class="dnd-item-role">{{ u.role_name || 'No Role' }}</div>
                  </div>
                </div>
                <div v-if="filteredAssigned.length === 0" class="dnd-empty">
                  <i class="bi bi-people d-block mb-1"></i>Belum ada user di-assign
                </div>
              </div>
            </div>
          </div>

          <!-- Save Button -->
          <div class="mt-3 d-flex justify-content-end gap-2" v-if="usersDirty">
            <button class="btn btn-secondary btn-sm" @click="loadCompanyUsers()"><i class="bi bi-arrow-counterclockwise me-1"></i>Reset</button>
            <button class="btn btn-primary btn-sm" @click="saveUserAssignments()"><i class="bi bi-check-lg me-1"></i>Simpan Perubahan</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Create/Edit Modal -->
    <div v-if="showModal" class="modal fade show d-block" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title"><i class="bi bi-buildings me-2"></i>{{ editingId ? 'Edit Company' : 'Tambah Company' }}</h5>
            <button type="button" class="btn-close" @click="closeModal"></button>
          </div>
          <div class="modal-body">
            <div class="mb-3">
              <label class="form-label fw-semibold">Kode Company <span class="text-danger">*</span></label>
              <input class="form-control" v-model="form.code" placeholder="PT-XXX">
            </div>
            <div class="mb-3">
              <label class="form-label fw-semibold">Nama Company <span class="text-danger">*</span></label>
              <input class="form-control" v-model="form.name" placeholder="PT Nama Perusahaan">
            </div>
            <div class="mb-3">
              <label class="form-label fw-semibold">NPWP</label>
              <input class="form-control" v-model="form.npwp" placeholder="XX.XXX.XXX.X-XXX.000">
            </div>
            <div class="mb-3">
              <label class="form-label fw-semibold">Alamat</label>
              <textarea class="form-control" v-model="form.address" rows="2"></textarea>
            </div>
            <div class="mb-3">
              <label class="form-label fw-semibold">Telepon</label>
              <input class="form-control" v-model="form.phone" placeholder="021-XXXXXXXX">
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" @click="closeModal">Batal</button>
            <button class="btn btn-primary" @click="submitCompany" :disabled="!form.code?.trim() || !form.name?.trim()">
              <i class="bi bi-check-lg me-1"></i>{{ editingId ? 'Update' : 'Simpan' }}
            </button>
          </div>
        </div>
      </div>
    </div>
    <div class="modal-backdrop fade show" v-if="showModal" @click="closeModal"></div>

    <!-- Super Admin Modal -->
    <div v-if="showSAModal" class="modal fade show d-block" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header" style="background: linear-gradient(135deg, #1e1b4b, #312e81); color: #fff;">
            <h5 class="modal-title"><i class="bi bi-shield-lock me-2"></i>{{ saEditing ? 'Edit Super Admin' : 'Tambah Super Admin' }}</h5>
            <button type="button" class="btn-close btn-close-white" @click="closeSAModal"></button>
          </div>
          <div class="modal-body">
            <div class="row mb-3">
              <div class="col-6">
                <label class="form-label fw-semibold">Username <span class="text-danger">*</span></label>
                <input type="text" class="form-control" v-model="saForm.username" :disabled="!!saEditing" placeholder="username">
              </div>
              <div class="col-6">
                <label class="form-label fw-semibold">Nama Lengkap <span class="text-danger">*</span></label>
                <input type="text" class="form-control" v-model="saForm.name" placeholder="Nama lengkap">
              </div>
            </div>
            <div class="row mb-3">
              <div class="col-6">
                <label class="form-label fw-semibold">Email</label>
                <input type="email" class="form-control" v-model="saForm.email" placeholder="email@domain.com">
              </div>
              <div class="col-6">
                <label class="form-label fw-semibold">{{ saEditing ? 'Password Baru (kosongkan jika tidak diubah)' : 'Password *' }}</label>
                <input type="password" class="form-control" v-model="saForm.password" placeholder="Min. 6 karakter">
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" @click="closeSAModal">Batal</button>
            <button class="btn btn-primary" @click="submitSA" :disabled="!saCanSave">
              <i class="bi bi-check-lg me-1"></i>{{ saEditing ? 'Update' : 'Simpan' }}
            </button>
          </div>
        </div>
      </div>
    </div>
    <div class="modal-backdrop fade show" v-if="showSAModal" @click="closeSAModal"></div>
    </div><!-- platform-content -->
  </div><!-- platform-page -->
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import * as settingsApi from '@/services/settings/api'
import { useToast } from '@/composables/useToast'
import { useConfirm } from '@/composables/useConfirm'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()
const toast = useToast()
const { confirm } = useConfirm()

function navigateTo(path) { window.location.href = path }
function goBack() {
  window.location.href = '/company-picker'
}

// Auto-open SA section if ?sa=1
onMounted(async () => {
  await loadCompanies()
  const params = new URLSearchParams(window.location.search)
  if (params.get('sa') === '1') { showSASection.value = true; await loadSuperAdmins() }
})

// Super Admin Management
const showSASection = ref(false)
const superAdmins = ref([])
const showSAModal = ref(false)
const saEditing = ref(null)
const saForm = reactive({ username: '', name: '', email: '', password: '' })

const saCanSave = computed(() => {
  if (!saForm.name?.trim()) return false
  if (!saEditing.value) {
    if (!saForm.username?.trim()) return false
    if (!saForm.password || saForm.password.length < 6) return false
  } else {
    if (saForm.password && saForm.password.length < 6) return false
  }
  return true
})

async function toggleSASection() {
  showSASection.value = !showSASection.value
  if (showSASection.value && superAdmins.value.length === 0) await loadSuperAdmins()
}

async function loadSuperAdmins() {
  try { const { data } = await settingsApi.getSuperAdmins(); superAdmins.value = data } catch (e) { toast.error('Gagal load super admins') }
}

function openSAModal(sa = null) {
  if (sa) {
    saEditing.value = sa.uuid
    saForm.username = sa.username; saForm.name = sa.name; saForm.email = sa.email || ''; saForm.password = ''
  } else {
    saEditing.value = null
    saForm.username = ''; saForm.name = ''; saForm.email = ''; saForm.password = ''
  }
  showSAModal.value = true
}
function closeSAModal() { showSAModal.value = false; saEditing.value = null }

async function submitSA() {
  try {
    if (saEditing.value) {
      const payload = { name: saForm.name, email: saForm.email }
      if (saForm.password) payload.password = saForm.password
      await settingsApi.updateSuperAdmin(saEditing.value, payload)
      toast.success('Super Admin berhasil diupdate')
    } else {
      await settingsApi.createSuperAdmin({ username: saForm.username, name: saForm.name, email: saForm.email, password: saForm.password })
      toast.success('Super Admin berhasil dibuat')
    }
    await loadSuperAdmins()
    closeSAModal()
  } catch (e) { toast.error('Gagal: ' + (e.response?.data?.error || e.message)) }
}

async function deactivateSA(sa) {
  const ok = await confirm({ title: 'Nonaktifkan Super Admin', message: `Yakin nonaktifkan ${sa.name}?`, confirmText: 'Nonaktifkan', variant: 'danger' })
  if (!ok) return
  try {
    await settingsApi.deleteSuperAdmin(sa.uuid)
    toast.success(`Super Admin ${sa.name} dinonaktifkan`)
    await loadSuperAdmins()
  } catch (e) { toast.error('Gagal: ' + (e.response?.data?.error || e.message)) }
}

const companies = ref([])
const selectedCompany = ref(null)
const companyDetail = ref(null)
const activeTab = ref('branches')

// CRUD
const showModal = ref(false)
const editingId = ref(null)
const form = reactive({ code: '', name: '', npwp: '', address: '', phone: '' })

// DnD User Assignment
const assignedUsers = ref([])
const availableUsers = ref([])
const originalAssigned = ref([])
const searchAvailable = ref('')
const searchAssigned = ref('')
const dragItem = ref(null)
const dragSource = ref(null)

const usersDirty = computed(() => {
  const current = assignedUsers.value.map(u => u.uuid).sort().join(',')
  const original = originalAssigned.value.map(u => u.uuid).sort().join(',')
  return current !== original
})

const filteredAvailable = computed(() => {
  const q = searchAvailable.value.toLowerCase()
  return q ? availableUsers.value.filter(u => u.name.toLowerCase().includes(q) || u.username?.toLowerCase().includes(q)) : availableUsers.value
})
const filteredAssigned = computed(() => {
  const q = searchAssigned.value.toLowerCase()
  return q ? assignedUsers.value.filter(u => u.name.toLowerCase().includes(q) || u.username?.toLowerCase().includes(q)) : assignedUsers.value
})




async function loadCompanies() {
  try { const { data } = await settingsApi.getCompanies(); companies.value = data } catch (e) { console.error(e) }
}

async function selectCompany(c) {
  if (selectedCompany.value?.uuid === c.uuid) { selectedCompany.value = null; companyDetail.value = null; return }
  selectedCompany.value = c
  activeTab.value = 'branches'
  try { const { data } = await settingsApi.getCompany(c.uuid); companyDetail.value = data } catch (e) { companyDetail.value = c }
}

async function loadCompanyUsers() {
  if (!selectedCompany.value) return
  try {
    const { data } = await settingsApi.getCompanyUsers(selectedCompany.value.uuid)
    assignedUsers.value = [...data.assigned]
    availableUsers.value = [...data.unassigned]
    originalAssigned.value = [...data.assigned]
  } catch (e) { toast.error('Gagal load users: ' + (e.response?.data?.error || e.message)) }
}

// Drag & Drop
function dragStart(e, user, source) {
  dragItem.value = user
  dragSource.value = source
  e.dataTransfer.effectAllowed = 'move'
  e.target.classList.add('dragging')
}
function dragEnd(e) {
  e.target.classList.remove('dragging')
  dragItem.value = null
  dragSource.value = null
}
function dropToAssigned() {
  if (dragItem.value && dragSource.value === 'available') assignUser(dragItem.value)
}
function dropToAvailable() {
  if (dragItem.value && dragSource.value === 'assigned') unassignUser(dragItem.value)
}
function assignUser(u) {
  availableUsers.value = availableUsers.value.filter(x => x.uuid !== u.uuid)
  assignedUsers.value.push(u)
}
function unassignUser(u) {
  assignedUsers.value = assignedUsers.value.filter(x => x.uuid !== u.uuid)
  availableUsers.value.push(u)
}

async function saveUserAssignments() {
  try {
    const userIds = assignedUsers.value.map(u => u.uuid)
    await settingsApi.updateCompanyUsers(selectedCompany.value.uuid, userIds)
    originalAssigned.value = [...assignedUsers.value]
    toast.success('User assignment berhasil disimpan')
    await loadCompanies()
  } catch (e) { toast.error('Gagal: ' + (e.response?.data?.error || e.message)) }
}

// CRUD
function openCreateModal() { editingId.value = null; form.code = ''; form.name = ''; form.npwp = ''; form.address = ''; form.phone = ''; showModal.value = true }
function editCompany(c) { editingId.value = c.uuid; form.code = c.code; form.name = c.name; form.npwp = c.npwp || ''; form.address = c.address || ''; form.phone = c.phone || ''; showModal.value = true }
function closeModal() { showModal.value = false; editingId.value = null }

async function submitCompany() {
  try {
    if (editingId.value) {
      await settingsApi.updateCompany(editingId.value, { code: form.code, name: form.name, npwp: form.npwp, address: form.address, phone: form.phone })
      toast.success('Company berhasil diupdate')
    } else {
      await settingsApi.createCompany({ code: form.code, name: form.name, npwp: form.npwp, address: form.address, phone: form.phone })
      toast.success('Company berhasil dibuat')
    }
    await loadCompanies()
    closeModal()
    if (selectedCompany.value) { const { data } = await settingsApi.getCompany(selectedCompany.value.uuid); companyDetail.value = data }
  } catch (e) { toast.error('Gagal: ' + (e.response?.data?.error || e.message)) }
}

async function toggleActiveStatus(c) {
  const action = c.is_active ? 'Nonaktifkan' : 'Aktifkan'
  const ok = await confirm({ title: `${action} Company`, message: `Yakin ${action.toLowerCase()} ${c.name}?`, confirmText: action, variant: c.is_active ? 'danger' : 'success' })
  if (!ok) return
  try {
    await settingsApi.updateCompany(c.uuid, { is_active: !c.is_active })
    toast.success(`Company ${action.toLowerCase()} berhasil`)
    await loadCompanies()
    if (selectedCompany.value?.uuid === c.uuid) { const { data } = await settingsApi.getCompany(c.uuid); companyDetail.value = data; selectedCompany.value = { ...selectedCompany.value, is_active: !c.is_active } }
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
