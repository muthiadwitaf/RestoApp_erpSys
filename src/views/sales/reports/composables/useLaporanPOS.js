/**
 * views/sales/reports/composables/useLaporanPOS.js
 * State & data-fetching untuk halaman Laporan POS
 */
import { ref, reactive } from 'vue'
import { getPosReport, getPosCashiers } from '@/services/sales/api'
import { useBranchStore } from '@/stores/branch'

export function useLaporanPOS() {
    const branchStore = useBranchStore()

    // ── State ──────────────────────────────────────────────
    const loading     = ref(false)
    const summary     = ref(null)
    const kasirRows   = ref([])
    const paymentRows = ref([])
    const produkRows  = ref([])
    const trendRows   = ref([])
    const cashiers    = ref([])

    // ── Default filter: bulan ini ──────────────────────────
    const today        = new Date()
    const firstOfMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
    const todayStr     = today.toISOString().split('T')[0]

    const filters = reactive({
        date_from:  firstOfMonth,
        date_to:    todayStr,
        branch_id:  '',
        cashier_id: '',
    })

    // ── Fetch laporan ──────────────────────────────────────
    async function fetchData() {
        loading.value     = true
        summary.value     = null
        kasirRows.value   = []
        paymentRows.value = []
        produkRows.value  = []
        trendRows.value   = []

        try {
            const params = {
                date_from: filters.date_from,
                date_to:   filters.date_to,
            }
            if (filters.branch_id)  params.branch_id  = filters.branch_id
            if (filters.cashier_id) params.cashier_id = filters.cashier_id

            const { data } = await getPosReport(params)
            summary.value     = data.summary
            kasirRows.value   = data.kasir_rows   || []
            paymentRows.value = data.payment_rows || []
            produkRows.value  = data.produk_rows  || []
            trendRows.value   = data.trend_rows   || []
        } catch (err) {
            console.error('[useLaporanPOS] fetchData error:', err)
        } finally {
            loading.value = false
        }
    }

    // ── Fetch list kasir untuk dropdown ───────────────────
    async function fetchCashiers() {
        try {
            const { data } = await getPosCashiers()
            cashiers.value = data || []
        } catch (err) {
            console.error('[useLaporanPOS] fetchCashiers error:', err)
        }
    }

    const branches = branchStore.userBranches || []

    return {
        filters,
        loading,
        summary,
        kasirRows,
        paymentRows,
        produkRows,
        trendRows,
        cashiers,
        branches,
        fetchData,
        fetchCashiers,
    }
}
