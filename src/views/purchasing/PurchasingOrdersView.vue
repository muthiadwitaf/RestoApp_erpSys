<template>
  <div class="purchasing-view">
    <div class="d-flex justify-content-between align-items-center mb-4 pb-2">
      <div>
        <h3 class="mb-1 text-gradient fw-bolder"><i class="bi bi-file-earmark-text me-2 text-primary"></i>Purchase Orders</h3>
        <span class="text-secondary small">Kelola pemesanan barang ke supplier</span>
      </div>
      <div>
        <button class="btn btn-primary rounded-pill px-4 btn-glow fw-semibold" @click="openCreateModal">
          <i class="bi bi-plus-lg me-1"></i> Buat PO
        </button>
      </div>
    </div>

    <!-- Table List -->
    <div class="erp-card mb-5">
      <div class="table-responsive">
        <table class="table table-hover align-middle mb-0 table-erp">
          <thead>
            <tr>
              <th>Nomor PO</th>
              <th>Tanggal</th>
              <th>Supplier</th>
              <th>Gudang Tujuan</th>
              <th>Total</th>
              <th>Status</th>
              <th>Pembuat</th>
              <th class="text-end">Aksi</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="po in orders" :key="po.uuid" class="hover-row">
              <td class="fw-bold text-primary font-monospace">{{ po.number }}</td>
              <td>{{ formatDate(po.date) }}</td>
              <td class="fw-semibold">{{ po.supplier_name }}</td>
              <td>{{ po.warehouse_name || '-' }}</td>
              <td class="fw-bold">{{ formatMoney(po.total) }}</td>
              <td><span class="badge" :class="statusBadge(po.status)">{{ po.status.toUpperCase() }}</span></td>
              <td class="small">{{ po.created_by }}</td>
              <td class="text-end">
                <button v-if="po.status === 'draft'" class="btn btn-sm btn-outline-success me-2" @click="submitDoc(po)" title="Ajukan">
                  <i class="bi bi-send"></i>
                </button>
                <button v-if="po.status === 'pending'" class="btn btn-sm btn-outline-primary me-2" @click="approveDoc(po)" title="Setujui">
                  <i class="bi bi-check2-circle"></i>
                </button>
                <button class="btn btn-sm btn-light border text-dark" @click="viewDetail(po)" title="Detail">
                  <i class="bi bi-eye"></i>
                </button>
              </td>
            </tr>
            <tr v-if="orders.length === 0 && !loading">
              <td colspan="8" class="text-center text-muted py-5">
                <i class="bi bi-cart-x fs-1 d-block mb-2 opacity-25"></i>
                Belum ada Purchase Order.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- FULL SCREEN PO MODAL -->
    <div class="modal fade" id="poModal" tabindex="-1" data-bs-backdrop="static">
      <div class="modal-dialog modal-fullscreen">
        <div class="modal-content">
          <div class="modal-header bg-white border-bottom shadow-sm z-1 py-3 px-4">
            <div class="d-flex align-items-center">
              <div class="bg-primary bg-opacity-10 text-primary rounded-circle d-flex align-items-center justify-content-center me-3" style="width: 48px; height: 48px;">
                <i class="bi bi-cart3 fs-4"></i>
              </div>
              <div>
                <h5 class="modal-title fw-bold text-dark mb-0">Buat Purchase Order</h5>
                <span class="small text-muted">Harga otomatis ditarik dari pricelist supplier</span>
              </div>
            </div>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          
          <div class="modal-body p-0" style="background-color: #f8faff;">
            <div class="row g-0 h-100">
              <!-- Left Column: Forms -->
              <div class="col-lg-8 border-end bg-white p-4 overflow-auto h-100">
                <!-- INFORMASI ORDER -->
                <h6 class="fw-bold text-primary mb-3 text-uppercase" style="font-size: 0.85rem;">
                  <i class="bi bi-info-circle me-1"></i> Informasi Order
                </h6>
                <div class="row g-3 mb-4">
                  <div class="col-md-4">
                    <label class="form-label small fw-semibold">Tanggal Order</label>
                    <input type="date" class="form-control" v-model="form.date">
                  </div>
                  <div class="col-md-4">
                    <label class="form-label small fw-semibold">Supplier <span class="text-danger">*</span></label>
                    <select class="form-select" v-model="form.supplier_id" @change="onSupplierChange">
                      <option :value="null">-- Pilih Supplier --</option>
                      <option v-for="s in suppliers" :key="s.uuid" :value="s.uuid">{{ s.name }}</option>
                    </select>
                  </div>
                  <div class="col-md-4">
                    <label class="form-label small fw-semibold">Gudang Tujuan</label>
                    <select class="form-select" v-model="form.warehouse_id">
                      <option :value="null">-- Pilih Gudang --</option>
                      <option v-for="w in warehouses" :key="w.uuid" :value="w.uuid">{{ w.name }}</option>
                    </select>
                  </div>
                </div>

                <!-- DAFTAR BARANG -->
                <h6 class="fw-bold text-primary mb-3 text-uppercase" style="font-size: 0.85rem;">
                  <i class="bi bi-box me-1"></i> Daftar Barang
                </h6>
                <div class="table-responsive mb-2">
                  <table class="table table-borderless mb-0">
                    <thead class="border-bottom text-primary small" style="font-size: 0.75rem; font-weight: bold;">
                      <tr>
                        <th width="35%">BARANG</th>
                        <th width="15%">QTY</th>
                        <th width="15%">SATUAN</th>
                        <th width="15%">HARGA/UNIT</th>
                        <th width="10%">DISC%</th>
                        <th width="10%" class="text-end">SUBTOTAL</th>
                        <th width="5%"></th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="(line, index) in form.lines" :key="index" class="border-bottom">
                        <td>
                          <select class="form-select form-select-sm" v-model="line.item_id" @change="onItemChange(line)" :disabled="!form.supplier_id">
                            <option :value="null">-- Pilih Barang --</option>
                            <option v-for="sp in supplierPrices" :key="sp.item_id" :value="sp.item_id">{{ sp.item_name }}</option>
                          </select>
                        </td>
                        <td>
                          <input type="number" class="form-control form-control-sm text-center" v-model.number="line.qty" min="1">
                        </td>
                        <td>
                          <select class="form-select form-select-sm" v-model="line.uom">
                            <option v-for="u in units" :key="u.uuid" :value="u.name">{{ u.name }}</option>
                          </select>
                        </td>
                        <td>
                          <input type="number" class="form-control form-control-sm text-end" v-model.number="line.price" min="0">
                        </td>
                        <td>
                          <div class="input-group input-group-sm">
                            <input type="number" class="form-control text-center" v-model.number="line.discount" min="0" max="100">
                            <span class="input-group-text bg-white p-1" style="font-size: 0.75rem;">%</span>
                          </div>
                        </td>
                        <td class="text-end align-middle text-primary fw-semibold small">
                          {{ formatMoney(getLineSubtotal(line)) }}
                        </td>
                        <td class="text-end align-middle">
                          <button type="button" class="btn btn-link text-danger p-0" @click="removeLine(index)">
                            <i class="bi bi-trash"></i>
                          </button>
                        </td>
                      </tr>
                      <tr v-if="form.lines.length === 0">
                        <td colspan="7" class="text-center text-muted small py-3 opacity-50">Belum ada barang ditambahkan</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <button type="button" class="btn btn-outline-primary btn-sm mb-4" @click="addLine">
                  <i class="bi bi-plus-lg"></i> Tambah Barang
                </button>

                <!-- PEMBAYARAN & TERMIN -->
                <h6 class="fw-bold text-primary mb-3 text-uppercase" style="font-size: 0.85rem;">
                  <i class="bi bi-credit-card me-1"></i> Pembayaran & Termin
                </h6>
                <div class="row g-3 mb-3">
                  <div class="col-md-4">
                    <label class="form-label small fw-semibold">Metode Pembayaran</label>
                    <select class="form-select" v-model="form.payment_method">
                      <option value="transfer">Transfer Bank</option>
                      <option value="cash">Tunai / Cash</option>
                      <option value="credit">Kredit</option>
                    </select>
                  </div>
                  <div class="col-md-4">
                    <label class="form-label small fw-semibold">Termin (hari)</label>
                    <div class="input-group">
                      <input type="number" class="form-control" v-model.number="form.payment_term_days" min="0">
                      <span class="input-group-text bg-light text-muted small">hari</span>
                    </div>
                  </div>
                  <div class="col-md-4">
                    <label class="form-label small fw-semibold">Extra Diskon</label>
                    <div class="input-group">
                      <input type="number" class="form-control" v-model.number="form.extra_discount" min="0" max="100">
                      <span class="input-group-text bg-light text-muted small">%</span>
                    </div>
                  </div>
                </div>
                
                <div class="alert bg-light border text-muted py-2 small mb-4 d-flex align-items-center">
                  <i class="bi bi-dash-circle text-secondary me-2 fs-5"></i>
                  <span v-if="selectedSupplierIsPKP">Kena PPN {{taxRate}}% — supplier berstatus <strong>PKP</strong>.</span>
                  <span v-else>Tidak kena PPN — supplier berstatus <strong>Non-PKP</strong>.</span>
                </div>

                <!-- CATATAN -->
                <h6 class="fw-bold text-primary mb-3 text-uppercase" style="font-size: 0.85rem;">
                  <i class="bi bi-journal-text me-1"></i> Catatan <span class="text-muted fw-normal">(Opsional)</span>
                </h6>
                <textarea class="form-control mb-4" rows="3" v-model="form.notes" placeholder="Catatan untuk supplier atau gudang..."></textarea>
                
              </div>

              <!-- Right Column: Summary Sidebar -->
              <div class="col-lg-4 bg-light p-4 d-flex flex-column h-100 border-start">
                <h6 class="fw-bold text-primary mb-4 text-uppercase" style="font-size: 0.85rem;">
                  <i class="bi bi-receipt me-1"></i> Ringkasan Order
                </h6>
                
                <div class="d-flex justify-content-between mb-2 small">
                  <span class="text-muted">Jumlah Item</span>
                  <span class="fw-bold">{{ totalItems }} item</span>
                </div>
                <div class="d-flex justify-content-between mb-3 small">
                  <span class="text-muted">Total Qty</span>
                  <span class="fw-bold">{{ totalQty }} unit</span>
                </div>

                <hr class="text-muted opacity-25">

                <div v-if="form.lines.length === 0" class="text-center text-muted py-4 small opacity-50">
                  Belum ada item
                </div>
                <div v-else class="flex-grow-1 overflow-auto mb-3" style="max-height: 200px;">
                  <!-- List item names briefly -->
                  <div v-for="(l, i) in validLines" :key="i" class="d-flex justify-content-between small text-muted mb-1">
                     <span class="text-truncate me-2">{{ getItemName(l.item_id) }}</span>
                     <span>{{ l.qty }}x</span>
                  </div>
                </div>

                <hr class="text-muted opacity-25 mt-auto">

                <div class="d-flex justify-content-between mb-2">
                  <span class="text-muted small">Subtotal</span>
                  <span class="fw-bold">{{ formatMoney(subtotal) }}</span>
                </div>
                
                <div class="d-flex justify-content-between align-items-center rounded p-3 mb-4 text-white" style="background: linear-gradient(135deg, #3498db, #2980b9); box-shadow: 0 4px 15px rgba(52, 152, 219, 0.3);">
                  <span class="fw-bold">Grand Total</span>
                  <span class="fw-bold fs-5">{{ formatMoney(grandTotal) }}</span>
                </div>

                <div class="small mb-4">
                  <div class="d-flex align-items-center mb-1" :class="form.supplier_id ? 'text-success' : 'text-muted'">
                    <i class="bi me-2" :class="form.supplier_id ? 'bi-check-circle-fill' : 'bi-circle'"></i> Supplier dipilih
                  </div>
                  <div class="d-flex align-items-center mb-1" :class="form.warehouse_id ? 'text-success' : 'text-muted'">
                    <i class="bi me-2" :class="form.warehouse_id ? 'bi-check-circle-fill' : 'bi-circle'"></i> Gudang dipilih
                  </div>
                  <div class="d-flex align-items-center" :class="hasValidLine ? 'text-success' : 'text-muted'">
                    <i class="bi me-2" :class="hasValidLine ? 'bi-check-circle-fill' : 'bi-circle'"></i> Min. 1 barang valid
                  </div>
                </div>

                <div class="alert alert-success bg-success bg-opacity-10 text-success border-success border-opacity-25 py-2 small d-flex align-items-center">
                  <i class="bi bi-calendar-check me-2 fs-5"></i>
                  <div>Jatuh tempo <strong>{{ form.payment_term_days || 0 }} hari</strong> setelah terima barang</div>
                </div>
                
              </div>
            </div>
          </div>

          <div class="modal-footer bg-white border-top p-3 d-flex justify-content-end">
            <button type="button" class="btn btn-light rounded-pill px-4 fw-semibold text-secondary me-2" data-bs-dismiss="modal">
              <i class="bi bi-x-lg me-1"></i> Batal
            </button>
            <button type="button" class="btn btn-primary btn-glow rounded-pill px-5 fw-bold" @click="save" :disabled="saving || !isValid">
              <i class="bi bi-check-circle me-1"></i> {{ saving ? 'Menyimpan...' : 'Simpan Purchase Order' }}
            </button>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { Modal } from 'bootstrap'
