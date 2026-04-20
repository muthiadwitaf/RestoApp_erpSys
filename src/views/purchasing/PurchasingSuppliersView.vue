<template>
  <div class="purchasing-view">
    <div class="inv-header d-flex justify-content-between align-items-center border-bottom pb-3 mb-3">
      <div>
        <h3 class="mb-0 fw-bold"><i class="bi bi-truck me-2 text-primary"></i>Data Supplier</h3>
        <span class="text-muted small">Kelola data pemasok barang atau bahan baku</span>
      </div>
      <div>
        <button class="btn btn-primary" @click="openAddModal">
          <i class="bi bi-plus-lg me-1"></i> Tambah Supplier
        </button>
      </div>
    </div>

    <!-- Toolbar -->
    <div class="d-flex justify-content-between align-items-center mb-3">
      <div class="search-box position-relative" style="width: 300px;">
        <i class="bi bi-search position-absolute text-muted" style="left: 12px; top: 50%; transform: translateY(-50%);"></i>
        <input v-model="searchQuery" class="form-control ps-5" placeholder="Cari nama atau kode supplier..." />
      </div>
    </div>

    <!-- Table -->
    <div class="card border-0 shadow-sm">
      <div class="card-body p-0 table-responsive">
        <table class="table table-hover align-middle mb-0">
          <thead class="table-light">
            <tr>
              <th style="width: 60px;" class="text-center">#</th>
              <th>Kode</th>
              <th>Nama Supplier</th>
              <th>Kontak</th>
              <th>Alamat</th>
              <th class="text-end">Aksi</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(sup, idx) in filteredSuppliers" :key="sup.uuid" class="hover-row">
              <td class="text-center text-muted small">{{ idx + 1 }}</td>
              <td class="fw-semibold text-primary font-monospace small">{{ sup.code }}</td>
              <td class="fw-bold">{{ sup.name }}</td>
              <td>
                <div v-if="sup.phone"><i class="bi bi-telephone text-muted me-1 small"></i>{{ sup.phone }}</div>
                <div v-if="sup.email" class="small text-muted"><i class="bi bi-envelope text-muted me-1"></i>{{ sup.email }}</div>
              </td>
              <td class="small">{{ sup.address || '-' }}</td>
              <td class="text-end">
                <button class="btn btn-sm btn-link text-primary p-0 me-2" @click="openEditModal(sup)" title="Edit">
                  <i class="bi bi-pencil-square"></i>
                </button>
                <button class="btn btn-sm btn-link text-danger p-0" @click="deleteConfirm(sup)" title="Hapus">
                  <i class="bi bi-trash3"></i>
                </button>
              </td>
            </tr>
            <tr v-if="filteredSuppliers.length === 0 && !loading">
              <td colspan="6" class="text-center text-muted py-5">
                <i class="bi bi-person-vcard fs-1 d-block mb-2 opacity-25"></i>
                Belum ada data supplier.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Form Modal -->
    <div class="modal fade" id="supplierModal" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content border-0 shadow">
          <div class="modal-header bg-light">
            <h5 class="modal-title fw-bold">
              <i class="bi bi-building"></i> {{ form.uuid ? 'Edit Supplier' : 'Tambah Supplier' }}
            </h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body p-4">
            <div class="mb-3">
              <label class="form-label fw-bold small">Kode Supplier <span class="text-danger">*</span></label>
              <input v-model="form.code" class="form-control" placeholder="Kosongkan untuk otomatis" />
            </div>
            <div class="mb-3">
              <label class="form-label fw-bold small">Nama Supplier <span class="text-danger">*</span></label>
              <input v-model="form.name" class="form-control" placeholder="Nama perusahaan atau perorangan" />
            </div>
            <div class="row mb-3">
              <div class="col-6">
                <label class="form-label fw-bold small">Telepon</label>
                <input v-model="form.phone" class="form-control" placeholder="Nomor Telp/WA" />
              </div>
              <div class="col-6">
                <label class="form-label fw-bold small">Email</label>
                <input v-model="form.email" type="email" class="form-control" placeholder="Alamat email" />
              </div>
            </div>
            <div class="mb-3">
              <label class="form-label fw-bold small">Alamat Lengkap</label>
              <textarea v-model="form.address" class="form-control" rows="3"></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Batal</button>
            <button type="button" class="btn btn-primary" @click="save" :disabled="saving || !form.name">
              <i class="bi bi-save me-1"></i> {{ saving ? 'Menyimpan...' : 'Simpan' }}
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
import * as api from '@/services/purchasing/api'

const suppliers = ref([])
const loading = ref(false)
const saving = ref(false)
const searchQuery = ref('')
let modalInstance = null

const form = ref({
  uuid: null,
  code: '',
  name: '',
  phone: '',
  email: '',
  address: ''
})

const filteredSuppliers = computed(() => {
  if (!searchQuery.value) return suppliers.value
  const q = searchQuery.value.toLowerCase()
  return suppliers.value.filter(s => 
    s.name.toLowerCase().includes(q) || 
    (s.code && s.code.toLowerCase().includes(q))
  )
})

async function loadData() {
  loading.value = true
  try {
    const res = await api.getSuppliers()
    suppliers.value = res.data || []
  } catch (error) {
    console.error('Failed to load suppliers:', error)
  } finally {
    loading.value = false
  }
}

function openAddModal() {
  form.value = { uuid: null, code: '', name: '', phone: '', email: '', address: '' }
  if(!modalInstance) modalInstance = new Modal(document.getElementById('supplierModal'))
  modalInstance.show()
}

function openEditModal(sup) {
  form.value = { ...sup }
  if(!modalInstance) modalInstance = new Modal(document.getElementById('supplierModal'))
  modalInstance.show()
}

async function save() {
  saving.value = true
  try {
    if (form.value.uuid) {
      await api.updateSupplier(form.value.uuid, form.value)
    } else {
      await api.createSupplier(form.value)
    }
    modalInstance.hide()
    await loadData()
  } catch (error) {
    alert(error.response?.data?.error || 'Gagal menyimpan supplier')
  } finally {
    saving.value = false
  }
}

async function deleteConfirm(sup) {
  if (!confirm(`Hapus supplier "${sup.name}"?`)) return
  try {
    await api.deleteSupplier(sup.uuid)
    await loadData()
  } catch (error) {
    alert(error.response?.data?.error || 'Gagal menghapus supplier')
  }
}

onMounted(() => {
  loadData()
  const el = document.getElementById('supplierModal')
  if (el) modalInstance = new Modal(el)
})
</script>

<style scoped>
.purchasing-view {
  padding: 24px;
}
.hover-row {
  transition: background-color 0.15s ease;
}
.hover-row:hover {
  background-color: var(--bs-primary-bg-subtle) !important;
}
</style>
