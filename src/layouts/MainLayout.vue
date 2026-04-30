<template>
  <div class="d-flex">
    <!-- Mobile Overlay -->
    <div class="sidebar-overlay" :class="{ active: mobileOpen }" @click="closeMobileSidebar"></div>
    <!-- Sidebar -->
    <nav class="sidebar" :class="{ collapsed: sidebarCollapsed, 'mobile-open': mobileOpen }" id="sidebar">
      <!-- Brand: local resto name -->
      <a href="/" class="sidebar-brand">
        <i class="bi bi-display"></i>
        <span class="ms-2">
          <span class="d-block text-truncate" style="font-size:0.9rem;font-weight:700;color:#fff;max-width:140px">{{ localRestoName }}</span>
        </span>
      </a>
      <ul class="sidebar-nav pos-sidebar-nav mt-3">
        <li class="nav-item px-3 mb-2 text-uppercase text-white-50" v-if="authStore.hasPermission('pos:view') || authStore.hasPermission('reportingsales:view')" style="font-size: 0.75rem; font-weight: 600; letter-spacing: 0.5px;">Point of Sales</li>
        <li class="nav-item" v-permission="'pos:view'">
          <router-link to="/resto/pos" class="nav-link" active-class="active">
            <i class="bi bi-display"></i><span class="nav-text">{{ t('nav_pos') }}</span>
          </router-link>
        </li>
        <li class="nav-item" v-permission="'pos:view'" v-show="!isOnlyKasir">
          <router-link to="/resto/tables" class="nav-link" active-class="active">
            <i class="bi bi-grid-3x3-gap-fill"></i><span class="nav-text">{{ t('nav_tables') }}</span>
          </router-link>
        </li>
        <li class="nav-item" v-permission="'pos:view'" v-show="!isOnlyKasir">
          <router-link to="/resto/menu" class="nav-link" active-class="active">
            <i class="bi bi-journal-richtext"></i><span class="nav-text">{{ t('nav_menu') }}</span>
          </router-link>
        </li>
        <li class="nav-item" v-permission="'pos:view'" v-show="!isOnlyKasir">
          <router-link to="/resto/kitchen" class="nav-link" active-class="active">
            <i class="bi bi-fire"></i><span class="nav-text">{{ t('nav_kitchen') }}</span>
          </router-link>
        </li>
        <li class="nav-item" v-permission="'pos:view'" v-show="!isOnlyKasir">
          <router-link to="/resto/history" class="nav-link" active-class="active">
            <i class="bi bi-clock-history"></i><span class="nav-text">{{ t('nav_history') }}</span>
          </router-link>
        </li>
        <li class="nav-item" v-permission="'reportingsales:view'" v-show="!isOnlyKasir">
          <router-link to="/resto/reports" class="nav-link" active-class="active">
            <i class="bi bi-bar-chart-line"></i><span class="nav-text">{{ t('nav_reports') }}</span>
          </router-link>
        </li>
        <li class="nav-item" v-permission="'pos:view'">
          <router-link to="/resto/settings" class="nav-link" active-class="active">
            <i class="bi bi-gear"></i><span class="nav-text">{{ t('nav_settings') }}</span>
          </router-link>
        </li>
        <li class="nav-item" v-show="!isOnlyKasir">
          <router-link to="/resto/guide" class="nav-link" active-class="active">
            <i class="bi bi-question-circle"></i><span class="nav-text">Bantuan</span>
          </router-link>
        </li>

        <!-- INVENTORY -->
        <li class="nav-item px-3 mb-2 mt-4 text-uppercase text-white-50" v-permission="'inventory:view'" v-show="!isOnlyKasir" style="font-size: 0.75rem; font-weight: 600; letter-spacing: 0.5px;">Inventory</li>
        <li class="nav-item" v-permission="'inventory:view'" v-show="!isOnlyKasir">
          <router-link to="/inventory/items" class="nav-link" active-class="active">
            <i class="bi bi-box-seam"></i><span class="nav-text">Bahan Baku</span>
          </router-link>
        </li>
        <li class="nav-item" v-permission="'inventory:view'" v-show="!isOnlyKasir">
          <router-link to="/inventory/stock" class="nav-link" active-class="active">
            <i class="bi bi-boxes"></i><span class="nav-text">Stok Bahan</span>
          </router-link>
        </li>
        <li class="nav-item" v-permission="'inventory:manage'" v-show="!isOnlyKasir">
          <router-link to="/inventory/opname" class="nav-link" active-class="active">
            <i class="bi bi-clipboard-check"></i><span class="nav-text">Stock Opname</span>
          </router-link>
        </li>

        <!-- PURCHASING -->
        <li class="nav-item px-3 mb-2 mt-4 text-uppercase text-white-50" v-permission="'purchasing:view'" v-show="!isOnlyKasir" style="font-size: 0.75rem; font-weight: 600; letter-spacing: 0.5px;">Purchasing</li>
        <li class="nav-item" v-permission="'purchasing:view'" v-show="!isOnlyKasir">
          <router-link to="/purchasing/suppliers" class="nav-link" active-class="active">
            <i class="bi bi-truck"></i><span class="nav-text">Data Supplier</span>
          </router-link>
        </li>
        <li class="nav-item" v-permission="'purchasing:view'" v-show="!isOnlyKasir">
          <router-link to="/purchasing/orders" class="nav-link" active-class="active">
            <i class="bi bi-file-earmark-text"></i><span class="nav-text">Purchase Orders</span>
          </router-link>
        </li>
        <li class="nav-item" v-permission="'purchasing:view'" v-show="!isOnlyKasir">
          <router-link to="/purchasing/bills" class="nav-link" active-class="active">
            <i class="bi bi-receipt-cutoff"></i><span class="nav-text">Tagihan Pembelian</span>
          </router-link>
        </li>

        <!-- ACCOUNTING -->
        <li class="nav-item px-3 mb-2 mt-4 text-uppercase text-white-50" v-permission="'accounting:view'" v-show="!isOnlyKasir" style="font-size: 0.75rem; font-weight: 600; letter-spacing: 0.5px;">Accounting</li>
        <li class="nav-item" v-permission="'accounting:view'" v-show="!isOnlyKasir">
          <router-link to="/accounting/coa" class="nav-link" active-class="active">
            <i class="bi bi-list-columns-reverse"></i><span class="nav-text">Chart of Accounts</span>
          </router-link>
        </li>
        <li class="nav-item" v-permission="'accounting:view'" v-show="!isOnlyKasir">
          <router-link to="/accounting/journals" class="nav-link" active-class="active">
            <i class="bi bi-journal-check"></i><span class="nav-text">Jurnal Transaksi</span>
          </router-link>
        </li>
        <li class="nav-item" v-permission="'accounting:view'" v-show="!isOnlyKasir">
          <router-link to="/accounting/reports" class="nav-link" active-class="active">
            <i class="bi bi-file-earmark-bar-graph"></i><span class="nav-text">Laporan Keuangan</span>
          </router-link>
        </li>

        <!-- HR & PAYROLL -->
        <li class="nav-item px-3 mb-2 mt-4 text-uppercase text-white-50" v-permission="'hr:view'" v-show="!isOnlyKasir" style="font-size: 0.75rem; font-weight: 600; letter-spacing: 0.5px;">HR & Payroll</li>
        <li class="nav-item" v-permission="'hr:view'" v-show="!isOnlyKasir">
          <router-link to="/hr/employees" class="nav-link" active-class="active">
            <i class="bi bi-people"></i><span class="nav-text">Data Karyawan</span>
          </router-link>
        </li>
        <li class="nav-item" v-permission="'hr:view'" v-show="!isOnlyKasir">
          <router-link to="/hr/attendance" class="nav-link" active-class="active">
            <i class="bi bi-calendar-check"></i><span class="nav-text">Kehadiran & Cuti</span>
          </router-link>
        </li>
        <li class="nav-item" v-permission="'hr:view'" v-show="!isOnlyKasir">
          <router-link to="/hr/payroll" class="nav-link" active-class="active">
            <i class="bi bi-cash-stack"></i><span class="nav-text">Payroll & PPh 21</span>
          </router-link>
        </li>

      </ul>
    </nav>

    <!-- Main Wrapper -->
    <div class="main-wrapper flex-grow-1">
      <!-- Header -->
      <header class="top-header" :class="{ 'sidebar-collapsed': sidebarCollapsed }">
        <button class="header-toggle" @click="toggleSidebar" id="btn-toggle-sidebar">
          <i class="bi bi-list"></i>
        </button>

        <div class="d-flex align-items-center gap-2">
          <!-- Branch Selector -->
          <div class="branch-selector" v-if="branchStore.userBranches.length > 0">
            <select class="form-select form-select-sm" v-model="selectedBranchId" id="branch-select">
              <option v-for="b in branchStore.userBranches" :key="b.uuid" :value="b.uuid">{{ b.name }}</option>
            </select>
          </div>
        </div>

        <div class="header-right">
          <!-- Theme Toggle -->
          <button class="theme-toggle" @click="themeStore.toggle()" :title="themeStore.isDark ? 'Light Mode' : 'Dark Mode'">
            <i :class="themeStore.isDark ? 'bi bi-sun-fill' : 'bi bi-moon-fill'"></i>
          </button>
          <!-- Notifications -->
          <div class="dropdown">
            <button class="notification-bell" data-bs-toggle="dropdown" id="btn-notifications">
              <i class="bi bi-bell"></i>
              <span class="badge rounded-pill bg-danger" v-if="notifStore.unreadCount(branchStore.currentBranchId) > 0">
                {{ notifStore.unreadCount(branchStore.currentBranchId) }}
              </span>
            </button>
            <div class="dropdown-menu dropdown-menu-end notification-dropdown">
              <div class="px-3 py-2 border-bottom d-flex justify-content-between align-items-center">
                <strong>Notifikasi</strong>
                <a href="#" class="text-primary small" @click.prevent="notifStore.markAllAsRead()">Tandai semua dibaca</a>
              </div>
              <div v-for="n in branchNotifications" :key="n.id" class="notification-item" :class="{ unread: !n.read }" @click="notifStore.markAsRead(n.id)">
                <div class="d-flex align-items-start gap-2">
                  <i class="bi" :class="notifIcon(n.type)"></i>
                  <div>
                    <div class="fw-semibold small">{{ n.title }}</div>
                    <div class="text-muted small">{{ n.message }}</div>
                  </div>
                </div>
              </div>
              <div v-if="branchNotifications.length === 0" class="p-3 text-center text-muted small">Tidak ada notifikasi</div>
            </div>
          </div>

          <!-- User -->
          <UserPanel />
        </div>
      </header>

      <!-- Content -->
      <main class="main-content" :class="{ 'sidebar-collapsed': sidebarCollapsed }">
        <router-view />
      </main>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useBranchStore } from '@/stores/branch'