import * as api from '@/services/purchasing/api'
import * as invApi from '@/services/inventory/api'

const orders = ref([])
const suppliers = ref([])
const warehouses = ref([])
const items = ref([])
const units = ref([])
const supplierPrices = ref([])
const taxRate = ref(11)

const loading = ref(false)
const saving = ref(false)
let modalInstance = null

const form = ref({
  supplier_id: null,
  warehouse_id: null,
  date: new Date().toISOString().split('T')[0],
  notes: '',
  payment_method: 'transfer',
  payment_term_days: 30,
  extra_discount: 0,
  lines: []
})

async function loadData() {
  loading.value = true
  try {
    const [resOrders, resSup, resWH, resItems, resUnits] = await Promise.all([
      api.getPurchaseOrders(),
      api.getSuppliers(),
      invApi.getWarehouses(),
      invApi.getItems({ limit: 1000 }),
      invApi.getUnits()
    ])
    orders.value = resOrders.data || []
    suppliers.value = resSup.data || []
    warehouses.value = resWH.data || []
    items.value = resItems.data?.data || resItems.data || []
    units.value = resUnits.data || []
    
    // Attempt to fetch tax config, ignore if fails
    try {
      const resTax = await api.getActiveTax()
      if (resTax && resTax.data) {
        taxRate.value = parseFloat(resTax.data.rate || 11)
      }
    } catch (e) {
      // ignore
    }
  } catch (err) {
    console.error('Failed to load PO initial data:', err)
  } finally {
    loading.value = false
  }
}

