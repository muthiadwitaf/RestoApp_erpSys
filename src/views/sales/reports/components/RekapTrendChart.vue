<template>
  <div class="rtc-card">
    <div class="rtc-header">
      <div class="rtc-title">
        <i class="bi bi-bar-chart-fill me-2"></i>Tren Penjualan
      </div>
      <div class="rtc-period-badge">{{ periodLabel }}</div>
    </div>

    <!-- Empty state -->
    <div v-if="!trend.length" class="rtc-empty">
      <i class="bi bi-bar-chart opacity-25"></i>
      <span>Belum ada data. Pilih filter dan klik Tampilkan.</span>
    </div>

    <!-- Canvas chart -->
    <div v-else class="rtc-canvas-wrap">
      <canvas ref="canvasRef" class="rtc-canvas"></canvas>
    </div>

    <!-- Tooltip -->
    <div v-if="tooltip.visible" class="rtc-tooltip"
         :style="{ left: tooltip.x + 'px', top: tooltip.y + 'px' }">
      <div class="rtc-tooltip-label">{{ tooltip.label }}</div>
      <div class="rtc-tooltip-omzet">{{ tooltip.omzet }}</div>
      <div class="rtc-tooltip-trx">{{ tooltip.trx }} transaksi</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { formatCurrency } from '@/utils/format'

const props = defineProps({
  trend:  { type: Array,  default: () => [] },
  period: { type: String, default: 'monthly' },
})

const PERIOD_LABELS = { daily: 'Harian', weekly: 'Mingguan', monthly: 'Bulanan' }
const periodLabel   = computed(() => PERIOD_LABELS[props.period] || props.period)

const canvasRef = ref(null)
const tooltip   = ref({ visible: false, x: 0, y: 0, label: '', omzet: '', trx: 0 })

let barRects = []  // [{x, y, w, h, idx}] — untuk hit-test tooltip

// ── Ambil warna tema ────────────────────────────────────────
function isDark() {
  return document.documentElement.getAttribute('data-theme') === 'dark'
}
function themeColor() { return isDark() ? '#818cf8' : '#6366f1' }
function gridColor()  { return isDark() ? '#2e3347' : '#e5e7eb' }
function textColor()  { return isDark() ? '#94a3b8' : '#6b7280' }

