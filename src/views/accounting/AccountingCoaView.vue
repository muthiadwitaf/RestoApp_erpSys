<template>
  <div class="accounting-view">
    <div class="inv-header d-flex justify-content-between align-items-center border-bottom pb-3 mb-3">
      <div>
        <h3 class="mb-0 fw-bold"><i class="bi bi-list-columns-reverse me-2 text-primary"></i>Chart of Accounts (COA)</h3>
        <span class="text-muted small">Kelola kode dan referensi akun buku besar</span>
      </div>
      <div>
        <button class="btn btn-primary" @click="openAddModal">
          <i class="bi bi-plus-lg me-1"></i> Tambah Akun
        </button>
      </div>
    </div>

    <div class="row mb-3">
      <div class="col-md-4">
        <div class="search-box position-relative">
          <i class="bi bi-search position-absolute text-muted" style="left: 12px; top: 50%; transform: translateY(-50%);"></i>
          <input v-model="searchQuery" class="form-control ps-5" placeholder="Cari nama atau kode akun..." />
        </div>
      </div>
      <div class="col-md-3">
        <select v-model="filterType" class="form-select">
          <option value="">-- Semua Tipe --</option>
          <option value="asset">Aset / Harta</option>
          <option value="liability">Kewajiban / Hutang</option>
          <option value="equity">Ekuitas / Modal</option>
          <option value="revenue">Pendapatan</option>
          <option value="expense">Beban / Biaya</option>
        </select>
      </div>
    </div>

    <!-- Table List -->
    <div class="card border-0 shadow-sm">
      <div class="card-body p-0 table-responsive">
        <table class="table table-hover align-middle mb-0">
          <thead class="table-light">
            <tr>
              <th>Kode Akun</th>
              <th>Nama Akun</th>
              <th>Tipe</th>
              <th class="text-center">Status</th>
              <th class="text-end">Aksi</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in filteredCoa" :key="c.uuid" class="hover-row">
              <td class="fw-bold text-primary font-monospace">{{ c.code }}</td>
              <td class="fw-semibold">{{ c.name }}</td>
              <td><span class="badge bg-secondary">{{ typeTranslate(c.type) }}</span></td>
              <td class="text-center">
                <span class="badge" :class="c.is_active ? 'bg-success' : 'bg-danger'">
                  {{ c.is_active ? 'Aktif' : 'Nonaktif' }}
                </span>
              </td>
              <td class="text-end">
                <button class="btn btn-sm btn-link text-primary p-0 me-2" @click="openEditModal(c)" title="Edit">
                  <i class="bi bi-pencil-square"></i>
                </button>
                <button class="btn btn-sm btn-link text-danger p-0" @click="deleteConfirm(c)" title="Hapus">
                  <i class="bi bi-trash3"></i>
                </button>
              </td>
            </tr>
            <tr v-if="filteredCoa.length === 0 && !loading">
              <td colspan="5" class="text-center text-muted py-5">
                <i class="bi bi-journal-x fs-1 d-block mb-2 opacity-25"></i>
                Tidak ada akun ditemukan.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Form Modal -->
    <div class="modal fade" id="coaModal" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content border-0 shadow">
          <div class="modal-header bg-light">
            <h5 class="modal-title fw-bold">
              <i class="bi bi-journal-plus"></i> {{ form.uuid ? 'Edit Akun' : 'Tambah Akun' }}
            </h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body p-4">
            <div class="mb-3">
              <label class="form-label fw-bold small">Kode Akun <span class="text-danger">*</span></label>
              <input v-model="form.code" class="form-control" placeholder="1001, 4001, dll" />
            </div>
            <div class="mb-3">
              <label class="form-label fw-bold small">Nama Akun <span class="text-danger">*</span></label>
              <input v-model="form.name" class="form-control" placeholder="Kas Kecil, Beban Listrik, dll" />
            </div>
            <div class="mb-3">
              <label class="form-label fw-bold small">Tipe Akun <span class="text-danger">*</span></label>
              <select v-model="form.type" class="form-select">
                <option value="asset">Aset / Harta</option>
                <option value="liability">Kewajiban / Hutang</option>
                <option value="equity">Ekuitas / Modal</option>
                <option value="revenue">Pendapatan</option>
                <option value="expense">Beban / Biaya</option>
              </select>
            </div>
            <div class="mb-3 form-check form-switch pt-2">
              <input v-model="form.is_active" class="form-check-input" type="checkbox" id="coaActive">
              <label class="form-check-label fw-bold small" for="coaActive">Akun Aktif</label>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Batal</button>
            <button type="button" class="btn btn-primary px-4" @click="save" :disabled="saving || !form.code || !form.name">
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
import * as api from '@/services/accounting/api'

const coaList = ref([])
const loading = ref(false)
const saving = ref(false)
const searchQuery = ref('')
const filterType = ref('')
let modalInstance = null

const form = ref({
  uuid: null,
  code: '',
  name: '',
  type: 'asset',
  is_active: true
})

const filteredCoa = computed(() => {
  let list = coaList.value
  if (filterType.value) list = list.filter(c => c.type === filterType.value)
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(c => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q))
  }
  return list
})

async function loadData() {
  loading.value = true
  try {
    const res = await api.getCoa()
    coaList.value = res.data || []
  } catch (error) {
    console.error('Failed to load COA', error)
  } finally {
    loading.value = false
  }
}

function openAddModal() {
  form.value = { uuid: null, code: '', name: '', type: 'asset', is_active: true }
  if(!modalInstance) modalInstance = new bootstrap.Modal(document.getElementById('coaModal'))
  modalInstance.show()
}

function openEditModal(c) {
  form.value = { ...c }
  if(!modalInstance) modalInstance = new bootstrap.Modal(document.getElementById('coaModal'))
  modalInstance.show()
}

async function save() {
  saving.value = true
  try {
    if (form.value.uuid) await api.updateCoa(form.value.uuid, form.value)
    else await api.createCoa(form.value)
    modalInstance.hide()
    await loadData()
  } catch (error) {
    alert(error.response?.data?.error || 'Gagal menyimpan COA')
  } finally {
    saving.value = false
  }
}

async function deleteConfirm(c) {
  if (!confirm(`Hapus akun ${c.code} - ${c.name}?`)) return
  try {
    await api.deleteCoa(c.uuid)
    await loadData()
  } catch (error) {
    alert(error.response?.data?.error || 'Gagal menghapus akun')
  }
}

function typeTranslate(t) {
  const map = {
    'asset': 'Aset',
    'liability': 'Kewajiban',
    'equity': 'Ekuitas',
    'revenue': 'Pendapatan',
    'expense': 'Beban'
  }
  return map[t] || t
}

onMounted(() => {
  loadData()
  const el = document.getElementById('coaModal')
  if (el) modalInstance = new Modal(el)
})
</script>

<style scoped>
.accounting-view {
  padding: 24px;
}
.hover-row {
  transition: background-color 0.15s ease;
}
.hover-row:hover {
  background-color: var(--bs-primary-bg-subtle) !important;
}
</style>
