<template>
  <div class="platform-page">
    <nav class="platform-navbar">
      <div class="platform-nav-brand"><i class="bi bi-box-seam-fill"></i> Platform Admin</div>
      <div class="platform-nav-links">
        <a class="platform-nav-link" href="#" @click.prevent="navigateTo('/platform/companies')"><i class="bi bi-buildings me-1"></i>Kelola Company</a>
        <a class="platform-nav-link" href="#" @click.prevent="navigateTo('/platform/cross-report')"><i class="bi bi-graph-up-arrow me-1"></i>Laporan Lintas</a>
        <a class="platform-nav-link active" href="#"><i class="bi bi-shield-lock me-1"></i>Super Admins</a>
        <a class="platform-nav-link" href="#" @click.prevent="navigateTo('/platform/audit')"><i class="bi bi-journal-text me-1"></i>Audit Trail</a>
      </div>
      <button class="btn btn-sm btn-outline-light" @click="handleLogout"><i class="bi bi-box-arrow-right me-1"></i>Logout</button>
    </nav>
    <div class="platform-content">
    <div class="page-header">
      <div><h1>Kelola Super Admin</h1><span class="breadcrumb-custom">Platform Admin / Super Admin</span></div>
      <button class="btn btn-primary" @click="openModal()" id="btn-add-sa">
        <i class="bi bi-plus-lg me-1"></i>Tambah Super Admin
      </button>
    </div>

    <!-- Super Admin Table -->
    <div class="card">
      <div class="card-body p-0">
        <div class="table-wrapper">
          <table class="table table-hover mb-0" id="sa-table">
            <thead class="table-light">
              <tr><th>Username</th><th>Nama</th><th>Email</th><th>Status</th><th>Dibuat</th><th class="text-center">Aksi</th></tr>
            </thead>
            <tbody>
              <tr v-for="sa in superAdmins" :key="sa.uuid">
                <td class="fw-semibold text-primary">{{ sa.username }}</td>
                <td>{{ sa.name }}</td>
                <td>{{ sa.email || '-' }}</td>
                <td><span class="badge" :class="sa.is_active ? 'bg-success' : 'bg-danger'">{{ sa.is_active ? 'Aktif' : 'Nonaktif' }}</span></td>
                <td>{{ new Date(sa.created_at).toLocaleDateString('id-ID') }}</td>
                <td class="text-center">
                  <button class="btn btn-sm btn-outline-primary me-1" @click="openModal(sa)" title="Edit"><i class="bi bi-pencil"></i></button>
                  <button class="btn btn-sm btn-outline-danger" @click="deactivateSA(sa)" title="Nonaktifkan" v-if="sa.is_active"><i class="bi bi-x-circle"></i></button>
                </td>
              </tr>
              <tr v-if="!superAdmins.length"><td colspan="6" class="text-center text-muted py-4"><i class="bi bi-shield-lock d-block mb-2" style="font-size:2rem"></i>Belum ada Super Admin</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Add/Edit Modal -->
    <div v-if="showModal" class="modal fade show d-block" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header" style="background: linear-gradient(135deg, #1e1b4b, #312e81); color: #fff;">
            <h5 class="modal-title"><i class="bi bi-shield-lock me-2"></i>{{ editing ? 'Edit Super Admin' : 'Tambah Super Admin' }}</h5>
            <button type="button" class="btn-close btn-close-white" @click="closeModal"></button>
          </div>
          <div class="modal-body">
            <div class="row mb-3">
              <div class="col-6">
                <label class="form-label fw-semibold">Username <span class="text-danger">*</span></label>
                <input type="text" class="form-control" v-model="form.username" :disabled="!!editing" placeholder="username">
              </div>
              <div class="col-6">
                <label class="form-label fw-semibold">Nama Lengkap <span class="text-danger">*</span></label>
                <input type="text" class="form-control" v-model="form.name" placeholder="Nama lengkap">
              </div>
            </div>
            <div class="row mb-3">
              <div class="col-6">
                <label class="form-label fw-semibold">Email</label>
                <input type="email" class="form-control" v-model="form.email" placeholder="email@domain.com">
              </div>
              <div class="col-6">
                <label class="form-label fw-semibold">{{ editing ? 'Password Baru (kosongkan jika tidak diubah)' : 'Password *' }}</label>
                <input type="password" class="form-control" v-model="form.password" placeholder="Min. 6 karakter">
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" @click="closeModal">Batal</button>
            <button class="btn btn-primary" @click="submitSA" :disabled="!canSave">
              <i class="bi bi-check-lg me-1"></i>{{ editing ? 'Update' : 'Simpan' }}
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
import { ref, reactive, computed, onMounted } from 'vue'
import * as companyApi from '@/services/company/api'
import { useToast } from '@/composables/useToast'
import { useConfirm } from '@/composables/useConfirm'
import { useAuthStore } from '@/stores/auth'

const toast = useToast()
const { confirm } = useConfirm()
const authStore = useAuthStore()

function navigateTo(path) { window.location.href = path }
async function handleLogout() { await authStore.logout(); window.location.href = '/login' }

const superAdmins = ref([])
const showModal = ref(false)
const editing = ref(null)
const form = reactive({ username: '', name: '', email: '', password: '' })

const canSave = computed(() => {
  if (!form.name?.trim()) return false
  if (!editing.value) {
    if (!form.username?.trim()) return false
    if (!form.password || form.password.length < 6) return false
  } else {
    if (form.password && form.password.length < 6) return false
  }
  return true
})

onMounted(loadData)

async function loadData() {
  try { const { data } = await companyApi.getSuperAdmins(); superAdmins.value = data } catch (e) { toast.error('Gagal load super admins') }
}

function openModal(sa = null) {
  if (sa) {
    editing.value = sa.uuid
    form.username = sa.username; form.name = sa.name; form.email = sa.email || ''; form.password = ''
  } else {
    editing.value = null
    form.username = ''; form.name = ''; form.email = ''; form.password = ''
  }
  showModal.value = true
}
function closeModal() { showModal.value = false; editing.value = null }

async function submitSA() {
  try {
    if (editing.value) {
      const payload = { name: form.name, email: form.email }
      if (form.password) payload.password = form.password
      await companyApi.updateSuperAdmin(editing.value, payload)
      toast.success('Super Admin berhasil diupdate')
    } else {
      await companyApi.createSuperAdmin({ username: form.username, name: form.name, email: form.email, password: form.password })
      toast.success('Super Admin berhasil dibuat')
    }
    await loadData()
    closeModal()
  } catch (e) { toast.error('Gagal: ' + (e.response?.data?.error || e.message)) }
}

async function deactivateSA(sa) {
  const ok = await confirm({ title: 'Nonaktifkan Super Admin', message: `Yakin nonaktifkan ${sa.name}?`, confirmText: 'Nonaktifkan', variant: 'danger' })
  if (!ok) return
  try {
    await companyApi.deleteSuperAdmin(sa.uuid)
    toast.success(`Super Admin ${sa.name} dinonaktifkan`)
    await loadData()
  } catch (e) { toast.error('Gagal: ' + (e.response?.data?.error || e.message)) }
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
