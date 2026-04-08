/**
 * views/sales/reports/composables/usePerformaProduk.js
 */
import { ref, reactive } from 'vue'
import { getProductPerf, getProductPerfCategories } from '@/services/sales/api'
import { useBranchStore } from '@/stores/branch'

export function usePerformaProduk() {
    const branchStore = useBranchStore()

    // ── State ──────────────────────────────────────────────
    const loading    = ref(false)
    const summary    = ref(null)
    const rows       = ref([])
    const categories = ref([])

    // ── Filters ────────────────────────────────────────────
    const today        = new Date()
    const firstOfMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
    const todayStr     = today.toISOString().split('T')[0]

    const filters = reactive({
        date_from:   firstOfMonth,
        date_to:     todayStr,
        branch_id:   '',
        category_id: '',
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
            if (filters.branch_id)   params.branch_id   = filters.branch_id
            if (filters.category_id) params.category_id = filters.category_id

            const { data } = await getProductPerf(params)
            summary.value  = data.summary
            rows.value     = data.rows || []
        } catch (err) {
            console.error('[usePerformaProduk] fetchData error:', err)
        } finally {
            loading.value = false
        }
    }

    async function fetchCategories() {
        try {
            const { data } = await getProductPerfCategories()
            categories.value = data || []
        } catch (err) {
            console.error('[usePerformaProduk] fetchCategories error:', err)
        }
    }

    const branches = branchStore.userBranches || []

    return {
        filters,
        loading,
        summary,
        rows,
        categories,
        branches,
        fetchData,
        fetchCategories,
    }
}
