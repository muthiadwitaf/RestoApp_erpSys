<template>
  <div class="inv-view">
    <!-- Header -->
    <div class="d-flex justify-content-between align-items-center mb-4 pb-2">
      <div>
        <h2 class="mb-1 text-gradient fw-bolder">
          <i class="bi bi-box-seam me-2 text-primary"></i>Bahan Baku
        </h2>
        <span class="text-secondary small">Kelola pustaka item, harga, dan kategori inventori Anda.</span>
      </div>
      <div>
        <button class="btn btn-primary rounded-pill px-4 shadow-sm btn-glow fw-semibold text-white border-0" @click="openAddModal" id="btn-add-item">
          <i class="bi bi-plus-lg me-1"></i> Tambah Bahan
        </button>
      </div>
    </div>

    <!-- Toolbar -->
    <div class="d-flex flex-wrap gap-3 mb-4">
      <div class="search-box position-relative flex-grow-1" style="max-width: 400px;">
        <i class="bi bi-search position-absolute text-muted" style="left: 16px; top: 50%; transform: translateY(-50%);"></i>
        <input v-model="searchQuery" class="form-control rounded-pill ps-5 shadow-sm border-0 py-2 input-glass" placeholder="Cari kode atau nama bahan..." />
      </div>
      <div>
        <select v-model="filterCategory" class="form-select rounded-pill shadow-sm border-0 py-2 px-4 text-dark fw-semibold input-glass" style="width: 220px; cursor: pointer;">
          <option value="">Semua Kategori</option>
          <option v-for="c in categories" :key="c.uuid" :value="c.uuid">{{ c.name }}</option>
        </select>
      </div>
    </div>

    <!-- Empty State -->
    <div v-if="filteredItems.length === 0 && !loading" class="text-center py-5 my-5">
      <div class="d-inline-flex align-items-center justify-content-center bg-white shadow-sm rounded-circle mb-4" style="width: 100px; height: 100px;">
        <i class="bi bi-inbox fs-1 text-muted opacity-50"></i>
      </div>
      <h5 class="text-dark fw-bold">Belum ada data bahan baku.</h5>
      <p class="text-muted small">Tambahkan item baru untuk mulai mengelola menu dan inventori restoran Anda.</p>
      <button class="btn btn-outline-primary rounded-pill mt-2" @click="openAddModal">Mulai Tambah Bahan</button>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="text-center py-5">
      <div class="spinner-border text-primary" role="status">
        <span class="visually-hidden">Loading...</span>
      </div>
    </div>

    <!-- Item Table -->
    <div class="bg-white rounded-3 shadow-sm border border-secondary-subtle overflow-hidden mb-5">
      <div class="table-responsive">
        <table class="table table-hover align-middle mb-0 inventory-table">
          <thead class="table-light">
            <tr>
              <th scope="col" class="ps-4 fw-semibold text-muted small text-uppercase" style="width: 35%">Nama Bahan Baku</th>
              <th scope="col" class="fw-semibold text-muted small text-uppercase">Kategori</th>
              <th scope="col" class="text-end fw-semibold text-muted small text-uppercase">Harga Pokok (Rp)</th>
              <th scope="col" class="text-center fw-semibold text-muted small text-uppercase" style="width: 120px">Status</th>
              <th scope="col" class="text-end pe-4 fw-semibold text-muted small text-uppercase" style="width: 100px">Aksi</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in filteredItems" :key="item.uuid" class="transition-all">
              <td class="ps-4 py-3">
                <div class="fw-bold text-dark">{{ item.name }}</div>
                <div class="text-muted small font-monospace mt-1"><i class="bi bi-upc me-1"></i>{{ item.code }}</div>
              </td>
              <td class="py-3">
                <span class="badge bg-light text-secondary border px-2 py-1 fw-normal">{{ item.category_name || 'Tanpa Kategori' }}</span>
              </td>
              <td class="text-end py-3 fw-semibold text-dark">
                {{ formatMoney(item.buy_price) }}
              </td>
              <td class="text-center py-3">
                <span class="badge rounded-pill fw-normal px-3" :class="item.is_active ? 'bg-success-subtle text-success' : 'bg-secondary-subtle text-secondary'">
                  <i class="bi me-1" :class="item.is_active ? 'bi-check2' : 'bi-dash'"></i>{{ item.is_active ? 'Aktif' : 'Nonaktif' }}
                </span>
              </td>
              <td class="text-end pe-4 py-3">
                <div class="d-inline-flex gap-1">
                  <button class="btn btn-sm btn-link text-primary p-1" @click="openEditModal(item)" title="Edit">
                    <i class="bi bi-pencil-square"></i>
                  </button>
                  <button class="btn btn-sm btn-link text-danger p-1" @click="deleteItemConfirm(item)" title="Hapus">
                    <i class="bi bi-trash3"></i>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Modal Form -->
    <div class="modal fade" id="itemModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-lg modal-dialog-centered">
        <div class="modal-content border-0 shadow-lg rounded-4 overflow-hidden">
          <div class="modal-header bg-white border-bottom-0 pt-4 pb-0 px-4">
            <h5 class="modal-title fw-bold text-dark fs-4">
              <i class="bi me-2" :class="form.uuid ? 'bi-pencil-square text-primary' : 'bi-plus-circle text-primary'"></i> 
              {{ form.uuid ? 'Edit Master Barang' : 'Tambah Master Barang' }}
            </h5>
            <button type="button" class="btn-close shadow-sm rounded-circle bg-light" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body p-4 bg-white">
            <div class="card bg-light border-0 rounded-4 p-4 shadow-sm">
              <div class="row g-4">
                <div class="col-md-4">
                  <label class="form-label fw-bold text-secondary small text-uppercase">Kode Barang <span class="text-danger">*</span></label>
                  <input v-model="form.code" class="form-control rounded-3 py-2 border-0 shadow-sm" placeholder="Otomatis jika kosong" />
                </div>
                <div class="col-md-8">
                  <label class="form-label fw-bold text-secondary small text-uppercase">Nama Barang <span class="text-danger">*</span></label>
                  <input v-model="form.name" class="form-control rounded-3 py-2 border-0 shadow-sm" placeholder="Isi nama barang yang menarik..." />
                </div>
                <div class="col-md-6">
                  <label class="form-label fw-bold text-secondary small text-uppercase">Kategori</label>
                  <select v-model="form.category_id" class="form-select rounded-3 py-2 border-0 shadow-sm text-dark cursor-pointer">
                    <option :value="null">-- Pilih Kategori --</option>
                    <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
                  </select>
                </div>
                <div class="col-md-6">
                  <label class="form-label fw-bold text-secondary small text-uppercase">Satuan Utama</label>
                  <select v-model="form.small_uom_id" class="form-select rounded-3 py-2 border-0 shadow-sm text-dark cursor-pointer">
                    <option :value="null">-- Pilih Satuan --</option>
                    <option v-for="u in units" :key="u.id" :value="u.id">{{ u.name }}</option>
                  </select>
                </div>
                <div class="col-md-6">
                  <div class="p-3 bg-white rounded-4 border shadow-sm border-start border-4" style="border-left-color: var(--bs-secondary) !important;">
                    <label class="form-label fw-bold text-secondary small text-uppercase mb-2">Harga Beli</label>
                    <div class="input-group">
                      <span class="input-group-text bg-light border-0 fw-bold text-muted">Rp</span>
                      <input v-model.number="form.buy_price" type="number" class="form-control border-0 bg-light" min="0" placeholder="0" />
                    </div>
                  </div>
                </div>
                <div class="col-md-6">
                  <div class="p-3 bg-white rounded-4 shadow-sm border border-start border-4" style="border-left-color: var(--bs-success) !important;">
                    <label class="form-label fw-bold text-success small text-uppercase mb-2">Harga Jual <span class="text-danger">*</span></label>
                    <div class="input-group">
                      <span class="input-group-text bg-success-subtle border-0 fw-bold text-success">Rp</span>
                      <input v-model.number="form.sell_price" type="number" class="form-control border-0 bg-success-subtle text-success fw-bold" min="0" placeholder="0" />
                    </div>
                  </div>
                </div>
                <div class="col-md-6">
                  <label class="form-label fw-bold text-secondary small text-uppercase">Minimal Stok Peringatan</label>
                  <input v-model.number="form.min_stock" type="number" class="form-control rounded-3 py-2 border-0 shadow-sm" min="0" />
                </div>
                <div class="col-md-6 d-flex align-items-center">
                  <div class="form-check form-switch form-switch-lg ms-2 mt-4">
                    <input v-model="form.is_active" class="form-check-input cursor-pointer shadow-sm" type="checkbox" id="flexSwitchActive" style="width: 3rem; height: 1.5rem;">
                    <label class="form-check-label user-select-none mt-1 ms-2 fw-semibold" :class="form.is_active ? 'text-success' : 'text-secondary'" for="flexSwitchActive">
                      {{ form.is_active ? 'Item Aktif (Ditampilkan)' : 'Item Non-Aktif (Disembunyikan)' }}
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="modal-footer bg-white border-top-0 px-4 pb-4 pt-0">
            <button type="button" class="btn btn-light rounded-pill px-4 fw-semibold text-secondary" data-bs-dismiss="modal">Batal</button>
            <button type="button" class="btn btn-primary rounded-pill px-5 fw-bold shadow-sm d-flex align-items-center" @click="save" :disabled="saving || !form.name">
              <span v-if="saving" class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
              <i v-else class="bi bi-save2 me-2"></i> 
              {{ saving ? 'Menyimpan...' : 'Simpan Barang' }}
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
import * as api from '@/services/inventory/api'

