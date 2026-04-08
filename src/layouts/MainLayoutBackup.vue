<template>
    <div class="d-flex">
        <!-- Sidebar -->
        <nav class="sidebar" :class="{ collapsed: sidebarCollapsed, 'mobile-open': mobileOpen }" id="sidebar">
            <!-- Brand: company name -->
            <a href="/" class="sidebar-brand">
                <i class="bi bi-box-seam-fill"></i>
                <span class="ms-2">
                    <span class="d-block" style="font-size:0.9rem;font-weight:700">ERP System</span>
                    <span v-if="!sidebarCollapsed && companyName" class="d-block text-truncate"
                        style="font-size:0.7rem;opacity:0.75;max-width:140px">{{ companyName }}</span>
                </span>
            </a>
            <ul class="sidebar-nav">
                <!-- Dashboard — semua role -->
                <li class="nav-item" v-permission="'dashboard:view'">
                    <router-link to="/" class="nav-link" active-class="active"
                        :class="{ active: $route.name === 'Dashboard' }">
                        <i class="bi bi-speedometer2"></i><span class="nav-text">Dashboard</span>
                    </router-link>
                </li>

                <!-- KEUANGAN — hanya accounting:view -->
                <li class="nav-section" v-permission="'accounting:view'">KEUANGAN</li>
                <li class="nav-item" :class="{ open: openMenu === 'accounting' }" v-permission="'accounting:view'">
                    <a class="nav-link" @click="toggleMenu('accounting')">
                        <i class="bi bi-bank"></i><span class="nav-text">Finance</span>
                        <i class="bi bi-chevron-right nav-arrow" v-if="!sidebarCollapsed"></i>
                    </a>
                    <ul class="submenu">
                        <li><router-link to="/accounting/coa" class="nav-link" active-class="active"><i
                                    class="bi bi-list-ul"></i><span class="nav-text">Chart of
                                    Accounts</span></router-link></li>
                        <li><router-link to="/accounting/journal" class="nav-link" active-class="active"><i
                                    class="bi bi-journal-text"></i><span class="nav-text">Jurnal
                                    Umum</span></router-link></li>
                        <li><router-link to="/accounting/ledger" class="nav-link" active-class="active"><i
                                    class="bi bi-book"></i><span class="nav-text">Buku Besar</span></router-link></li>
                        <li><router-link to="/accounting/reports" class="nav-link" active-class="active"><i
                                    class="bi bi-file-earmark-bar-graph"></i><span class="nav-text">Laporan
                                    Keuangan</span></router-link></li>
                        <li><router-link to="/accounting/expenses" class="nav-link" active-class="active"><i
                                    class="bi bi-receipt"></i><span class="nav-text">Biaya
                                    Operasional</span></router-link></li>
                        <li><router-link to="/accounting/reimbursements" class="nav-link" active-class="active"><i
                                    class="bi bi-person-check"></i><span class="nav-text">Reimburse
                                    Karyawan</span></router-link></li>
                        <li><router-link to="/accounting/assets" class="nav-link" active-class="active"><i
                                    class="bi bi-building-check"></i><span class="nav-text">Manajemen
                                    Aset</span></router-link></li>
                        <li><router-link to="/accounting/bills" class="nav-link" active-class="active"><i
                                    class="bi bi-file-earmark-medical"></i><span class="nav-text">Tagihan
                                    Pembelian</span></router-link></li>
                        <li><router-link to="/accounting/invoices" class="nav-link" active-class="active"><i
                                    class="bi bi-file-earmark-text"></i><span class="nav-text">Invoice
                                    Penjualan</span></router-link></li>
                        <li><router-link to="/accounting/tax" class="nav-link" active-class="active"><i
                                    class="bi bi-percent"></i><span class="nav-text">Konfigurasi
                                    Pajak</span></router-link></li>
                        <li><router-link to="/accounting/closing" class="nav-link" active-class="active"><i
                                    class="bi bi-calendar-check"></i><span class="nav-text">Tutup
                                    Buku</span></router-link></li>
                    </ul>
                </li>

                <!-- PENJUALAN — hanya sales:view -->
                <li class="nav-section" v-permission="'sales:view'">PENJUALAN</li>
                <li class="nav-item" :class="{ open: openMenu === 'sales' }" v-permission="'sales:view'">
                    <a class="nav-link" @click="toggleMenu('sales')">
                        <i class="bi bi-cart3"></i><span class="nav-text">Sales</span>
                        <i class="bi bi-chevron-right nav-arrow" v-if="!sidebarCollapsed"></i>
                    </a>
                    <ul class="submenu">
                        <li><router-link to="/sales/customers" class="nav-link" active-class="active"><i
                                    class="bi bi-people"></i><span class="nav-text">Pelanggan</span></router-link></li>
                        <li><router-link to="/sales/orders" class="nav-link" active-class="active"><i
                                    class="bi bi-receipt"></i><span class="nav-text">Sales Order</span></router-link>
                        </li>
                        <li><router-link to="/sales/returns" class="nav-link" active-class="active"><i
                                    class="bi bi-arrow-return-left"></i><span class="nav-text">Retur
                                    Penjualan</span></router-link></li>
                        <li><router-link to="/sales/bundles" class="nav-link" active-class="active"><i
                                    class="bi bi-box2"></i><span class="nav-text">Paket Bundling</span></router-link>
                        </li>
                        <li><router-link to="/sales/consignment" class="nav-link" active-class="active"><i
                                    class="bi bi-shop"></i><span class="nav-text">Konsinyasi</span></router-link></li>
                        <li><router-link to="/sales/pricelist" class="nav-link" active-class="active"><i
                                    class="bi bi-tags"></i><span class="nav-text">Pricelist</span></router-link></li>
                    </ul>
                </li>
                <!-- POS sub-menu -- visible to all with pos:view (kasir sees only this section) -->
                <li class="nav-item" :class="{ open: openMenu === 'pos' }" v-permission="'pos:view'">
                    <a class="nav-link" @click="toggleMenu('pos')">
                        <i class="bi bi-tv"></i><span class="nav-text">POS</span>
                        <i class="bi bi-chevron-right nav-arrow" v-if="!sidebarCollapsed"></i>
                    </a>
                    <ul class="submenu">
                        <li><router-link to="/sales/pos" class="nav-link" active-class="active"><i
                                    class="bi bi-tv"></i><span class="nav-text">POS Kasir</span></router-link></li>
                        <li><router-link to="/sales/pos-history" class="nav-link" active-class="active"><i
                                    class="bi bi-clock-history"></i><span class="nav-text">Riwayat
                                    POS</span></router-link></li>
                        <li v-permission="'pos:settings'"><router-link to="/sales/pos-settings" class="nav-link"
                                active-class="active"><i class="bi bi-gear"></i><span class="nav-text">Setting
                                    POS</span></router-link></li>
                    </ul>
                </li>


                <!-- PEMBELIAN — hanya purchasing:view -->
                <li class="nav-section" v-permission="'purchasing:view'">PEMBELIAN</li>
                <li class="nav-item" :class="{ open: openMenu === 'purchasing' }" v-permission="'purchasing:view'">
                    <a class="nav-link" @click="toggleMenu('purchasing')">
                        <i class="bi bi-bag"></i><span class="nav-text">Purchasing</span>
                        <i class="bi bi-chevron-right nav-arrow" v-if="!sidebarCollapsed"></i>
                    </a>
                    <ul class="submenu">
                        <li><router-link to="/purchasing/suppliers" class="nav-link" active-class="active"><i
                                    class="bi bi-building"></i><span class="nav-text">Supplier</span></router-link></li>
                        <li><router-link to="/purchasing/orders" class="nav-link" active-class="active"><i
                                    class="bi bi-clipboard-check"></i><span class="nav-text">Purchase
                                    Order</span></router-link></li>
                        <li><router-link to="/purchasing/returns" class="nav-link" active-class="active"><i
                                    class="bi bi-arrow-return-right"></i><span class="nav-text">Retur
                                    Pembelian</span></router-link></li>
                        <li><router-link to="/purchasing/reorder" class="nav-link" active-class="active"><i
                                    class="bi bi-cart-check"></i><span class="nav-text">Saran
                                    Pembelian</span></router-link></li>
                    </ul>
                </li>
                <li class="nav-item" :class="{ open: openMenu === 'purchasing-masterdata' }"
                    v-permission="'purchasing:view'">
                    <a class="nav-link" @click="toggleMenu('purchasing-masterdata')">
                        <i class="bi bi-database"></i><span class="nav-text">Master Data</span>
                        <i class="bi bi-chevron-right nav-arrow" v-if="!sidebarCollapsed"></i>
                    </a>
                    <ul class="submenu">
                        <li><router-link to="/inventory/items" class="nav-link" active-class="active"><i
                                    class="bi bi-box"></i><span class="nav-text">Master Barang</span></router-link></li>
                        <li><router-link to="/inventory/categories" class="nav-link" active-class="active"><i
                                    class="bi bi-tags"></i><span class="nav-text">Kategori Barang</span></router-link>
                        </li>
                        <li><router-link to="/inventory/units" class="nav-link" active-class="active"><i
                                    class="bi bi-rulers"></i><span class="nav-text">Satuan Barang</span></router-link>
                        </li>
                    </ul>
                </li>

                <!-- INVENTORI — inventory:manage (bukan inventory:view) agar Sales/Purchasing tidak lihat ini -->
                <li class="nav-section" v-permission="'inventory:manage'">INVENTORI</li>
                <li class="nav-item" :class="{ open: openMenu === 'inventory' }" v-permission="'inventory:manage'">
                    <a class="nav-link" @click="toggleMenu('inventory')">
                        <i class="bi bi-boxes"></i><span class="nav-text">Gudang</span>
                        <i class="bi bi-chevron-right nav-arrow" v-if="!sidebarCollapsed"></i>
                    </a>
                    <ul class="submenu">
                        <li><router-link to="/inventory/warehouses" class="nav-link" active-class="active"><i
                                    class="bi bi-building"></i><span class="nav-text">Daftar Gudang</span></router-link>
                        </li>
                        <li><router-link to="/inventory/bins" class="nav-link" active-class="active"><i
                                    class="bi bi-grid-3x3-gap"></i><span class="nav-text">Bin
                                    Location</span></router-link></li>
                        <li><router-link to="/inventory/stock" class="nav-link" active-class="active"><i
                                    class="bi bi-clipboard-data"></i><span class="nav-text">Stok</span></router-link>
                        </li>
                        <li><router-link to="/inventory/receive" class="nav-link" active-class="active"><i
                                    class="bi bi-box-arrow-in-down"></i><span
                                    class="nav-text">Penerimaan</span></router-link></li>
                        <li><router-link to="/inventory/issue" class="nav-link" active-class="active"><i
                                    class="bi bi-box-arrow-up"></i><span
                                    class="nav-text">Pengeluaran</span></router-link></li>
                        <li><router-link to="/inventory/delivery" class="nav-link" active-class="active"><i
                                    class="bi bi-truck"></i><span class="nav-text">Delivery</span></router-link></li>
                        <li><router-link to="/inventory/transfer" class="nav-link" active-class="active"><i
                                    class="bi bi-arrow-left-right"></i><span
                                    class="nav-text">Transfer</span></router-link></li>
                        <li><router-link to="/inventory/opname" class="nav-link" active-class="active"><i
                                    class="bi bi-search"></i><span class="nav-text">Stok Opname</span></router-link>
                        </li>
                        <li><router-link to="/inventory/stock-card" class="nav-link" active-class="active"><i
                                    class="bi bi-journal-text"></i><span class="nav-text">Kartu
                                    Stok</span></router-link></li>
                        <li><router-link to="/inventory/batches" class="nav-link" active-class="active"><i
                                    class="bi bi-calendar-x"></i><span class="nav-text">Kadaluarsa
                                    Batch</span></router-link></li>
                        <li><router-link to="/inventory/barcode" class="nav-link" active-class="active"><i
                                    class="bi bi-upc-scan"></i><span class="nav-text">Cetak Barcode</span></router-link>
                        </li>
                    </ul>
                </li>


                <!-- HR — hanya hr:view -->
                <li class="nav-section" v-permission="'hr:view'">HR</li>
                <li class="nav-item" :class="{ open: openMenu === 'hr' }" v-permission="'hr:view'">
                    <a class="nav-link" @click="toggleMenu('hr')">
                        <i class="bi bi-people-fill"></i><span class="nav-text">HR</span>
                        <i class="bi bi-chevron-right nav-arrow" v-if="!sidebarCollapsed"></i>
                    </a>
                    <ul class="submenu">
                        <li v-if="isHrManager">
                            <router-link to="/hr/karyawan" class="nav-link" active-class="active">
                                <i class="bi bi-person-vcard"></i><span class="nav-text">Master Karyawan</span>
                            </router-link>
                        </li>
                        <li><router-link to="/hr/payroll" class="nav-link" active-class="active"><i
                                    class="bi bi-cash-coin"></i><span class="nav-text">Payroll</span></router-link></li>
                        <li><router-link to="/hr/cuti" class="nav-link" active-class="active"><i
                                    class="bi bi-calendar-heart"></i><span class="nav-text">Cuti</span></router-link>
                        </li>
                        <li><router-link to="/hr/cuti-tim" class="nav-link" active-class="active"><i
                                    class="bi bi-calendar-week"></i><span class="nav-text">Kalender
                                    Cuti</span></router-link></li>
                        <li v-if="isHrManager">
                            <router-link to="/hr/cuti-admin" class="nav-link" active-class="active">
                                <i class="bi bi-check2-square"></i><span class="nav-text">Persetujuan Cuti</span>
                            </router-link>
                        </li>
                        <li><router-link to="/hr/task" class="nav-link" active-class="active"><i
                                    class="bi bi-kanban"></i><span class="nav-text">Task</span></router-link></li>
                        <li><router-link to="/hr/absensi" class="nav-link" active-class="active"><i
                                    class="bi bi-fingerprint"></i><span class="nav-text">Absensi</span></router-link>
                        </li>
                        <li><router-link to="/hr/my-claims" class="nav-link" active-class="active"><i
                                    class="bi bi-file-earmark-check"></i><span class="nav-text">Claim
                                    Karyawan</span></router-link></li>
                        <li><router-link to="/hr/tracking" class="nav-link" active-class="active"><i
                                    class="bi bi-geo-alt"></i><span class="nav-text">Tracking</span></router-link></li>
                        <li v-if="isHrManager">
                            <router-link to="/hr/setting" class="nav-link" active-class="active">
                                <i class="bi bi-building-gear"></i><span class="nav-text">Setting Perusahaan</span>
                            </router-link>
                        </li>
                    </ul>
                </li>

                <!-- PENGATURAN — hanya settings:view -->
                <li class="nav-section" v-permission="'settings:view'">PENGATURAN</li>
                <li class="nav-item" :class="{ open: openMenu === 'settings' }" v-permission="'settings:view'">
                    <a class="nav-link" @click="toggleMenu('settings')">
                        <i class="bi bi-gear"></i><span class="nav-text">Settings</span>
                        <i class="bi bi-chevron-right nav-arrow" v-if="!sidebarCollapsed"></i>
                    </a>
                    <ul class="submenu">
                        <li><router-link to="/settings/company" class="nav-link" active-class="active"><i
                                    class="bi bi-building-gear"></i><span class="nav-text">Profil
                                    Perusahaan</span></router-link></li>
                        <li><router-link to="/settings/branches" class="nav-link" active-class="active"><i
                                    class="bi bi-building"></i><span class="nav-text">Cabang</span></router-link></li>
                        <li><router-link to="/settings/roles" class="nav-link" active-class="active"><i
                                    class="bi bi-shield-lock"></i><span class="nav-text">Roles</span></router-link></li>
                        <li><router-link to="/settings/users" class="nav-link" active-class="active"><i
                                    class="bi bi-person-gear"></i><span class="nav-text">Users</span></router-link></li>
                        <li v-permission="'settings:edit'"><router-link to="/settings/margin" class="nav-link"
                                active-class="active"><i class="bi bi-percent"></i><span class="nav-text">Margin
                                    Default</span></router-link></li>
                        <li><router-link to="/settings/audit" class="nav-link" active-class="active"><i
                                    class="bi bi-clock-history"></i><span class="nav-text">Audit
                                    Trail</span></router-link></li>
                    </ul>
                </li>

            </ul>
        </nav>

        <!-- Main Wrapper -->
        <div class="main-wrapper flex-grow-1">
            <!-- Header -->
            <header class="top-header"
                :style="{ marginLeft: sidebarCollapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)' }">
                <button class="header-toggle" @click="toggleSidebar" id="btn-toggle-sidebar">
                    <i class="bi bi-list"></i>
                </button>

                <div class="d-flex align-items-center gap-2">
                    <!-- Branch Selector -->
                    <div class="branch-selector" v-if="branchStore.userBranches.length > 0">
                        <select class="form-select form-select-sm" v-model="selectedBranchId" id="branch-select">
                            <option v-for="b in branchStore.userBranches" :key="b.uuid" :value="b.uuid">{{ b.name }}
                            </option>
                        </select>
                    </div>
                </div>

                <div class="header-right">
                    <!-- Theme Toggle -->
                    <button class="theme-toggle" @click="themeStore.toggle()"
                        :title="themeStore.isDark ? 'Light Mode' : 'Dark Mode'">
                        <i :class="themeStore.isDark ? 'bi bi-sun-fill' : 'bi bi-moon-fill'"></i>
                    </button>
                    <!-- Notifications -->
                    <div class="dropdown">
                        <button class="notification-bell" data-bs-toggle="dropdown" id="btn-notifications">
                            <i class="bi bi-bell"></i>
                            <span class="badge rounded-pill bg-danger"
                                v-if="notifStore.unreadCount(branchStore.currentBranchId) > 0">
                                {{ notifStore.unreadCount(branchStore.currentBranchId) }}
                            </span>
                        </button>
                        <div class="dropdown-menu dropdown-menu-end notification-dropdown">
                            <div class="px-3 py-2 border-bottom d-flex justify-content-between align-items-center">
                                <strong>Notifikasi</strong>
                                <a href="#" class="text-primary small"
                                    @click.prevent="notifStore.markAllAsRead()">Tandai semua dibaca</a>
                            </div>
                            <div v-for="n in branchNotifications" :key="n.id" class="notification-item"
                                :class="{ unread: !n.read }" @click="notifStore.markAsRead(n.id)">
                                <div class="d-flex align-items-start gap-2">
                                    <i class="bi" :class="notifIcon(n.type)"></i>
                                    <div>
                                        <div class="fw-semibold small">{{ n.title }}</div>
                                        <div class="text-muted small">{{ n.message }}</div>
                                    </div>
                                </div>
                            </div>
                            <div v-if="branchNotifications.length === 0" class="p-3 text-center text-muted small">Tidak
                                ada notifikasi</div>
                        </div>
                    </div>

                    <!-- User -->
                    <div class="dropdown">
                        <button class="btn btn-sm btn-outline-secondary dropdown-toggle" data-bs-toggle="dropdown"
                            id="btn-user-menu">
                            <i class="bi bi-person-circle me-1"></i>{{ authStore.user?.name }}
                        </button>
                        <ul class="dropdown-menu dropdown-menu-end">
                            <li><span class="dropdown-item-text small text-muted">{{ branchStore.currentBranch?.name
                                    }}</span></li>
                            <li><span class="dropdown-item-text small text-muted" v-if="companyName">{{ companyName
                                    }}</span></li>
                            <li>
                                <hr class="dropdown-divider">
                            </li>
                            <li><a class="dropdown-item" href="#" @click.prevent="handleLogout" id="btn-logout"><i
                                        class="bi bi-box-arrow-right me-2"></i>Logout</a></li>
                        </ul>
                    </div>
                </div>
            </header>

            <!-- Content -->
            <main class="main-content"
                :style="{ marginLeft: sidebarCollapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)' }">
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

    const router = useRouter()
    const route = useRoute()
    const authStore = useAuthStore()
    const branchStore = useBranchStore()
    const notifStore = useNotificationStore()
    const themeStore = useThemeStore()
    const companyStore = useCompanyStore()

    const sidebarCollapsed = ref(false)
    const mobileOpen = ref(false)
    const openMenu = ref('')

    // HR Manager check — termasuk super admin
    const isHrManager = computed(() =>
        authStore.user?.is_super_admin ||
        authStore.user?.roleNames?.includes('HR Manager')
    )

    // Auto-open menu HR saat pertama kali masuk halaman HR
    onMounted(() => {
        if (route.path.startsWith('/hr')) {
            openMenu.value = 'hr'
        }
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

    function toggleSidebar() { sidebarCollapsed.value = !sidebarCollapsed.value }
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