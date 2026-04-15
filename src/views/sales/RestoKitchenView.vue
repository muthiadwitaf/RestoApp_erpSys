<template>
  <div class="resto-kitchen bg-light-gray" id="resto-kitchen-view">
    <!-- Header Area -->
    <div class="kds-header">
      <div class="kds-header-left">
        <div class="kds-logo-box bg-orange text-white">
          <i class="bi bi-fire fs-4"></i>
        </div>
        <div>
          <h4 class="kds-title mb-0">{{ t('kitchen_display') }}</h4>
          <span class="text-muted small fw-bold">{{ pendingOrders.length }} {{ t('orders_processing') }}</span>
        </div>
      </div>
      <div class="kds-header-right">
        <!-- Audio Unlocker to pass Browser Autoplay Policy -->
        <button v-if="!audioUnlocked" class="btn btn-danger d-flex align-items-center gap-2 me-3" @click="unlockAudio">
          <i class="bi bi-volume-mute-fill"></i> {{ t('turn_on_audio') }}
        </button>
        <div v-else class="kds-auto-refresh badge bg-body border text-success border-success me-3 px-3 py-2">
          <i class="bi bi-volume-up-fill me-1"></i> {{ t('audio_on') }}
        </div>
        
        <div class="kds-auto-refresh badge bg-body border text-body me-3 px-3 py-2">
          <i class="bi bi-arrow-repeat text-primary me-2"></i> Auto-refresh: <strong>{{ refreshCountdown }}s</strong>
        </div>
        <button class="btn btn-outline-secondary d-flex align-items-center gap-2" @click="loadOrders" id="btn-refresh-kitchen">
          <i class="bi bi-arrow-clockwise"></i> {{ t('refresh_now') }}
        </button>
      </div>
    </div>

    <!-- Ticket Board Grid -->
    <div class="kds-board" v-if="pendingOrders.length > 0">
      <div v-for="order in pendingOrders" :key="order.uuid" class="kds-ticket" :class="urgencyClass(order)">
        
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
          <div class="d-flex justify-content-between align-items-center text-white-50 small mt-1">
            <span>{{ order.order_number }}</span>
            <span class="text-uppercase fw-bold">
              {{ statusLabel(order.status) }}
              <span v-if="order.status === 'paid'" class="badge bg-warning text-dark ms-1 d-inline-block shadow-sm"><i class="bi bi-cash-coin me-1"></i>LUNAS</span>
            </span>
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

        <!-- Ticket Notes -->
        <div v-if="order.notes" class="kds-ticket-notes px-3 py-2 bg-yellow-soft">
          <span class="fw-bold text-brown small"><i class="bi bi-chat-left-text-fill me-1"></i> Catatan Pesanan:</span><br>
          <span class="text-dark small">{{ order.notes }}</span>
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
               <div v-if="item.status === 'pending' || item.status === 'new'" class="item-checkbox border-warning text-warning"><i class="bi bi-fire"></i></div>
               <div v-else-if="item.status === 'cooking'" class="item-checkbox border-primary text-primary"><i class="bi bi-hourglass-split"></i></div>
               <div v-else class="item-checkbox bg-success border-success text-white"><i class="bi bi-check-lg"></i></div>
            </div>
          </div>
        </div>

        <!-- Ticket Actions (Bottom) -->
        <div class="kds-ticket-actions p-3 border-top mt-auto bg-light">
          <button v-if="getOrderVirtualStatus(order) === 'new'" class="btn btn-warning w-100 fw-bold py-2 btn-lg-touch" @click="markOrderCooking(order)">
            <i class="bi bi-fire me-2"></i> MULAI MASAK
          </button>
          <button v-if="getOrderVirtualStatus(order) === 'cooking' && allItemsReady(order)" class="btn btn-success w-100 fw-bold py-2 btn-lg-touch" @click="markOrderReady(order)">
            <i class="bi bi-check2-circle me-2"></i> SEMUA SIAP
          </button>
          <button v-if="getOrderVirtualStatus(order) === 'cooking' && !allItemsReady(order)" class="btn btn-outline-success w-100 fw-bold py-2 btn-lg-touch" disabled>
            <i class="bi bi-hourglass me-2"></i> SEDANG DIMASAK
          </button>
          <button v-if="getOrderVirtualStatus(order) === 'ready'" class="btn btn-primary w-100 fw-bold py-2 btn-lg-touch" @click="markOrderServed(order)">
            <i class="bi bi-bell-fill me-2"></i> PANGGIL & SAJIKAN
          </button>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else-if="!orderStore.isLoading" class="kds-empty">
      <div class="empty-illustration mb-4">
        <i class="bi bi-cup-hot-fill text-success" style="font-size: 5rem; opacity: 0.8;"></i>
      </div>
      <div class="text-center">
        <h3 class="fw-bold text-body">{{ t('empty_kitchen') }}</h3>
        <p class="text-muted fs-5">{{ t('empty_kitchen_msg') }}</p>
      </div>
    </div>

    <!-- Loading Overlay -->
    <div v-if="orderStore.isLoading && pendingOrders.length === 0" class="kds-loading">
      <div class="spinner-border text-primary" style="width: 3rem; height: 3rem;"></div>
      <h5 class="mt-3 fw-bold text-dark">Melakukan Sinkronisasi...</h5>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useOrderStore } from '@/stores/order'
