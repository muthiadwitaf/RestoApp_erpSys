<template>
  <div class="accounting-view">
    <div class="d-flex justify-content-between align-items-center mb-4 pb-2">
      <div>
        <h3 class="mb-1 text-gradient fw-bolder"><i class="bi bi-journal-check me-2 text-primary"></i>Jurnal Transaksi</h3>
        <span class="text-secondary small">Riwayat otomatis dari POS & Purchasing dan input Jurnal Umum</span>
      </div>
      <div>
        <button class="btn btn-primary rounded-pill px-4 btn-glow fw-semibold" @click="alert('Fitur tambah jurnal manual akan diimplementasi di sini.')">
          <i class="bi bi-plus-lg me-1"></i> Buat Jurnal Baru
        </button>
      </div>
    </div>

    <!-- Table List -->
    <div class="erp-card mb-5">
      <div class="table-responsive">
        <table class="table table-hover align-middle mb-0 table-erp">
          <thead>
            <tr>
              <th>Nomor Jurnal</th>
              <th>Tanggal</th>
              <th>Deskripsi / Ref</th>
              <th class="text-center">Total Debit</th>
              <th class="text-center">Total Kredit</th>
              <th class="text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="j in journals" :key="j.uuid" class="hover-row">
              <td class="fw-bold text-primary font-monospace">{{ j.number }}</td>
              <td>{{ formatDate(j.date) }}</td>
              <td class="small">{{ j.description }}</td>
              <td class="text-center fw-semibold text-success">{{ formatMoney(getTotals(j).debit) }}</td>
              <td class="text-center fw-semibold text-danger">{{ formatMoney(getTotals(j).credit) }}</td>
              <td class="text-center">
                <span class="badge rounded-pill fw-normal px-3" :class="j.status === 'posted' ? 'bg-success-subtle text-success' : 'bg-warning-subtle text-warning'">
                  {{ j.status.toUpperCase() }}
                </span>
              </td>
            </tr>
            <tr v-if="journals.length === 0 && !loading">
              <td colspan="6" class="text-center text-muted py-5">
                <i class="bi bi-book-half fs-1 d-block mb-2 opacity-25"></i>
                Belum ada transaksi jurnal.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import * as api from '@/services/accounting/api'

const journals = ref([])
const loading = ref(false)

async function loadData() {
  loading.value = true
  try {
    const res = await api.getJournals()
    journals.value = res.data || []
  } catch (error) {
    console.error('Failed to load journals', error)
  } finally {
    loading.value = false
  }
}

function getTotals(journal) {
  let debit = 0; let credit = 0;
  if(journal.lines && Array.isArray(journal.lines)) {
    journal.lines.forEach(l => {
      debit += parseFloat(l.debit || 0)
      credit += parseFloat(l.credit || 0)
    })
  }
  return { debit, credit }
}

function formatMoney(val) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(val || 0)
}
function formatDate(d) {
  if (!d) return '-'
  return new Date(d).toLocaleDateString('id-ID')
}

onMounted(() => {
  loadData()
})
</script>

<style scoped>
.accounting-view {
  padding: 2rem 2.5rem;
  background-color: #f8faff;
  min-height: 100vh;
}
[data-theme="dark"] .accounting-view {
  background-color: #1a1d23;
}
</style>