async function onSupplierChange() {
  if (!form.value.supplier_id) {
    supplierPrices.value = []
    return
  }
  try {
    const supplier = suppliers.value.find(s => s.uuid === form.value.supplier_id)
    if (supplier && supplier.uuid) {
      const res = await api.getSupplierPriceList(supplier.uuid)
      supplierPrices.value = res.data || []
    }
    
    form.value.lines.forEach(line => {
       if (line.item_id) updateLinePriceFromSupplier(line)
    })
  } catch(e) {
    console.error('Failed to load supplier prices', e)
  }
}

function updateLinePriceFromSupplier(line) {
  const priceObj = supplierPrices.value.find(sp => sp.item_id === line.item_id)
  if (priceObj) {
    line.price = priceObj.price
    if (priceObj.uom_name) line.uom = priceObj.uom_name
  }
}

function onItemChange(line) {
  if (!line.item_id) return
  const item = items.value.find(i => i.uuid === line.item_id)
  if (item && !line.uom) {
    line.uom = item.uom || 'Pcs'
  }
  updateLinePriceFromSupplier(line)
}

function getItemName(itemUuid) {
  const sp = supplierPrices.value.find(sp => sp.item_id === itemUuid)
  if (sp) return sp.item_name
  const item = items.value.find(i => i.uuid === itemUuid)
  return item ? item.name : 'Unknown Item'
}

