/**
 * views/sales/reports/composables/useLaporanSO.js
 *
 * Composable untuk Laporan Sales Order.
 * Mengelola state, filter, dan fetch data — tidak ada logika UI di sini.
 */
import { ref, reactive } from 'vue'
import { getSalesSOList, getSalesRekapSalespersons } from '@/services/sales/api'
import { useBranchStore } from '@/stores/branch'

export function useLaporanSO() {
    const branchStore = useBranchStore()

    // ── State ──────────────────────────────────────────────
    const loading    = ref(false)
    const summary    = ref(null)
    const rows       = ref([])
    const salespersons = ref([])

    // ── Filters ────────────────────────────────────────────
    const today = new Date()
    const firstOfMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
    const todayStr     = today.toISOString().split('T')[0]

    const filters = reactive({
        date_from:  firstOfMonth,
        date_to:    todayStr,
        branch_id:  '',    // '' = semua cabang
        status:     '',    // '' = semua status
        salesperson: '',   // '' = semua salesperson
    })

    // ── STATUS_OPTIONS (dipakai juga oleh FilterBar) ───────
    const STATUS_OPTIONS = [
        { value: '',                                         label: 'Semua Status' },
        { value: 'draft',                                    label: 'Draft' },
        { value: 'pending',                                  label: 'Pending' },
        { value: 'approved',                                 label: 'Approved' },
        { value: 'approved|partial|processed',               label: 'Terbuka (belum lunas)' },
        { value: 'paid',                                     label: 'Lunas' },
        { value: 'rejected',                                 label: 'Ditolak' },
    ]

    // ── Ambil data laporan ─────────────────────────────────
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
            if (filters.status)      params.status       = filters.status
            if (filters.salesperson) params.salesperson  = filters.salesperson

            const { data } = await getSalesSOList(params)
            summary.value = data.summary
            rows.value    = data.rows || []
        } catch (err) {
            console.error('[useLaporanSO] fetchData error:', err)
        } finally {
            loading.value = false
        }
    }

    // ── Ambil list salesperson (reuse endpoint rekap) ──────
    async function fetchSalespersons() {
        try {
            const { data } = await getSalesRekapSalespersons()
            salespersons.value = data || []
        } catch (err) {
            console.error('[useLaporanSO] fetchSalespersons error:', err)
        }
    }

    // ── Branches dari store ────────────────────────────────
    const branches = branchStore.userBranches || []

    return {
        filters,
        loading,
        summary,
        rows,
        salespersons,
        branches,
        STATUS_OPTIONS,
        fetchData,
        fetchSalespersons,
    }
}
