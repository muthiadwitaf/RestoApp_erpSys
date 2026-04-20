<template>
  <div v-if="show" class="rm-modal-overlay" @click.self="close">
    <div class="rm-modal">
      <div class="rm-modal-header d-flex justify-content-between align-items-center">
        <div>
          <h5 class="mb-0"><i class="bi bi-diagram-3-fill text-primary"></i> Kelola Resep Menu</h5>
          <small class="text-muted" v-if="menuItem">{{ menuItem.name }}</small>
        </div>
        <button class="btn-close" @click="close"></button>
      </div>

      <div class="rm-modal-body p-0">
        <div class="p-3 bg-light border-bottom">
          <h6 class="fw-bold mb-3"><i class="bi bi-calculator"></i> Kalkulasi HPP (Harga Pokok Penjualan)</h6>
          
          <div class="row g-3">
            <div class="col-md-4">
              <label class="form-label small text-muted mb-1">Resep (Bahan Baku)</label>
              <div class="fw-bold text-dark">Rp {{ formatMoney(localRecipeCost) }}</div>
            </div>
            <div class="col-md-4">
              <label class="form-label small text-muted mb-1">Biaya Tenaga Kerja</label>
              <div class="input-group input-group-sm">
                <span class="input-group-text border-0 bg-transparent ps-0 pb-0 pt-0 fw-bold">Rp</span>
                <input v-model.number="localLaborCost" type="number" class="form-control form-control-sm border-secondary bg-white p-1" @change="saveCosts" />
              </div>
            </div>
            <div class="col-md-4">
              <label class="form-label small text-muted mb-1">Overhead (Gas, Listrik)</label>
              <div class="input-group input-group-sm">
                <span class="input-group-text border-0 bg-transparent ps-0 pb-0 pt-0 fw-bold">Rp</span>
                <input v-model.number="localOverheadCost" type="number" class="form-control form-control-sm border-secondary bg-white p-1" @change="saveCosts" />
              </div>
            </div>
          </div>

          <div class="d-flex justify-content-between align-items-center mt-3 pt-3 border-top border-secondary-subtle">
            <div>
              <span class="text-muted small">Total HPP per Porsi:</span>
              <h5 class="fw-bold text-danger mb-0">Rp {{ formatMoney(totalCogs) }}</h5>
            </div>
            <div class="text-end" v-if="menuItem">
              <span class="text-muted small">Harga Jual: Rp {{ formatMoney(menuItem.price) }}</span>
              <div class="fw-bold" :class="marginColor"> Margin: {{ marginPct.toFixed(1) }}%</div>
            </div>
          </div>
        </div>

        <div class="p-3">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <h6 class="fw-bold mb-0">Komposisi Bahan Baku</h6>
            <button class="btn btn-sm btn-outline-primary" @click="showAddForm = !showAddForm">
              <i class="bi" :class="showAddForm ? 'bi-x' : 'bi-plus-lg'"></i> {{ showAddForm ? 'Batal Tambah' : 'Tambah Bahan' }}
            </button>
          </div>

          <!-- Add Ingredient Form -->
          <div v-if="showAddForm" class="card bg-white border shadow-sm mb-3">
            <div class="card-body p-2">
              <div class="row g-2 align-items-end">
                <div class="col-md-5">
                  <label class="form-label small mb-1">Pilih Bahan Baku</label>
                  <select v-model="newItem.item_uuid" class="form-select form-select-sm">
                    <option value="">-- Pilih Bahan --</option>
                    <option v-for="item in inventoryItems" :key="item.uuid" :value="item.uuid">
                      {{ item.name }} (Rp {{ formatMoney(item.buy_price) }})
                    </option>
                  </select>
                </div>
                <div class="col-md-4">
                  <label class="form-label small mb-1">Kuantitas</label>
                  <input v-model.number="newItem.qty" type="number" step="0.01" class="form-control form-control-sm" placeholder="Jumlah" />
                </div>
                <div class="col-md-3">
                  <button class="btn btn-sm btn-primary w-100" @click="addIngredient" :disabled="!newItem.item_uuid || !newItem.qty || adding">
                    <span v-if="adding" class="spinner-border spinner-border-sm"></span>
                    <span v-else><i class="bi bi-check-lg"></i> Simpan</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div v-if="loading" class="text-center py-4">
            <div class="spinner-border text-primary spinner-border-sm"></div> Memuat komposisi...
          </div>

          <table class="table table-sm table-hover border">
            <thead class="table-light">
              <tr>
                <th>Nama Bahan</th>
                <th class="text-center">Kuantitas</th>
                <th class="text-end">Biaya (Rp)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="ing in ingredients" :key="ing.uuid">
                <td class="align-middle">
                  <span class="fw-semibold">{{ ing.item_name }}</span>
                  <div class="text-muted" style="font-size: 0.7rem;">@ {{ formatMoney(ing.buy_price) }}</div>
                </td>
                <td class="align-middle text-center">
                  <span v-if="editingUuid !== ing.uuid">{{ ing.qty }}</span>
                  <input v-else type="number" v-model.number="ing.qty" class="form-control form-control-sm text-center d-inline w-75" />
                </td>
                <td class="align-middle text-end fw-semibold text-secondary">
                  {{ formatMoney(ing.subtotal) }}
                </td>
                <td class="align-middle text-end" style="width: 70px;">
                  <button v-if="editingUuid !== ing.uuid" class="btn btn-link py-0 px-1 text-primary btn-sm" @click="editIngredient(ing)"><i class="bi bi-pencil"></i></button>
                  <button v-else class="btn btn-link py-0 px-1 text-success btn-sm" @click="updateEq(ing)"><i class="bi bi-check-lg"></i></button>
                  <button class="btn btn-link py-0 px-1 text-danger btn-sm" @click="deleteIngredient(ing.uuid)"><i class="bi bi-trash"></i></button>
                </td>
              </tr>
              <tr v-if="ingredients.length === 0 && !loading">
                <td colspan="4" class="text-center text-muted small py-3">Belum ada komposisi bahan baku. Menu ini tidak memotong stok inventori.</td>
              </tr>
            </tbody>
          </table>
          <div class="alert alert-info py-2 small mb-0 mt-3 d-flex gap-2">
            <i class="bi bi-info-circle-fill"></i>
            <div>Setiap pesanan kasir akan memotong stok bahan baku ini secara otomatis sesuai jumlah porsi.</div>
          </div>
        </div>
      </div>
      <div class="rm-modal-footer">
        <button class="btn btn-secondary btn-sm" @click="close">Tutup</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, computed } from 'vue'
