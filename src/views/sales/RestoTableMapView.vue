<template>
  <div class="resto-table-map" id="resto-table-map-view">
    <!-- Header -->
    <div class="rtm-header">
      <div class="rtm-header-left">
        <h4 class="rtm-title"><i class="bi bi-aspect-ratio text-primary"></i> Pengaturan Denah Meja</h4>
      </div>
      <div class="rtm-header-right d-flex gap-2">
        <button class="btn btn-sm" :class="editMode ? 'btn-primary' : 'btn-outline-secondary'" @click="toggleEditMode" id="btn-edit-mode">
          <i class="bi" :class="editMode ? 'bi-pencil-square' : 'bi-eye'"></i>
          {{ editMode ? 'Mode Edit Aktif' : 'Atur Denah / Edit Mode' }}
        </button>
        <button v-if="editMode" class="btn btn-sm btn-success" @click="saveLayout" id="btn-save-layout">
          <i class="bi bi-check-lg"></i> Simpan Denah
        </button>
        <button v-if="editMode" class="btn btn-sm btn-light border" @click="openAddTableModal" id="btn-add-table">
          <i class="bi bi-plus-lg text-primary"></i> Tambah Meja
        </button>
      </div>
    </div>

    <div class="rtm-body">
      <!-- Sidebar Ruangan -->
      <aside class="rtm-rooms bg-white">
        <div class="rtm-rooms-header">
          <span class="rtm-rooms-title">Area Ruangan</span>
          <button class="btn btn-sm btn-light border text-primary" @click="openAddRoomModal" id="btn-add-room" title="Tambah Ruangan">
            <i class="bi bi-plus"></i>
          </button>
        </div>
        <ul class="rtm-room-list">
          <li :class="{ active: !selectedRoom }" @click="selectedRoom = null">
            Semua Area
            <span class="badge bg-light text-dark border ms-auto">{{ tables.length }}</span>
          </li>
          <li v-for="room in rooms" :key="room.uuid" :class="{ active: selectedRoom === room.uuid }" @click="selectedRoom = room.uuid">
            {{ room.name }}
            <div class="ms-auto d-flex align-items-center gap-2">
              <span class="badge bg-light text-dark border">{{ tablesByRoom(room.uuid).length }}</span>
              <button v-if="editMode" class="btn btn-sm text-primary p-0 edit-btn" @click.stop="openEditRoomModal(room)" title="Edit">
                <i class="bi bi-pencil"></i>
              </button>
              <button v-if="editMode" class="btn btn-sm text-danger p-0 delete-btn" @click.stop="deleteRoom(room)" title="Hapus">
                <i class="bi bi-trash3"></i>
              </button>
            </div>
          </li>
        </ul>

        <!-- Status Legend -->
        <div class="rtm-legend">
          <div class="rtm-legend-title">Keterangan Status</div>
          <div class="rtm-legend-item"><span class="legend-box available"></span> Tersedia (Kosong)</div>
          <div class="rtm-legend-item"><span class="legend-box occupied"></span> Terisi (Pesanan)</div>
          <div class="rtm-legend-item"><span class="legend-box reserved"></span> Reservasi</div>
          <div class="rtm-legend-item"><span class="legend-box cleaning"></span> Perlu Dibersihkan</div>
        </div>
      </aside>

      <!-- Area Denah Canvas -->
      <div class="rtm-canvas-container" ref="canvasContainer">
        <div class="rtm-canvas" ref="canvas"
             @mousedown="onCanvasMouseDown" @mousemove="onCanvasMouseMove" @mouseup="onCanvasMouseUp">
          <!-- Titik bantu grid -->
          <div class="rtm-grid"></div>

          <!-- Meja -->
          <div v-for="table in filteredTables" :key="table.uuid"
               class="majoo-table"
               :class="[
                 `shape-${table.shape}`,
                 { dragging: dragging?.uuid === table.uuid, 'is-selected': selectedTable?.uuid === table.uuid }
               ]"
               :style="{
                 left: table.pos_x + 'px',
                 top: table.pos_y + 'px',
                 width: table.width + 'px',
                 height: table.height + 'px'
               }"
               @mousedown.stop="onTableMouseDown($event, table)"
               @click.stop="onTableClick(table)"
               @dblclick.stop="onTableDblClick(table)">
            <!-- Top border indicating status -->
            <div class="majoo-table-status-bar" :class="`bg-status-${table.status}`"></div>

            <!-- Content -->
            <div class="majoo-table-body">
              <div class="majoo-table-header">
                <span class="majoo-table-number">{{ table.number }}</span>
              </div>
              <div class="majoo-table-capacity">
                <i class="bi bi-people-fill text-muted"></i> {{ table.capacity }}
              </div>
              <!-- Status Badge -->
              <div class="majoo-table-status-badge" :class="`status-badge-${table.status}`">
                <i class="bi" :class="statusIcon(table.status)"></i>
                {{ statusLabel(table.status) }}
              </div>
              <div v-if="table.status === 'occupied'" class="majoo-table-timer">
                <i class="bi bi-clock"></i> {{ getTableTimer(table.uuid) }}
              </div>
              <div v-if="table.label" class="majoo-table-label">{{ table.label }}</div>
            </div>

            <!-- Delete button in edit mode -->
            <button v-if="editMode" class="btn-delete-table" @click.stop="deleteTableConfirm(table)" title="Hapus meja">
              <i class="bi bi-x"></i>
            </button>
          </div>
        </div>

        <div v-if="filteredTables.length === 0 && !loading" class="rtm-empty">
           <img src="https://cdn-icons-png.flaticon.com/512/7513/7513361.png" alt="Empty table map" class="empty-icon-img" style="width: 80px; opacity: 0.2; margin-bottom: 16px;">
          <p class="text-muted fw-bold mb-1">Denah Meja Kosong</p>
          <p class="text-muted small">Aktifkan <strong>Mode Edit</strong> dan tambah meja baru untuk memulai layout area ini.</p>
        </div>
      </div>
    </div>

    <!-- Right Panel: Info Meja -->
    <transition name="slide-right">
      <div v-if="selectedTable && !editMode" class="rtm-info-panel bg-white shadow-sm">
        <div class="rtm-info-header text-center pt-4 pb-3 border-bottom position-relative">
          <button class="btn-close position-absolute top-0 end-0 m-3" @click="selectedTable = null"></button>
          <div class="info-avatar mx-auto mb-2" :class="`bg-status-${selectedTable.status}-light text-status-${selectedTable.status}`">
            <i class="bi bi-hdd-stack-fill fs-3"></i>
          </div>
          <h4 class="fw-bold mb-0">Meja {{ selectedTable.number }}</h4>
          <span class="badge mt-2 border" :class="`bg-status-${selectedTable.status}-light text-status-${selectedTable.status}`">
            {{ statusLabel(selectedTable.status) }}
          </span>
        </div>
        
        <div class="rtm-info-body p-4">
          <h6 class="text-uppercase text-muted fw-bold mb-3 fs-8">Informasi Meja</h6>
          <div class="info-detail-row">
            <span class="text-muted"><i class="bi bi-geo-alt me-2"></i>Area Ruangan</span>
            <span class="fw-bold text-dark">{{ selectedTable.room_name || 'Tanpa Ruangan' }}</span>
          </div>
          <div class="info-detail-row">
            <span class="text-muted"><i class="bi bi-people me-2"></i>Kapasitas</span>
            <span class="fw-bold text-dark">{{ selectedTable.capacity }} Orang</span>
          </div>
          <div class="info-detail-row" v-if="selectedTable.label">
            <span class="text-muted"><i class="bi bi-tag me-2"></i>Label</span>
            <span class="fw-bold text-dark">{{ selectedTable.label }}</span>
          </div>

          <!-- Order details -->
          <template v-if="selectedTableOrder">
            <h6 class="text-uppercase text-muted fw-bold mt-4 mb-3 fs-8">Pesanan Berjalan</h6>
            <div class="card border-0 bg-light p-3 rounded-3 mb-4">
              <div class="d-flex justify-content-between mb-2">
                <span class="text-muted small">No. Pesanan</span>
                <span class="fw-bold">{{ selectedTableOrder.order_number }}</span>
              </div>
              <div class="d-flex justify-content-between mb-2">
                <span class="text-muted small">Total Tagihan</span>
                <span class="fw-bold text-primary">Rp {{ formatMoney(selectedTableOrder.total) }}</span>
              </div>
              <div class="d-flex justify-content-between align-items-center">
                <span class="text-muted small">Status</span>
                <span class="badge" :class="orderStatusBadge(selectedTableOrder.status)">{{ orderStatusLabel(selectedTableOrder.status) }}</span>
              </div>
            </div>
          </template>

          <div class="rtm-actions mt-4 pt-4 border-top">
            <button v-if="selectedTable.status === 'available'" class="btn btn-primary w-100 py-2 fw-bold mb-2"
                    @click="openNewOrder(selectedTable)" id="btn-new-order">
              <i class="bi bi-plus-circle me-1"></i> Buat Pesanan Baru
            </button>
            <button v-if="selectedTable.status === 'occupied' && selectedTableOrder" class="btn btn-primary w-100 py-2 fw-bold mb-2"
                    @click="openOrder(selectedTableOrder)" id="btn-view-order">
              <i class="bi bi-receipt me-1"></i> Lihat Rincian Pesanan
            </button>
            <button v-if="editMode" class="btn btn-outline-primary w-100 py-2 mt-2 fw-bold"
                    @click="openEditTableModal(selectedTable)" id="btn-edit-table">
              <i class="bi bi-pencil-square me-1"></i>Edit Data Meja
            </button>

            <!-- Status Change Buttons -->
            <h6 class="text-uppercase text-muted fw-bold mt-4 mb-3 fs-8">Ubah Status Meja</h6>
            <div class="d-flex flex-wrap gap-2">
              <button v-if="selectedTable.status !== 'available' && !selectedTableOrder"
                      class="btn btn-sm btn-outline-success flex-fill"
                      @click="changeTableStatus('available')">
                <i class="bi bi-check-circle me-1"></i> Tersedia
              </button>
              <button v-if="selectedTable.status !== 'reserved'"
                      class="btn btn-sm btn-outline-warning flex-fill"
                      @click="changeTableStatus('reserved')">
                <i class="bi bi-bookmark-star me-1"></i> Reservasi
              </button>
              <button v-if="selectedTable.status !== 'cleaning'"
                      class="btn btn-sm btn-outline-secondary flex-fill"
                      @click="changeTableStatus('cleaning')">
                <i class="bi bi-droplet-half me-1"></i> Perlu Bersih
              </button>
            </div>
          </div>
        </div>
      </div>
    </transition>

    <!-- Modal Tambah/Edit Ruangan -->
    <div v-if="showAddRoom" class="modal-backdrop show" @click.self="showAddRoom = false">
      <div class="rtm-modal">
        <div class="rtm-modal-header bg-light">
          <h5 class="fw-bold mb-0">{{ roomForm.uuid ? 'Edit Ruangan' : 'Tambah Ruangan/Area' }}</h5>
          <button class="btn-close" @click="showAddRoom = false"></button>
        </div>
        <div class="rtm-modal-body p-4">
          <div class="mb-3">
            <label class="form-label fw-bold text-muted small">Nama Area *</label>
            <input v-model="roomForm.name" class="form-control form-control-lg fs-6" placeholder="Misal: Lantai 1, Outdoor" id="input-room-name" />
          </div>
          <div class="mb-2">
            <label class="form-label fw-bold text-muted small">Catatan Singkat</label>
            <textarea v-model="roomForm.description" class="form-control" rows="2" id="input-room-desc"></textarea>
          </div>
        </div>
        <div class="rtm-modal-footer bg-light p-3 d-flex justify-content-end gap-2">
          <button class="btn btn-outline-secondary px-4" @click="showAddRoom = false">Batal</button>
          <button class="btn btn-primary px-4" @click="saveRoom" :disabled="!roomForm.name" id="btn-save-room">Simpan Area</button>
        </div>
      </div>
    </div>

    <!-- Modal Tambah/Edit Meja -->
    <div v-if="showAddTable" class="modal-backdrop show" @click.self="showAddTable = false">
      <div class="rtm-modal">
        <div class="rtm-modal-header bg-light">
          <h5 class="fw-bold mb-0">{{ tableForm.uuid ? 'Edit Data Meja' : 'Pengaturan Meja Baru' }}</h5>
          <button class="btn-close" @click="showAddTable = false"></button>
        </div>
        <div class="rtm-modal-body p-4">
          <div class="row">
            <div class="col-md-6 mb-3">
              <label class="form-label fw-bold text-muted small">Nomor Meja *</label>
              <input v-model="tableForm.number" class="form-control" placeholder="Contoh: 01, A1" id="input-table-number" />
            </div>
            <div class="col-md-6 mb-3">
              <label class="form-label fw-bold text-muted small">Kapasitas (Orang)</label>
              <input v-model.number="tableForm.capacity" type="number" class="form-control" min="1" id="input-table-capacity" />
            </div>
          </div>
          <div class="mb-3">
            <label class="form-label fw-bold text-muted small">Label Keterangan (Opsional)</label>
            <input v-model="tableForm.label" class="form-control" placeholder="Misal: Dekat Ac, Teras Depan" id="input-table-label" />
          </div>
          <div class="row mb-3">
            <div class="col-sm-6">
              <label class="form-label fw-bold text-muted small">Pilih Area Penempatan</label>
              <select v-model="tableForm.room_id" class="form-select" id="select-table-room">
                <option :value="null">-- Tidak Masuk Area --</option>
                <option v-for="r in rooms" :key="r.uuid" :value="r.uuid">{{ r.name }}</option>
              </select>
            </div>
            <div class="col-sm-6" v-if="tableForm.uuid">
              <label class="form-label fw-bold text-muted small">Status Meja</label>
              <select v-model="tableForm.status" class="form-select" id="select-table-status">
                <option value="available">Tersedia (Kosong)</option>
                <option value="occupied">Terisi (Pesanan)</option>
                <option value="reserved">Reservasi</option>
                <option value="cleaning">Perlu Dibersihkan</option>
              </select>
            </div>
          </div>
          <div class="mb-2">
             <label class="form-label fw-bold text-muted small">Bentuk Visual Meja</label>
             <div class="d-flex gap-3 mt-1">
               <label class="shape-selector">
                 <input type="radio" v-model="tableForm.shape" value="square" name="t_shape" class="d-none">
                 <div class="shape-box" :class="{ 'active': tableForm.shape === 'square' }">
                   <div style="width:30px;height:30px;background:#ddd;border-radius:4px"></div>
                   <span>Kotak</span>
                 </div>
               </label>
               <label class="shape-selector">
                 <input type="radio" v-model="tableForm.shape" value="round" name="t_shape" class="d-none">
                 <div class="shape-box" :class="{ 'active': tableForm.shape === 'round' }">
                   <div style="width:30px;height:30px;background:#ddd;border-radius:50%"></div>
                   <span>Bulat</span>
                 </div>
               </label>
               <label class="shape-selector">
                 <input type="radio" v-model="tableForm.shape" value="rectangle" name="t_shape" class="d-none">
                 <div class="shape-box" :class="{ 'active': tableForm.shape === 'rectangle' }">
                   <div style="width:40px;height:24px;background:#ddd;border-radius:4px"></div>
                   <span>Panjang</span>
                 </div>
               </label>
             </div>
          </div>
        </div>
        <div class="rtm-modal-footer bg-light p-3 d-flex justify-content-end gap-2">
          <button class="btn btn-outline-secondary px-4" @click="showAddTable = false">Batal</button>
          <button class="btn btn-primary px-4" @click="saveTable" :disabled="!tableForm.number" id="btn-save-table">Simpan Meja</button>
        </div>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="rtm-loading">
      <div class="spinner-border text-primary"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { getRestoRooms, createRestoRoom, updateRestoRoom, deleteRestoRoom, getRestoTables, createRestoTable, updateRestoTable, deleteRestoTable, saveRestoLayout, getRestoOrders } from '@/services/sales/restoApi'

