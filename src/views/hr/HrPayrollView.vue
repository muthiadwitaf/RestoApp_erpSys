<template>
  <div class="hr-view">
    <div class="d-flex justify-content-between align-items-center mb-4 pb-2">
      <div>
        <h3 class="mb-1 text-gradient fw-bolder"><i class="bi bi-cash-stack me-2 text-primary"></i>Payroll & TER PPh 21</h3>
        <span class="text-secondary small">Generate slip gaji otomatis & perhitungan pajak tarif efektif (TER)</span>
      </div>
      <div>
        <button class="btn btn-primary rounded-pill px-4 btn-glow fw-semibold" @click="alert('Jalankan Generate Payroll untuk periode bulan berjalan.')">
          <i class="bi bi-calculator me-1"></i> Generate Payroll
        </button>
      </div>
    </div>

    <!-- Table -->
    <div class="erp-card mb-5">
      <div class="table-responsive">
        <table class="table table-hover align-middle mb-0 table-erp">
          <thead>
            <tr>
              <th>Periode</th>
              <th>Nama Karyawan</th>
              <th class="text-end">Gaji Pokok</th>
              <th class="text-end">Tunjangan</th>
              <th class="text-end">Potongan</th>
              <th class="text-end">Pajak PPh 21</th>
              <th class="text-end">Take Home Pay</th>
              <th class="text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(pay, idx) in payrolls" :key="idx" class="hover-row">
              <td class="fw-bold text-muted small">{{ pay.period }}</td>
              <td class="fw-bold">{{ pay.employee_name }}</td>
              <td class="text-end">{{ formatMoney(pay.basic_salary) }}</td>
              <td class="text-end text-success">+{{ formatMoney(pay.allowance) }}</td>
              <td class="text-end text-danger">-{{ formatMoney(pay.deduction) }}</td>
              <td class="text-end text-danger">-{{ formatMoney(pay.tax) }}</td>
              <td class="text-end fw-bold text-primary fs-6">{{ formatMoney(pay.net_salary) }}</td>
              <td class="text-center">
                <span class="badge rounded-pill fw-normal px-3" :class="pay.status === 'Paid' ? 'bg-success-subtle text-success' : 'bg-secondary-subtle text-secondary'">{{ pay.status }}</span>
              </td>
            </tr>
            <tr v-if="payrolls.length === 0 && !loading">
              <td colspan="8" class="text-center text-muted py-5">
                <i class="bi bi-receipt fs-1 d-block mb-3 opacity-25"></i>
                <p class="mb-0">Belum ada slip gaji yang digenerate.</p>
                <small>Tekan tombol Generate Payroll di pojok kanan atas.</small>
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

const payrolls = ref([])
const loading = ref(false)

function formatMoney(val) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(val || 0)
}

function loadData() {
  loading.value = true;
  // Fallback map layout
  setTimeout(() => { loading.value = false }, 500)
}

onMounted(() => loadData())
</script>

<style scoped>
.hr-view {
  padding: 2rem 2.5rem;
  background-color: #f8faff;
  min-height: 100vh;
}
[data-theme="dark"] .hr-view {
  background-color: #1a1d23;
}
</style>
