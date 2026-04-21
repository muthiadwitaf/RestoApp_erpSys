import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useBranchStore } from '@/stores/branch'

const routes = [
    {
        path: '/login',
        name: 'Login',
        component: () => import('@/views/LoginView.vue'),
        meta: { public: true }
    },
    {
        path: '/company-picker',
        name: 'CompanyPicker',
        component: () => import('@/views/auth/CompanyPickerView.vue'),
        meta: { public: true }
    },
    {
        path: '/',
        component: () => import('@/layouts/MainLayout.vue'),
        meta: { requiresAuth: true },
        children: [
            { path: '', name: 'Dashboard', redirect: '/resto/pos' },
            
            // POS Resto — modul utama
            { path: 'resto/tables', name: 'RestoTableMap', component: () => import('@/views/sales/RestoTableMapView.vue'), meta: { permission: 'pos:view' } },
            { path: 'resto/menu', name: 'RestoMenu', component: () => import('@/views/sales/RestoMenuView.vue'), meta: { permission: 'pos:view' } },
            { path: 'resto/pos', name: 'RestoPOS', component: () => import('@/views/sales/RestoPosView.vue'), meta: { permission: 'pos:view' } },
            { path: 'resto/guide', name: 'RestoGuide', component: () => import('@/views/sales/RestoGuideView.vue'), meta: { permission: 'pos:view' } },
            { path: 'resto/kitchen', name: 'RestoKitchen', component: () => import('@/views/sales/RestoKitchenView.vue'), meta: { permission: 'pos:view' } },
            { path: 'resto/settings', name: 'RestoSettings', component: () => import('@/views/sales/PosSettingsView.vue'), meta: { permission: 'pos:view' } },
            
            // Reporting
            { path: 'resto/reports', name: 'RestoReportPOS', component: () => import('@/views/sales/RestoDailyReportView.vue'), meta: { permission: 'reportingsales:view' } },
            
            // Standard POS Configs (Now under /resto)
            { path: 'resto/history', name: 'RestoHistory', component: () => import('@/views/sales/PosHistoryView.vue'), meta: { permission: 'pos:view' } },

            // Inventory Module
            { path: 'inventory/items', name: 'InventoryItems', component: () => import('@/views/inventory/InventoryItemsView.vue'), meta: { permission: 'inventory:view' } },
            { path: 'inventory/stock', name: 'InventoryStock', component: () => import('@/views/inventory/InventoryStockView.vue'), meta: { permission: 'inventory:view' } },
            { path: 'inventory/opname', name: 'InventoryOpname', component: () => import('@/views/inventory/InventoryOpnameView.vue'), meta: { permission: 'inventory:manage' } },

            // Purchasing Module
            { path: 'purchasing/suppliers', name: 'PurchasingSuppliers', component: () => import('@/views/purchasing/PurchasingSuppliersView.vue'), meta: { permission: 'purchasing:view' } },
            { path: 'purchasing/orders', name: 'PurchasingOrders', component: () => import('@/views/purchasing/PurchasingOrdersView.vue'), meta: { permission: 'purchasing:view' } },
            { path: 'purchasing/bills', name: 'PurchasingBills', component: () => import('@/views/purchasing/PurchasingBillsView.vue'), meta: { permission: 'purchasing:view' } },

            // Accounting Module
            { path: 'accounting/coa', name: 'AccountingCoa', component: () => import('@/views/accounting/AccountingCoaView.vue'), meta: { permission: 'accounting:view' } },
            { path: 'accounting/journals', name: 'AccountingJournals', component: () => import('@/views/accounting/AccountingJournalsView.vue'), meta: { permission: 'accounting:view' } },
            { path: 'accounting/reports', name: 'AccountingReports', component: () => import('@/views/accounting/AccountingReportsView.vue'), meta: { permission: 'accounting:view' } },

            // HR & Payroll Module
            { path: 'hr/employees', name: 'HrEmployees', component: () => import('@/views/hr/HrEmployeesView.vue'), meta: { permission: 'hr:view' } },
            { path: 'hr/attendance', name: 'HrAttendance', component: () => import('@/views/hr/HrAttendanceView.vue'), meta: { permission: 'hr:view' } },
            { path: 'hr/payroll', name: 'HrPayroll', component: () => import('@/views/hr/HrPayrollView.vue'), meta: { permission: 'hr:view' } },

            // 403
            { path: 'forbidden', name: 'Forbidden', component: () => import('@/views/ForbiddenView.vue') }
        ]
    },
    { path: '/:pathMatch(.*)*', redirect: '/' }
]

const router = createRouter({
    history: createWebHistory(),
    routes
})

router.beforeEach(async (to, from, next) => {
    const auth = useAuthStore()
    const branch = useBranchStore()

    if (auth.authDisabled) {
        auth.ensureGuestSession()
        if (!branch.userBranches.length) await branch.fetchBranches()
        if (branch.userBranches.length > 0 && !branch.currentBranchId) {
            branch.selectBranch(branch.userBranches[0].uuid)
        }
        if (to.meta.public) return next(getDefaultRoute(auth))
        return next()
    }

    if (to.name === 'CompanyPicker') {
        if (!auth.pendingCompanies || !auth.tempToken) return next('/login')
        return next()
    }

    if (to.meta.public) {
        // If arriving at login with timeout flag, force-clear stale auth to prevent redirect loop
        if (to.path === '/login' && to.query.timeout === '1') {
            auth.user = null
            localStorage.removeItem('erp_access_token')
            localStorage.removeItem('erp_refresh_token')
            localStorage.removeItem('erp_user')
            return next()
        }
        if (auth.isAuthenticated) return next(getDefaultRoute(auth))
        return next()
    }

    if (!auth.isAuthenticated) return next('/login')

    if (to.path === '/' && to.name === 'Dashboard' && !auth.hasPermission('dashboard:view')) {
        return next(getDefaultRoute(auth))
    }

    if (to.meta.permission) {
        const perms = Array.isArray(to.meta.permission) ? to.meta.permission : [to.meta.permission]
        if (!perms.some(p => auth.hasPermission(p))) {
            return next('/forbidden')
        }
    }

    if (to.meta.superAdmin && !auth.user?.is_super_admin) {
        return next('/forbidden')
    }

    next()
})

function getDefaultRoute(auth) {
    if (auth.hasPermission('pos:view')) return '/resto/pos'
    return '/forbidden'
}

export default router
