<template>
  <div class="hr-view">
    <div class="inv-header d-flex justify-content-between align-items-center border-bottom pb-3 mb-3">
      <div>
        <h3 class="mb-0 fw-bold"><i class="bi bi-calendar-check me-2 text-primary"></i>Kehadiran & Cuti</h3>
        <span class="text-muted small">Pantau jam kerja (clock-in/out) dan permohonan cuti</span>
      </div>
      <div>
        <button class="btn btn-outline-primary" @click="alert('Persetujuan Cuti akan diimplementasi di sini.')">
          <i class="bi bi-check2-square me-1"></i> Approval Cuti
        </button>
      </div>
    </div>

    <!-- Table Absensi -->
    <div class="card border-0 shadow-sm mt-4">
      <div class="card-header bg-white py-3 d-flex justify-content-between align-items-center">
        <h6 class="mb-0 fw-bold">Log Absensi Harian</h6>
        <input type="date" class="form-control form-control-sm w-auto" />
      </div>
      <div class="card-body p-0 table-responsive">
        <table class="table table-hover align-middle mb-0">
          <thead class="table-light">
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
                <span class="badge" :class="att.status === 'Hadir' ? 'bg-success' : 'bg-warning text-dark'">
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
  padding: 24px;
}
</style>
