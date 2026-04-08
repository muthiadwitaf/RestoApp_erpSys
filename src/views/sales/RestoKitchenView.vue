<template>
  <div class="resto-kitchen bg-light-gray" id="resto-kitchen-view">
    <!-- Header Area -->
    <div class="kds-header">
      <div class="kds-header-left">
        <div class="kds-logo-box bg-orange text-white">
          <i class="bi bi-fire fs-4"></i>
        </div>
        <div>
          <h4 class="kds-title mb-0">Kitchen Display</h4>
          <span class="text-muted small fw-bold">{{ activeOrders.length }} Pesanan Sedang Diproses</span>
        </div>
      </div>
      <div class="kds-header-right">
        <div class="kds-auto-refresh badge bg-white border text-dark me-3 px-3 py-2">
          <i class="bi bi-arrow-repeat text-primary me-2"></i> Auto-refresh: <strong>{{ refreshCountdown }}s</strong>
        </div>
        <button class="btn btn-outline-secondary d-flex align-items-center gap-2" @click="loadOrders" id="btn-refresh-kitchen">
          <i class="bi bi-arrow-clockwise"></i> Segarkan Sekarang
        </button>
      </div>
    </div>

    <!-- Ticket Board Grid -->
    <div class="kds-board" v-if="activeOrders.length > 0">
      <div v-for="order in activeOrders" :key="order.uuid" class="kds-ticket" :class="urgencyClass(order)">
        
        <!-- Ticket Header -->
        <div class="kds-ticket-header" :class="ticketHeaderClass(order)">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <span class="kds-table-num">
              Meja {{ order.table_number || '?' }}
            </span>
            <span class="kds-timer-badge" :class="timerBadgeClass(order)">
              <i class="bi bi-stopwatch-fill"></i> {{ formatTimer(order.ordered_at) }}
            </span>
          </div>
          <div class="d-flex justify-content-between align-items-center text-white-50 small">
            <span>{{ order.order_number }}</span>
            <span class="text-uppercase fw-bold">{{ statusLabel(order.status) }}</span>
          </div>
        </div>

        <!-- Metadata / Customer -->
        <div class="kds-ticket-meta px-3 py-2 border-bottom bg-light">
          <div v-if="order.customer_name" class="fw-bold text-dark w-100 text-truncate" title="Customer">
            <i class="bi bi-person-fill text-muted me-1"></i> {{ order.customer_name }}
            <span v-if="order.guest_count > 1" class="text-muted fw-normal ms-1">({{ order.guest_count }} org)</span>
          </div>
          <div v-if="order.table_label" class="text-muted small mt-1">
            <i class="bi bi-pin-map-fill"></i> {{ order.table_label }}
          </div>
        </div>

        <!-- Ticket Notes / Remarks -->
        <div v-if="order.notes" class="kds-ticket-notes px-3 py-2 bg-yellow-soft">
          <span class="fw-bold text-brown"><i class="bi bi-chat-left-text-fill me-1"></i> Catatan Pesanan:</span><br>
          <span class="text-dark">{{ order.notes }}</span>
        </div>

        <!-- Order Items List -->
        <div class="kds-items">
          <div v-for="item in orderItems(order)" :key="item.uuid" class="kds-item" :class="`item-status-${item.status}`" @click="advanceItem(item, order)">
            <div class="d-flex align-items-start gap-2">
              <div class="kds-item-qty">{{ item.qty }}<span class="small text-muted">x</span></div>
              <div class="kds-item-details">
                <div class="kds-item-name" :class="{'text-decoration-line-through text-muted': item.status === 'ready' || item.status === 'served'}">
                  {{ item.item_name }}
                </div>
                <div v-if="item.notes" class="kds-item-note text-danger fw-bold small mt-1">
                  <i class="bi bi-exclamation-square-fill me-1"></i> {{ item.notes }}
                </div>
              </div>
            </div>
            
            <div class="kds-item-action">
               <div v-if="item.status === 'pending'" class="item-checkbox border-warning text-warning"><i class="bi bi-fire"></i></div>
               <div v-else-if="item.status === 'cooking'" class="item-checkbox border-primary text-primary"><i class="bi bi-hourglass-split"></i></div>
               <div v-else class="item-checkbox bg-success border-success text-white"><i class="bi bi-check-lg"></i></div>
            </div>
          </div>
        </div>

        <!-- Ticket Actions (Bottom) -->
        <div class="kds-ticket-actions p-3 border-top mt-auto bg-light">
          <button v-if="order.status === 'new'" class="btn btn-warning w-100 fw-bold py-2 btn-lg-touch" @click="markOrderCooking(order)">
            <i class="bi bi-fire me-2"></i> MULAI MASAK
          </button>
          <button v-if="order.status === 'cooking' && allItemsReady(order)" class="btn btn-success w-100 fw-bold py-2 btn-lg-touch" @click="markOrderReady(order)">
            <i class="bi bi-check2-circle me-2"></i> SEMUA SIAP
          </button>
          <button v-if="order.status === 'cooking' && !allItemsReady(order)" class="btn btn-outline-success w-100 fw-bold py-2 btn-lg-touch" disabled>
            <i class="bi bi-hourglass me-2"></i> SEDANG DIMASAK
          </button>
          <button v-if="order.status === 'ready'" class="btn btn-primary w-100 fw-bold py-2 btn-lg-touch" @click="markOrderServed(order)">
            <i class="bi bi-bell-fill me-2"></i> PANGGIL & SAJIKAN
          </button>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else-if="!loading" class="kds-empty">
      <div class="empty-illustration mb-4">
        <i class="bi bi-cup-hot-fill text-success" style="font-size: 5rem; opacity: 0.8;"></i>
      </div>
      <h3 class="fw-bold text-dark">Dapur Kosong! 🎉</h3>
      <p class="text-muted fs-5">Luar biasa! Tidak ada antrian pesanan saat ini.</p>
    </div>

    <!-- Loading Overlay -->
    <div v-if="loading" class="kds-loading">
      <div class="spinner-border text-primary" style="width: 3rem; height: 3rem;"></div>
      <h5 class="mt-3 fw-bold text-dark">Melakukan Sinkronisasi...</h5>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { getKitchenOrders, updateKitchenItemStatus, updateRestoOrderStatus } from '@/services/sales/restoApi'

