<template>
  <div class="user-panel-container dropdown" data-bs-theme-dropdown>
    <!-- Trigger Button -->
    <button
      class="btn btn-sm d-flex align-items-center gap-2 user-toggle border-0"
      data-bs-toggle="dropdown"
      data-bs-auto-close="outside"
      id="userPanelDropdownBtn"
    >
      <div class="avatar-circle shadow-sm">
        <span>{{ userInitials }}</span>
      </div>
      <div class="d-none d-md-flex flex-column align-items-start text-start">
        <span class="fw-bold lh-1 text-body" style="font-size: 0.9rem;">{{ userName }}</span>
        <span class="text-secondary small lh-1 mt-1" style="font-size: 0.75rem;">{{ userRole }}</span>
      </div>
    </button>

    <!-- Panel Dropdown Content -->
    <div class="dropdown-menu dropdown-menu-end shadow border-0 p-0 user-panel-menu bg-body" aria-labelledby="userPanelDropdownBtn">
      
      <!-- 1. User Card -->
      <div class="user-card p-4 bg-body-tertiary border-bottom rounded-top">
        <div class="d-flex align-items-center gap-3">
          <div class="avatar-circle avatar-xl bg-primary text-white shadow">
            <span>{{ userInitials }}</span>
          </div>
          <div class="d-flex flex-column">
             <span class="fw-bold fs-5 text-body">{{ userName }}</span>
             <span class="text-secondary small fw-medium">{{ userRole }}</span>
             <span class="text-secondary small mt-1 d-flex align-items-center gap-1 opacity-75">
               <i class="bi bi-shop"></i> {{ currentBranchName }}
             </span>
          </div>
        </div>
      </div>

      <div class="p-3">
        <!-- 2. Status Kasir (Read Only) -->
        <div class="status-kasir-box p-3 mb-3 rounded-3 border">
          <div class="d-flex justify-content-between align-items-center mb-2">
             <span class="small fw-bold text-secondary tracking-wide">{{ t('cashier_status') }}</span>
             <span v-if="isShiftOpen" class="badge bg-success-subtle text-success border border-success-subtle rounded-pill px-2 py-1">OPEN</span>
             <span v-else class="badge bg-danger-subtle text-danger border border-danger-subtle rounded-pill px-2 py-1">CLOSED</span>
          </div>
          
          <div class="mb-3 small">
            <template v-if="isShiftOpen">
              <div class="text-secondary mb-1"><i class="bi bi-clock-history me-1"></i> {{ t('active_shift') }}</div>
              <div class="fw-semibold text-body fs-6">{{ t('starting_cash') }} {{ formatMoney(currentShift?.opening_cash || 0) }}</div>
            </template>
            <template v-else>
              <div class="text-secondary"><i class="bi bi-info-circle me-1"></i> {{ t('shift_closed_msg') }}</div>
            </template>
          </div>

          <!-- Tombol redirect POS -->
          <button @click="goToPos" class="btn btn-primary btn-sm w-100 d-flex justify-content-center align-items-center gap-2 fw-semibold">
            <i class="bi bi-display"></i> {{ t('enter_pos') }}
          </button>
        </div>

        <hr class="dropdown-divider my-3 opacity-25">

        <!-- 3. Pengaturan Akun -->
        <div class="mb-3">
          <div class="small fw-bold text-secondary mb-2 ps-1 tracking-wide">{{ t('account') }}</div>
          <button class="dropdown-item rounded d-flex align-items-center gap-3 py-2 px-3" @click="openModal('editProfile')">
            <div class="icon-box"><i class="bi bi-person-gear"></i></div>
            <span class="fw-medium">{{ t('edit_profile') }}</span>
          </button>
          <button class="dropdown-item rounded d-flex align-items-center gap-3 py-2 px-3" @click="openModal('changePassword')">
            <div class="icon-box"><i class="bi bi-shield-lock"></i></div>
            <span class="fw-medium">{{ t('change_pass') }}</span>
          </button>
        </div>

        <hr class="dropdown-divider my-3 opacity-25">

        <!-- 4. Preferensi User -->
        <div class="mb-2">
          <div class="small fw-bold text-secondary mb-2 ps-1 tracking-wide">{{ t('preferences') }}</div>
          
          <!-- Dark Mode Toggle -->
          <div class="dropdown-item rounded d-flex justify-content-between align-items-center py-2 px-3 toggle-cursor" @click.stop="toggleTheme">
            <div class="d-flex align-items-center gap-3">
              <div class="icon-box"><i class="bi bi-moon-stars"></i></div>
              <span class="fw-medium">Dark Mode</span>
            </div>
            <div class="form-check form-switch m-0 pb-1">
              <input class="form-check-input" type="checkbox" role="switch" :checked="themeStore.isDark" style="pointer-events: none;">
            </div>
          </div>

          <!-- Bahasa -->
          <button class="dropdown-item rounded d-flex justify-content-between align-items-center py-2 px-3" @click="openModal('changeLanguage')">
            <div class="d-flex align-items-center gap-3">
              <div class="icon-box"><i class="bi bi-translate"></i></div>
              <span class="fw-medium">{{ t('language') }}</span>
            </div>
            <span class="badge bg-body-secondary text-body border">{{ currentLanguage === 'ID' ? 'ID' : 'EN' }}</span>
          </button>
        </div>
      </div>

      <!-- 5. Logout -->
      <div class="p-3 border-top bg-body-tertiary rounded-bottom">
        <button class="btn btn-logout w-100 py-2 d-flex justify-content-center align-items-center gap-2 fw-bold rounded-3" @click="handleLogout">
          <i class="bi bi-box-arrow-right"></i> {{ t('logout') }}
        </button>
      </div>
    </div>

    <!-- VUE REACTIVE MODALS (Teletoport to body) -->
    <Teleport to="body">
      
      <!-- MODAL: EDIT PROFIL -->
      <div v-if="activeModal === 'editProfile'" class="modal fade show d-block" tabindex="-1" style="z-index:1060;">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content border-0 shadow">
            <div class="modal-header border-bottom">
              <h5 class="modal-title fw-bold">{{ t('edit_profile') }}</h5>
              <button type="button" class="btn-close" @click="closeModal"></button>
            </div>
            <div class="modal-body p-4">
              <div class="mb-3">
                <label class="form-label fw-medium text-secondary small">{{ t('full_name') }}</label>
                <input type="text" class="form-control" v-model="profileForm.name" :placeholder="t('ph_name')">
              </div>
              <div class="mb-3">
                <label class="form-label fw-medium text-secondary small">{{ t('email_addr') }}</label>
                <input type="email" class="form-control" v-model="profileForm.email" :placeholder="t('ph_email')">
              </div>
            </div>
            <div class="modal-footer border-top bg-body-tertiary">
              <button type="button" class="btn btn-light border" @click="closeModal">{{ t('cancel') }}</button>
              <button type="button" class="btn btn-primary px-4" @click="saveProfile" :disabled="isSavingProfile">
                <span v-if="isSavingProfile" class="spinner-border spinner-border-sm me-2"></span>
                {{ t('save_prof') }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- MODAL: GANTI PASSWORD -->
      <div v-if="activeModal === 'changePassword'" class="modal fade show d-block" tabindex="-1" style="z-index:1060;">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content border-0 shadow">
            <div class="modal-header border-bottom">
              <h5 class="modal-title fw-bold">{{ t('change_pass') }}</h5>
              <button type="button" class="btn-close" @click="closeModal"></button>
            </div>
            <div class="modal-body p-4">
              <div class="mb-3">
                <label class="form-label fw-medium text-secondary small">{{ t('new_pass') }}</label>
                <input type="password" class="form-control" v-model="passForm.newPass" :placeholder="t('ph_new_pass')">
              </div>
              <div class="mb-3">
                <label class="form-label fw-medium text-secondary small">{{ t('conf_pass') }}</label>
                <input type="password" class="form-control" v-model="passForm.confPass" :placeholder="t('ph_conf_pass')">
              </div>
              <div v-show="passError" class="alert alert-danger py-2 small mb-0"><i class="bi bi-exclamation-triangle me-1"></i> {{ passError }}</div>
            </div>
            <div class="modal-footer border-top bg-body-tertiary">
              <button type="button" class="btn btn-light border" @click="closeModal">{{ t('cancel') }}</button>
              <button type="button" class="btn btn-primary px-4" @click="savePassword" :disabled="isSavingPass">
                 <span v-if="isSavingPass" class="spinner-border spinner-border-sm me-2"></span>
                 {{ t('save_pass') }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- MODAL: BAHASA -->
      <div v-if="activeModal === 'changeLanguage'" class="modal fade show d-block" tabindex="-1" style="z-index:1060;">
        <div class="modal-dialog modal-dialog-centered modal-sm">
          <div class="modal-content border-0 shadow">
            <div class="modal-header border-bottom">
              <h5 class="modal-title fw-bold fs-6">{{ t('choose_lang') }}</h5>
              <button type="button" class="btn-close" @click="closeModal"></button>
            </div>
            <div class="modal-body p-2">
              <div class="list-group list-group-flush rounded">
                <button class="list-group-item list-group-item-action d-flex justify-content-between align-items-center border-0" @click="_setLanguage('ID')">
                  <span><span class="fs-4 me-2">🇮🇩</span> Indonesia</span>
                  <i class="bi bi-check-circle-fill text-primary" v-if="currentLanguage === 'ID'"></i>
                </button>
                <button class="list-group-item list-group-item-action d-flex justify-content-between align-items-center border-0" @click="_setLanguage('EN')">
                  <span><span class="fs-4 me-2">🇺🇸</span> English</span>
                  <i class="bi bi-check-circle-fill text-primary" v-if="currentLanguage === 'EN'"></i>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- GLOBAL MODAL BACKDROP -->
      <div v-if="activeModal" class="modal-backdrop fade show" style="z-index: 1055;" @click="closeModal"></div>

    </Teleport>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useBranchStore } from '@/stores/branch'
import { useCompanyStore } from '@/stores/company'
import { useShiftStore } from '@/stores/shift'
import { useThemeStore } from '@/stores/theme'
import { useLang } from '@/composables/useLang'
import * as settingsApi from '@/services/settings/api'
const router = useRouter()
const authStore = useAuthStore()
const branchStore = useBranchStore()
const companyStore = useCompanyStore()
const shiftStore = useShiftStore()
const themeStore = useThemeStore()
const { currentLanguage, t, setLanguage } = useLang()

// Modal states
const activeModal = ref(null) // 'editProfile' | 'changePassword' | 'changeLanguage' | null

// State management
const localRestoName = ref(localStorage.getItem('resto_local_name') || 'Smart POS')
const userName = computed(() => authStore.user?.name || 'Kasir User')
const currentBranchName = computed(() => branchStore.currentBranch?.name || t('all_branches'))

const userInitials = computed(() => {
  const name = userName.value
  const parts = name.split(' ')
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.substring(0, 2).toUpperCase()
})

const userRole = computed(() => {
  if (authStore.user?.is_super_admin) return 'Super Admin'
  const roles = authStore.user?.roleNames || []
  return roles.length > 0 ? roles[0] : 'Kasir'
})

// Shift states
const isShiftOpen = computed(() => shiftStore.isOpen)
const currentShift = computed(() => shiftStore.currentShift)
const formatMoney = (val) => Number(val || 0).toLocaleString('id-ID')

// Profile & Password State
const profileForm = reactive({ name: '', email: '' })
const isSavingProfile = ref(false)

const passForm = reactive({ newPass: '', confPass: '' })
const isSavingPass = ref(false)
const passError = ref('')

onMounted(() => {
  window.addEventListener('restoConfigUpdated', () => {
    localRestoName.value = localStorage.getItem('resto_local_name') || 'Smart POS'
  })
  
  if (!shiftStore.currentShift && !shiftStore.isLoading) {
    shiftStore.fetchCurrentShift()
  }
  // Load current user profile 
  if (authStore.user) {
    profileForm.name = authStore.user.name || ''
    profileForm.email = authStore.user.email || ''
  }
})

// UI Logics
function closeDropdown() {
  document.body.click() // Hack safe to close Bootstrap dropdown auto-close="outside"
}

function toggleTheme() {
  themeStore.toggle()
}

function openModal(modalName) {
  closeDropdown()
  activeModal.value = modalName
  
  if (modalName === 'editProfile' && authStore.user) {
    profileForm.name = authStore.user.name || ''
    profileForm.email = authStore.user.email || ''
  }
}

function closeModal() {
  activeModal.value = null
  passError.value = ''
  passForm.newPass = ''
  passForm.confPass = ''
}

function goToPos() {
  closeDropdown()
  router.push('/resto/pos')
}

// Action: Save Profile API Call
async function saveProfile() {
  if (!authStore.user?.uuid) return
  isSavingProfile.value = true
  try {
    await settingsApi.updateUser(authStore.user.uuid, {
      name: profileForm.name,
      email: profileForm.email
    })
    
    // Update local user 
    const updatedUser = { ...authStore.user, name: profileForm.name, email: profileForm.email }
    authStore.setUser(updatedUser, localStorage.getItem('erp_access_token'))

    closeModal()
    alert(t('prof_success'))
  } catch (e) {
    alert(t('prof_fail') + (e.response?.data?.error || e.message))
  } finally {
    isSavingProfile.value = false
  }
}

// Action: Save Password API Call
async function savePassword() {
  passError.value = ''
  if (!passForm.newPass) {
    passError.value = t('pass_req')
    return
  }
  if (passForm.newPass.length < 6) {
    passError.value = t('pass_min')
    return
  }
  if (passForm.newPass !== passForm.confPass) {
    passError.value = t('pass_match')
    return
  }
  
  if (!authStore.user?.uuid) return
  isSavingPass.value = true
  try {
    await settingsApi.updateUser(authStore.user.uuid, { password: passForm.newPass })
    
    closeModal()
    alert(t('pass_success'))
  } catch (e) {
    passError.value = t('pass_fail') + (e.response?.data?.error || e.message)
  } finally {
    isSavingPass.value = false
  }
}

// Action: Set Language Layout used directly from useLang, but we can wrap it to close modal
function _setLanguage(lang) {
  setLanguage(lang)
  closeModal()
}

async function handleLogout(e) {
  if(e) e.preventDefault()
  await authStore.logout()
  branchStore.clearBranch()
  companyStore.clearCompany()
  router.push('/login')
}
</script>

<style scoped>
.user-panel-container {
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
}

.user-toggle {
  background: transparent;
  padding: 0.35rem 0.5rem;
  border-radius: 50px;
  transition: background-color 0.2s ease;
}

.user-toggle:hover, .user-toggle:focus {
  background: var(--bs-secondary-bg);
}

.user-panel-menu {
  width: 340px;
  border-radius: 1rem;
  animation: slideDown 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04) !important;
}

