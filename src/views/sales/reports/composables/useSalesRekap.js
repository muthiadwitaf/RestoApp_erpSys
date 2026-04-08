/**
 * views/sales/reports/composables/useSalesRekap.js
 *
 * Composable untuk Rekap Penjualan.
 * Mengelola state, filter, dan fetch data — tidak ada logika UI di sini.
 */
import { ref, reactive } from 'vue'
import { getSalesRekap, getSalesRekapSalespersons } from '@/services/sales/api'
import { useBranchStore } from '@/stores/branch'

export function useSalesRekap() {
    const branchStore = useBranchStore()

    // ── State ──────────────────────────────────────────────
    const loading      = ref(false)
    const summary      = ref(null)
    const trend        = ref([])
    const salespersons = ref([])

    // ── Filters ────────────────────────────────────────────
    const today = new Date()
    const firstOfMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
    const todayStr     = today.toISOString().split('T')[0]

    const filters = reactive({
        period:     'monthly',
        date_from:  firstOfMonth,
        date_to:    todayStr,
        branch_id:  '',       // '' = semua cabang
        created_by: '',       // '' = semua salesperson
    })

    // ── Ambil data laporan ─────────────────────────────────
    async function fetchData() {
        loading.value = true
        summary.value = null
        trend.value   = []
        try {
            const params = {
                period:    filters.period,
                date_from: filters.date_from,
                date_to:   filters.date_to,
            }
            if (filters.branch_id)  params.branch_id  = filters.branch_id
            if (filters.created_by) params.created_by = filters.created_by

            const { data } = await getSalesRekap(params)
            summary.value = data.summary
            trend.value   = data.trend || []
        } catch (err) {
            console.error('[useSalesRekap] fetchData error:', err)
        } finally {
            loading.value = false
        }
    }

    // ── Ambil list salesperson (sekali saja) ───────────────
    async function fetchSalespersons() {
        try {
            const { data } = await getSalesRekapSalespersons()
            salespersons.value = data || []
        } catch (err) {
            console.error('[useSalesRekap] fetchSalespersons error:', err)
        }
    }

    // ── Branches dari store ────────────────────────────────
    const branches = branchStore.userBranches || []

    return {
        filters,
        loading,
        summary,
        trend,
        salespersons,
        branches,
        fetchData,
        fetchSalespersons,
    }
}