const router = useRouter()

const loading = ref(false)
const rooms = ref([])
const tables = ref([])
const activeOrders = ref([])
const selectedRoom = ref(null)
const selectedTable = ref(null)
const editMode = ref(false)
const dragging = ref(null)
const dragOffset = ref({ x: 0, y: 0 })
const currentTime = ref(Date.now())

// Modals
const showAddRoom = ref(false)
const showAddTable = ref(false)
const roomForm = ref({ name: '', description: '' })
const tableForm = ref({ number: '', label: '', capacity: 4, shape: 'square', room_id: null })

// Tables setup
const canvasContainer = ref(null)

const filteredTables = computed(() => {
  if (!selectedRoom.value) return tables.value
  return tables.value.filter(t => t.room_id === selectedRoom.value)
})

function tablesByRoom(roomUuid) {
  return tables.value.filter(t => t.room_id === roomUuid)
}

const selectedTableOrder = computed(() => {
  if (!selectedTable.value) return null
  return activeOrders.value.find(o => o.table_id === selectedTable.value.uuid && !['paid', 'cancelled'].includes(o.status))
})

// ═══ Data Loading ═══
async function loadData() {
  loading.value = true
  try {
    const [roomRes, tableRes, orderRes] = await Promise.all([
      getRestoRooms(),
      getRestoTables(),
      getRestoOrders()
    ])
    rooms.value = roomRes.data
    tables.value = tableRes.data.map(t => ({
      ...t,
      pos_x: parseFloat(t.pos_x) || 0,
      pos_y: parseFloat(t.pos_y) || 0,
      width: parseFloat(t.width) || (t.shape === 'rectangle' ? 100 : 80),
      height: parseFloat(t.height) || (t.shape === 'rectangle' ? 60 : 80),
    }))

    // Filter active orders
    activeOrders.value = (orderRes.data || []).filter(o => !['paid', 'cancelled'].includes(o.status))

    // Sync table statuses based on orders
    const occupiedTableIds = new Set(activeOrders.value.map(o => o.table_id))
    tables.value.forEach(t => {
      if (occupiedTableIds.has(t.uuid) && t.status === 'available') {
        t.status = 'occupied'
      } else if (!occupiedTableIds.has(t.uuid) && t.status === 'occupied') {
        t.status = 'available'
      }
    })
  } catch (e) {
    console.error('Failed to load resto data', e)
  } finally {
    loading.value = false
  }
}

