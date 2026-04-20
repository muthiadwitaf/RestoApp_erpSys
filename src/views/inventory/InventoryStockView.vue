<template>
  <div class="inv-view">
    <div class="inv-header d-flex justify-content-between align-items-center border-bottom pb-3 mb-3">
      <div>
        <h3 class="mb-0 fw-bold"><i class="bi bi-boxes me-2 text-primary"></i>Stok Realtime</h3>
        <span class="text-muted small">Pantau stok terkini di semua gudang</span>
      </div>
      <div>
        <button class="btn btn-outline-secondary btn-sm" @click="loadData">
          <i class="bi bi-arrow-clockwise me-1"></i> Segarkan
        </button>
      </div>
    </div>

    <!-- Filters -->
    <div class="d-flex justify-content-between align-items-center mb-3">
      <div class="search-box position-relative" style="width: 300px;">
        <i class="bi bi-search position-absolute text-muted" style="left: 12px; top: 50%; transform: translateY(-50%);"></i>
        <input v-model="searchQuery" class="form-control ps-5" placeholder="Cari nama barang..." />
      </div>
      <div class="d-flex gap-2">
        <select v-model="filterWarehouse" class="form-select form-select-sm" style="width: 200px;">
          <option value="">Semua Gudang</option>
          <option v-for="w in warehouses" :key="w.uuid" :value="w.uuid">{{ w.name }}</option>
        </select>
        <button class="btn btn-sm btn-outline-primary" @click="showLowStock = !showLowStock" :class="{'active': showLowStock}">
          <i class="bi bi-exclamation-triangle"></i> Stok Menipis
        </button>
      </div>
    </div>

    <!-- Table -->
    <div class="card border-0 shadow-sm">
      <div class="card-body p-0 table-responsive">
        <table class="table table-hover align-middle mb-0">
          <thead class="table-light">
            <tr>
              <th style="width: 60px;" class="text-center">#</th>
              <th>Nama Barang</th>
              <th>Gudang</th>
              <th class="text-end">Qty Saat Ini</th>
              <th class="text-end">Min. Stok</th>
              <th class="text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(s, idx) in filteredStock" :key="s.item_uuid + '-' + s.warehouse_uuid" class="hover-row">
              <td class="text-center text-muted small">{{ idx + 1 }}</td>
              <td class="fw-bold">{{ getItemName(s.item_uuid) }}</td>
              <td><span class="badge bg-light text-dark"><i class="bi bi-building me-1"></i>{{ s.warehouse_name }}</span></td>
              <td class="text-end fw-bold fs-6" :class="{ 'text-danger': isLowStock(s) }">{{ s.qty }}</td>
              <td class="text-end text-muted small">{{ getItemMinStock(s.item_uuid) }}</td>
              <td class="text-center">
                <span v-if="s.qty <= 0" class="badge bg-danger">Habis</span>
                <span v-else-if="isLowStock(s)" class="badge bg-warning text-dark">Hampir Habis</span>
                <span v-else class="badge bg-success">Tersedia</span>
              </td>
            </tr>
            <tr v-if="filteredStock.length === 0 && !loading">
              <td colspan="6" class="text-center text-muted py-5">
                <i class="bi bi-inboxes fs-1 d-block mb-2 opacity-25"></i>
                Tidak ada data stok yang sesuai
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import * as api from '@/services/inventory/api'

const stock = ref([])
const warehouses = ref([])
const items = ref([])
const loading = ref(false)

const searchQuery = ref('')
const filterWarehouse = ref('')
const showLowStock = ref(false)

const filteredStock = computed(() => {
  let list = stock.value
  if (filterWarehouse.value) {
    list = list.filter(s => s.warehouse_uuid === filterWarehouse.value)
  }
  if (showLowStock.value) {
    list = list.filter(s => isLowStock(s))
  }
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(s => getItemName(s.item_uuid).toLowerCase().includes(q))
  }
  return list
})

function getItemName(uuid) {
  const item = items.value.find(i => i.uuid === uuid)
  return item ? item.name : '-'
}

function getItemMinStock(uuid) {
  const item = items.value.find(i => i.uuid === uuid)
  return item ? (item.min_stock || 0) : 0
}

function isLowStock(s) {
  const min = getItemMinStock(s.item_uuid)
  return s.qty <= min
}

async function loadData() {
  loading.value = true
  try {
    const [resStock, resWH, resItems] = await Promise.all([
      api.getStock(),
      api.getWarehouses(),
      api.getItems()
    ])
    stock.value = resStock.data || []
    warehouses.value = resWH.data || []
    items.value = resItems.data || []
  } catch (error) {
    console.error('Failed to load stock data:', error)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadData()
})
</script>

<style scoped>
.inv-view {
  padding: 24px;
}
.hover-row {
  transition: background-color 0.15s ease;
}
.hover-row:hover {
  background-color: var(--bs-primary-bg-subtle) !important;
}
</style>
