<template>
  <div class="majoo-view">
    <!-- Header -->
    <div class="d-flex justify-content-between align-items-center mb-4 pb-2">
      <div class="d-flex align-items-center gap-2">
        <h3 class="mb-1 fw-bold fs-4 text-gradient"><i class="bi bi-people-fill me-2 text-primary"></i> Data Karyawan</h3>
        <span class="badge bg-primary-subtle text-primary border border-primary-subtle rounded-pill px-3 py-1 ms-2" v-if="!loading">{{ filteredKaryawan.length }} karyawan</span>
      </div>
      <div>
        <button class="btn btn-primary rounded-pill px-4 btn-glow fw-semibold shadow-sm" @click="openAddModal">
          <i class="bi bi-plus-lg me-1"></i> Tambah Karyawan
        </button>
      </div>
    </div>

    <!-- Toolbar / Search -->
    <div class="mb-4 d-flex justify-content-between">
       <div class="search-box position-relative" style="width: 350px;">
        <i class="bi bi-search position-absolute text-muted" style="left: 16px; top: 50%; transform: translateY(-50%);"></i>
        <input v-model="searchQuery" class="form-control rounded-pill ps-5 py-2 input-glass border-0 shadow-sm" placeholder="Cari nama atau NIK..." />
      </div>
    </div>

    <!-- Table -->
    <div class="erp-card mb-5">
      <div class="table-responsive">
        <table class="table align-middle mb-0 table-erp">
          <thead>
            <tr>
              <th style="width: 50px;" class="text-center text-muted fw-semibold">#</th>
              <th class="text-muted fw-semibold">NAMA</th>
              <th class="text-muted fw-semibold">NIK</th>
              <th class="text-muted fw-semibold">JABATAN</th>
              <th class="text-center text-muted fw-semibold">STATUS</th>
              <th class="text-end pe-4 text-muted fw-semibold" style="width: 120px;">AKSI</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(k, idx) in filteredKaryawan" :key="k.uuid">
              <td class="text-center text-muted">{{ idx + 1 }}</td>
              <td class="fw-bold text-dark">
                <div class="d-flex align-items-center gap-3">
                  <div class="avatar-circle bg-primary text-white d-flex align-items-center justify-content-center fw-bold rounded-circle shadow-sm" style="width:36px;height:36px;">
                    {{ getInitials(k.nama_lengkap) }}
                  </div>
                  {{ k.nama_lengkap }}
                </div>
              </td>
              <td class="text-muted">{{ k.nik || '-' }}</td>
              <td><span class="badge bg-light text-secondary border px-3 py-1">{{ k.status_pegawai || 'Tetap' }}</span></td>
              <td class="text-center">
                <div class="form-check form-switch d-inline-block m-0">
                  <input class="form-check-input cursor-pointer" type="checkbox" role="switch" :checked="k.is_active" @change="toggleStatus(k)" style="width: 40px; height: 20px;">
                </div>
              </td>
              <td class="text-end pe-4">
                <div class="d-inline-flex gap-2">
                  <button class="btn btn-sm btn-outline-primary rounded-circle action-btn" @click="openEditModal(k)" title="Edit">
                    <i class="bi bi-pencil"></i>
                  </button>
                  <button class="btn btn-sm btn-outline-danger rounded-circle action-btn" title="Hapus" @click="deleteKaryawan(k)">
                    <i class="bi bi-trash"></i>
                  </button>
                </div>
              </td>
            </tr>
            <tr v-if="filteredKaryawan.length === 0 && !loading">
              <td colspan="6" class="text-center text-muted py-5">
                <i class="bi bi-inbox fs-2 d-block mb-2 opacity-25"></i>
                Belum ada data karyawan.
              </td>
            </tr>
            <tr v-if="loading">
              <td colspan="6" class="text-center py-5">
                <div class="spinner-border text-primary"></div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Modal Form -->
    <div class="modal fade modal-erp" id="employeeModal" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header bg-white px-4 pt-4 pb-3">
            <h5 class="modal-title fw-bold text-dark">
              <i class="bi me-2" :class="form.uuid ? 'bi-pencil-square text-primary' : 'bi-person-plus text-primary'"></i> 
              {{ form.uuid ? 'Edit Karyawan' : 'Tambah Karyawan' }}
            </h5>
            <button type="button" class="btn-close rounded-circle shadow-sm" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="mb-3">
              <label class="form-label fw-bold text-secondary small text-uppercase">NIK</label>
              <input v-model="form.nik" class="form-control rounded-3 py-2 bg-light border-0 shadow-sm" placeholder="Nomor Induk Karyawan" />
            </div>
            <div class="mb-3">
              <label class="form-label fw-bold text-secondary small text-uppercase">Nama Lengkap <span class="text-danger">*</span></label>
              <input v-model="form.nama_lengkap" class="form-control rounded-3 py-2 bg-light border-0 shadow-sm" placeholder="Nama sesuai KTP" />
            </div>
            <div class="row mb-3">
              <div class="col-6">
                <label class="form-label fw-bold text-secondary small text-uppercase">Status Pegawai</label>
                <select v-model="form.status" class="form-select rounded-3 py-2 bg-light border-0 shadow-sm cursor-pointer">
                  <option value="aktif">Aktif</option>
                  <option value="nonaktif">Nonaktif</option>
                  <option value="resign">Resign</option>
                  <option value="phk">PHK</option>
                </select>
              </div>
              <div class="col-6 d-flex flex-column align-items-center justify-content-center">
                 <label class="form-label fw-bold text-secondary small text-uppercase">Status Aktif</label>
                 <div class="form-check form-switch mt-1">
                   <input v-model="form.is_active" class="form-check-input cursor-pointer" type="checkbox" id="empActive" style="width: 45px; height: 25px;">
                 </div>
              </div>
            </div>
          </div>
          <div class="modal-footer px-4 pb-4 pt-0">
            <button type="button" class="btn btn-light rounded-pill px-4 fw-semibold text-secondary" data-bs-dismiss="modal">Batal</button>
            <button type="button" class="btn btn-primary btn-glow rounded-pill px-4 fw-bold shadow-sm" @click="save" :disabled="saving || !form.nama_lengkap">
              <i class="bi bi-check-lg me-1"></i> {{ saving ? 'Menyimpan...' : 'Simpan' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { Modal } from 'bootstrap'
import * as api from '@/services/hr/api'

const karyawan = ref([])
const loading = ref(false)
const saving = ref(false)
const searchQuery = ref('')
let modalInstance = null

const form = ref({
  uuid: null,
  nik: '',
  nama_lengkap: '',
  status: 'aktif',
  is_active: true
})

const filteredKaryawan = computed(() => {
  if (!searchQuery.value) return karyawan.value
  const q = searchQuery.value.toLowerCase()
  return karyawan.value.filter(k => 
    (k.nama_lengkap && k.nama_lengkap.toLowerCase().includes(q)) || 
    (k.nik && k.nik.toLowerCase().includes(q))
  )
})

async function loadData() {
  loading.value = true
  try {
    const res = await api.getKaryawan()
    karyawan.value = res.data || []
  } catch (error) {
    console.error('Failed to load employees:', error)
  } finally {
    loading.value = false
  }
}

function getInitials(name) {
  if (!name) return '?'
  return name.split(' ').map(n=>n[0]).join('').substring(0, 2).toUpperCase()
}

function openAddModal() {
  form.value = { uuid: null, nik: '', nama_lengkap: '', status: 'aktif', is_active: true }
  if(!modalInstance) modalInstance = new Modal(document.getElementById('employeeModal'))
  modalInstance.show()
}

function openEditModal(k) {
  form.value = { ...k }
  if(!modalInstance) modalInstance = new Modal(document.getElementById('employeeModal'))
  modalInstance.show()
}

async function save() {
  saving.value = true
  try {
    if (form.value.uuid) {
      await api.updateKaryawan(form.value.uuid, form.value)
    } else {
      await api.createKaryawan(form.value)
    }
    modalInstance.hide()
    await loadData()
  } catch (error) {
    alert(error.response?.data?.error || 'Gagal menyimpan data karyawan')
  } finally {
    saving.value = false
  }
}

async function deleteKaryawan(k) {
  if (!confirm(`Hapus karyawan "${k.nama_lengkap}"?`)) return
  try {
    await api.deleteKaryawan(k.uuid)
    await loadData()
  } catch (error) {
    alert(error.response?.data?.error || 'Gagal menghapus karyawan')
  }
}

async function toggleStatus(k) {
  k.is_active = !k.is_active
  try {
    await api.updateKaryawan(k.uuid, { is_active: k.is_active })
  } catch (e) {
    k.is_active = !k.is_active // rollback if failed
    console.error(e)
  }
}

onMounted(() => {
  loadData()
  const el = document.getElementById('employeeModal')
  if (el) modalInstance = new Modal(el)
})
</script>

<style scoped>
.majoo-view {
  padding: 2rem 2.5rem;
  background-color: #f8faff;
  min-height: 100vh;
}
[data-theme="dark"] .majoo-view {
  background-color: #1a1d23;
}

.action-btn {
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-color: transparent !important;
  background-color: transparent;
}
.action-btn:hover {
  background-color: var(--bs-primary-bg-subtle);
  transform: translateY(-2px);
}
.action-btn.btn-outline-danger:hover {
  background-color: var(--bs-danger-bg-subtle);
}

.cursor-pointer {
  cursor: pointer;
}

.form-switch .form-check-input:checked {
  background-color: #00cec9;
  border-color: #00cec9;
}
</style>