// ═══ Intervals ═══
let refreshInterval, timeInterval
onMounted(() => {
  loadData()
  refreshInterval = setInterval(loadData, 30000)
  timeInterval = setInterval(() => { currentTime.value = Date.now() }, 1000)
})
onUnmounted(() => {
  clearInterval(refreshInterval)
  clearInterval(timeInterval)
})

function getTableTimer(tableId) {
  const order = activeOrders.value.find(o => o.table_id === tableId && !['paid', 'cancelled'].includes(o.status))
  if (!order || !order.ordered_at) return ''
  const diff = Math.floor((currentTime.value - new Date(order.ordered_at).getTime()) / 1000)
  if (diff < 0) return '00:00'
  const m = Math.floor(diff / 60)
  const s = diff % 60
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

// ═══ Ruangan ═══
function openAddRoomModal() {
  roomForm.value = { uuid: null, name: '', description: '' }
  showAddRoom.value = true
}
function openEditRoomModal(room) {
  roomForm.value = { uuid: room.uuid, name: room.name, description: room.description || '' }
  showAddRoom.value = true
}
async function saveRoom() {
  try {
    if (roomForm.value.uuid) {
      await updateRestoRoom(roomForm.value.uuid, roomForm.value)
    } else {
      await createRestoRoom(roomForm.value)
    }
    showAddRoom.value = false
    loadData()
  } catch (e) {
    alert(e.response?.data?.error || 'Gagal menyimpan ruangan')
  }
}
async function deleteRoom(room) {
  if (!confirm(`Hapus area ruangan "${room.name}"?`)) return
  try {
    await deleteRestoRoom(room.uuid)
    if (selectedRoom.value === room.uuid) selectedRoom.value = null
    loadData()
  } catch (e) {
    alert(e.response?.data?.error || 'Gagal menghapus ruangan')
  }
}

// ═══ Meja ═══
function openAddTableModal() {
  tableForm.value = { uuid: null, number: '', label: '', capacity: 4, shape: 'square', room_id: null, status: 'available' }
  showAddTable.value = true
}
function openEditTableModal(table) {
  tableForm.value = { ...table }
  showAddTable.value = true
}
async function saveTable() {
  try {
    if (tableForm.value.uuid) {
      // Editing existing
      await updateRestoTable(tableForm.value.uuid, {
        number: tableForm.value.number,
        capacity: tableForm.value.capacity,
        label: tableForm.value.label,
        room_id: tableForm.value.room_id,
        shape: tableForm.value.shape,
        status: tableForm.value.status
      })
    } else {
      // New table
      await createRestoTable({
        ...tableForm.value,
        room_id: tableForm.value.room_id || selectedRoom.value,
        pos_x: Math.random() * 300 + 50,
        pos_y: Math.random() * 200 + 50,
      })
    }
    showAddTable.value = false
    loadData()
  } catch (e) {
    alert(e.response?.data?.error || 'Gagal menyimpan meja')
  }
}
async function deleteTableConfirm(table) {
  if (!confirm(`Yakin ingin menghapus secara permanen meja nomor "${table.number}"?`)) return
  try {
    await deleteRestoTable(table.uuid)
    if (selectedTable.value?.uuid === table.uuid) selectedTable.value = null
    loadData()
  } catch (e) {
    alert(e.response?.data?.error || 'Gagal menghapus meja')
  }
}
async function saveLayout() {
  try {
    await saveRestoLayout(tables.value.map(t => ({
      uuid: t.uuid, pos_x: t.pos_x, pos_y: t.pos_y, width: t.width, height: t.height
    })))
    alert('Layout denah meja berhasil disimpan!')
    editMode.value = false
  } catch (e) {
    alert(e.response?.data?.error || 'Gagal menyimpan layout')
  }
}

// ═══ Drag / Drop ═══
function toggleEditMode() { 
  editMode.value = !editMode.value 
  if (editMode.value) selectedTable.value = null
}

function onTableMouseDown(e, table) {
  if (!editMode.value) return
  dragging.value = table
  // Calculate offset relative to canvas container, not viewport
  const canvasRect = canvasContainer.value?.getBoundingClientRect() || { left: 0, top: 0 }
  const scrollLeft = canvasContainer.value?.scrollLeft || 0
  const scrollTop = canvasContainer.value?.scrollTop || 0
  const mouseCanvasX = e.clientX - canvasRect.left + scrollLeft
  const mouseCanvasY = e.clientY - canvasRect.top + scrollTop
  dragOffset.value = { x: mouseCanvasX - table.pos_x, y: mouseCanvasY - table.pos_y }
}
function onCanvasMouseDown() {}
function onCanvasMouseMove(e) {
  if (!dragging.value) return
  const canvasRect = canvasContainer.value?.getBoundingClientRect() || { left: 0, top: 0 }
  const scrollLeft = canvasContainer.value?.scrollLeft || 0
  const scrollTop = canvasContainer.value?.scrollTop || 0
  const mouseCanvasX = e.clientX - canvasRect.left + scrollLeft
  const mouseCanvasY = e.clientY - canvasRect.top + scrollTop
  const newX = Math.max(0, mouseCanvasX - dragOffset.value.x)
  const newY = Math.max(0, mouseCanvasY - dragOffset.value.y)
  // Snap to 20px grid
  dragging.value.pos_x = Math.round(newX / 20) * 20
  dragging.value.pos_y = Math.round(newY / 20) * 20
}
function onCanvasMouseUp() {
  dragging.value = null
}

// ═══ Interaksi Click ═══
function onTableClick(table) {
  if (editMode.value) return
  selectedTable.value = table
}
function onTableDblClick(table) {
  if (editMode.value) return
  if (table.status === 'available') {
    openNewOrder(table)
  } else if (table.status === 'occupied') {
    const order = activeOrders.value.find(o => o.table_id === table.uuid && !['paid','cancelled'].includes(o.status))
    if (order) openOrder(order)
  }
}

function openNewOrder(table) {
  router.push({ name: 'RestoPOS', query: { table_id: table.uuid } })
}
function openOrder(order) {
  router.push({ name: 'RestoPOS', query: { table_id: order.table_id } })
}

// ═══ Helpers ═══
function formatMoney(val) {
  return new Intl.NumberFormat('id-ID').format(parseFloat(val) || 0)
}
function statusLabel(s) {
  return { available: 'Meja Tersedia', occupied: 'Sedang Terisi', reserved: 'Telah Direservasi', cleaning: 'Perlu Dibersihkan' }[s] || s
}
function orderStatusLabel(s) {
  return { new: 'Antrian Baru', cooking: 'Proses Dapur', ready: 'Makanan Siap', served: 'Sudah Disajikan', paid: 'Lunas', cancelled: 'Dibatalkan' }[s] || s
}
function orderStatusBadge(s) {
  return { new: 'bg-info', cooking: 'bg-warning text-dark', ready: 'bg-success', served: 'bg-primary', paid: 'bg-secondary', cancelled: 'bg-danger' }[s] || 'bg-secondary'
}
function statusIcon(s) {
  return {
    available: 'bi-check-circle-fill',
    occupied: 'bi-fire',
    reserved: 'bi-bookmark-star-fill',
    cleaning: 'bi-droplet-half'
  }[s] || 'bi-circle'
}

async function changeTableStatus(newStatus) {
  if (!selectedTable.value) return
  try {
    await updateRestoTable(selectedTable.value.uuid, { status: newStatus })
    selectedTable.value.status = newStatus
    // Also update in the tables array
    const t = tables.value.find(tb => tb.uuid === selectedTable.value.uuid)
    if (t) t.status = newStatus
  } catch (e) {
    alert(e.response?.data?.error || 'Gagal mengubah status meja')
  }
}
</script>

<style scoped>
.resto-table-map {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 60px);
  font-family: 'Inter', -apple-system, sans-serif;
  background-color: #f8fafc; /* bg-slate-50 */
}

