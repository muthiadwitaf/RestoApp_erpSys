import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as settingsApi from '@/services/settings/api'

export const useAuthStore = defineStore('auth', () => {
    const user = ref(JSON.parse(localStorage.getItem('erp_user') || 'null'))
    const isAuthenticated = computed(() => !!user.value)
    const SESSION_TIMEOUT = 30 * 60 * 1000 // 30 minutes
    let timeoutId = null

    // State untuk company picker (saat user punya >1 company)
    const pendingCompanies = ref(JSON.parse(localStorage.getItem('erp_pending_companies') || 'null'))
    const tempToken = ref(localStorage.getItem('erp_temp_token') || null)
    const pendingSuperAdmin = ref(localStorage.getItem('erp_pending_super_admin') === 'true')

    const userPermissions = computed(() => {
        if (!user.value) return []
        return user.value.permissions || []
    })

    async function login(email, password) {
        try {
            const { data } = await settingsApi.login(email, password)

            // Bypass Company Picker: Otomatis pilih perusahaan pertama untuk RestoApp
            if (data.requires_company_selection && data.companies && data.companies.length > 0) {
                const firstComp = data.companies[0]
                const axios = (await import('axios')).default
                const res = await axios.post('/api/settings/auth/select-company', {
                    temp_token: data.temp_token,
                    company_uuid: firstComp.uuid,
                })
                
                localStorage.setItem('erp_access_token', res.data.accessToken)
                localStorage.setItem('erp_refresh_token', res.data.refreshToken)
                const userData = res.data.user
                userData.permissions = userData.permissions || []
                user.value = userData
                localStorage.setItem('erp_user', JSON.stringify(userData))
                
                const { useCompanyStore } = await import('@/stores/company')
                const { useBranchStore } = await import('@/stores/branch')
                useCompanyStore().initFromAuth(firstComp.uuid, userData.company_name, data.companies)
                const branchStore = useBranchStore()
                branchStore.loadFromUser()
                if (branchStore.userBranches.length > 0) {
                    branchStore.selectBranch(branchStore.userBranches[0].uuid)
                }
                
                startSessionTimer()
                return { success: true }
            }

            // 1 company → langsung login
            localStorage.setItem('erp_access_token', data.accessToken)
            localStorage.setItem('erp_refresh_token', data.refreshToken)
            const userData = data.user
            userData.permissions = data.user.permissions || []
            user.value = userData
            localStorage.setItem('erp_user', JSON.stringify(userData))
            startSessionTimer()
            return { success: true }
        } catch (err) {
            const msg = err.response?.data?.error || 'Email atau password salah'
            return { success: false, message: msg }
        }
    }

    // Dipanggil dari CompanyPickerView setelah company dipilih
    function setUser(userData, accessToken) {
        userData.permissions = userData.permissions || []
        user.value = userData
        localStorage.setItem('erp_user', JSON.stringify(userData))
        localStorage.setItem('erp_access_token', accessToken)
        startSessionTimer()
    }

    function clearPending() {
        pendingCompanies.value = null
        tempToken.value = null
        pendingSuperAdmin.value = false
        localStorage.removeItem('erp_pending_companies')
        localStorage.removeItem('erp_temp_token')
        localStorage.removeItem('erp_pending_super_admin')
    }

    async function logout() {
        try {
            const refreshToken = localStorage.getItem('erp_refresh_token')
            if (refreshToken) await settingsApi.logout(refreshToken)
        } catch (e) { /* ignore */ }
        user.value = null
        clearPending()
        localStorage.removeItem('erp_user')
        localStorage.removeItem('erp_access_token')
        localStorage.removeItem('erp_refresh_token')
        localStorage.removeItem('erp_branch')
        localStorage.removeItem('erp-company')
        stopSessionTimer()
    }

    function startSessionTimer() {
        stopSessionTimer()
        timeoutId = setTimeout(async () => {
            if (isAuthenticated.value) { await logout(); window.location.href = '/login?timeout=1' }
        }, SESSION_TIMEOUT)
        const events = ['mousemove', 'keydown', 'click', 'scroll']
        events.forEach(evt => document.addEventListener(evt, resetTimer, { passive: true }))
    }

    function resetTimer() {
        if (!isAuthenticated.value) return
        clearTimeout(timeoutId)
        timeoutId = setTimeout(async () => {
            if (isAuthenticated.value) { await logout(); window.location.href = '/login?timeout=1' }
        }, SESSION_TIMEOUT)
    }

    function stopSessionTimer() { clearTimeout(timeoutId) }

    if (isAuthenticated.value) startSessionTimer()

    function hasPermission(permission) {
        if (user.value?.is_super_admin) return true
        return userPermissions.value.includes(permission)
    }
    function hasAnyPermission(perms) {
        if (user.value?.is_super_admin) return true
        return perms.some(p => userPermissions.value.includes(p))
    }

    return {
        user, isAuthenticated, userPermissions,
        pendingCompanies, tempToken, pendingSuperAdmin,
        login, logout, setUser, clearPending,
        hasPermission, hasAnyPermission, startSessionTimer
    }
})