function addLine() {
  form.value.lines.push({
    item_id: null,
    qty: 1,
    uom: 'Pcs',
    price: 0,
    discount: 0
  })
}

function removeLine(idx) {
  form.value.lines.splice(idx, 1)
}

function getLineSubtotal(line) {
  return (line.qty || 0) * (line.price || 0) * (1 - (line.discount || 0) / 100)
}

const selectedSupplierIsPKP = computed(() => {
  if (!form.value.supplier_id) return false
  const s = suppliers.value.find(s => s.uuid === form.value.supplier_id)
  return s ? s.is_pkp : false
})

const validLines = computed(() => form.value.lines.filter(l => l.item_id))
const totalItems = computed(() => validLines.value.length)
const totalQty = computed(() => validLines.value.reduce((sum, l) => sum + (l.qty || 0), 0))

const subtotal = computed(() => {
  return form.value.lines.reduce((sum, l) => sum + getLineSubtotal(l), 0)
})

const grandTotal = computed(() => {
  const afterDisc = subtotal.value * (1 - (form.value.extra_discount || 0) / 100)
  const tax = selectedSupplierIsPKP.value ? (afterDisc * taxRate.value / 100) : 0
  return afterDisc + tax
})

const hasValidLine = computed(() => {
  return form.value.lines.some(l => l.item_id && l.qty > 0 && l.price >= 0)
})