/* Header */
.rtm-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 24px;
  background: #ffffff;
  border-bottom: 1px solid #e2e8f0;
  z-index: 10;
}
.rtm-title {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 700;
  color: #1e293b;
}

/* Main Body Area */
.rtm-body {
  display: flex;
  flex: 1;
  overflow: hidden;
  position: relative;
}

/* Sidebar Rooms */
.rtm-rooms {
  width: 250px;
  min-width: 250px;
  border-right: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  z-index: 5;
}
.rtm-rooms-header {
  padding: 16px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #f1f5f9;
}
.rtm-rooms-title {
  font-weight: 700;
  color: #475569;
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.rtm-room-list {
  list-style: none;
  padding: 12px 10px;
  margin: 0;
  flex: 1;
  overflow-y: auto;
}
.rtm-room-list li {
  padding: 12px 14px;
  border-radius: 10px;
  margin-bottom: 6px;
  cursor: pointer;
  font-size: 0.95rem;
  color: #334155;
  display: flex;
  justify-content: space-between;
  align-items: center;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  font-weight: 500;
  border: 1px solid transparent;
}
.rtm-room-list li:hover {
  background-color: #f8fafc;
  border-color: #e2e8f0;
  transform: translateX(4px);
}
.rtm-room-list li.active {
  background-color: #eff6ff;
  color: #2563eb;
  font-weight: 700;
  border-color: #bfdbfe;
  box-shadow: 0 2px 4px rgba(37, 99, 235, 0.05);
}
.rtm-room-list li.active .badge {
  background-color: #dbeafe !important;
  color: #1d4ed8 !important;
  border-color: #bfdbfe !important;
}

/* Legend */
.rtm-legend {
  padding: 20px;
  background-color: #f8fafc;
  border-top: 1px solid #e2e8f0;
}
.rtm-legend-title {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  color: #64748b;
  margin-bottom: 12px;
}
.rtm-legend-item {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 0.85rem;
  color: #475569;
  margin-bottom: 8px;
}
.legend-box {
  width: 14px;
  height: 14px;
  border-radius: 3px;
}
.legend-box.available { background: #10b981; } /* emerald-500 */
.legend-box.occupied { background: #ef4444; } /* red-500 */
.legend-box.reserved { background: #f59e0b; } /* amber-500 */
.legend-box.cleaning { background: #64748b; } /* slate-500 */

/* Canvas / Background */
.rtm-canvas-container {
  flex: 1;
  overflow: auto;
  position: relative;
  background-color: #f1f5f9; /* Soft gray canvas background typical of Majoo */
}
.rtm-canvas {
  position: relative;
  min-width: 1200px;
  min-height: 900px;
}
.rtm-grid {
  position: absolute;
  inset: 0;
  background-image: radial-gradient(#cbd5e1 1.5px, transparent 1.5px);
  background-size: 20px 20px;
  pointer-events: none;
}

/* Majoo Table UI Card */
.majoo-table {
  position: absolute;
  background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  box-shadow: 0 4px 12px -2px rgba(0, 0, 0, 0.08), 0 2px 4px -1px rgba(0, 0, 0, 0.04);
  display: flex;
  flex-direction: column;
  cursor: pointer;
  user-select: none;
  transition: box-shadow 0.25s ease, transform 0.2s ease, border-color 0.2s;
  overflow: hidden; /* To clip the top status bar cleanly */
}
.majoo-table:hover {
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
  z-index: 10;
}
.majoo-table.is-selected {
  border: 2px solid #3b82f6; /* blue-500 */
  box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.2);
}
.majoo-table.dragging {
  opacity: 0.9;
  transform: scale(1.05);
  box-shadow: 0 20px 25px -5px rgba(0,0,0,0.2);
  z-index: 999;
  cursor: grabbing;
}

/* Shapes logic mapping */
.majoo-table.shape-round { border-radius: 50% !important; }

/* Status Logic & Color (Top Bar Strategy) */
.majoo-table-status-bar {
  height: 8px;
  width: 100%;
  flex-shrink: 0;
  box-shadow: inset 0 -1px 2px rgba(0,0,0,0.1);
}
.bg-status-available { background-color: #10b981 !important; }
.bg-status-occupied { background-color: #ef4444 !important; }
.bg-status-reserved { background-color: #f59e0b !important; }
.bg-status-cleaning { background-color: #64748b !important; }

/* Dynamic Status Texts/Backgrounds for Side Panel */
.text-status-available { color: #059669 !important; } /* emerald-600 */
.bg-status-available-light { background-color: #d1fae5 !important; border-color: #a7f3d0 !important; }
.text-status-occupied { color: #dc2626 !important; } /* red-600 */
.bg-status-occupied-light { background-color: #fee2e2 !important; border-color: #fecaca !important;}
.text-status-reserved { color: #d97706 !important; } /* amber-600 */
.bg-status-reserved-light { background-color: #fef3c7 !important; border-color: #fde68a !important;}
.text-status-cleaning { color: #475569 !important; } /* slate-600 */
.bg-status-cleaning-light { background-color: #f1f5f9 !important; border-color: #e2e8f0 !important;}


.majoo-table-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 8px;
  position: relative;
}
.majoo-table.shape-round .majoo-table-body {
  padding-top: 10px; /* offset for missing top-border visual space */
}

/* Table Card Content Data */
.majoo-table-number {
  font-size: 1.35rem;
  font-weight: 800;
  color: #1e293b; /* slate-800 */
  line-height: 1;
}
.majoo-table-capacity {
  font-size: 0.75rem;
  color: #64748b;
  font-weight: 500;
  margin-top: 4px;
}
.majoo-table-timer {
  background: #fef2f2;
  color: #dc2626;
  font-size: 0.7rem;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 12px;
  margin-top: 4px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.majoo-table-label {
  font-size: 0.65rem;
  color: #94a3b8;
  max-width: 90%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  position: absolute;
  bottom: 4px;
}

/* Status Badge on Table Card */
.majoo-table-status-badge {
  font-size: 0.6rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  padding: 2px 8px;
  border-radius: 10px;
  margin-top: 4px;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  white-space: nowrap;
}
.majoo-table-status-badge i {
  font-size: 0.55rem;
}
.status-badge-available {
  background: #d1fae5;
  color: #059669;
  border: 1px solid #a7f3d0;
}
.status-badge-occupied {
  background: #fee2e2;
  color: #dc2626;
  border: 1px solid #fecaca;
  animation: pulse-occupied 2s ease-in-out infinite;
}
.status-badge-reserved {
  background: #fef3c7;
  color: #d97706;
  border: 1px solid #fde68a;
}
.status-badge-cleaning {
  background: #f1f5f9;
  color: #475569;
  border: 1px solid #e2e8f0;
}

/* Occupied table card glow effect */
.majoo-table:has(.status-badge-occupied) {
  border-color: #fca5a5;
}
.majoo-table:has(.status-badge-reserved) {
  border-color: #fde68a;
}
.majoo-table:has(.status-badge-cleaning) {
  border-color: #cbd5e1;
  opacity: 0.85;
}

@keyframes pulse-occupied {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

/* Delete Button on card */
.btn-delete-table {
  position: absolute;
  top: -8px;
  right: -8px;
  width: 24px;
  height: 24px;
  border-radius: 12px;
  background-color: #ef4444;
  color: white;
  border: 2px solid white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.9rem;
  opacity: 0;
  transition: opacity 0.2s;
  cursor: pointer;
  z-index: 20;
}
.majoo-table:hover .btn-delete-table { opacity: 1; }

/* Right Panel Popup View */
.rtm-info-panel {
  width: 340px;
  min-width: 340px;
  border-left: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  z-index: 20;
}
.info-avatar {
  width: 64px;
  height: 64px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.fs-8 { font-size: 0.75rem;}
.info-detail-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;
  font-size: 0.9rem;
}

/* Empty State Mapping */
.rtm-empty {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  pointer-events: none;
}
.rtm-loading {
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.8);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 99;
}

/* Modal Form Styles */
.modal-backdrop {
  background: rgba(0, 0, 0, 0.5) !important;
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1050;
  position: fixed; inset:0;
}
.rtm-modal {
  background: #fff;
  border-radius: 12px;
  width: 500px;
  max-width: 95vw;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  overflow: hidden;
}
/* Shape selector custom radio */
.shape-selector { cursor: pointer; }
.shape-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  transition: all 0.2s;
}
.shape-box span { font-size: 0.8rem; font-weight: 500; color: #64748b; }
.shape-box.active {
  background-color: #eff6ff;
  border-color: #3b82f6;
}
.shape-box.active span { color: #1d4ed8; }
.shape-box.active div { background-color: #93c5fd !important; }

/* Transitions */
.slide-right-enter-active, .slide-right-leave-active { transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
.slide-right-enter-from, .slide-right-leave-to { transform: translateX(100%); }
</style>
