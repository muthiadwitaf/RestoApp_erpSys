<template>
  <div class="dropdown user-dropdown">
    <button class="btn btn-sm dropdown-toggle user-toggle d-flex align-items-center gap-2" data-bs-toggle="dropdown" id="btn-user-menu" data-bs-auto-close="outside">
      <div class="avatar-circle">
        <span>{{ userInitials }}</span>
      </div>
      <div class="d-none d-md-flex flex-column align-items-start text-start">
        <span class="fw-bold lh-1 text-dark" style="font-size: 0.9rem;">{{ authStore.user?.name || 'User' }}</span>
        <span class="text-muted small lh-1 mt-1" style="font-size: 0.75rem;">{{ userRole }}</span>
      </div>
    </button>
    
    <div class="dropdown-menu dropdown-menu-end shadow-lg border-0 user-dropdown-menu mt-2 pt-0 pb-2">
      <!-- HEADER -->
      <div class="dropdown-header px-4 py-3 bg-primary text-white mb-2" style="border-radius: 0.5rem 0.5rem 0 0;">
        <div class="d-flex align-items-center gap-3">
          <div class="avatar-circle avatar-lg bg-white text-primary fw-bold">
            <span>{{ userInitials }}</span>
          </div>
          <div class="d-flex flex-column">
             <span class="fw-bold fs-6 text-truncate" style="max-width: 180px;">{{ authStore.user?.name || 'User' }}</span>
             <span class="opacity-75 small">{{ userRole }}</span>
             <span class="opacity-50 small mt-1" style="font-size: 0.7rem;"><i class="bi bi-geo-alt-fill me-1"></i>{{ branchStore.currentBranch?.name }}</span>
          </div>
        </div>
      </div>

      <!-- SHIFT CONTROL -->
      <ShiftStatus />

      <div class="dropdown-divider my-2 opacity-50"></div>

      <!-- MAIN ACTIONS -->
      <div class="px-2">
        <DropdownItem icon="bi bi-clock-history" to="/resto/history" description="Lihat riwayat transaksi kasir">Riwayat Shift</DropdownItem>
        <DropdownItem icon="bi bi-gear" to="/resto/settings" description="Atur EDC & Printer Kasir">Pengaturan POS</DropdownItem>
      </div>

      <div class="dropdown-divider my-2 opacity-50"></div>

      <!-- FOOTER -->
      <div class="px-2">
        <DropdownItem 
          icon="bi bi-box-arrow-right" 
          variant="danger" 
          description="Akhiri sesi dan keluar"
          @click="handleLogout"
        >
          Logout Sistem
        </DropdownItem>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useBranchStore } from '@/stores/branch'
import { useCompanyStore } from '@/stores/company'
import { useShiftStore } from '@/stores/shift'

import ShiftStatus from './ShiftStatus.vue'
import DropdownItem from './DropdownItem.vue'

const router = useRouter()
const authStore = useAuthStore()
const branchStore = useBranchStore()
const companyStore = useCompanyStore()
const shiftStore = useShiftStore()

const userInitials = computed(() => {
  const name = authStore.user?.name || 'User'
  const parts = name.split(' ')
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.substring(0, 2).toUpperCase()
})

const userRole = computed(() => {
  if (authStore.user?.is_super_admin) return 'Super Admin'
  const roles = authStore.user?.roleNames || []
  return roles.length > 0 ? roles[0] : 'Kasir'
})

onMounted(() => {
  // Always ensure shiftStore is fetched at least once when Dropdown mounts (global)
  if (!shiftStore.currentShift && !shiftStore.isLoading) {
    shiftStore.fetchCurrentShift()
  }
})

async function handleLogout(e) {
  if(e) e.preventDefault()
  await authStore.logout()
  branchStore.clearBranch()
  companyStore.clearCompany()
  router.push('/login')
}
</script>

<style scoped>
.user-toggle {
  background: transparent;
  border: 1px solid rgba(0,0,0,0.1);
  padding: 0.25rem 0.75rem 0.25rem 0.25rem;
  border-radius: 50px;
  transition: all 0.2s ease;
}
.user-toggle:hover, .user-toggle:focus {
  background: #f8f9fa;
  border-color: rgba(0,0,0,0.2);
}
.user-dropdown-menu {
  width: 320px;
  animation: dropdownFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  border-radius: 0.5rem;
}

@keyframes dropdownFadeIn {
  from { opacity: 0; transform: translateY(-10px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.avatar-circle {
  width: 32px;
  height: 32px;
  background-color: var(--bs-primary);
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  font-size: 0.8rem;
}
.avatar-circle.avatar-lg {
  width: 48px;
  height: 48px;
  font-size: 1.2rem;
}
</style>