import { getMenuRecipes, createMenuRecipe, updateMenuRecipe, deleteMenuRecipe, updateRestoMenuItem } from '@/services/sales/restoApi'
import { getItems } from '@/services/inventory/api'

const props = defineProps({
  show: Boolean,
  menuItem: Object
})

const emit = defineEmits(['close', 'updated'])

const loading = ref(false)
const adding = ref(false)
const ingredients = ref([])
const inventoryItems = ref([])

const showAddForm = ref(false)
const newItem = ref({ item_uuid: '', qty: 1, unit_uuid: null })
const editingUuid = ref(null)

const localRecipeCost = ref(0)
const localLaborCost = ref(0)
const localOverheadCost = ref(0)

const totalCogs = computed(() => localRecipeCost.value + localLaborCost.value + localOverheadCost.value)
const marginPct = computed(() => {
  if (!props.menuItem || !props.menuItem.price || props.menuItem.price === 0) return 0
  return ((props.menuItem.price - totalCogs.value) / props.menuItem.price) * 100
})
const marginColor = computed(() => {
  if (marginPct.value >= 30) return 'text-success'
  if (marginPct.value >= 15) return 'text-primary'
  if (marginPct.value > 0) return 'text-warning'
  return 'text-danger'
})

watch(() => props.show, (val) => {
  if (val && props.menuItem) {
    localLaborCost.value = parseFloat(props.menuItem.labor_cost) || 0
    localOverheadCost.value = parseFloat(props.menuItem.overhead_cost) || 0
    localRecipeCost.value = parseFloat(props.menuItem.recipe_cost) || 0
    loadData()
  }
})

async function loadData() {
  loading.value = true
  try {
    const [recipeRes, invRes] = await Promise.all([
      getMenuRecipes(props.menuItem.uuid),
      getItems() // Ideally pass ?type=raw_material, but for now fetch all
    ])
    ingredients.value = recipeRes.data
    inventoryItems.value = invRes.data || []
    
    recalcTotalFromIngredients(recipeRes.data)
  } catch (err) {
    console.error(err)
  } finally {
    loading.value = false
  }
}

function recalcTotalFromIngredients(ings) {
  localRecipeCost.value = ings.reduce((sum, item) => sum + parseFloat(item.subtotal), 0)
}

async function saveCosts() {
  try {
    await updateRestoMenuItem(props.menuItem.uuid, {
      labor_cost: localLaborCost.value,
      overhead_cost: localOverheadCost.value
    })
    emit('updated')
  } catch (err) {
    alert('Gagal menyimpan biaya')
  }
}

async function addIngredient() {
  adding.value = true
  try {
    await createMenuRecipe(props.menuItem.uuid, newItem.value)
    newItem.value = { item_uuid: '', qty: 1, unit_uuid: null }
    showAddForm.value = false
    await loadData()
    emit('updated')
  } catch (e) {
    alert(e.response?.data?.error || 'Gagal tambah bahan')
  } finally {
    adding.value = false
  }
}

function editIngredient(ing) {
  editingUuid.value = ing.uuid
}

async function updateEq(ing) {
  try {
    await updateMenuRecipe(props.menuItem.uuid, ing.uuid, { qty: ing.qty })
    editingUuid.value = null
    await loadData()
    emit('updated')
  } catch (e) {
    alert('Gagal update bahan')
  }
}

async function deleteIngredient(uuid) {
  if (!confirm('Hapus bahan ini dari resep?')) return
  try {
    await deleteMenuRecipe(props.menuItem.uuid, uuid)
    await loadData()
    emit('updated')
  } catch (e) {
    alert('Gagal hapus bahan')
  }
}

function formatMoney(val) {
  return new Intl.NumberFormat('id-ID').format(parseFloat(val) || 0)
}

function close() {
  emit('close')
}
</script>

<style scoped>
.rm-modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.6);
  z-index: 10000; display: flex; align-items: flex-start; justify-content: center;
  padding-top: 5vh; backdrop-filter: blur(2px);
}
.rm-modal {
  background: var(--bs-body-bg, #fff); border-radius: 12px; width: 600px; max-width: 95vw;
  box-shadow: 0 10px 40px rgba(0,0,0,0.2); overflow: hidden;
}
.rm-modal-header {
  padding: 16px 20px; border-bottom: 1px solid var(--bs-border-color, #dee2e6);
}
.rm-modal-body {
  max-height: 80vh; overflow-y: auto;
}
.rm-modal-footer {
  padding: 12px 20px; border-top: 1px solid var(--bs-border-color, #dee2e6);
  display: flex; justify-content: flex-end;
}
</style>
