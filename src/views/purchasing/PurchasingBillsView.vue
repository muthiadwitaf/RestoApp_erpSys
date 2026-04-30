<template>
  <div class="purchasing-view">
    <div class="d-flex justify-content-between align-items-center mb-4 pb-2">
      <div>
        <h3 class="mb-1 text-gradient fw-bolder"><i class="bi bi-receipt-cutoff me-2 text-primary"></i>Tagihan (Bills)</h3>
        <span class="text-secondary small">Kelola faktur dan tagihan dari supplier</span>
      </div>
      <div>
        <!-- Typically, bills are generated from POs, but allow manual creation -->
        <button class="btn btn-primary rounded-pill px-4 btn-glow fw-semibold" @click="alert('Pilih PO terlebih dahulu untuk membuat tagihan otomatis.')">
          <i class="bi bi-plus-lg me-1"></i> Buat Bill
        </button>
      </div>
    </div>

    <!-- Table List -->
    <div class="erp-card mb-5">
      <div class="table-responsive">
        <table class="table table-hover align-middle mb-0 table-erp">
          <thead>
            <tr>
              <th>Nomor Bill</th>
              <th>Tanggal</th>
              <th>Nomor PO</th>
              <th>Jatuh Tempo</th>
              <th class="text-end">Total Tagihan</th>
              <th class="text-center">Status</th>
              <th class="text-end">Aksi</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="b in bills" :key="b.uuid" class="hover-row">
              <td class="fw-bold text-primary font-monospace">{{ b.number }}</td>
              <td>{{ formatDate(b.date) }}</td>
              <td>{{ b.po_number || '-' }}</td>
              <td :class="{'text-danger fw-bold': isOverdue(b.due_date) && b.status !== 'paid'}">
                {{ formatDate(b.due_date) }}
              </td>
              <td class="text-end fw-bold">{{ formatMoney(b.total) }}</td>
              <td class="text-center">
                <span class="badge" :class="statusBadge(b.status)">{{ b.status.toUpperCase() }}</span>
              </td>
              <td class="text-end pe-4">
                <button v-if="b.status !== 'paid'" class="btn btn-sm btn-success rounded-pill px-3 me-2 shadow-sm" @click="openPayModal(b)" title="Bayar">
                  <i class="bi bi-cash-coin me-1"></i> Bayar
                </button>
                <button class="btn btn-sm btn-link text-dark p-0" title="Lihat">
                  <i class="bi bi-eye fs-5"></i>
                </button>
              </td>
            </tr>
            <tr v-if="bills.length === 0 && !loading">
              <td colspan="7" class="text-center text-muted py-5">
                <i class="bi bi-stickies fs-1 d-block mb-2 opacity-25"></i>
                Belum ada tagihan pembelian.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Pay Modal -->
    <div class="modal fade modal-erp" id="payModal" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header bg-white">
            <h5 class="modal-title fw-bold text-dark"><i class="bi bi-cash-coin text-success me-2"></i>Pembayaran Tagihan</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body p-4" v-if="selectedBill">
            <div class="d-flex justify-content-between mb-2">
              <span class="text-muted">Nomor Tagihan</span>
              <span class="fw-bold">{{ selectedBill.number }}</span>
            </div>
            <div class="d-flex justify-content-between mb-4 pb-3 border-bottom">
              <span class="text-muted">Total Tagihan</span>
              <span class="fw-bold fs-5 text-primary">{{ formatMoney(selectedBill.total) }}</span>
            </div>

            <div class="mb-3">
              <label class="form-label fw-bold small">Nominal Bayar (Rp)</label>
              <input v-model.number="payAmount" type="number" class="form-control form-control-lg text-end" min="0" />
            </div>
            <div class="mb-3">
              <label class="form-label fw-bold small">Metode Bayar / Kas</label>
              <select v-model="payAccount" class="form-select">
                <option value="kas">Kas Utama</option>
                <option value="bank">Bank BCA</option>
              </select>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-light rounded-pill px-4 fw-semibold text-secondary" data-bs-dismiss="modal">Batal</button>
            <button type="button" class="btn btn-success rounded-pill px-4 fw-bold shadow-sm" @click="submitPayment" :disabled="saving">
              <i class="bi bi-check-circle me-1"></i> Proses Pembayaran
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

const bills = ref([])
const loading = ref(false)
const saving = ref(false)
let modalInstance = null

const selectedBill = ref(null)
const payAmount = ref(0)
const payAccount = ref('kas')

async function loadData() {
  loading.value = true
  try {
    const res = await api.getBills()
    bills.value = res.data || []
  } catch (err) {
    console.error('Failed to load Bills:', err)
  } finally {
    loading.value = false
  }
}

function openPayModal(b) {
  selectedBill.value = b
  payAmount.value = parseFloat(b.total) || 0 // Default full payment
  if (!modalInstance) modalInstance = new Modal(document.getElementById('payModal'))
  modalInstance.show()
}

async function submitPayment() {
  saving.value = true
  try {
    // In a real app, send { amount: payAmount, account: payAccount }
    await api.payBill(selectedBill.value.uuid, { amount: payAmount.value })
    modalInstance.hide()
    loadData()
  } catch (error) {
    alert(error.response?.data?.error || 'Gagal memproses pembayaran')
  } finally {
    saving.value = false
  }
}

function isOverdue(dateStr) {
  if (!dateStr) return false
  return new Date(dateStr) < new Date()
}

function formatDate(d) {
  if (!d) return '-'
  return new Date(d).toLocaleDateString('id-ID')
}

function formatMoney(val) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(val || 0)
}

function statusBadge(status) {
  return {
    'unpaid': 'bg-danger',
    'partial': 'bg-warning text-dark',
    'paid': 'bg-success'
  }[status] || 'bg-secondary'
}

onMounted(() => {
  loadData()
  const el = document.getElementById('payModal')
  if (el) modalInstance = new Modal(el)
})
</script>

<style scoped>
.purchasing-view {
  padding: 2rem 2.5rem;
  background-color: #f8faff;
  min-height: 100vh;
}
[data-theme="dark"] .purchasing-view {
  background-color: #1a1d23;
}
</style>