const items = ref([])
const categories = ref([])
const units = ref([])
const loading = ref(false)
const saving = ref(false)
const searchQuery = ref('')
const filterCategory = ref('')
let modalInstance = null

const form = ref({
  uuid: null,
  code: '',
  name: '',
  category_id: null,
  small_uom_id: null,
  buy_price: 0,
  sell_price: 0,
  min_stock: 0,
  is_active: true
})

const filteredItems = computed(() => {
  let list = items.value
  if (filterCategory.value) {
    const cat = categories.value.find(c => c.uuid === filterCategory.value)
    if (cat) list = list.filter(i => i.category_id === cat.id)
  }
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(i => 
      (i.name && i.name.toLowerCase().includes(q)) || 
      (i.code && i.code.toLowerCase().includes(q))
    )
  }
  return list
})

async function loadData() {
  loading.value = true
  try {
    const [resItems, resCats, resUnits] = await Promise.all([
      api.getItems(),
      api.getCategories(),
      api.getUnits()
    ])
    items.value = resItems.data || []
    categories.value = resCats.data || []
    units.value = resUnits.data || []
  } catch (error) {
    console.error('Failed to load inventory data:', error)
  } finally {
    loading.value = false
  }
}

function openAddModal() {
  form.value = {
    uuid: null, code: '', name: '', category_id: null, small_uom_id: null, buy_price: 0, sell_price: 0, min_stock: 0, is_active: true
  }
  if(!modalInstance) modalInstance = new Modal(document.getElementById('itemModal'))
  modalInstance.show()
}

