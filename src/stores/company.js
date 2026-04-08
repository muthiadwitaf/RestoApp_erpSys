import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import axios from 'axios'

export const useCompanyStore = defineStore('company', () => {
    const currentCompanyUuid = ref(null)
    const currentCompanyName = ref(null)
    const userCompanies = ref([]) // [{ uuid, name, code }]

    // Init dari JWT data (dipanggil dari authStore saat login)
    function initFromAuth(companyUuid, companyName, companies = []) {
        currentCompanyUuid.value = companyUuid || null
        currentCompanyName.value = companyName || null
        userCompanies.value = companies
    }

    // Switch company — request JWT baru dari backend (saat sudah login)
    async function selectCompany(companyUuid, router, branchStore) {
        try {
            const accessToken = localStorage.getItem('erp_access_token')
            const res = await axios.post('/api/settings/auth/switch-company', {
                company_uuid: companyUuid,
            }, {
                headers: { Authorization: `Bearer ${accessToken}` }
            })

            // Update tokens
            localStorage.setItem('erp_access_token', res.data.accessToken)
            if (res.data.refreshToken) localStorage.setItem('erp_refresh_token', res.data.refreshToken)

            // Update state company
            currentCompanyUuid.value = companyUuid
            currentCompanyName.value = userCompanies.value.find(c => c.uuid === companyUuid)?.name || ''

            // Reload halaman untuk re-init semua store dengan JWT baru
            window.location.href = '/'
        } catch (e) {
            console.error('Switch company gagal:', e.response?.data || e.message)
        }
    }

    function clearCompany() {
        currentCompanyUuid.value = null
        currentCompanyName.value = null
        userCompanies.value = []
    }

    return {
        currentCompanyUuid,
        currentCompanyName,
        userCompanies,
        initFromAuth,
        selectCompany,
        clearCompany,
    }
}, {
    persist: {
        key: 'erp-company',
        storage: localStorage,
        paths: ['currentCompanyUuid', 'currentCompanyName', 'userCompanies'],
    }
})