const loading = ref(false)
const activeOrders = ref([])
const refreshCountdown = ref(15)
const currentTime = ref(Date.now())

let refreshTimer, countdownTimer, timeTicker

onMounted(() => {
  loadOrders()
  startAutoRefresh()
  timeTicker = setInterval(() => { currentTime.value = Date.now() }, 1000)
})
onUnmounted(() => {
  clearInterval(refreshTimer)
  clearInterval(countdownTimer)
  clearInterval(timeTicker)
})

function startAutoRefresh() {
  refreshCountdown.value = 15
  clearInterval(refreshTimer)
  clearInterval(countdownTimer)
  refreshTimer = setInterval(() => {
    loadOrders()
    refreshCountdown.value = 15
  }, 15000)
  countdownTimer = setInterval(() => {
    if (refreshCountdown.value > 0) refreshCountdown.value--
  }, 1000)
}

async function loadOrders() {
  loading.value = activeOrders.value.length === 0
  try {
    const res = await getKitchenOrders()
    // Sort orders: oldest first (urgency driven)
    const orders = res.data || []
    orders.sort((a,b) => new Date(a.ordered_at).getTime() - new Date(b.ordered_at).getTime())
    activeOrders.value = orders
  } catch (e) {
    console.error('Kitchen load error:', e)
  } finally {
    loading.value = false
  }
}

function orderItems(order) {
  if (!order.items || !Array.isArray(order.items)) return []
  return order.items.filter(i => i && i.item_name && i.status !== 'cancelled')
}

function allItemsReady(order) {
  const items = orderItems(order)
  return items.length > 0 && items.every(i => i.status === 'ready' || i.status === 'served' || i.status === 'cancelled')
}

async function advanceItem(item, order) {
  // If item is ready/served, clicking again shouldn't do anything (or maybe revert, but we'll stick to one-way forward like Majoo)
  if (item.status === 'ready' || item.status === 'served' || item.status === 'cancelled') return;

  const nextStatus = item.status === 'pending' ? 'cooking' : 'ready'
  
  // Optimistic UI update
  const prevStatus = item.status
  item.status = nextStatus

  try {
    await updateKitchenItemStatus(item.uuid, nextStatus)

    if (nextStatus === 'cooking' && order.status === 'new') {
      await updateRestoOrderStatus(order.uuid, 'cooking')
      order.status = 'cooking'
    }
    
    // Auto mark order ready if last item finished
    if (nextStatus === 'ready' && allItemsReady(order)) {
      await updateRestoOrderStatus(order.uuid, 'ready')
      order.status = 'ready'
    }
  } catch (e) {
    // Revert optimistic update
    item.status = prevStatus
    alert(e.response?.data?.error || 'Gagal update status item')
    loadOrders()
  }
}

// Order Level Actions
async function markOrderCooking(order) {
  try {
    await updateRestoOrderStatus(order.uuid, 'cooking')
    loadOrders()
  } catch (e) {
    alert(e.response?.data?.error || 'Gagal update status pesanan')
  }
}
async function markOrderReady(order) {
  try {
    await updateRestoOrderStatus(order.uuid, 'ready')
    loadOrders()
  } catch (e) {
    alert(e.response?.data?.error || 'Gagal update status pesanan')
  }
}
async function markOrderServed(order) {
  try {
    await updateRestoOrderStatus(order.uuid, 'served')
    loadOrders()
  } catch (e) {
    alert(e.response?.data?.error || 'Gagal update status pesanan')
  }
}

