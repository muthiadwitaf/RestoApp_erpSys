<template>
  <div class="hr-view">
    <!-- HMR Trigger -->
    <div class="d-flex justify-content-between align-items-center mb-4 pb-2">
      <div>
        <h3 class="mb-1 text-gradient fw-bolder"><i class="bi bi-calendar-check me-2 text-primary"></i>Kehadiran & Cuti</h3>
        <span class="text-secondary small">Pantau jam kerja (clock-in/out) dan permohonan cuti</span>
      </div>
      <div>
        <button class="btn btn-outline-primary rounded-pill px-4" @click="alert('Persetujuan Cuti akan diimplementasi di sini.')">
          <i class="bi bi-check2-square me-1"></i> Approval Cuti
        </button>
      </div>
    </div>

    <!-- Table Absensi -->
    <div class="erp-card mt-4 mb-5">
      <div class="card-header bg-white py-3 border-bottom d-flex justify-content-between align-items-center">
        <h6 class="mb-0 fw-bold text-dark">Log Absensi Harian</h6>
        <input type="date" class="form-control form-control-sm w-auto rounded-pill px-3 input-glass border-0 shadow-sm" />
      </div>
      <div class="table-responsive">
        <table class="table table-hover align-middle mb-0 table-erp">
          <thead>
            <tr>
              <th>Nama Pegawai</th>
              <th>Clock In</th>
              <th>Clock Out</th>
              <th>Durasi Kerja</th>
              <th class="text-center">Status Kehadiran</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(att, idx) in attendanceList" :key="idx" class="hover-row">
              <td class="fw-bold">{{ att.employee_name }}</td>
              <td class="text-success"><i class="bi bi-clock me-1"></i>{{ att.clock_in }}</td>
              <td class="text-danger"><i class="bi bi-clock me-1"></i>{{ att.clock_out || '-' }}</td>
              <td>{{ att.duration || '-' }}</td>
              <td class="text-center">
                <span class="badge rounded-pill fw-normal px-3" :class="att.status === 'Hadir' ? 'bg-success-subtle text-success' : 'bg-warning-subtle text-warning'">
                  {{ att.status }}
                </span>
              </td>
            </tr>
            <tr v-if="attendanceList.length === 0 && !loading">
              <td colspan="5" class="text-center text-muted py-5">
                <i class="bi bi-journal-x fs-1 d-block mb-3 opacity-25"></i>
                <p class="mb-0">Tidak ada data kehadiran hari ini.</p>
                <small>Log absensi akan masuk otomatis begitu karyawan melakukan PIN clock-in di POS.</small>
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
import * as api from '@/services/hr/api'

const attendanceList = ref([])
const loading = ref(false)

async function loadData() {
  loading.value = true
  // Mock fallback if employee claims logic isn't heavily seeded yet
  // In a real flow, this fetches from api.getAttendance(...)
  setTimeout(() => {
    loading.value = false;
  }, 500)
}

onMounted(() => {
  loadData()
})
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
