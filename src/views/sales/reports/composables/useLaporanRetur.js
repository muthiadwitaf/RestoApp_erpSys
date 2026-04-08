/**
 * views/sales/reports/composables/useLaporanRetur.js
 * State & data-fetching untuk halaman Laporan Retur Penjualan
 */
import { ref, reactive } from 'vue'
import { getReturReport } from '@/services/sales/api'
import { useBranchStore } from '@/stores/branch'

export function useLaporanRetur() {
    const branchStore = useBranchStore()

    // ── State ──────────────────────────────────────────────
    const loading      = ref(false)
    const summary      = ref(null)
    const itemRows     = ref([])
    const customerRows = ref([])
    const reasonRows   = ref([])
    const trendRows    = ref([])

    // ── Default filter: bulan ini ──────────────────────────
    const today        = new Date()
    const firstOfMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
    const todayStr     = today.toISOString().split('T')[0]

    const filters = reactive({
        date_from:   firstOfMonth,
        date_to:     todayStr,
        branch_id:   '',
        customer_id: '',
        period:      'monthly',
    })

    // ── Fetch laporan ──────────────────────────────────────
    async function fetchData() {
        loading.value      = true
        summary.value      = null
        itemRows.value     = []
        customerRows.value = []
        reasonRows.value   = []
        trendRows.value    = []

        try {
            const params = {
                date_from: filters.date_from,
                date_to:   filters.date_to,
                period:    filters.period,
            }
            if (filters.branch_id)   params.branch_id   = filters.branch_id
            if (filters.customer_id) params.customer_id = filters.customer_id

            const { data } = await getReturReport(params)
            summary.value      = data.summary
            itemRows.value     = data.item_rows     || []
            customerRows.value = data.customer_rows || []
            reasonRows.value   = data.reason_rows   || []
            trendRows.value    = data.trend_rows    || []
        } catch (err) {
            console.error('[useLaporanRetur] fetchData error:', err)
        } finally {
            loading.value = false
        }
    }

    const branches = branchStore.userBranches || []

    return {
        filters,
        loading,
        summary,
        itemRows,
        customerRows,
        reasonRows,
        trendRows,
        branches,
        fetchData,
    }
}