import { useToast } from '@/composables/useToast'
import { useLang } from '@/composables/useLang'

const orderStore = useOrderStore()
const toast = useToast()
const { t } = useLang()
const pendingOrders = computed(() => orderStore.activeOrders.filter(order => order.status !== 'served' && order.status !== 'cancelled'))
const currentTime = ref(Date.now())
const refreshCountdown = ref(5)

let timeTicker
let countdownTicker
// Audio unlocking tracker for Browser policy
const audioUnlocked = ref(false)

// Bulletproof Ping using Web Audio API (No external MP3 needed/No CORS issues)
let audioCtx = null;

function unlockAudio() {
  audioUnlocked.value = true;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    // Play a silent tiny beep just to unlock the context
    playBeep(0.01);
  } catch (e) {
    console.log('Audio init warning', e);
  }
}

function playBeep(volume = 1.0) {
  if (!audioCtx) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();
  
  // Create 2 oscillators for a piercing bell/chime sound
  const osc1 = audioCtx.createOscillator();
  const osc2 = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  
  // Square wave makes a much sharper, louder sound
  osc1.type = 'square';
  osc1.frequency.setValueAtTime(1200, audioCtx.currentTime);
  osc1.frequency.exponentialRampToValueAtTime(800, audioCtx.currentTime + 0.6);

  osc2.type = 'triangle';
  osc2.frequency.setValueAtTime(600, audioCtx.currentTime);
  osc2.frequency.exponentialRampToValueAtTime(400, audioCtx.currentTime + 0.6);
  
  // Set initial volume extremely loud (2.0) then taper off
  gainNode.gain.setValueAtTime(volume * 2, audioCtx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.8);
  
  osc1.connect(gainNode);
  osc2.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  
  osc1.start();
  osc2.start();
  osc1.stop(audioCtx.currentTime + 0.8);
  osc2.stop(audioCtx.currentTime + 0.8);
}

onMounted(() => {
  orderStore.startPolling(5000) // 5s polling for production feel
  timeTicker = setInterval(() => { currentTime.value = Date.now() }, 1000)
  
  // UX countdown for auto-refresh
  countdownTicker = setInterval(() => {
    if (refreshCountdown.value <= 1) refreshCountdown.value = 5
    else refreshCountdown.value--
  }, 1000)
})

function loadOrders() {
  // Manual refresh of kitchen orders (optimistic, no UI block)
  orderStore.fetchActiveOrders()
}

onUnmounted(() => {
  orderStore.stopPolling()
  clearInterval(timeTicker)
  clearInterval(countdownTicker)
})

// Watch for new orders and play sound
watch(() => orderStore.activeOrders.length, (newCount, oldCount) => {
  if (newCount > oldCount && audioUnlocked.value) {
    playBeep(1.0);
  }
})

function orderItems(order) {
  if (!order.items || !Array.isArray(order.items)) return []
  return order.items.filter(i => i && i.status !== 'cancelled')
}