import { useNotificationStore } from '@/stores/notification'
import { useThemeStore } from '@/stores/theme'
import { useCompanyStore } from '@/stores/company'
import { useLang } from '@/composables/useLang'
import UserPanel from '@/components/UserPanel.vue'

const router = useRouter()
const route  = useRoute()
const authStore = useAuthStore()
const branchStore = useBranchStore()
const notifStore = useNotificationStore()
const themeStore = useThemeStore()
const companyStore = useCompanyStore()
const { t } = useLang()

const localRestoName = ref(localStorage.getItem('resto_local_name') || 'Smart POS')

const sidebarCollapsed = ref(false)
const mobileOpen = ref(false)
const openMenu = ref('')

const isMobile = () => window.innerWidth <= 768

// HR Manager check — termasuk super admin
const isHrManager = computed(() =>
  authStore.user?.is_super_admin ||
  authStore.user?.roleNames?.includes('HR Manager') ||
  authStore.hasPermission('hr:delete')
)

// Check if user is Kasir only
const isOnlyKasir = computed(() => {
   if (authStore.user?.is_super_admin) return false
   const roles = authStore.user?.roleNames || []
   // if Cashier is their only role, or they have no pos:settings
   return roles.includes('cashier') && !authStore.hasPermission('pos:settings')
})

