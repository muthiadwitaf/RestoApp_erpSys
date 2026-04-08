<template>
  <div class="shift-status-card p-3 mx-2 mb-2 rounded-3 border">
    <div class="d-flex align-items-start justify-content-between mb-2">
      <div v-if="isOpen">
        <div class="d-flex align-items-center gap-2">
          <span class="status-indicator bg-success"></span>
          <span class="fw-bold text-success" style="font-size: 0.9rem;">Shift Aktif</span>
        </div>
        <div class="mt-1 small text-muted">
          Kas Awal: <span class="fw-semibold text-dark">Rp {{ formatMoney(currentShift?.opening_cash || 0) }}</span>
        </div>
      </div>
      <div v-else>
        <div class="d-flex align-items-center gap-2">
          <span class="status-indicator bg-danger"></span>
          <span class="fw-bold text-danger" style="font-size: 0.9rem;">Belum Ada Shift</span>
        </div>
        <div class="mt-1 small text-muted align-items-center d-flex">
          <i class="bi bi-info-circle me-1"></i> Buka kasir untuk mulai
        </div>
      </div>
    </div>

    <!-- Action Button -->
    <div class="mt-2">
      <button 
        v-if="isOpen" 
        class="btn btn-outline-danger btn-sm w-100 fw-bold d-flex align-items-center justify-content-center gap-2"
        @click="handleAction('close')"
      >
        <i class="bi bi-lock"></i> Tutup Kasir
      </button>
      <button 
        v-else 
        class="btn btn-success btn-sm w-100 fw-bold d-flex align-items-center justify-content-center gap-2"
        @click="handleAction('open')"
      >
        <i class="bi bi-unlock"></i> Buka Kasir
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useShiftStore } from '@/stores/shift'

const shiftStore = useShiftStore()
const router = useRouter()
const route = useRoute()

const isOpen = computed(() => shiftStore.isOpen)
const currentShift = computed(() => shiftStore.currentShift)

const formatMoney = (val) => Number(val || 0).toLocaleString('id-ID')

function handleAction(type) {
  if (type === 'close') {
    shiftStore.showCloseModal = true
  } else {
    shiftStore.showOpenModal = true
  }
  
  // Jika sedang tidak di menu POS, arahkan ke menu POS
  if (!route.path.startsWith('/resto/pos')) {
    router.push('/resto/pos')
  }

  // Menutup dropdown (event dari parent jika diperlukan, 
  // atau bootstrap data-bs-dismiss otomatis apabila UserDropdown mengaturnya)
  // Tapi kita bisa tembak event JS native click untuk menutup bootstrap dropdown
  document.body.click()
}
</script>

<style scoped>
.shift-status-card {
  background-color: #f8f9fa;
  box-shadow: inset 0 0 0 1px rgba(0,0,0,.05);
}
.status-indicator {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
  box-shadow: 0 0 0 2px #fff, 0 0 0 4px currentColor;
  opacity: 0.8;
}
.bg-success {
  color: #198754;
}
.bg-danger {
  color: #dc3545;
}
</style>