const isValid = computed(() => {
  return form.value.supplier_id && form.value.warehouse_id && hasValidLine.value
})

function openCreateModal() {
  form.value = {
    supplier_id: null,
    warehouse_id: null,
    date: new Date().toISOString().split('T')[0],
    notes: '',
    payment_method: 'transfer',
    payment_term_days: 30,
    extra_discount: 0,
    lines: []
  }
  addLine() // start with 1 empty line
  supplierPrices.value = []
  if (!modalInstance) modalInstance = new Modal(document.getElementById('poModal'))
  modalInstance.show()
}

async function save() {
  if (!isValid.value) return
  saving.value = true
  try {
    // Filter out empty lines before saving
    const payload = {
      ...form.value,
      lines: form.value.lines.filter(l => l.item_id && l.qty > 0)
    }
    await api.createPO(payload)
    modalInstance.hide()
    loadData()
  } catch (error) {
    alert(error.response?.data?.error || 'Gagal menyimpan PO')
  } finally {
    saving.value = false
  }
}

async function submitDoc(po) {
  if(!confirm(`Ajukan PO ${po.number} untuk disetujui?`)) return
  try { await api.submitPO(po.uuid); loadData(); } 
  catch(e) { alert('Gagal mengajukan') }
}

async function approveDoc(po) {
  if(!confirm(`Setujui PO ${po.number}?`)) return
  try { await api.approvePO(po.uuid); loadData(); }
  catch(e) { alert('Gagal menyetujui') }
}

function viewDetail(po) {
  alert(`Detail PO ${po.number} - Mode view/edit belum tersedia.`)
}

function formatMoney(val) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val || 0)
}
function formatDate(d) {
  if (!d) return '-'
  return new Date(d).toLocaleDateString('id-ID')
}

function statusBadge(status) {
  return {
    'draft': 'bg-secondary',
    'pending': 'bg-warning text-dark',
    'approved': 'bg-success',
    'rejected': 'bg-danger',
    'processed': 'bg-info text-dark',
    'billed': 'bg-primary',
    'paid': 'bg-dark'
  }[status] || 'bg-light text-dark'
}

onMounted(() => {
  loadData()
  const el = document.getElementById('poModal')
  if (el) modalInstance = new Modal(el)
})
</script>

<style scoped>
.purchasing-view {
  padding: 2rem 2.5rem;
  background-color: #f8faff;
  min-height: 100vh;
}
[data-theme="dark"] .purchasing-view {
  background-color: #1a1d23;
}
.modal-fullscreen {
  width: 100vw;
  max-width: none;
  height: 100%;
  margin: 0;
}
.modal-fullscreen .modal-content {
  height: 100%;
  border: 0;
  border-radius: 0;
}
</style>