@keyframes slideDown {
  from { opacity: 0; transform: translateY(-10px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.avatar-circle {
  background-color: var(--bs-primary, #0d6efd);
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
}
.avatar-circle {
  width: 36px;
  height: 36px;
  font-size: 0.9rem;
}
.avatar-circle.avatar-xl {
  width: 60px;
  height: 60px;
  font-size: 1.5rem;
}

.tracking-wide {
  letter-spacing: 0.05em;
}

.status-kasir-box {
  background: var(--bs-secondary-bg);
  box-shadow: inset 0 0 0 1px rgba(var(--bs-body-color-rgb), 0.1);
}

.icon-box {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--bs-tertiary-bg);
  color: var(--bs-secondary-color);
  border-radius: 8px;
  transition: all 0.2s;
}

.dropdown-item {
  color: var(--bs-body-color);
  transition: all 0.15s ease;
}

.dropdown-item:hover {
  background-color: var(--bs-secondary-bg);
  color: var(--bs-emphasis-color);
}

.dropdown-item:hover .icon-box {
  background-color: var(--bs-primary-bg-subtle, #cfe2ff);
  color: var(--bs-primary);
}

.toggle-cursor {
  cursor: pointer;
}

/* Penyesuaian logout dengan theme responsif */
html[data-bs-theme="dark"] .btn-logout {
  background-color: rgba(var(--bs-danger-rgb), 0.1);
  color: var(--bs-danger);
}
html[data-bs-theme="dark"] .btn-logout:hover {
  background-color: rgba(var(--bs-danger-rgb), 0.2);
}
html:not([data-bs-theme="dark"]) .btn-logout {
  background-color: #fef2f2;
  color: #dc2626;
}
html:not([data-bs-theme="dark"]) .btn-logout:hover {
  background-color: #fee2e2;
  color: #b91c1c;
}

.form-switch .form-check-input {
  cursor: pointer;
  height: 1.25rem;
  width: 2.25rem;
}
</style>
