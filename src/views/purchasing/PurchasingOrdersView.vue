<template>
  <div class="purchasing-view">
    <div class="inv-header d-flex justify-content-between align-items-center border-bottom pb-3 mb-3">
      <div>
        <h3 class="mb-0 fw-bold"><i class="bi bi-file-earmark-text me-2 text-primary"></i>Purchase Orders</h3>
        <span class="text-muted small">Kelola pemesanan barang ke supplier</span>
      </div>
      <div>
        <button class="btn btn-primary" @click="openCreateModal">
          <i class="bi bi-plus-lg me-1"></i> Buat PO
        </button>
      </div>
    </div>

    <!-- Table List -->
    <div class="card border-0 shadow-sm">
      <div class="card-body p-0 table-responsive">
        <table class="table table-hover align-middle mb-0">
          <thead class="table-light">
            <tr>
              <th>Nomor PO</th>
              <th>Tanggal</th>
              <th>Supplier</th>
              <th>Gudang Tujuan</th>
              <th>Total</th>
              <th>Status</th>
              <th>Pembuat</th>
              <th class="text-end">Aksi</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="po in orders" :key="po.uuid" class="hover-row">
              <td class="fw-bold text-primary font-monospace">{{ po.number }}</td>
              <td>{{ formatDate(po.date) }}</td>
              <td class="fw-semibold">{{ po.supplier_name }}</td>
              <td>{{ po.warehouse_name || '-' }}</td>
              <td class="fw-bold">{{ formatMoney(po.total) }}</td>
              <td><span class="badge" :class="statusBadge(po.status)">{{ po.status.toUpperCase() }}</span></td>
              <td class="small">{{ po.created_by }}</td>
              <td class="text-end">
                <button v-if="po.status === 'draft'" class="btn btn-sm btn-outline-success me-2" @click="submitDoc(po)" title="Ajukan">
                  <i class="bi bi-send"></i>
                </button>
                <button v-if="po.status === 'pending'" class="btn btn-sm btn-outline-primary me-2" @click="approveDoc(po)" title="Setujui">
                  <i class="bi bi-check2-circle"></i>
                </button>
                <button class="btn btn-sm btn-light border text-dark" @click="viewDetail(po)" title="Detail">
                  <i class="bi bi-eye"></i>
                </button>
              </td>
            </tr>
            <tr v-if="orders.length === 0 && !loading">
              <td colspan="8" class="text-center text-muted py-5">
                <i class="bi bi-cart-x fs-1 d-block mb-2 opacity-25"></i>
                Belum ada Purchase Order.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Create Modal (Simplified for now, UI can be expanded) -->
    <div class="modal fade" id="poModal" tabindex="-1">
      <div class="modal-dialog modal-lg">
        <div class="modal-content border-0 shadow">
          <div class="modal-header bg-light">
            <h5 class="modal-title fw-bold">Buat Purchase Order</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body p-4">
            <div class="row g-3">
              <div class="col-md-6">
                <label class="form-label fw-bold small">Supplier</label>
                <select v-model="form.supplier_id" class="form-select">
                  <option :value="null">-- Pilih Supplier --</option>
                  <option v-for="s in suppliers" :key="s.id" :value="s.id">{{ s.name }}</option>
                </select>
              </div>
              <div class="col-md-6">
                <label class="form-label fw-bold small">Tanggal</label>
                <input type="date" v-model="form.date" class="form-control" />
              </div>
              <div class="col-md-6">
                <label class="form-label fw-bold small">Gudang Tujuan (Opsional)</label>
                <select v-model="form.warehouse_id" class="form-select">
                  <option :value="null">-- Biarkan Kosong --</option>
                  <option v-for="w in warehouses" :key="w.id" :value="w.id">{{ w.name }}</option>
                </select>
              </div>
              <div class="col-12">
                <label class="form-label fw-bold small">Catatan</label>
                <textarea v-model="form.notes" class="form-control" rows="2"></textarea>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Batal</button>
            <button type="button" class="btn btn-primary px-4" @click="save" :disabled="saving || !form.supplier_id">
              <i class="bi bi-cart-plus me-1"></i> {{ saving ? 'Menyimpan...' : 'Simpan Draft' }}
            </button>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { Modal } from 'bootstrap'
import * as api from '@/services/purchasing/api'
import * as invApi from '@/services/inventory/api'

const orders = ref([])
const suppliers = ref([])
const warehouses = ref([])
const loading = ref(false)
const saving = ref(false)
let modalInstance = null

const form = ref({
  supplier_id: null,
  warehouse_id: null,
  date: new Date().toISOString().split('T')[0],
  notes: '',
  lines: [] // Emulated for now
})

async function loadData() {
  loading.value = true
  try {
    const [resOrders, resSup, resWH] = await Promise.all([
      api.getPurchaseOrders(),
      api.getSuppliers(),
      invApi.getWarehouses()
    ])
    orders.value = resOrders.data || []
    suppliers.value = resSup.data || []
    warehouses.value = resWH.data || []
  } catch (err) {
    console.error('Failed to load PO:', err)
  } finally {
    loading.value = false
  }
}

function openCreateModal() {
  form.value = {
    supplier_id: null,
    warehouse_id: null,
    date: new Date().toISOString().split('T')[0],
    notes: '',
    lines: []
  }
  if (!modalInstance) modalInstance = new Modal(document.getElementById('poModal'))
  modalInstance.show()
}

async function save() {
  saving.value = true
  try {
    await api.createPO(form.value)
    modalInstance.hide()
    loadData()
  } catch (error) {
    alert(error.response?.data?.error || 'Gagal menyimpan PO')
  } finally {
    saving.value = false
  }
}

async function submitDoc(po) {
  if(!confirm(`Ajukan PO ${po.number} untuk disetujui?`)) return
  try { await api.submitPO(po.uuid); loadData(); } 
  catch(e) { alert('Gagal mengajukan') }
}

async function approveDoc(po) {
  if(!confirm(`Setujui PO ${po.number}?`)) return
  try { await api.approvePO(po.uuid); loadData(); }
  catch(e) { alert('Gagal menyetujui') }
}

function viewDetail(po) {
  alert(`Detail PO ${po.number} - Untuk menambah/mengedit barang (lines) akan terbuka di halaman baru nanti.`)
}

function formatMoney(val) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(val || 0)
}
function formatDate(d) {
  if (!d) return '-'
  return new Date(d).toLocaleDateString('id-ID')
}

function statusBadge(status) {
  return {
    'draft': 'bg-secondary',
    'pending': 'bg-warning text-dark',
    'approved': 'bg-success',
    'rejected': 'bg-danger',
    'processed': 'bg-info text-dark',
    'billed': 'bg-primary',
    'paid': 'bg-dark'
  }[status] || 'bg-light text-dark'
}

onMounted(() => {
  loadData()
  const el = document.getElementById('poModal')
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
