<template>
  <div class="toast-container position-fixed top-0 end-0 p-3" style="z-index: 9999">
    <div v-for="t in toasts" :key="t.id" class="toast show mb-2" :class="'border-' + t.type" role="alert">
      <div class="toast-body d-flex align-items-center gap-2">
        <i class="bi" :class="iconClass(t.type)"></i>
        <span>{{ t.message }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useToast } from '@/composables/useToast'
const { toasts } = useToast()
function iconClass(type) {
  return { success: 'bi-check-circle-fill text-success', danger: 'bi-x-circle-fill text-danger', warning: 'bi-exclamation-triangle-fill text-warning', info: 'bi-info-circle-fill text-info' }[type] || 'bi-bell'
}
</script>

<style scoped>
.toast { background: var(--card-bg, #fff); border-left: 4px solid; box-shadow: 0 4px 12px rgba(0,0,0,0.15); animation: slideIn 0.3s ease; }
@keyframes slideIn { from { opacity: 0; transform: translateX(100%); } to { opacity: 1; transform: translateX(0); } }
</style>
