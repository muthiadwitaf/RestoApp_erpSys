<template>
  <div>
    <div class="page-header">
      <div>
        <h1>Dashboard</h1>
        <span class="breadcrumb-custom">{{ branchStore.currentBranch?.name || 'Semua Cabang' }} · {{ todayStr }}</span>
      </div>
    </div>

    <!-- ═══ STAT CARDS — Role-Aware, Flexible Layout ═══ -->
    <div class="stat-cards-row mb-3">
      <!-- Penjualan Bulan Ini — Sales Manager/Owner/Admin/Direktur (NOT Kasir) -->
      <div class="stat-card-col" v-if="canSee('salesFull')">
        <div class="card stat-card primary">
          <div class="card-body d-flex justify-content-between align-items-center">
            <div>
              <div class="stat-label">Penjualan Bulan Ini</div>
              <div class="stat-value text-primary">{{ formatCurrency(stats.salesTotal) }}</div>
              <div class="small text-success mt-1"><i class="bi bi-arrow-up"></i> {{ stats.salesCount }} transaksi</div>
            </div>
            <i class="bi bi-cart-check stat-icon text-primary"></i>
          </div>
        </div>
      </div>

      <!-- POS Hari Ini — Kasir (khusus) -->
      <div class="stat-card-col" v-if="isKasir">
        <div class="card stat-card primary">
          <div class="card-body d-flex justify-content-between align-items-center">
            <div>
              <div class="stat-label">POS Hari Ini</div>
              <div class="stat-value text-primary">{{ formatCurrency(posTodayTotal) }}</div>
              <div class="small text-success mt-1"><i class="bi bi-receipt"></i> {{ posTodayCount }} transaksi</div>
            </div>
            <i class="bi bi-tv stat-icon text-primary"></i>
          </div>
        </div>
      </div>

      <!-- Piutang — Finance/Owner/Admin/Direktur -->
      <div class="stat-card-col" v-if="canSee('finance')">
        <div class="card stat-card success">
          <div class="card-body d-flex justify-content-between align-items-center">
            <div>
              <div class="stat-label">Piutang</div>
              <div class="stat-value text-success">{{ formatCurrency(piutangTotal) }}</div>
              <div class="small text-muted mt-1">{{ stats.unpaidInvoices }} invoice belum dibayar</div>
            </div>
            <i class="bi bi-cash-stack stat-icon text-success"></i>
          </div>
        </div>
      </div>

      <!-- Hutang — Finance/Owner/Admin/Direktur -->
      <div class="stat-card-col" v-if="canSee('finance')">
        <div class="card stat-card warning">
          <div class="card-body d-flex justify-content-between align-items-center">
            <div>
              <div class="stat-label">Hutang</div>
              <div class="stat-value text-warning">{{ formatCurrency(hutangTotal) }}</div>
              <div class="small text-muted mt-1">ke {{ stats.supplierCount }} supplier</div>
            </div>
            <i class="bi bi-credit-card stat-icon text-warning"></i>
          </div>
        </div>
      </div>

      <!-- PO Bulan Ini — Purchasing -->
      <div class="stat-card-col" v-if="canSee('purchasing')">
        <div class="card stat-card info">
          <div class="card-body d-flex justify-content-between align-items-center">
            <div>
              <div class="stat-label">PO Bulan Ini</div>
              <div class="stat-value text-info">{{ stats.poCount }}</div>
              <div class="small text-muted mt-1">purchase orders</div>
            </div>
            <i class="bi bi-truck stat-icon text-info"></i>
          </div>
        </div>
      </div>

      <!-- Stok Menipis — Warehouse/Owner/Admin/Direktur -->
      <div class="stat-card-col" v-if="canSee('warehouse')">
        <div class="card stat-card danger">
          <div class="card-body d-flex justify-content-between align-items-center">
            <div>
              <div class="stat-label">Stok Menipis</div>
              <div class="stat-value text-danger">{{ lowStockItems.length }}</div>
              <div class="small text-muted mt-1">item perlu restock</div>
            </div>
            <i class="bi bi-exclamation-triangle stat-icon text-danger"></i>
          </div>
        </div>
      </div>

      <!-- Segera Kadaluarsa — Warehouse -->
      <div class="stat-card-col" v-if="canSee('warehouse')">
        <div class="card stat-card" style="border-left: 4px solid var(--bs-orange)">
          <div class="card-body d-flex justify-content-between align-items-center">
            <div>
              <div class="stat-label">Segera Kadaluarsa</div>
              <div class="stat-value" style="color: var(--bs-orange)">{{ expiringItems.length }}</div>
              <div class="small text-muted mt-1">batch ≤30 hari</div>
            </div>
            <i class="bi bi-clock-history stat-icon" style="color: var(--bs-orange)"></i>
          </div>
        </div>
      </div>

      <!-- Tagihan Jatuh Tempo — Finance -->
      <div class="stat-card-col" v-if="canSee('finance') && !canSee('executive')">
        <div class="card stat-card danger">
          <div class="card-body d-flex justify-content-between align-items-center">
            <div>
              <div class="stat-label">Jatuh Tempo</div>
              <div class="stat-value text-danger">{{ overdueInvoices.length + overdueBills.length }}</div>
              <div class="small text-muted mt-1">invoice/tagihan overdue</div>
            </div>
            <i class="bi bi-calendar-x stat-icon text-danger"></i>
          </div>
        </div>
      </div>

      <!-- Tutup Buku Overdue — Finance -->
      <div class="stat-card-col" v-if="canSee('finance') && closingOverdueCount > 0">
        <router-link to="/accounting/closing" class="text-decoration-none">
          <div class="card stat-card danger">
            <div class="card-body d-flex justify-content-between align-items-center">
              <div>
                <div class="stat-label">Tutup Buku</div>
                <div class="stat-value text-danger">{{ closingOverdueCount }}</div>
                <div class="small text-danger mt-1"><i class="bi bi-exclamation-triangle me-1"></i>periode overdue</div>
              </div>
              <i class="bi bi-calendar-check stat-icon text-danger"></i>
            </div>
          </div>
        </router-link>
      </div>
    </div>

    <!-- ═══ ROW 2: Sales Chart + Pending Approvals ═══ -->
    <div class="dash-flex-row mb-3">
      <div class="dash-flex-item dash-flex-lg" v-if="canSee('salesFull')">
        <div class="card h-100">
          <div class="card-header d-flex justify-content-between align-items-center">
            <span><i class="bi bi-bar-chart-line me-2"></i>Tren Penjualan 7 Hari Terakhir</span>
          </div>
          <div class="card-body">
            <div class="chart-container">
              <div class="chart-bars">
                <div class="chart-bar-group" v-for="(d, idx) in salesChart" :key="idx">
                  <div class="chart-bar-value small text-muted">{{ formatShort(d.amount) }}</div>
                  <div class="chart-bar" :style="{ height: barHeight(d.amount) + '%' }"></div>
                  <div class="chart-bar-label small text-muted">{{ d.label }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="dash-flex-item dash-flex-sm">
        <div class="card h-100">
          <div class="card-header"><i class="bi bi-hourglass-split me-2 text-warning"></i>{{ pendingTitle }}</div>
          <div class="card-body p-0">
            <router-link
              v-for="item in pendingApprovals" :key="item.number"
              :to="item.route || (isWarehouseRole ? (item.type === 'SO' ? '/inventory/issue' : '/inventory/receive') : isFinanceRole ? '/accounting/invoices' : (item.type === 'SO' ? '/sales/orders' : '/purchasing/orders'))"
              class="d-flex align-items-center gap-2 px-3 py-2 border-bottom text-decoration-none text-body hover-highlight">
              <div class="flex-shrink-0">
                <span class="badge" :class="item.badgeClass || (item.type === 'SO' ? 'bg-info' : 'bg-warning text-dark')">{{ item.type }}</span>
              </div>
              <div class="flex-grow-1">
                <div class="fw-semibold small">{{ item.number }}</div>
                <div class="text-muted small">{{ item.party }}{{ item.total ? ' · ' + formatCurrency(item.total) : '' }}</div>
              </div>
              <div>
                <span v-if="item.action" class="badge bg-secondary small">{{ item.action }}</span>
                <i v-else class="bi bi-chevron-right text-muted small"></i>
              </div>
            </router-link>
            <div v-if="pendingApprovals.length === 0" class="p-3 text-center text-muted small">{{ isWarehouseRole ? 'Tidak ada antrian gudang 👍' : isFinanceRole ? 'Tidak ada antrian finance 👍' : 'Tidak ada pending approval' }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══ ROW 3: Recent SO + Top Products + Low Stock + Kadaluarsa ═══ -->
    <div class="dash-flex-row mb-3">
      <div class="dash-flex-item dash-flex-lg" v-if="canSee('salesFull')">
        <div class="card h-100">
          <div class="card-header d-flex justify-content-between align-items-center">
            <span><i class="bi bi-receipt me-2"></i>Sales Order Terbaru</span>
            <router-link to="/sales/orders" class="btn btn-sm btn-outline-primary">Lihat Semua</router-link>
          </div>
          <div class="card-body p-0">
            <div class="table-wrapper">
              <table class="table table-hover mb-0">
                <thead><tr><th>No. SO</th><th>Pelanggan</th><th>Status</th><th class="text-end">Total</th></tr></thead>
                <tbody>
                  <tr v-for="so in recentSO" :key="so.uuid" @click="showSODetail(so)" style="cursor:pointer" class="hover-highlight">
                    <td class="fw-semibold small text-primary">{{ so.number }}</td>
                    <td class="small">{{ getCustomerName(so.customer_id) }}</td>
                    <td><span class="badge" :class="'badge-' + so.status">{{ so.status }}</span></td>
                    <td class="text-end small">{{ formatCurrency(calcSOTotal(so)) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
      <div class="dash-flex-item dash-flex-md" v-if="canSee('sales') || isKasir">
        <div class="card h-100">
          <div class="card-header"><i class="bi bi-trophy me-2 text-warning"></i>Produk Terlaris</div>
          <div class="card-body p-0">
            <div v-for="(p, idx) in topProducts" :key="p.id" class="d-flex align-items-center gap-2 px-3 py-2 border-bottom">
              <div class="flex-shrink-0">
                <span class="badge rounded-circle d-flex align-items-center justify-content-center" :class="idx === 0 ? 'bg-warning text-dark' : idx === 1 ? 'bg-secondary' : 'bg-light text-dark'" style="width: 28px; height: 28px;">{{ idx + 1 }}</span>
              </div>
              <div class="flex-grow-1">
                <div class="fw-semibold small">{{ p.name }}</div>
                <div class="text-muted small">{{ p.category }}</div>
              </div>
              <div class="text-end">
                <div class="fw-bold small text-primary">{{ p.soldQty }} pcs</div>
                <div class="text-muted small">{{ formatCurrency(p.revenue) }}</div>
              </div>
            </div>
            <div v-if="topProducts.length === 0" class="p-3 text-center text-muted small">Belum ada data penjualan</div>
          </div>
        </div>
      </div>
      <div class="dash-flex-item dash-flex-sm" v-if="canSee('warehouse')">
        <div class="card h-100">
          <div class="card-header d-flex justify-content-between align-items-center">
            <span><i class="bi bi-exclamation-triangle me-2 text-danger"></i>Stok Menipis</span>
            <router-link :to="hasPerm('purchasing:view') ? '/purchasing/reorder' : '/inventory/stock'" class="btn btn-sm btn-outline-danger">Restock</router-link>
          </div>
          <div class="card-body p-0">
            <router-link v-for="ls in lowStockItems" :key="ls.item_uuid + '-' + ls.warehouse_uuid" to="/inventory/stock" class="d-flex align-items-center justify-content-between px-3 py-2 border-bottom text-decoration-none text-body hover-highlight">
              <div>
                <div class="fw-semibold small">{{ ls.name || getItemName(ls.item_uuid) }}</div>
                <div class="text-muted small">{{ ls.warehouse_name }}</div>
              </div>
              <span class="badge bg-danger">{{ ls.qty }}</span>
            </router-link>
            <div v-if="lowStockItems.length === 0" class="p-3 text-center text-muted small">Semua stok aman 👍</div>
          </div>
        </div>
      </div>
      <div class="dash-flex-item dash-flex-sm" v-if="canSee('warehouse')">
        <div class="card h-100">
          <div class="card-header d-flex justify-content-between align-items-center">
            <span><i class="bi bi-clock-history me-2 text-warning"></i>Segera Kadaluarsa</span>
            <router-link to="/inventory/batches" class="btn btn-sm btn-outline-warning">Detail</router-link>
          </div>
          <div class="card-body p-0">
            <router-link v-for="eb in expiringItems" :key="eb.uuid" to="/inventory/batches" class="d-flex align-items-center justify-content-between px-3 py-2 border-bottom text-decoration-none text-body hover-highlight">
              <div>
                <div class="fw-semibold small">{{ eb.item_name }}</div>
                <div class="text-muted small">{{ eb.batch_no || 'No Batch' }} · {{ eb.qty }} pcs · {{ eb.warehouse_name }}</div>
              </div>
              <span class="badge" :class="expiryBadgeClass(eb.status)">{{ formatDate(eb.expiry_date) }}</span>
            </router-link>
            <div v-if="expiringItems.length === 0" class="p-3 text-center text-muted small">Tidak ada barang mendekati kadaluarsa 👍</div>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══ ROW 4: Stok per Gudang + Overdue + Aktivitas ═══ -->
    <div class="dash-flex-row mb-3">
      <div class="dash-flex-item dash-flex-lg" v-if="canSee('warehouse')">
        <div class="card h-100">
          <div class="card-header"><i class="bi bi-boxes me-2"></i>Ringkasan Stok per Gudang</div>
          <div class="card-body p-0">
            <div class="table-wrapper">
              <table class="table table-hover mb-0">
                <thead><tr><th>Gudang</th><th class="text-end">Total Item</th><th class="text-end">Total Qty</th><th class="text-end">Nilai Stok</th></tr></thead>
                <tbody>
                  <tr v-for="ws in warehouseSummary" :key="ws.uuid">
                    <td class="fw-semibold small">{{ ws.name }}</td>
                    <td class="text-end small">{{ ws.totalItems }}</td>
                    <td class="text-end small">{{ ws.totalQty.toLocaleString('id-ID') }}</td>
                    <td class="text-end small fw-semibold text-primary">{{ formatCurrency(ws.totalValue) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
      <div class="dash-flex-item dash-flex-sm" v-if="canSee('finance')">
        <div class="card h-100">
          <div class="card-header"><i class="bi bi-calendar-x me-2 text-danger"></i>Invoice Jatuh Tempo</div>
          <div class="card-body p-0">
            <div v-for="inv in overdueInvoices" :key="inv.uuid" class="px-3 py-2 border-bottom">
              <div class="d-flex justify-content-between">
                <span class="fw-semibold small">{{ inv.number }}</span>
                <span class="badge bg-danger">{{ daysOverdue(inv.due_date) }} hari</span>
              </div>
              <div class="text-muted small">{{ formatDate(inv.due_date) }} · {{ formatCurrency(inv.total) }}</div>
            </div>
            <div v-if="overdueInvoices.length === 0" class="p-3 text-center text-muted small">Tidak ada invoice jatuh tempo</div>
          </div>
        </div>
      </div>
      <div class="dash-flex-item dash-flex-md" v-if="hasPerm('settings:view')">
        <div class="card h-100">
          <div class="card-header d-flex justify-content-between align-items-center">
            <span><i class="bi bi-clock-history me-2"></i>Aktivitas Terbaru</span>
            <router-link to="/settings/audit" class="btn btn-sm btn-outline-secondary">Lihat Semua</router-link>
          </div>
          <div class="card-body p-0">
            <div v-for="a in recentAudit" :key="a.uuid" class="d-flex align-items-start gap-2 px-3 py-2 border-bottom">
              <div class="flex-shrink-0 mt-1">
                <span class="badge" :class="actionBadge(a.action)">{{ a.action }}</span>
              </div>
              <div>
                <div class="fw-semibold small">{{ a.description }}</div>
                <div class="text-muted small">{{ a.userName }} · {{ formatTime(a.timestamp) }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══ ROW 5: Konsinyasi Summary ═══ -->
    <div class="dash-flex-row mb-3" v-if="canSee('salesFull') && consignmentSummary.length > 0">
      <div class="dash-flex-item dash-flex-lg">
        <div class="card h-100">
          <div class="card-header d-flex justify-content-between align-items-center">
            <span><i class="bi bi-shop me-2 text-info"></i>Konsinyasi Aktif</span>
            <router-link to="/sales/consignment" class="btn btn-sm btn-outline-info">Kelola</router-link>
          </div>
          <div class="card-body p-0">
            <table class="table table-sm table-hover mb-0">
              <thead><tr><th>Barang</th><th>Supplier</th><th class="text-end">Titip</th><th class="text-end">Terjual</th><th class="text-end">Komisi</th><th class="text-end">Pendapatan</th></tr></thead>
              <tbody>
                <tr v-for="c in consignmentSummary" :key="c.uuid" @click="$router.push('/sales/consignment')" style="cursor:pointer" class="hover-highlight">
                  <td class="small fw-semibold">{{ c.item_name || '-' }}</td>
                  <td class="small text-muted">{{ c.supplier_name || '-' }}</td>
                  <td class="text-end small">{{ c.qty }}</td>
                  <td class="text-end small fw-bold text-success">{{ c.sold_qty }}</td>
                  <td class="text-end"><span class="badge bg-info">{{ c.commission_pct }}%</span></td>
                  <td class="text-end small fw-bold text-primary">{{ formatCurrency(calcConsignmentRevenue(c)) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══ Quick Actions ═══ -->
    <div class="row g-3">
      <div class="col-12">
        <div class="card">
          <div class="card-header"><i class="bi bi-lightning me-2"></i>Aksi Cepat</div>
          <div class="card-body">
            <div class="d-flex flex-wrap gap-2">
              <router-link to="/sales/orders" class="btn btn-outline-primary btn-sm" v-permission="'sales:create'"><i class="bi bi-plus me-1"></i>Buat Sales Order</router-link>
              <router-link to="/purchasing/orders" class="btn btn-outline-warning btn-sm" v-permission="'purchasing:create'"><i class="bi bi-plus me-1"></i>Buat Purchase Order</router-link>
              <router-link to="/sales/pos" class="btn btn-outline-success btn-sm" v-permission="'pos:view'"><i class="bi bi-tv me-1"></i>Buka POS</router-link>
              <router-link to="/accounting/journal" class="btn btn-outline-info btn-sm" v-permission="'accounting:create'"><i class="bi bi-journal-text me-1"></i>Buat Jurnal</router-link>
              <router-link to="/inventory/items" class="btn btn-outline-secondary btn-sm" v-permission="'inventory:view'"><i class="bi bi-box me-1"></i>Master Barang</router-link>
              <router-link to="/accounting/reports" class="btn btn-outline-dark btn-sm" v-permission="'accounting:view'"><i class="bi bi-file-earmark-bar-graph me-1"></i>Laporan Keuangan</router-link>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- SO Detail Modal -->
    <div v-if="detailSO" class="modal fade show d-block" tabindex="-1" @click.self="detailSO = null">
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title"><i class="bi bi-receipt me-2"></i>Detail SO: {{ detailSO.number }}</h5>
            <button type="button" class="btn-close" @click="detailSO = null"></button>
          </div>
          <div class="modal-body">
            <div class="row mb-3">
              <div class="col-md-3"><div class="text-muted small">Pelanggan</div><div class="fw-semibold">{{ getCustomerName(detailSO.customer_id) }}</div></div>
              <div class="col-md-2"><div class="text-muted small">Tanggal</div><div class="fw-semibold">{{ formatDate(detailSO.date) }}</div></div>
              <div class="col-md-2"><div class="text-muted small">Status</div><span class="badge" :class="'badge-' + detailSO.status">{{ detailSO.status }}</span></div>
              <div class="col-md-2"><div class="text-muted small">Dibuat</div><div class="fw-semibold">{{ detailSO.created_by }}</div></div>
              <div class="col-md-3" v-if="detailSO.approved_by"><div class="text-muted small">Disetujui</div><div class="fw-semibold text-success">{{ detailSO.approved_by }}</div></div>
            </div>
            <div v-if="detailSO.notes" class="alert alert-light py-2 small mb-3"><i class="bi bi-sticky me-1"></i><strong>Catatan:</strong> {{ detailSO.notes }}</div>
            <table class="table table-sm table-bordered mb-0">
              <thead class="table-light"><tr><th>#</th><th>Kode</th><th>Nama Barang</th><th class="text-end">Qty</th><th>Satuan</th><th class="text-end">Harga</th><th class="text-end">Diskon</th><th class="text-end">Subtotal</th></tr></thead>
              <tbody>
                <tr v-for="(line, idx) in detailSO.lines" :key="idx">
                  <td class="text-muted">{{ idx + 1 }}</td>
                  <td class="fw-semibold">{{ getItemCode(line.item_id) }}</td>
                  <td>{{ getItemName(line.item_id) }}</td>
                  <td class="text-end">{{ line.qty }}</td>
                  <td class="text-muted">{{ line.uom }}</td>
                  <td class="text-end">{{ formatCurrency(line.price) }}</td>
                  <td class="text-end">{{ line.discount || 0 }}%</td>
                  <td class="text-end fw-bold">{{ formatCurrency(line.qty * line.price * (1 - (line.discount || 0) / 100)) }}</td>
                </tr>
              </tbody>
              <tfoot><tr class="table-light"><td colspan="7" class="text-end fw-bold">Grand Total</td><td class="text-end fw-bold text-primary fs-6">{{ formatCurrency(calcSOTotal(detailSO)) }}</td></tr></tfoot>
            </table>
          </div>
          <div class="modal-footer">
            <router-link :to="'/sales/orders'" class="btn btn-outline-primary btn-sm"><i class="bi bi-arrow-right me-1"></i>Buka Sales Order</router-link>
            <button class="btn btn-secondary" @click="detailSO = null">Tutup</button>
          </div>
        </div>
      </div>
    </div>
    <div class="modal-backdrop fade show" v-if="detailSO" @click="detailSO = null"></div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useBranchStore } from '@/stores/branch'
import { useAuthStore } from '@/stores/auth'
import * as accountingApi from '@/services/accounting/api'
import * as salesApi from '@/services/sales/api'
import * as inventoryApi from '@/services/inventory/api'
import * as purchasingApi from '@/services/purchasing/api'
import * as settingsApi from '@/services/settings/api'
import { formatCurrency, formatDate } from '@/utils/format'

const branchStore = useBranchStore()
const authStore = useAuthStore()

function hasPerm(perm) { return authStore.hasAnyPermission([perm]) }

// ── Role detection ──────────────────────────────────────────────────────────
// Executive = Owner/Direktur/Super Admin/Admin IT (see everything relevant)
const isExecutive = computed(() => hasPerm('company:view') || hasPerm('settings:edit') || authStore.user?.is_super_admin)
const isFinanceRole = computed(() => hasPerm('accounting:view') || hasPerm('accounting:create'))
const isSalesRole = computed(() => hasPerm('sales:view') || hasPerm('sales:create'))
const isPurchasingRole = computed(() => hasPerm('purchasing:view') || hasPerm('purchasing:create'))
const isWarehouseRole = computed(() => (hasPerm('inventory:view') || hasPerm('inventory:manage')) && !isExecutive.value)
const isKasir = computed(() => hasPerm('pos:view') && !hasPerm('sales:view') && !isExecutive.value)

// canSee(group) — determines if user should see a specific group of cards/widgets
function canSee(group) {
  if (isExecutive.value) return true // executives see everything
  switch (group) {
    case 'salesFull': return isSalesRole.value // Sales managers only (NOT kasir)
    case 'sales': return isSalesRole.value || isKasir.value // Sales + Kasir (for shared widgets like top products)
    case 'finance': return isFinanceRole.value
    case 'purchasing': return isPurchasingRole.value
    case 'warehouse': return isWarehouseRole.value || hasPerm('inventory:view') || hasPerm('inventory:manage')
    case 'executive': return isExecutive.value
    default: return false
  }
}

const pendingTitle = computed(() => {
  if (isWarehouseRole.value) return 'Antrian Gudang'
  if (isFinanceRole.value && !isExecutive.value) return 'Antrian Finance'
  return 'Menunggu Persetujuan'
})

const todayStr = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const loading = ref(false)

// Data refs
const allOrders = ref([])
const allPOs = ref([])
const allInvoices = ref([])
const allSuppliers = ref([])
const allItems = ref([])
const allWarehouses = ref([])
const stockData = ref([])
const allCustomers = ref([])
const allConsignments = ref([])
const allAudit = ref([])
const allBills = ref([])
const allPosTx = ref([])
const allExpiringBatches = ref([])
const allSalesReturns = ref([])
const allAllOpnames = ref([])
const allPurchaseReturns = ref([])
const closingOverdueCount = ref(0)

onMounted(async () => {
  loading.value = true
  try {
    // Build API calls based on permissions — skip calls that will 403
    const calls = []
    const callMap = {} // index → key
    let idx = 0

    function addCall(key, fn) {
      callMap[idx] = key
      calls.push(fn())
      idx++
    }

    // Sales data — only if user can see sales
    if (hasPerm('sales:view') || hasPerm('sales:create') || hasPerm('sales:approve') || isExecutive.value) {
      addCall('orders', () => salesApi.getSalesOrders())
      addCall('customers', () => salesApi.getCustomers())
      addCall('salesReturns', () => salesApi.getSalesReturns())
    }

    // Finance data
    if (hasPerm('accounting:view') || hasPerm('accounting:create') || isExecutive.value) {
      addCall('invoices', () => salesApi.getInvoices())
      addCall('bills', () => purchasingApi.getBills())
      addCall('closingDash', () => accountingApi.getClosingDashboard({ branch_id: branchStore.currentBranchId }))
      // Finance perlu lihat SO processed (untuk buat invoice) dan sales returns
      if (!hasPerm('sales:view') && !hasPerm('sales:create') && !hasPerm('sales:approve')) {
        addCall('orders', () => salesApi.getSalesOrders())
        addCall('salesReturns', () => salesApi.getSalesReturns())
      }
    }

    // Inventory data — items/warehouses/stock accessible with pos:view too
    if (hasPerm('inventory:view') || hasPerm('inventory:manage') || hasPerm('pos:view') || isExecutive.value) {
      addCall('items', () => inventoryApi.getItems())
      addCall('warehouses', () => inventoryApi.getWarehouses())
      addCall('stock', () => inventoryApi.getStock())
      addCall('consignments', () => salesApi.getConsignments())
      addCall('batches', () => inventoryApi.getExpiringBatches({ branch_id: branchStore.currentBranchId, days: 30 }))
      addCall('opnames', () => inventoryApi.getOpnames())
      // Warehouse staff butuh lihat SO approved (untuk GI) — fetch SO di sini jika belum di-fetch oleh sales block
      if (!hasPerm('sales:view') && !hasPerm('sales:create') && !hasPerm('sales:approve')) {
        addCall('orders', () => salesApi.getSalesOrders())
      }
    }

    // Purchasing data — PO list juga dibutuhkan oleh warehouse staff (untuk lihat PO approved = proses GR)
    if (hasPerm('purchasing:view') || hasPerm('purchasing:create') || hasPerm('purchasing:approve') ||
        hasPerm('inventory:manage') || isExecutive.value) {
      addCall('pos2', () => purchasingApi.getPurchaseOrders())
      addCall('purchaseReturns', () => purchasingApi.getPurchaseReturns())
    }
    // Supplier list — hanya untuk user dengan akses purchasing nyata (bukan sekadar inventory:view)
    if (hasPerm('purchasing:view') || hasPerm('purchasing:create') || hasPerm('purchasing:approve') || isExecutive.value) {
      addCall('suppliers', () => purchasingApi.getSuppliers())
    }

    // POS data
    if (hasPerm('pos:view') || hasPerm('pos:create') || isExecutive.value) {
      addCall('posTx', () => salesApi.getPosTransactions({ branch_id: branchStore.currentBranchId }))
    }

    // Admin data
    if (hasPerm('settings:view') || isExecutive.value) {
      addCall('audit', () => settingsApi.getAuditTrail())
    }

    const results = await Promise.allSettled(calls)

    // Map results back to data refs
    for (let i = 0; i < results.length; i++) {
      if (results[i].status !== 'fulfilled') continue
      const data = results[i].value.data || []
      const key = callMap[i]
      switch (key) {
        case 'orders': allOrders.value = data; break
        case 'customers': allCustomers.value = data; break
        case 'invoices': allInvoices.value = data; break
        case 'items': allItems.value = data; break
        case 'warehouses': allWarehouses.value = data; break
        case 'stock': stockData.value = data; break
        case 'consignments': allConsignments.value = data; break
        case 'pos2': allPOs.value = data; break
        case 'suppliers': allSuppliers.value = data; break
        case 'audit': {
          const auditRes = results[i].value.data
          allAudit.value = Array.isArray(auditRes) ? auditRes : (auditRes?.data || [])
          break
        }
        case 'bills': allBills.value = data; break
        case 'posTx': allPosTx.value = data; break
        case 'batches': allExpiringBatches.value = data; break
        case 'salesReturns': allSalesReturns.value = data; break
        case 'purchaseReturns': allPurchaseReturns.value = data; break
        case 'opnames': allAllOpnames.value = data; break
        case 'closingDash': closingOverdueCount.value = parseInt(data?.overdue_count) || 0; break
      }
    }
  } catch (e) { console.error('Dashboard load error:', e) }
  loading.value = false
})

// Expiry alert
const expiringItems = computed(() => allExpiringBatches.value)
function expiryBadgeClass(status) {
  return { expired: 'bg-danger', expiring: 'bg-warning text-dark' }[status] || 'bg-warning text-dark'
}

// --- Stats ---
const branchSO = computed(() => allOrders.value.filter(so => so.branch_id === branchStore.currentBranchId))
const branchPO = computed(() => allPOs.value.filter(po => po.branch_id === branchStore.currentBranchId))
const branchInvoices = computed(() => allInvoices.value.filter(i => i.branch_id === branchStore.currentBranchId))
const branchSuppliers = computed(() => allSuppliers.value.filter(s => s.branch_id === branchStore.currentBranchId))
const branchBills = computed(() => allBills.value.filter(b => b.branch_id === branchStore.currentBranchId))

// Piutang = total unpaid invoices
const piutangTotal = computed(() => branchInvoices.value.filter(i => i.status === 'unpaid').reduce((s, i) => s + (parseFloat(i.total) || 0), 0))
// Hutang = total unpaid bills
const hutangTotal = computed(() => branchBills.value.filter(b => b.status !== 'paid').reduce((s, b) => s + (parseFloat(b.remaining) || 0), 0))

// POS hari ini
const posTodayTotal = computed(() => {
  const today = new Date().toISOString().split('T')[0]
  return allPosTx.value
    .filter(t => t.branch_id === branchStore.currentBranchId && t.date?.split('T')[0] === today)
    .reduce((s, t) => s + (parseFloat(t.total) || 0), 0)
})
const posTodayCount = computed(() => {
  const today = new Date().toISOString().split('T')[0]
  return allPosTx.value.filter(t => t.branch_id === branchStore.currentBranchId && t.date?.split('T')[0] === today).length
})

// Overdue bills
const overdueBills = computed(() => {
  const today = new Date()
  return branchBills.value.filter(b => b.status !== 'paid' && new Date(b.due_date) < today)
})

const stats = computed(() => {
  const thisMonth = new Date().toISOString().slice(0, 7) // 'YYYY-MM'
  // Paid invoices this month
  const invoiceSales = branchInvoices.value
    .filter(i => i.status === 'paid' && i.date?.slice(0, 7) === thisMonth)
    .reduce((s, i) => s + (parseFloat(i.total) || 0), 0)
  // POS transactions this month
  const posSales = allPosTx.value
    .filter(t => t.branch_id === branchStore.currentBranchId && t.date?.slice(0, 7) === thisMonth)
    .reduce((s, t) => s + (parseFloat(t.total) || 0), 0)
  // SO count this month
  const soCountThisMonth = branchSO.value.filter(so => so.date?.slice(0, 7) === thisMonth).length
  const posCountThisMonth = allPosTx.value.filter(t => t.branch_id === branchStore.currentBranchId && t.date?.slice(0, 7) === thisMonth).length
  return {
    salesTotal: invoiceSales + posSales,
    salesCount: soCountThisMonth + posCountThisMonth,
    unpaidInvoices: branchInvoices.value.filter(i => i.status === 'unpaid').length,
    supplierCount: branchSuppliers.value.length,
    poCount: branchPO.value.filter(po => po.date?.slice(0, 7) === new Date().toISOString().slice(0, 7)).length
  }
})

// --- Recent SO ---
const recentSO = computed(() => branchSO.value.slice(0, 5))

// --- Sales Chart (real 7-day invoice data) ---
const salesChart = computed(() => {
  const result = []
  const today = new Date()
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const dateStr = d.toISOString().split('T')[0]
    const dayNames = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']
    const label = dayNames[d.getDay()]
    const dayTotal = branchInvoices.value
      .filter(inv => inv.date && inv.date.split('T')[0] === dateStr)
      .reduce((s, inv) => s + (parseFloat(inv.total) || 0), 0)
    result.push({ label, amount: dayTotal })
  }
  return result
})
const maxChartVal = computed(() => Math.max(...salesChart.value.map(d => d.amount), 1))
function barHeight(val) { return Math.max((val / maxChartVal.value) * 100, 5) }
function formatShort(n) { return n >= 1000000 ? (n / 1000000).toFixed(1) + 'jt' : n >= 1000 ? (n / 1000).toFixed(0) + 'rb' : n.toString() }

// --- Pending Approvals (role-aware) ---
const branchSalesReturns = computed(() => allSalesReturns.value.filter(r => r.branch_id === branchStore.currentBranchId))
const branchPurchaseReturns = computed(() => allPurchaseReturns.value.filter(r => r.branch_id === branchStore.currentBranchId))

function calcPOTotal(po) {
  if (parseFloat(po.total) > 0) return parseFloat(po.total)
  return (po.lines || []).reduce((s, l) => s + (l.qty || 0) * parseFloat(l.price || 0) * (1 - (parseFloat(l.discount) || 0) / 100), 0)
}

const pendingApprovals = computed(() => {
  const res = []
  if (isWarehouseRole.value) {
    // Gudang staff: SO approved (needs GI) + PO approved (needs GR)
    branchSO.value.filter(so => so.status === 'approved').forEach(so => {
      res.push({ type: 'SO', number: so.number, party: getCustomerName(so.customer_id), total: calcSOTotal(so), action: 'Perlu GI' })
    })
    branchPO.value.filter(po => po.status === 'approved').forEach(po => {
      const supName = allSuppliers.value.find(s => s.uuid === po.supplier_id)?.name || po.supplier_name || '-'
      res.push({ type: 'PO', number: po.number, party: supName, total: calcPOTotal(po), action: 'Perlu GR', route: '/inventory/receive' })
    })
    branchSalesReturns.value.filter(r => r.status === 'approved').forEach(r => {
      res.push({ type: 'SRET', number: r.number, party: r.customer_name || '-', total: parseFloat(r.total) || 0, route: '/sales/returns', badgeClass: 'bg-danger', action: 'Terima Barang' })
    })
    branchPurchaseReturns.value.filter(r => r.status === 'approved').forEach(r => {
      res.push({ type: 'PRET', number: r.number, party: r.supplier_name || '-', total: parseFloat(r.total) || 0, route: '/purchasing/returns', badgeClass: 'bg-warning text-dark', action: 'Kirim Barang' })
    })
  } else if (isFinanceRole.value && !isExecutive.value) {
    // SO status 'processed' yang belum ada invoicenya — perlu dibuat invoice
    branchSO.value.filter(so => so.status === 'processed').forEach(so => {
      const hasInv = allInvoices.value.some(inv => inv.so_id === so.uuid || inv.so_number === so.number)
      if (!hasInv) res.push({ type: 'SO', number: so.number, party: so.customer_name || getCustomerName(so.customer_id), total: calcSOTotal(so), route: '/accounting/invoices', badgeClass: 'bg-success', action: 'Buat Invoice' })
    })
    branchSalesReturns.value.filter(r => r.status === 'received').forEach(r => {
      res.push({ type: 'SRET', number: r.number, party: r.customer_name || '-', total: parseFloat(r.total) || 0, route: '/sales/returns', badgeClass: 'bg-danger', action: 'Proses Refund' })
    })
    branchPurchaseReturns.value.filter(r => r.status === 'shipped').forEach(r => {
      res.push({ type: 'PRET', number: r.number, party: r.supplier_name || '-', total: parseFloat(r.total) || 0, route: '/purchasing/returns', badgeClass: 'bg-warning text-dark', action: 'Proses Resolusi' })
    })
    // Finance juga perlu lihat tagihan yang belum lunas sebagai reminder
    branchBills.value.filter(b => b.status !== 'paid').forEach(b => {
      res.push({ type: 'BILL', number: b.number, party: b.supplier_name || b.po_number || '-', total: parseFloat(b.total) || 0, route: '/accounting/bills', badgeClass: 'bg-danger', action: 'Bayar' })
    })
  } else if (isPurchasingRole.value && !isExecutive.value) {
    // Purchasing staff: lihat PO pending milik branch (belum di-approve manager)
    branchPO.value.filter(po => po.status === 'pending').forEach(po => {
      const supName = allSuppliers.value.find(s => s.uuid === po.supplier_id)?.name || po.supplier_name || '-'
      res.push({ type: 'PO', number: po.number, party: supName, total: calcPOTotal(po), route: '/purchasing/orders', badgeClass: 'bg-warning text-dark', action: 'Menunggu Approval' })
    })
    // PO approved = siap diterima, sebagai reminder ke purchasing
    branchPO.value.filter(po => po.status === 'approved').forEach(po => {
      const supName = allSuppliers.value.find(s => s.uuid === po.supplier_id)?.name || po.supplier_name || '-'
      res.push({ type: 'PO', number: po.number, party: supName, total: calcPOTotal(po), route: '/purchasing/orders', badgeClass: 'bg-success', action: 'Disetujui' })
    })
    branchPurchaseReturns.value.filter(r => r.status === 'draft').forEach(r => {
      res.push({ type: 'PRET', number: r.number, party: r.supplier_name || '-', total: parseFloat(r.total) || 0, route: '/purchasing/returns', badgeClass: 'bg-warning text-dark' })
    })
  } else {
    // Manager/Admin/Executive: SO + PO pending approval
    branchSO.value.filter(so => so.status === 'pending').forEach(so => {
      res.push({ type: 'SO', number: so.number, party: getCustomerName(so.customer_id), total: calcSOTotal(so) })
    })
    branchPO.value.filter(po => po.status === 'pending').forEach(po => {
      const supName = allSuppliers.value.find(s => s.uuid === po.supplier_id)?.name || po.supplier_name || '-'
      res.push({ type: 'PO', number: po.number, party: supName, total: calcPOTotal(po), route: '/purchasing/orders' })
    })
    branchSalesReturns.value.filter(r => r.status === 'draft').forEach(r => {
      res.push({ type: 'SRET', number: r.number, party: r.customer_name || '-', total: parseFloat(r.total) || 0, route: '/sales/returns', badgeClass: 'bg-danger' })
    })
    branchPurchaseReturns.value.filter(r => r.status === 'draft').forEach(r => {
      res.push({ type: 'PRET', number: r.number, party: r.supplier_name || '-', total: parseFloat(r.total) || 0, route: '/purchasing/returns', badgeClass: 'bg-warning text-dark' })
    })
    allAllOpnames.value.filter(o => o.status === 'pending' && o.branch_id === branchStore.currentBranchId).forEach(o => {
      res.push({ type: 'OPN', number: o.number, party: o.warehouse_name || '-', total: null, route: '/inventory/opname', badgeClass: 'bg-info text-dark', action: 'Approve Opname' })
    })
  }
  return res
})

// --- Top Products (from POS transactions) ---
const topProducts = computed(() => {
  const sold = {}
  const branchPosTx = allPosTx.value.filter(t => t.branch_id === branchStore.currentBranchId)
  branchPosTx.forEach(tx => {
    let items = []
    try { items = typeof tx.items_json === 'string' ? JSON.parse(tx.items_json) : (tx.items_json || []) } catch {}
    items.forEach(item => {
      const name = item.item_name || item.name
      if (!name) return
      if (!sold[name]) sold[name] = { qty: 0, revenue: 0 }
      sold[name].qty += (item.qty || 0)
      sold[name].revenue += (item.subtotal || (item.qty || 0) * parseFloat(item.price || 0))
    })
  })
  return Object.entries(sold)
    .map(([name, data]) => ({ id: name, name, category: '-', soldQty: data.qty, revenue: data.revenue }))
    .sort((a, b) => b.soldQty - a.soldQty)
    .slice(0, 5)
})

// --- Low Stock ---
const lowStockItems = computed(() => {
  const branchWHUuids = allWarehouses.value.filter(w => w.branch_id === branchStore.currentBranchId).map(w => w.uuid)
  return stockData.value.filter(inv => {
    if (!branchWHUuids.includes(inv.warehouse_uuid)) return false
    const item = allItems.value.find(i => i.uuid === inv.item_uuid)
    return item && inv.qty <= (parseFloat(item.min_stock) || 0)
  })
})

// --- Warehouse Summary ---
const warehouseSummary = computed(() => {
  const branchWH = allWarehouses.value.filter(w => w.branch_id === branchStore.currentBranchId)
  return branchWH.map(wh => {
    const whStock = stockData.value.filter(inv => inv.warehouse_uuid === wh.uuid)
    const totalItems = whStock.length
    const totalQty = whStock.reduce((s, inv) => s + inv.qty, 0)
    const totalValue = whStock.reduce((s, inv) => {
      const item = allItems.value.find(i => i.uuid === inv.item_uuid)
      return s + (item ? inv.qty * (parseFloat(item.hpp) || parseFloat(item.buy_price) || 0) : 0)
    }, 0)
    return { uuid: wh.uuid, name: wh.name, totalItems, totalQty, totalValue }
  })
})

// --- Overdue Invoices ---
const overdueInvoices = computed(() => {
  const today = new Date()
  return branchInvoices.value.filter(inv => inv.status === 'unpaid' && new Date(inv.due_date) < today)
})
function daysOverdue(dateStr) { return Math.max(0, Math.floor((new Date() - new Date(dateStr)) / 86400000)) }

// --- Recent Audit ---
const recentAudit = computed(() => (allAudit.value || []).filter(a => a.branch_id === branchStore.currentBranchId).slice(0, 5))
function actionBadge(action) { return { create: 'bg-success', edit: 'bg-warning text-dark', update: 'bg-warning text-dark', delete: 'bg-danger', approve: 'bg-primary', submit: 'bg-info text-dark', reject: 'bg-danger' }[action] || 'bg-secondary' }
function formatTime(ts) { return new Date(ts).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) }

// --- Helpers ---
function getCustomerName(id) { return allCustomers.value.find(c => c.uuid === id)?.name || '-' }
function getItemName(id) { return allItems.value.find(i => i.uuid === id)?.name || '-' }
function getItemCode(id) { return allItems.value.find(i => i.uuid === id)?.code || '-' }
function calcSOTotal(so) { return parseFloat(so.total) || (so.lines || []).reduce((s, l) => s + (l.qty * parseFloat(l.price) * (1 - (parseFloat(l.discount) || 0) / 100)), 0) }

// --- SO Detail Modal ---
const detailSO = ref(null)
async function showSODetail(so) {
  try {
    const { data } = await salesApi.getSalesOrder(so.uuid)
    detailSO.value = data
  } catch {
    detailSO.value = so
  }
}

// --- Consignment Summary ---
const consignmentSummary = computed(() => allConsignments.value.filter(c => c.status === 'active'))
function calcConsignmentRevenue(c) {
  const item = allItems.value.find(i => i.code === c.item_code) || allItems.value.find(i => i.name === c.item_name)
  const itemPrice = parseFloat(item?.sell_price) || 0
  return itemPrice * (c.sold_qty || 0) * (parseFloat(c.commission_pct) || 0) / 100
}
</script>

<style scoped>
.chart-container { height: 200px; display: flex; align-items: flex-end; }
.chart-bars { display: flex; align-items: flex-end; justify-content: space-between; width: 100%; height: 100%; gap: 8px; }
.chart-bar-group { display: flex; flex-direction: column; align-items: center; flex: 1; height: 100%; justify-content: flex-end; }
.chart-bar { width: 100%; max-width: 48px; background: linear-gradient(180deg, var(--primary-color), var(--secondary-color)); border-radius: 6px 6px 0 0; transition: height 0.6s ease; min-height: 4px; }
.chart-bar-value { margin-bottom: 4px; font-weight: 600; white-space: nowrap; }
.chart-bar-label { margin-top: 6px; }

/* Flexible dashboard rows */
.dash-flex-row { display: flex; gap: 1rem; flex-wrap: wrap; }
.dash-flex-item { min-width: 0; }
.dash-flex-sm { flex: 1 1 250px; min-width: 250px; }
.dash-flex-md { flex: 1.5 1 300px; min-width: 280px; }
.dash-flex-lg { flex: 2 1 400px; min-width: 350px; }

/* Stat cards — flexible auto-fill */
.stat-cards-row {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}
.stat-card-col {
  flex: 1 1 240px;
  min-width: 220px;
  max-width: 100%;
}
/* Kalau hanya 1 card, jangan terlalu lebar */
.stat-card-col:only-child {
  max-width: 400px;
}

@media (max-width: 768px) {
  .dash-flex-item { flex: 1 1 100% !important; }
  .stat-card-col { flex: 1 1 100% !important; max-width: 100% !important; }
}
.hover-highlight:hover { background-color: rgba(var(--bs-primary-rgb, 13, 110, 253), 0.06) !important; }
</style>
