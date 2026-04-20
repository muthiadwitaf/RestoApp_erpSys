<template>
  <div class="inv-view">
    <!-- Header -->
    <div class="inv-header d-flex justify-content-between align-items-center border-bottom pb-3 mb-3">
      <div>
        <h3 class="mb-0 fw-bold"><i class="bi bi-clipboard-check me-2 text-primary"></i>Stock Opname</h3>
        <span class="text-muted small">Penyesuaian stok fisik dan sistem</span>
      </div>
      <div>
        <button class="btn btn-primary" @click="openCreateModal">
          <i class="bi bi-plus-lg me-1"></i> Buat Opname
        </button>
      </div>
    </div>

    <!-- Table -->
    <div class="card border-0 shadow-sm">
      <div class="card-body p-0 table-responsive">
        <table class="table table-hover align-middle mb-0">
          <thead class="table-light">
            <tr>
              <th>Nomor Opname</th>
              <th>Tanggal</th>
              <th>Gudang</th>
              <th>Status</th>
              <th>Pembuat</th>
              <th class="text-end">Aksi</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="op in opnames" :key="op.uuid" class="hover-row">
              <td class="fw-bold text-primary font-monospace">{{ op.number }}</td>
              <td>{{ formatDate(op.date) }}</td>
              <td><i class="bi bi-building me-1"></i>{{ op.warehouse_name }}</td>
              <td>
                <span class="badge" :class="statusBadge(op.status)">{{ op.status.toUpperCase() }}</span>
              </td>
              <td>{{ op.created_by || '-' }}</td>
              <td class="text-end">
                <button v-if="op.status === 'draft'" class="btn btn-sm btn-outline-success me-2" @click="submitDoc(op)" title="Ajukan">
                  <i class="bi bi-send"></i>
                </button>
                <button v-if="op.status === 'pending'" class="btn btn-sm btn-outline-primary me-2" @click="approveDoc(op)" title="Setujui">
                  <i class="bi bi-check2-circle"></i>
                </button>
                <button class="btn btn-sm btn-light border text-dark" @click="viewDetail(op)" title="Lihat Detail">
                  <i class="bi bi-eye"></i>
                </button>
              </td>
            </tr>
            <tr v-if="opnames.length === 0 && !loading">
              <td colspan="6" class="text-center text-muted py-5">
                <i class="bi bi-journal-x fs-1 d-block mb-2 opacity-25"></i>
                Belum ada dokumen Stock Opname.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Create Modal -->
    <div class="modal fade" id="createOpnameModal" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content border-0 shadow">
          <div class="modal-header bg-light">
            <h5 class="modal-title fw-bold">Buat Stock Opname Baru</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body p-4">
            <div class="mb-3">
              <label class="form-label fw-bold small">Pilih Gudang</label>
              <select v-model="form.warehouse_id" class="form-select">
                <option :value="null">-- Pilih Gudang --</option>
                <option v-for="w in warehouses" :key="w.id" :value="w.id">{{ w.name }}</option>
              </select>
            </div>
            <div class="mb-3">
              <label class="form-label fw-bold small">Tanggal</label>
              <input type="date" v-model="form.date" class="form-control" />
            </div>
            <div class="mb-3">
              <label class="form-label fw-bold small">Catatan</label>
              <textarea v-model="form.notes" class="form-control" rows="2"></textarea>
            </div>
            <div class="alert alert-info py-2 small">
              <i class="bi bi-info-circle me-1"></i> Setelah dokumen dibuat, Anda dapat mengisi qty aktual masing-masing barang.
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Batal</button>
            <button type="button" class="btn btn-primary" @click="createOpname" :disabled="!form.warehouse_id || saving">
              <i class="bi bi-check-lg"></i> Buat Dokumen
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
import * as api from '@/services/inventory/api'

const opnames = ref([])
const warehouses = ref([])
const loading = ref(false)
const saving = ref(false)
let modalCreate = null

const form = ref({
  warehouse_id: null,
  date: new Date().toISOString().split('T')[0],
  notes: ''
})

async function loadData() {
  loading.value = true
  try {
    const [resOpnames, resWH] = await Promise.all([
      api.getOpnames(),
      api.getWarehouses()
    ])
    opnames.value = resOpnames.data || []
    warehouses.value = resWH.data || []
  } catch (error) {
    console.error('Data load error:', error)
  } finally {
    loading.value = false
  }
}

function openCreateModal() {
  form.value = {
    warehouse_id: null,
    date: new Date().toISOString().split('T')[0],
    notes: ''
  }
  if (!modalCreate) modalCreate = new bootstrap.Modal(document.getElementById('createOpnameModal'))
  modalCreate.show()
}

async function createOpname() {
  saving.value = true
  try {
    // Requires an empty lines array initially
    const payload = {
      ...form.value,
      lines: []
    }
    await api.createOpname(payload)
    modalCreate.hide()
    await loadData()
  } catch (error) {
    alert(error.response?.data?.error || 'Gagal membuat dokumen opname')
  } finally {
    saving.value = false
  }
}

async function submitDoc(op) {
  if (!confirm(`Ajukan dokumen ${op.number} untuk disetujui?`)) return
  try {
    await api.submitOpname(op.uuid)
    loadData()
  } catch (e) {
    alert(e.response?.data?.error || 'Gagal mengajukan dokumen')
  }
}

async function approveDoc(op) {
  if (!confirm(`Setujui opname ${op.number}? Ini akan memperbarui qty stok akhir.`)) return
  try {
    await api.approveOpname(op.uuid)
    loadData()
  } catch (e) {
    alert(e.response?.data?.error || 'Gagal menyetuji dokumen')
  }
}

function viewDetail(op) {
  alert(`Preview Detail ${op.number}. Fitur edit lines akan diimplementasikan.`)
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
    'rejected': 'bg-danger'
  }[status] || 'bg-light text-dark'
}

onMounted(() => {
  loadData()
  const el = document.getElementById('createOpnameModal')
  if (el) modalCreate = new bootstrap.Modal(el)
})
</script>

<style scoped>
.inv-view {
  padding: 24px;
}
.hover-row {
  transition: background-color 0.15s ease;
}
.hover-row:hover {
  background-color: var(--bs-primary-bg-subtle) !important;
}
</style>