// ── Format sumbu Y singkat ───────────────────────────────────
function shortVal(n) {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}M`
  if (n >= 1_000_000)     return `${(n / 1_000_000).toFixed(1)}jt`
  if (n >= 1_000)         return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

// ── Draw chart ───────────────────────────────────────────────
function drawChart() {
  const canvas = canvasRef.value
  if (!canvas || !props.trend.length) return

  const dpr    = window.devicePixelRatio || 1
  const W      = canvas.offsetWidth
  const H      = canvas.offsetHeight
  canvas.width  = W * dpr
  canvas.height = H * dpr

  const ctx = canvas.getContext('2d')
  ctx.scale(dpr, dpr)

  const padL = 64, padR = 20, padT = 30, padB = 55
  const plotW = W - padL - padR
  const plotH = H - padT - padB

  const data    = props.trend
  const maxVal  = Math.max(...data.map(d => d.omzet), 1)
  const stepY   = plotH / 5

  // ── Grid lines ─────────────────────────────────────────────
  ctx.strokeStyle = gridColor()
  ctx.lineWidth   = 1
  ctx.setLineDash([4, 4])
  for (let i = 0; i <= 5; i++) {
    const y = padT + plotH - i * stepY
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + plotW, y); ctx.stroke()
    // Y labels
    ctx.fillStyle  = textColor()
    ctx.font       = '11px Inter, sans-serif'
    ctx.textAlign  = 'right'
    ctx.fillText(shortVal(Math.round(maxVal * i / 5)), padL - 6, y + 4)
  }
  ctx.setLineDash([])

  // ── Bars ───────────────────────────────────────────────────
  const barCount = data.length
  const barW     = Math.min(Math.max((plotW / barCount) * 0.55, 8), 50)
  const gap      = plotW / barCount

  barRects = []

  for (let i = 0; i < barCount; i++) {
    const d      = data[i]
    const bh     = plotH * (d.omzet / maxVal)
    const bx     = padL + i * gap + (gap - barW) / 2
    const by     = padT + plotH - bh

    // Gradient fill
    const grad = ctx.createLinearGradient(0, by, 0, by + bh)
    grad.addColorStop(0, isDark() ? '#818cf8' : '#6366f1')
    grad.addColorStop(1, isDark() ? '#4f46e5' : '#a5b4fc')
    ctx.fillStyle = grad

    const radius = Math.min(6, barW / 2)
    ctx.beginPath()
    ctx.moveTo(bx + radius, by)
    ctx.lineTo(bx + barW - radius, by)
    ctx.quadraticCurveTo(bx + barW, by, bx + barW, by + radius)
    ctx.lineTo(bx + barW, by + bh)
    ctx.lineTo(bx, by + bh)
    ctx.lineTo(bx, by + radius)
    ctx.quadraticCurveTo(bx, by, bx + radius, by)
    ctx.closePath()
    ctx.fill()

    barRects.push({ x: bx, y: by, w: barW, h: bh, idx: i })

    // X label
    ctx.fillStyle = textColor()
    ctx.font      = '10px Inter, sans-serif'
    ctx.textAlign = 'center'
    let label = d.label
    // Shorten labels
    if (props.period === 'daily')   label = label.slice(5)   // MM-DD
    if (props.period === 'weekly')  label = label.slice(5)   // Wnn
    ctx.fillText(label, bx + barW / 2, padT + plotH + 18)
  }
}

// ── Mouse tooltip ────────────────────────────────────────────
function onMouseMove(e) {
  const canvas = canvasRef.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top

  const hit = barRects.find(b => mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h)
  if (hit) {
    const d = props.trend[hit.idx]
    tooltip.value = {
      visible: true,
      x: hit.x + hit.w / 2,
      y: hit.y - 10,
      label: d.label,
      omzet: formatCurrency(d.omzet),
      trx: d.transaksi,
    }
  } else {
    tooltip.value.visible = false
  }
}
function onMouseLeave() { tooltip.value.visible = false }

// ── Resize observer ──────────────────────────────────────────
let ro = null
function setupResize() {
  ro = new ResizeObserver(() => nextTick(drawChart))
  if (canvasRef.value?.parentElement) ro.observe(canvasRef.value.parentElement)
}

onMounted(() => { nextTick(drawChart); setupResize() })
onUnmounted(() => ro?.disconnect())

watch(() => [props.trend, props.period], () => nextTick(drawChart))

// Redraw on theme change
const observer = new MutationObserver(() => nextTick(drawChart))
onMounted(() => observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }))
onUnmounted(() => observer.disconnect())
</script>

<style scoped>
.rtc-card {
  background: #fff;
  border-radius: 14px;
  border: 1px solid #e5e7eb;
  box-shadow: 0 1px 6px rgba(0,0,0,0.05);
  padding: 1.1rem 1.25rem;
  margin-bottom: 1.25rem;
  position: relative;
}
:global([data-theme="dark"]) .rtc-card { background: #1e2130; border-color: #2e3347; }

.rtc-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.85rem;
}
.rtc-title {
  font-size: 0.85rem;
  font-weight: 700;
  color: #374151;
}
:global([data-theme="dark"]) .rtc-title { color: #e2e8f0; }

.rtc-period-badge {
  background: #ede9fe;
  color: #6366f1;
  border-radius: 20px;
  padding: 2px 10px;
  font-size: 0.72rem;
  font-weight: 700;
}
:global([data-theme="dark"]) .rtc-period-badge { background: #312e81; color: #a5b4fc; }

.rtc-canvas-wrap { width: 100%; height: 260px; }
.rtc-canvas { width: 100% !important; height: 100% !important; display: block; }

.rtc-empty {
  height: 200px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  color: #9ca3af;
  font-size: 0.85rem;
}
.rtc-empty i { font-size: 2.5rem; }

/* Tooltip */
.rtc-tooltip {
  position: absolute;
  background: #1e2130;
  color: #fff;
  border-radius: 10px;
  padding: 0.5rem 0.85rem;
  font-size: 0.78rem;
  pointer-events: none;
  transform: translate(-50%, -100%);
  white-space: nowrap;
  box-shadow: 0 4px 16px rgba(0,0,0,0.2);
  z-index: 10;
}
.rtc-tooltip-label  { font-weight: 700; margin-bottom: 2px; color: #a5b4fc; }
.rtc-tooltip-omzet  { font-weight: 800; font-size: 0.88rem; }
.rtc-tooltip-trx    { color: #9ca3af; font-size: 0.72rem; }
</style>