// Auto-open menu HR saat pertama kali masuk halaman HR
onMounted(() => {
  if (route.path.startsWith('/hr')) {
    openMenu.value = 'hr'
  } else if (route.path.startsWith('/inventory/reports')) {
    openMenu.value = 'inventory-reports'
  } else if (route.path.startsWith('/inventory')) {
    openMenu.value = 'inventory'
  }
  
  window.addEventListener('restoConfigUpdated', () => {
    localRestoName.value = localStorage.getItem('resto_local_name') || 'Smart POS'
  })
})

// Auto-close sidebar mobile saat berpindah halaman
watch(() => route.path, () => {
  if (isMobile()) mobileOpen.value = false
})

// v-model computed untuk branch select
const selectedBranchId = computed({
  get: () => branchStore.currentBranchId,
  set: (val) => branchStore.selectBranch(val)
})

// Auto-select: jalan setelah auth.user populated;
// reset jika stored branch bukan milik user ini (login berbeda)
watch(
  () => branchStore.userBranches,
  (branches) => {
    if (!branches.length) return
    const isValid = branches.some(b => b.uuid === branchStore.currentBranchId)
    if (!branchStore.currentBranchId || !isValid) {
      branchStore.selectBranch(branches[0].uuid)
    }
  },
  { immediate: true }
)

// Company info for display
const companyName = computed(() => companyStore.currentCompanyName || authStore.user?.company_name || '')

const branchNotifications = computed(() => notifStore.getByBranch(branchStore.currentBranchId))

function toggleSidebar() {
  if (isMobile()) {
    mobileOpen.value = !mobileOpen.value
  } else {
    sidebarCollapsed.value = !sidebarCollapsed.value
  }
}
function closeMobileSidebar() { mobileOpen.value = false }
function toggleMenu(menu) { openMenu.value = openMenu.value === menu ? '' : menu }
function notifIcon(type) {
  const map = { warning: 'bi-exclamation-triangle-fill text-warning', info: 'bi-info-circle-fill text-info', danger: 'bi-exclamation-circle-fill text-danger', success: 'bi-check-circle-fill text-success' }
  return map[type] || 'bi-bell'
}

async function handleLogout() {
  await authStore.logout()
  branchStore.clearBranch()
  companyStore.clearCompany()
  router.push('/login')
}
</script>