function getOrderVirtualStatus(order) {
  if (['new', 'cooking', 'ready', 'served'].includes(order.status)) return order.status;
  
  // If paid or others, derive from items
  const items = orderItems(order);
  if (items.length === 0) return 'ready';
  if (items.every(i => ['ready', 'served', 'cancelled'].includes(i.status))) return 'ready';
  if (items.some(i => i.status === 'cooking')) return 'cooking';
  if (items.some(i => ['ready', 'served'].includes(i.status))) return 'cooking';
  
  return 'new';
}

function allItemsReady(order) {
  const items = orderItems(order)
  return items.length > 0 && items.every(i => ['ready', 'served', 'cancelled'].includes(i.status))
}

async function advanceItem(item, order) {
  if (['ready', 'served', 'cancelled'].includes(item.status)) return;

  const nextStatus = (item.status === 'pending' || item.status === 'new') ? 'cooking' : 'ready'
  
  try {
    await orderStore.updateItemStatus(item.uuid, nextStatus)
  } catch (e) {
    toast.error('Gagal update status item')
  }
}

// Order Level Actions
async function markOrderCooking(order) {
  try {
    await orderStore.updateOrderStatus(order.uuid, 'cooking')
    toast.success(`Meja ${order.table_number} mulai dimasak`)
  } catch (e) {
    toast.error('Gagal update status pesanan')
  }
}

async function markOrderReady(order) {
  try {
    await orderStore.updateOrderStatus(order.uuid, 'ready')
    toast.success(`Meja ${order.table_number} siap disajikan`)
  } catch (e) {
    toast.error('Gagal update status pesanan')
  }
}

async function markOrderServed(order) {
  try {
    await orderStore.updateOrderStatus(order.uuid, 'served')
    toast.success(`Meja ${order.table_number} disajikan`)
  } catch (e) {
    toast.error('Gagal update status pesanan')
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
  if (m >= 25) return 'bg-danger' // Red - Late
  if (m >= 15) return 'bg-warning text-dark' // Yellow - Warning
  return 'bg-success' // Green - Normal
}

function timerBadgeClass(order) {
  const m = getMinutesElapsed(order.ordered_at)
  if (m >= 25) return 'bg-body text-danger'
  if (m >= 15) return 'bg-body text-warning'
  return 'bg-body text-body'
}

function statusLabel(s) {
  return { new: 'Baru', cooking: 'Dimasak', ready: 'Semua Siap', served: 'Disajikan' }[s] || s
}
</script>

<style scoped>
.bg-light-gray { background-color: var(--bs-secondary-bg); } 
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
  background: var(--bs-body-bg);
  border-bottom: 2px solid var(--bs-border-color);
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
.kds-title { color: var(--bs-heading-color); font-weight: 800; letter-spacing: -0.5px; }

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
  background: var(--bs-body-bg);
  border-radius: 16px;
  box-shadow: 0 8px 24px -4px rgba(0,0,0,0.08), 0 4px 10px -2px rgba(0,0,0,0.04);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--bs-border-color);
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
.bg-yellow-soft { background-color: rgba(var(--bs-warning-rgb), 0.1); border-bottom: 1px solid rgba(var(--bs-warning-rgb), 0.2); }
.text-brown { color: var(--bs-warning); }

/* Items List */
.kds-items {
  padding: 8px 12px;
}
.kds-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 14px;
  background-color: var(--bs-body-bg);
  border-bottom: 1px solid var(--bs-border-color);
  cursor: pointer;
  transition: background-color 0.2s;
  color: var(--bs-body-color);
}
.kds-item:last-child { border-bottom: none; }
.kds-item:hover { background-color: var(--bs-tertiary-bg); }

.kds-item-qty {
  font-size: 1.25rem;
  font-weight: 800;
  color: var(--bs-primary);
  flex-shrink: 0;
  width: 40px;
}
.kds-item-details { flex: 1; padding-right: 12px; }
.kds-item-name {
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--bs-heading-color);
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
  border: 2px solid var(--bs-border-color);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.4rem;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  background-color: var(--bs-tertiary-bg);
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