// Timers & Urgency Logic
function formatTimer(orderedAt) {
  if (!orderedAt) return '--:--'
  const diff = Math.floor((currentTime.value - new Date(orderedAt).getTime()) / 1000)
  if (diff < 0) return '00:00'
  const m = Math.floor(diff / 60)
  const s = diff % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
function getMinutesElapsed(orderedAt) {
  if (!orderedAt) return 0
  return Math.floor((currentTime.value - new Date(orderedAt).getTime()) / 60000)
}

function urgencyClass(order) {
  const m = getMinutesElapsed(order.ordered_at)
  if (m >= 25) return 'urgency-late'
  if (m >= 15) return 'urgency-warn'
  return 'urgency-normal'
}

function ticketHeaderClass(order) {
  const m = getMinutesElapsed(order.ordered_at)
  if (m >= 25) return 'bg-danger' // Merah - Telat
  if (m >= 15) return 'bg-warning text-dark' // Kuning - Peringatan
  return 'bg-success' // Hijau - Normal
}

function timerBadgeClass(order) {
  const m = getMinutesElapsed(order.ordered_at)
  // Contrast fixes since bg-warning is bright
  if (m >= 15 && m < 25) return 'bg-white text-dark'
  return 'bg-white text-danger' // highlight text inside dark headers
}

function statusLabel(s) {
  return { new: 'Baru', cooking: 'Dimasak', ready: 'Semua Siap', served: 'Disajikan' }[s] || s
}
</script>

<style scoped>
.bg-light-gray { background-color: #e2e8f0; } /* Tailwind slate-200, realistic KDS bg */
.resto-kitchen {
  min-height: calc(100vh - 60px);
  font-family: 'Inter', -apple-system, sans-serif;
  display: flex;
  flex-direction: column;
}

/* Header */
.kds-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  background: #ffffff;
  border-bottom: 2px solid #cbd5e1;
  box-shadow: 0 2px 10px rgba(0,0,0,0.02);
  z-index: 10;
}
.kds-header-left, .kds-header-right { display: flex; align-items: center; }
.kds-header-left { gap: 16px; }
.kds-logo-box {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--bs-primary, #00B4AB); /* Majoo Teal */
}
.kds-title { color: #1e293b; font-weight: 800; letter-spacing: -0.5px; }

/* Grid Layout (Kanban/Masonry style) */
.kds-board {
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
  gap: 20px;
  padding: 24px;
  flex: 1;
  overflow-y: auto;
}

/* Individual Ticket Card */
.kds-ticket {
  width: 320px;
  background: #ffffff;
  border-radius: 16px;
  box-shadow: 0 8px 24px -4px rgba(0,0,0,0.08), 0 4px 10px -2px rgba(0,0,0,0.04);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid #e2e8f0;
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  flex-grow: 0;
  flex-shrink: 0;
  align-self: flex-start;
}
.kds-ticket:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 30px -5px rgba(0,0,0,0.12), 0 8px 15px -4px rgba(0,0,0,0.06);
}

/* Animasi Urgent */
.kds-ticket.urgency-warn { border: 2px solid #f59e0b; }
.kds-ticket.urgency-late { border: 2px solid #ef4444; animation: flash-border 2s infinite; }
@keyframes flash-border {
  0%, 100% { border-color: #ef4444; }
  50% { border-color: #fca5a5; }
}

/* Ticket Header */
.kds-ticket-header {
  padding: 16px;
  color: white; /* Will be overridden if text-dark applied */
}
.kds-table-num {
  font-size: 1.5rem;
  font-weight: 900;
  letter-spacing: -0.5px;
}
.kds-timer-badge {
  padding: 4px 10px;
  border-radius: 100px;
  font-weight: 800;
  font-size: 0.95rem;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

/* Meta & Notes */
.bg-yellow-soft { background-color: #fef3c7; border-bottom: 1px solid #fde68a; }
.text-brown { color: #92400e; }

/* Items List */
.kds-items {
  padding: 8px 12px;
}
.kds-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 14px;
  background-color: #fff;
  border-bottom: 1px solid #f1f5f9;
  cursor: pointer;
  transition: background-color 0.2s;
}
.kds-item:last-child { border-bottom: none; }
.kds-item:hover { background-color: #f8fafc; }

.kds-item-qty {
  font-size: 1.25rem;
  font-weight: 800;
  color: #3b82f6; /* bright blue */
  flex-shrink: 0;
  width: 40px;
}
.kds-item-details { flex: 1; padding-right: 12px; }
.kds-item-name {
  font-size: 1.05rem;
  font-weight: 600;
  color: #1e293b;
  line-height: 1.3;
}

/* Action Checkbox inside item */
.kds-item-action {
  flex-shrink: 0;
}
.item-checkbox {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  border: 2px solid #cbd5e1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.4rem;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  background-color: #f8fafc;
}
.kds-item.item-status-pending .item-checkbox { background-color: #fffbeb; } /* amber-50 */
.kds-item.item-status-cooking .item-checkbox { background-color: #eff6ff; } /* blue-50 */
.kds-item.item-status-ready .item-checkbox { background-color: #10b981; border-color: #10b981;} /* emerald-500 */
.kds-item.item-status-ready .kds-item-qty { opacity: 0.5; }

/* Large Action Buttons */
.btn-lg-touch { 
  font-size: 1rem;
  letter-spacing: 0.5px;
}

/* Empty / Loading States */
.kds-empty, .kds-loading {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}
</style>
