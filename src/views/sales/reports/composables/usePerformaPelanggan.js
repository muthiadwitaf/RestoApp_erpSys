/**
 * views/sales/reports/composables/usePerformaPelanggan.js
 */
import { ref, reactive } from 'vue'
import { getCustomerPerf } from '@/services/sales/api'
import { getCustomerGroups } from '@/services/sales/api'
import { useBranchStore } from '@/stores/branch'

export function usePerformaPelanggan() {
    const branchStore = useBranchStore()

    // ── State ──────────────────────────────────────────────
    const loading        = ref(false)
    const summary        = ref(null)
    const rows           = ref([])
    const customerGroups = ref([])

    // ── Filters ────────────────────────────────────────────
    const today        = new Date()
    const firstOfMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
    const todayStr     = today.toISOString().split('T')[0]

    const filters = reactive({
        date_from: firstOfMonth,
        date_to:   todayStr,
        branch_id: '',
        group_id:  '',
    })

    // ── Fetch ───────────────────────────────────────────────
    async function fetchData() {
        loading.value = true
        summary.value = null
        rows.value    = []
        try {
            const params = {
                date_from: filters.date_from,
                date_to:   filters.date_to,
            }
            if (filters.branch_id) params.branch_id = filters.branch_id
            if (filters.group_id)  params.group_id  = filters.group_id

            const { data } = await getCustomerPerf(params)
            summary.value  = data.summary
            rows.value     = data.rows || []
        } catch (err) {
            console.error('[usePerformaPelanggan] fetchData error:', err)
        } finally {
            loading.value = false
        }
    }

    async function fetchGroups() {
        try {
            const { data } = await getCustomerGroups()
            customerGroups.value = data || []
        } catch (err) {
            console.error('[usePerformaPelanggan] fetchGroups error:', err)
        }
    }

    const branches = branchStore.userBranches || []

    return {
        filters,
        loading,
        summary,
        rows,
        customerGroups,
        branches,
        fetchData,
        fetchGroups,
    }
}