function openEditModal(item) {
  form.value = { ...item }
  if(!modalInstance) modalInstance = new Modal(document.getElementById('itemModal'))
  modalInstance.show()
}

async function save() {
  saving.value = true
  try {
    if (form.value.uuid) {
      await api.updateItem(form.value.uuid, form.value)
    } else {
      await api.createItem(form.value)
    }
    modalInstance.hide()
    await loadData()
  } catch (error) {
    alert(error.response?.data?.error || 'Gagal menyimpan barang')
  } finally {
    saving.value = false
  }
}

async function deleteItemConfirm(item) {
  if (!confirm(`Hapus barang "${item.name}"?`)) return
  try {
    await api.deleteItem(item.uuid)
    await loadData()
  } catch (error) {
    alert(error.response?.data?.error || 'Gagal menghapus barang')
  }
}

function formatMoney(val) {
  return new Intl.NumberFormat('id-ID').format(parseFloat(val) || 0)
}

function getCategoryColor(categoryName) {
  // Pastel/Vibrant harmonious colors
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#9b59b6', 
    '#f39c12', '#16a085', '#2980b9', '#e84393', '#00cec9',
    '#6c5ce7', '#fab1a0', '#0984e3', '#fdcb6e', '#e17055'
  ];
  if (!categoryName) return '#b2bec3';
  
  let hash = 0;
  for (let i = 0; i < categoryName.length; i++) {
    hash = categoryName.charCodeAt(i) + ((hash << 5) - hash);
  }
  hash = Math.abs(hash);
  return colors[hash % colors.length];
}

onMounted(() => {
  loadData()
  const el = document.getElementById('itemModal')
  if (el) modalInstance = new Modal(el)
})
</script>

<style scoped>
.inv-view {
  padding: 2rem 2.5rem;
  background-color: #f8faff;
  min-height: 100vh;
}

/* Typography Enhancements */
.text-gradient {
  background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  display: inline-block;
}

/* Glow & Glass effects */
.btn-glow {
  background: linear-gradient(135deg, #3498db, #2980b9);
  box-shadow: 0 4px 15px rgba(52, 152, 219, 0.4) !important;
  transition: all 0.3s ease;
}
.btn-glow:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(52, 152, 219, 0.6) !important;
}

.input-glass {
  background-color: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(0,0,0,0.05) !important;
  transition: all 0.3s ease;
}
.input-glass:focus {
  background-color: #ffffff;
  box-shadow: 0 0 0 0.25rem rgba(52, 152, 219, 0.15) !important;
}

/* Table Row Hover */
.inventory-table tbody tr:hover {
  background-color: #f8fbff;
}

.cursor-pointer {
  cursor: pointer;
}

/* Form switch scaling */
.form-switch-lg .form-check-input {
  width: 3rem !important;
  height: 1.5rem !important;
}

/* Responsive adjustments */
@media (max-width: 991.98px) {
  .inventory-table {
    display: block;
    width: 100%;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
}
</style>
