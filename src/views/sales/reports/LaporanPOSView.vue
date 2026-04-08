<template>
  <div>

    <!-- Page Header -->
    <div class="page-header">
      <div>
        <h1>Laporan Harian Resto</h1>
        <span class="breadcrumb-custom">Restoran / Laporan Harian</span>
      </div>
    </div>

    <!-- Filter Bar -->
    <POSFilterBar
      :modelFilters="filters"
      :branches="branches"
      :cashiers="cashiers"
      @update:modelFilters="Object.assign(filters, $event)"
      @submit="fetchData"
      @export-pdf="handleExportPdf"
    />

    <!-- KPI Cards -->
    <POSKpiCards :summary="summary" :loading="loading" />

    <!-- Tabel Panel -->
    <POSTabel
      :kasirRows="kasirRows"
      :paymentRows="paymentRows"
      :produkRows="produkRows"
      :loading="loading"
    />

  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import { useCompanyStore } from '@/stores/company'
import { useLaporanPOS }   from './composables/useLaporanPOS'
import { exportPosPdf }    from './utils/posPdf'

import POSFilterBar from './components/POSFilterBar.vue'
import POSKpiCards  from './components/POSKpiCards.vue'
import POSTabel     from './components/POSTabel.vue'

const companyStore = useCompanyStore()

const {
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
} = useLaporanPOS()

onMounted(async () => {
  await Promise.all([fetchCashiers(), fetchData()])
})

function handleExportPdf() {
  exportPosPdf({
    filters,
    summary:     summary.value,
    kasirRows:   kasirRows.value,
    paymentRows: paymentRows.value,
    produkRows:  produkRows.value,
    companyName: companyStore.currentCompanyName || '',
  })
}
</script>

<style scoped>
/* Styling ada di sub-komponen */
</style>
