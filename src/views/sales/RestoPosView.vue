<template>
  <div class="resto-pos" id="resto-pos-view">
    <!-- ================================================================== -->
    <!-- BUKA KASIR MODAL (blocks POS until session is opened)              -->
    <!-- ================================================================== -->
    <div v-if="!activeSession && !sessionLoading" class="modal fade show d-block" tabindex="-1"
         style="z-index:1070;background:rgba(0,0,0,0.65)">
      <div class="modal-dialog modal-dialog-centered" style="max-width:420px">
        <div class="modal-content shadow-lg">
          <div class="modal-header py-3" style="background:linear-gradient(135deg,#00B4AB,#009A92);color:#fff">
            <h5 class="modal-title mb-0">
              <i class="bi bi-cash-coin me-2"></i>Buka Kasir
            </h5>
          </div>
          <div class="modal-body p-4">
            <!-- Cash input: shown only when pos_require_opening_cash = true -->
            <template v-if="posSettings.pos_require_opening_cash !== false">
              <p class="text-muted small mb-3">
                Masukkan jumlah <strong>Uang Kas Awal</strong> (modal/deposit) untuk memulai sesi kasir.
              </p>
              <div class="mb-3">
                <label class="form-label fw-semibold">Uang Kas Awal (Rp)</label>
                <div class="input-group input-group-lg">
                  <span class="input-group-text">Rp</span>
                  <input type="number" class="form-control" v-model.number="openingCashInput"
                         min="0" placeholder="0" id="input-opening-cash"
                         @keyup.enter="doBukaKasir" ref="openingCashRef" />
                </div>
                <div class="text-end mt-1">
                  <span class="fw-bold text-success fs-6">{{ formatMoney(openingCashInput || 0) }}</span>
                </div>
              </div>
              <div class="d-flex flex-wrap gap-2 mb-1">
                <button v-for="q in [100000,200000,300000,500000,1000000]" :key="q"
                        class="btn btn-outline-secondary btn-sm"
                        @click="openingCashInput = q">{{ formatMoney(q) }}</button>
              </div>
            </template>
            <template v-else>
              <div class="py-3 text-center">
                <i class="bi bi-unlock display-4 text-success mb-3 d-block"></i>
                <p class="mb-1 fw-semibold">Siap Buka Kasir</p>
                <p class="text-muted small">Sesi kasir akan dibuka tanpa pencatatan kas awal.</p>
              </div>
            </template>
          </div>
          <div class="modal-footer flex-column gap-2">
            <button class="btn btn-primary w-100 fw-bold py-2" @click="doBukaKasir" :disabled="openingBusy">
              <span v-if="openingBusy" class="spinner-border spinner-border-sm me-1"></span>
              <i v-else class="bi bi-unlock me-1"></i>
              {{ openingBusy ? 'Membuka...' : 'Buka Kasir' }}
            </button>
            <button class="btn btn-outline-secondary w-100" @click="router.push('/resto/tables')" :disabled="openingBusy">
              <i class="bi bi-arrow-left me-1"></i>Kembali
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ================================================================== -->
    <!-- TUTUP KASIR MODAL (closing report preview)                         -->
    <!-- ================================================================== -->
    <div v-if="showTutupModal" class="modal fade show d-block" tabindex="-1"
         style="z-index:1070;background:rgba(0,0,0,0.6)">
      <div class="modal-dialog modal-dialog-centered" style="max-width:480px">
        <div class="modal-content shadow-lg">
          <div class="modal-header py-3" style="background:linear-gradient(135deg,#dc3545,#a71d2a);color:#fff">
            <h5 class="modal-title mb-0">
              <i class="bi bi-lock me-2"></i>Tutup Kasir
            </h5>
            <button class="btn-close btn-close-white" @click="showTutupModal = false" :disabled="closingBusy"></button>
          </div>
          <div class="modal-body p-0">
            <div v-if="closingLoading" class="text-center py-5">
              <div class="spinner-border text-danger mb-2"></div>
              <div class="text-muted small">Menghitung rekap...</div>
            </div>
            <div v-else>
              <div class="px-4 py-3 bg-light border-bottom">
                <div class="row g-2">
                  <div class="col-6">
                    <div class="text-muted small">Kasir</div>
                    <div class="fw-semibold">{{ activeSession?.cashier_name }}</div>
                  </div>
                  <div class="col-6">
                    <div class="text-muted small">Buka</div>
                    <div class="fw-semibold">{{ formatSessionTime(activeSession?.opened_at) }}</div>
                  </div>
                  <div class="col-6">
                    <div class="text-muted small">Tutup</div>
                    <div class="fw-semibold">{{ formatSessionTime(new Date().toISOString()) }}</div>
                  </div>
                  <div class="col-6">
                    <div class="text-muted small">Jumlah Transaksi</div>
                    <div class="fw-semibold">{{ closingReport?.transaction_count ?? '-' }}</div>
                  </div>
                </div>
              </div>
                <div class="p-4">
                  <div class="d-flex justify-content-between align-items-center py-2 border-bottom">
                    <span class="text-muted"><i class="bi bi-wallet2 me-2"></i>Uang Kas Awal</span>
                    <span class="fw-semibold">{{ formatMoney(closingReport?.opening_cash ?? 0) }}</span>
                  </div>
                  <div class="mt-2 mb-1 small text-muted fw-semibold">CASH FLOW (TUNAI)</div>
                  <div class="d-flex justify-content-between align-items-center py-2">
                    <span><i class="bi bi-arrow-down-left-square text-success me-2"></i>Uang Masuk (Sales / In)</span>
                    <span class="fw-semibold text-success">+ {{ formatMoney(closingReport?.total_cash_in ?? 0) }}</span>
                  </div>
                  <div class="d-flex justify-content-between align-items-center py-2 border-bottom">
                    <span><i class="bi bi-arrow-up-right-square text-danger me-2"></i>Uang Keluar (Change / Out)</span>
                    <span class="fw-semibold text-danger">- {{ formatMoney(closingReport?.total_cash_out ?? 0) }}</span>
                  </div>
                  <!-- Sisa kas (expected) -->
                  <div class="d-flex justify-content-between align-items-center py-3 mt-2 rounded-top"
                       style="background:var(--bs-tertiary-bg);padding:0.75rem 1rem">
                    <span class="fw-bold fs-6">Sistem: Kas Diharapkan</span>
                    <span class="fw-bold fs-5">{{ formatMoney(closingReport?.expected_cash ?? 0) }}</span>
                  </div>

                  <!-- Actual Cash Input or Result -->
                  <div v-if="activeSession" class="bg-light p-3 border border-top-0 rounded-bottom">
                    <label class="form-label fw-bold text-primary mb-2">Uang Fisik Aktual di Laci (Rp)</label>
                    <div class="input-group input-group-lg">
                      <span class="input-group-text bg-white">Rp</span>
                      <input type="number" class="form-control fw-bold border-start-0" 
                             v-model="actualCashInput" placeholder="Hitung uang nyata..." />
                    </div>
                    <div class="mt-3 d-flex justify-content-between align-items-center" 
                         :class="(actualCashInput - (closingReport?.expected_cash || 0)) < 0 ? 'text-danger' : 'text-success'">
                      <span class="fw-semibold small">Selisih:</span>
                      <span class="fw-bold">{{ formatMoney((actualCashInput || 0) - (closingReport?.expected_cash || 0)) }}</span>
                    </div>
                  </div>
                  <div v-else class="p-3 border border-top-0 rounded-bottom"
                       :class="(closingReport?.difference ?? 0) < 0 ? 'bg-danger bg-opacity-10' : 'bg-success bg-opacity-10'">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                      <span class="fw-bold fs-6">Uang Fisik Aktual</span>
                      <span class="fw-bold fs-5">{{ formatMoney(closingReport?.actual_cash ?? 0) }}</span>
                    </div>
                    <div class="d-flex justify-content-between align-items-center"
                         :class="(closingReport?.difference ?? 0) < 0 ? 'text-danger' : 'text-success'">
                      <span class="fw-semibold small">Selisih Laporan:</span>
                      <span class="fw-bold fs-6">{{ formatMoney(closingReport?.difference ?? 0) }}</span>
                    </div>
                  </div>
                  
                  <div class="mt-3 mb-1 small text-muted fw-semibold">PEMBAYARAN NON-TUNAI</div>
                  <div class="d-flex justify-content-between align-items-center py-1">
                    <span><i class="bi bi-qr-code me-2"></i>QRIS</span>
                    <span class="fw-semibold text-info">{{ formatMoney(closingReport?.total_qris ?? 0) }}</span>
                  </div>
                  <div class="d-flex justify-content-between align-items-center py-1">
                    <span><i class="bi bi-bank me-2"></i>Transfer Bank</span>
                    <span class="fw-semibold text-primary">{{ formatMoney(closingReport?.total_transfer ?? 0) }}</span>
                  </div>
                  <div class="d-flex justify-content-between align-items-center py-1">
                    <span><i class="bi bi-credit-card me-2"></i>Debit</span>
                    <span class="fw-semibold" style="color:#00B4AB;">{{ formatMoney(closingReport?.total_debit ?? 0) }}</span>
                  </div>
                </div>
              </div>
            </div>
            <div class="modal-footer flex-column gap-2" v-if="!closingLoading">
              <template v-if="activeSession">
                <button class="btn btn-danger w-100 fw-bold py-2" @click="doTutupKasir" :disabled="closingBusy">
                  <span v-if="closingBusy" class="spinner-border spinner-border-sm me-1"></span>
                  <i v-else class="bi bi-lock me-1"></i> {{ closingBusy ? 'Menutup...' : 'Tutup Shift Sekarang' }}
                </button>
                <button class="btn btn-outline-secondary w-100" @click="showTutupModal = false" :disabled="closingBusy">Batal</button>
              </template>
              <template v-else>
                <button class="btn btn-secondary w-100 fw-bold py-2" @click="showTutupModal = false">
                  <i class="bi bi-check2-circle me-1"></i>Tutup Layer
                </button>
              </template>
            </div>
        </div>
      </div>
    </div>

    <!-- ================================================================== -->
    <!-- PENYESUAIAN KAS MODAL                                              -->
    <!-- ================================================================== -->
    <div v-if="showAdjustmentModal" class="modal fade show d-block" tabindex="-1" style="z-index:1075;background:rgba(0,0,0,0.6)">
      <div class="modal-dialog modal-dialog-centered" style="max-width:400px">
        <div class="modal-content shadow-lg">
          <div class="modal-header py-3 bg-light">
            <h5 class="modal-title mb-0"><i class="bi bi-wallet2 me-2"></i>Penyesuaian Kas Cash</h5>
            <button class="btn-close" @click="showAdjustmentModal = false" :disabled="adjustmentBusy"></button>
          </div>
          <div class="modal-body p-4">
            <div class="mb-3">
              <label class="form-label fw-semibold">Tipe Penyesuaian</label>
              <select class="form-select" v-model="adjustmentForm.type">
                <option value="IN">Uang Masuk (Kas Masuk)</option>
                <option value="OUT">Uang Keluar (Kas Keluar)</option>
              </select>
            </div>
            <div class="mb-3">
              <label class="form-label fw-semibold">Nominal (Rp)</label>
              <div class="input-group">
                <span class="input-group-text">Rp</span>
                <input type="number" class="form-control" v-model.number="adjustmentForm.amount" min="1" />
              </div>
            </div>
            <div class="mb-1">
              <label class="form-label fw-semibold">Catatan / Alasan</label>
              <input type="text" class="form-control" v-model="adjustmentForm.note" placeholder="Cth: Beli es batu, pinjam kembalian..." />
            </div>
          </div>
          <div class="modal-footer flex-column gap-2">
            <button class="btn btn-primary w-100 fw-bold py-2" @click="doPenyesuaianKas" :disabled="adjustmentBusy">
              <span v-if="adjustmentBusy" class="spinner-border spinner-border-sm me-1"></span>
              <i v-else class="bi bi-floppy me-1"></i> {{ adjustmentBusy ? 'Disimpan...' : 'Simpan Penyesuaian' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Header -->
    <div class="rp-header">
      <div class="rp-header-left">
        <h4 class="rp-title"><i class="bi bi-receipt-cutoff"></i> POS Resto</h4>
        <div v-if="activeSession" class="d-flex align-items-center gap-2 ms-3 flex-wrap">
          <span class="badge bg-success px-2 py-1"><i class="bi bi-unlock me-1"></i>Sesi Aktif</span>
          <span class="small text-muted"><i class="bi bi-person me-1"></i>{{ activeSession.cashier_name }}</span>
          <button class="btn btn-sm btn-outline-info py-0 border-0 ms-1 fw-semibold" @click="showAdjustmentModal = true" title="Penyesuaian Kas">
            <i class="bi bi-cash-stack"></i> Kas
          </button>
          <button class="btn btn-sm btn-outline-danger py-0 border-0 ms-1 fw-semibold" @click="openCloseModal" title="Tutup Kasir">
            <i class="bi bi-lock"></i> Tutup
          </button>
        </div>
        <span class="badge bg-primary ms-2" v-if="activeOrders.length">{{ activeOrders.length }} pesanan</span>
      </div>
      <div class="rp-header-right">
        <router-link to="/resto/tables" class="btn btn-sm btn-outline-secondary">
          <i class="bi bi-grid-3x3-gap-fill"></i> Denah Meja
        </router-link>
        <router-link to="/resto/kitchen" class="btn btn-sm btn-outline-warning">
          <i class="bi bi-fire"></i> Kitchen
        </router-link>
        <button class="btn btn-sm btn-outline-secondary" @click="loadData" id="btn-refresh">
          <i class="bi bi-arrow-clockwise"></i> Refresh
        </button>
      </div>
    </div>

    <div class="rp-body">
      <!-- ═══ Left: Table List ═══ -->
      <div class="rp-table-list">
        <div class="rp-list-header">
          <h6><i class="bi bi-grid-fill"></i> Pilih Meja</h6>
          <select v-model="selectedRoom" class="form-select form-select-sm rp-room-select" id="select-room-filter">
            <option :value="null">Semua Ruangan</option>
            <option v-for="r in rooms" :key="r.uuid" :value="r.uuid">{{ r.name }}</option>
          </select>
        </div>
        <div class="rp-tables-scroll">
          <div v-for="table in filteredTables" :key="table.uuid"
               class="rp-table-item" :class="{ active: selectedTable?.uuid === table.uuid, occupied: table.status === 'occupied' }"
               @click="selectTable(table)">
            <div class="rp-table-icon" :class="`status-${table.status}`">
              <i class="bi bi-grid-3x3-gap-fill"></i>
            </div>
            <div class="rp-table-info">
              <span class="rp-table-num">Meja {{ table.number }}</span>
              <span class="rp-table-label" v-if="table.label">{{ table.label }}</span>
              <span class="rp-table-status">
                <span class="badge" :class="statusBadge(table.status)">{{ statusLabel(table.status) }}</span>
              </span>
            </div>
            <div class="rp-table-cap"><i class="bi bi-people-fill"></i> {{ table.capacity }}</div>
          </div>
          <div v-if="filteredTables.length === 0 && !loading" class="text-center text-muted py-4">
            <i class="bi bi-grid-3x3-gap" style="font-size:2rem;opacity:0.3"></i>
            <p class="mt-2 small">Belum ada meja</p>
          </div>
        </div>
      </div>

      <!-- ═══ Center: Order Items Panel ═══ -->
      <div class="rp-order-panel" v-if="selectedTable">
        <div class="rp-panel-header">
          <div>
            <h6 class="mb-0"><i class="bi bi-receipt-cutoff"></i>
              Meja {{ selectedTable.number }}
              <small v-if="selectedTable.label" class="text-muted">· {{ selectedTable.label }}</small>
            </h6>
            <div v-if="currentOrder" class="mt-1">
              <span class="badge" :class="orderStatusBadge(currentOrder.status)">{{ orderStatusLabel(currentOrder.status) }}</span>
              <small class="text-muted ms-2">{{ currentOrder.order_number }}</small>
            </div>
          </div>
          <div class="d-flex gap-2">
            <button v-if="currentOrder && !['paid','cancelled'].includes(currentOrder.status)"
                    class="btn btn-sm btn-primary" @click="sendToKitchen" :disabled="newItems.length === 0">
              <i class="bi bi-save"></i> Simpan
            </button>
            <button v-if="visibleItems.length > 0 && (!currentOrder || !['paid','cancelled'].includes(currentOrder.status))"
                    class="btn btn-sm btn-success" @click="showCheckout = true" id="btn-checkout-pos">
              <i class="bi bi-cash-coin"></i> Bayar
            </button>
            <button v-if="currentOrder && !['paid','cancelled'].includes(currentOrder.status)"
                    class="btn btn-sm btn-outline-danger" @click="cancelCurrentOrder">
              <i class="bi bi-x-circle"></i>
            </button>
          </div>
        </div>

        <!-- Order Items List -->
        <div class="rp-order-items" v-if="visibleItems.length > 0">
          <div v-for="(item, idx) in visibleItems" :key="item.uuid || idx" class="rp-order-item" :class="{'opacity-50': item.status !== 'pending' && !item._changed}">
            <!-- Row 1: Name and Delete button -->
            <div class="rp-oi-row1">
              <div class="rp-oi-name-col">
                <span class="rp-oi-name">{{ item.item_name || item.name }}</span>
                <span class="rp-oi-note" v-if="item.notes">📝 {{ item.notes }}</span>
              </div>
              <button v-if="canEditItem(item)" class="btn btn-sm btn-link text-danger p-0 rp-btn-del" @click="removeOrderItem(item)" title="Hapus">
                <i class="bi bi-trash3"></i>
              </button>
            </div>
            
            <!-- Row 2: Qty, Status, Price -->
            <div class="rp-oi-row2">
              <!-- Qty Controls -->
              <div class="rp-qty-ctrl" v-if="canEditItem(item)">
                <button class="btn btn-sm btn-outline-secondary" @click="changeQty(item, -1)"><i class="bi bi-dash"></i></button>
                <span class="rp-qty-badge">{{ item.qty }}</span>
                <button class="btn btn-sm btn-outline-secondary" @click="changeQty(item, 1)"><i class="bi bi-plus"></i></button>
              </div>
              <span v-else class="rp-qty-fixed">{{ item.qty }}×</span>
              
              <!-- Total Price & Status -->
              <div class="rp-oi-price-group">
                <span class="rp-oi-price">Rp {{ formatMoney((item.price || 0) * (item.qty || 0)) }}</span>
                <span class="badge" :class="itemStatusBadge(item.status)">{{ itemStatusLabel(item.status) }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Empty state -->
        <div v-if="visibleItems.length === 0" class="rp-order-empty">
          <i class="bi bi-bag-x" style="font-size:2.5rem;opacity:0.25"></i>
          <p class="text-muted">{{ currentOrder ? 'Belum ada item.' : 'Meja kosong. Pilih menu untuk mulai.' }}</p>
        </div>

        <!-- Summary & Actions -->
        <div class="rp-order-footer" v-if="visibleItems.length > 0 || currentOrder">
          <div class="rp-summary" v-if="visibleItems.length > 0">
            <div class="rp-sum-row"><span>Subtotal</span><span>Rp {{ formatMoney(subtotal) }}</span></div>
            <div class="rp-sum-row total"><span>Total</span><span>Rp {{ formatMoney(subtotal) }}</span></div>
          </div>
          <div class="rp-bottom-actions">
            <button v-if="newItems.length > 0" class="btn btn-warning btn-sm flex-fill" @click="sendToKitchen">
              <i class="bi bi-fire"></i> Kirim ke Dapur ({{ newItems.length }} item)
            </button>
            <button v-if="visibleItems.length > 0 && (!currentOrder || !['paid','cancelled'].includes(currentOrder.status))"
                    class="btn btn-success btn-sm flex-fill" @click="showCheckout = true">
              <i class="bi bi-cash-coin"></i> Bayar
            </button>
          </div>
        </div>
      </div>

      <!-- ═══ No table selected ═══ -->
      <div v-if="!selectedTable" class="rp-no-selection">
        <i class="bi bi-hand-index" style="font-size:3rem;opacity:0.2"></i>
        <h5>Pilih meja dari daftar</h5>
        <p class="text-muted">Klik meja di sebelah kiri untuk melihat atau membuat pesanan</p>
      </div>

      <!-- ═══ Right: Menu Catalog Panel ═══ -->
      <div class="rp-menu-panel" v-if="selectedTable">
        <div class="rp-panel-header">
          <h6><i class="bi bi-grid-fill"></i> Katalog Menu</h6>
          <div class="rp-search-bar">
            <i class="bi bi-search"></i>
            <input v-model="searchQuery" class="form-control form-control-sm" placeholder="Cari menu..." />
          </div>
        </div>
        <!-- Category tabs -->
        <div class="rp-cat-tabs" v-if="categories.length > 0">
          <button :class="{ active: !selectedCategory }" @click="selectedCategory = null" class="rp-cat-tab">Semua</button>
          <button v-for="cat in categories" :key="cat" :class="{ active: selectedCategory === cat }"
                  @click="selectedCategory = cat" class="rp-cat-tab">{{ cat }}</button>
        </div>
        <!-- Product Grid -->
        <div class="rp-product-grid">
          <div v-for="product in filteredProducts" :key="product.uuid"
               class="rp-product-card" @click="addToOrder(product)"
               :class="{ 'unavailable': !product.is_available }">
            <div class="rp-product-img">
              <img v-if="product.image_url" :src="product.image_url" class="rp-product-photo" alt="" />
              <i v-else class="bi bi-cup-hot-fill"></i>
              <span v-if="!product.is_available" class="rp-badge-unavail">Habis</span>
            </div>
            <div class="rp-product-info">
              <span class="rp-product-cat">{{ product.category }}</span>
              <span class="rp-product-name">{{ product.name }}</span>
              <span class="rp-product-desc" v-if="product.description">{{ product.description }}</span>
              <span class="rp-product-price">Rp {{ formatMoney(product.price) }}</span>
            </div>
            <div v-if="getCartQty(product)" class="rp-product-badge">{{ getCartQty(product) }}</div>
          </div>
          <div v-if="filteredProducts.length === 0 && !loadingProducts" class="rp-empty-products">
            <i class="bi bi-search" style="font-size:2rem;opacity:0.2"></i>
            <p class="text-muted small mt-2">Tidak ada menu ditemukan</p>
          </div>
          <div v-if="loadingProducts" class="rp-empty-products">
            <div class="spinner-border spinner-border-sm text-primary"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══ Checkout Modal ═══ -->
    <div v-if="showCheckout" class="rp-modal-overlay" @click.self="showCheckout = false">
      <div class="rp-checkout-modal border-0 shadow-lg rounded-3 overflow-hidden">
        <div class="rp-modal-header bg-primary text-white d-flex justify-content-between align-items-center p-3">
          <h5 class="mb-0 fw-semibold"><i class="bi bi-credit-card-2-front me-2"></i> Pilih Metode Pembayaran</h5>
          <button class="btn-close btn-close-white" @click="showCheckout = false"></button>
        </div>
        <div class="rp-modal-body p-4 bg-white text-dark">
          <!-- TOP BLUE TOTAL -->
          <div class="d-flex justify-content-between align-items-center bg-primary bg-opacity-10 text-primary border border-primary-subtle rounded p-3 mb-4">
            <span class="fw-semibold">Total Pembayaran</span>
            <h4 class="mb-0 fw-bold">Rp {{ formatMoney(checkoutTotal) }}</h4>
          </div>

          <!-- GRID OF BUTTONS -->
          <div class="d-flex gap-3 mb-4">
            <button v-for="m in paymentMethods" :key="m.value"
                    class="btn flex-fill d-flex flex-column align-items-center justify-content-center py-3 rounded-3"
                    :class="payMethod === m.value ? 'btn-primary border-primary text-white shadow-sm' : 'btn-outline-secondary bg-white text-secondary'"
                    @click="payMethod = m.value"
                    style="border-width: 1px;"
                    >
              <i :class="m.icon" class="fs-3 mb-1"></i>
              <span class="fw-semibold small">{{ m.label }}</span>
            </button>
          </div>

          <!-- DYNAMIC PAYMENT SECTIONS -->
          <!-- TUNAI SECTION -->
          <div v-if="payMethod === 'cash'" class="text-start mt-4">
            <label class="form-label fw-bold">Uang Diterima</label>
            <div class="input-group input-group-lg mb-3 shadow-none border rounded overflow-hidden">
              <span class="input-group-text bg-white text-muted border-0 fw-bold">Rp</span>
              <input v-model.number="cashPaid" type="number" class="form-control fw-bold text-primary border-0" id="input-cash-paid-pos" style="font-size: 1.25rem; outline: none !important; box-shadow: none !important;" />
            </div>
            <div class="d-flex gap-2 mb-4 flex-wrap">
              <button v-for="q in quickCash" :key="q" class="btn btn-outline-secondary rounded-3 fw-semibold text-dark" @click="cashPaid = q">
                {{ formatMoney(q) }}
              </button>
            </div>
            <div class="p-3 bg-light rounded-3 text-center border">
              <div class="small text-muted mb-1">Kembalian</div>
              <h3 class="mb-0 fw-bold" :class="cashPaid >= checkoutTotal ? 'text-success' : 'text-danger'">
                Rp {{ formatMoney(cashPaid - checkoutTotal) }}
              </h3>
            </div>
          </div>

          <!-- QRIS SECTION -->
          <div v-else-if="payMethod === 'qris'" class="text-center mt-4">
            <p class="text-muted mb-3">Silakan scan QRIS untuk melakukan pembayaran.</p>
            <div class="d-inline-block bg-white p-2 rounded-3 shadow-sm border mb-3">
              <img v-if="posSettings.pos_qris_url" :src="authImageUrl(posSettings.pos_qris_url)" alt="QRIS"
                   style="width:200px; height:200px; object-fit:contain" />
              <div v-else class="d-flex align-items-center justify-content-center bg-light text-muted" style="width:200px; height:200px">
                QRIS Belum Diatur
              </div>
            </div>
            <div>
              <span class="badge bg-danger fs-6 px-3 py-2 mb-3 shadow-sm rounded-2">Rp {{ formatMoney(checkoutTotal) }}</span>
            </div>
            <p class="small text-muted mb-4 px-3">Scan QR Code di atas menggunakan aplikasi mobile banking atau e-wallet Anda.</p>
            <div class="alert alert-warning d-flex align-items-center mb-0 small text-start border-warning rounded-2 shadow-sm" role="alert" style="background-color: #fff3cd;">
              <i class="bi bi-info-circle me-2 text-warning fs-5"></i>
              <div class="text-dark">Setelah pelanggan berhasil scan, klik <strong>Konfirmasi Pembayaran</strong> di bawah.</div>
            </div>
          </div>

          <!-- TRANSFER BANK SECTION -->
          <div v-else-if="payMethod === 'transfer'" class="text-start mt-4">
            <p class="text-muted mb-3 text-center">Silakan lakukan transfer ke rekening di bawah ini.</p>
            <div class="bg-primary bg-opacity-10 border border-primary-subtle rounded-3 p-4 mb-4">
              <div class="d-flex align-items-center gap-3 mb-3">
                <div class="bg-primary text-white rounded p-2 fw-bold d-flex align-items-center justify-content-center" style="width: 60px; height: 60px; font-size: 1.25rem;">
                  {{ posSettings.pos_bank_name || 'BANK' }}
                </div>
                <div>
                  <div class="small text-muted mb-1">Bank</div>
                  <div class="fw-bold fs-5 text-dark">{{ posSettings.pos_bank_name || '-' }}</div>
                </div>
              </div>
              <hr class="border-secondary-subtle">
              <div class="row mb-3">
                <div class="col-6">
                  <div class="small text-muted mb-1">Nama Pemilik</div>
                  <div class="fw-semibold text-dark">{{ (posSettings.pos_bank_holder || '').trim() || '-' }}</div>
                </div>
                <div class="col-6">
                  <div class="small text-muted mb-1">Nomor Rekening</div>
                  <div class="fw-bold text-dark fs-5">{{ (posSettings.pos_bank_number || '').trim() || '-' }}</div>
                </div>
              </div>
              <hr class="border-secondary-subtle">
              <div class="d-flex justify-content-between align-items-center">
                <span class="small text-muted">Jumlah Transfer</span>
                <h5 class="fw-bold text-primary mb-0">Rp {{ formatMoney(checkoutTotal) }}</h5>
              </div>
            </div>
            <div class="alert alert-warning d-flex align-items-center mb-0 small border-warning rounded-2 shadow-sm" role="alert" style="background-color: #fff3cd;">
              <i class="bi bi-info-circle me-2 text-warning fs-5"></i>
              <div class="text-dark">Setelah transfer selesai, klik <strong>Konfirmasi Pembayaran</strong> di bawah.</div>
            </div>
          </div>
          
          <!-- DEBIT SECTION -->
          <div v-else-if="payMethod === 'debit'" class="text-start mt-4">
            <p class="text-muted mb-3 text-center">Instruksi Pembayaran Debit / EDC</p>
            <div class="bg-info bg-opacity-10 border border-info-subtle rounded-3 p-4 mb-4">
              <div class="d-flex align-items-center gap-3 mb-3">
                <div class="bg-info text-white rounded p-2 fw-bold d-flex align-items-center justify-content-center" style="width: 60px; height: 60px; font-size: 1.5rem;">
                  <i class="bi bi-credit-card"></i>
                </div>
                <div>
                  <div class="small text-muted mb-1">Informasi Mesin EDC (Debit)</div>
                  <div class="fw-bold fs-5 text-dark">{{ posSettings.pos_debit_bank || 'Debit Card' }}</div>
                </div>
              </div>
              <hr class="border-secondary-subtle">
              <div class="d-flex justify-content-between align-items-center">
                <span class="small text-muted">Total Pembayaran</span>
                <h5 class="fw-bold text-info mb-0">Rp {{ formatMoney(checkoutTotal) }}</h5>
              </div>
            </div>
            <div class="alert alert-warning d-flex align-items-center mb-0 small border-warning rounded-2 shadow-sm" role="alert" style="background-color: #fff3cd;">
              <i class="bi bi-info-circle me-2 text-warning fs-5"></i>
              <div class="text-dark">Setelah mesin EDC memproses pembayaran, klik <strong>Konfirmasi Pembayaran</strong>.</div>
            </div>
          </div>
          
          <div v-else class="mb-3 mt-4 p-4 border rounded-3 text-center bg-white shadow-sm">
             <h6 class="text-secondary fw-bold mb-3">Instruksi Pembayaran {{ payMethod.toUpperCase() }}</h6>
             <p class="mb-3 text-dark small">Pastikan pelanggan telah mentransfer sejumlah:</p>
             <h3 class="text-primary fw-bold mb-0">Rp {{ formatMoney(checkoutTotal) }}</h3>
          </div>

        </div>
        <div class="rp-modal-footer bg-white border-top p-3 d-flex justify-content-between align-items-center">
          <button class="btn btn-outline-secondary px-4 py-2 bg-white" @click="showCheckout = false">
            <i class="bi bi-arrow-left me-1"></i> Kembali
          </button>
          <button class="btn btn-success px-4 py-2 fw-bold" @click="processCheckout"
                  :disabled="payMethod === 'cash' && cashPaid < checkoutTotal" id="btn-process-checkout" style="background-color: #198754;">
            <i class="bi bi-check-circle me-1"></i> Konfirmasi Pembayaran
          </button>
        </div>
      </div>
    </div>

    <div v-if="loading" class="rp-loading"><div class="spinner-border text-primary"></div></div>
    
    <!-- RECEIPT MODAL -->
    <div v-if="showReceiptModal" class="modal fade show d-block" tabindex="-1" style="z-index:1070;background:rgba(0,0,0,0.65)">
      <div class="modal-dialog modal-dialog-centered" style="max-width:380px">
        <div class="modal-content shadow-lg">
          <div class="modal-header py-3" style="background:#00B4AB;color:#fff">
            <h5 class="modal-title mb-0"><i class="bi bi-receipt me-2"></i>Struk Pembayaran</h5>
            <button class="btn-close btn-close-white" @click="showReceiptModal = false"></button>
          </div>
          <div class="modal-body p-0 d-flex justify-content-center bg-light">
            <!-- PRINT RECEIPT AREA -->
            <div id="print-area" class="bg-white p-3 border shadow-sm my-3" style="width: 320px;">
              <div v-if="receiptData" style="font-family: monospace; color: black; font-size: 13px;">
                <div class="text-center mb-3">
                  <h4 class="fw-bold mb-1">{{ receiptData.resto_name || 'Resto' }}</h4>
                  <div v-if="receiptData.resto_address" style="font-size: 11px; margin-bottom: 5px;">{{ receiptData.resto_address }}</div>
                  <strong class="fs-5">BUKTI PEMBAYARAN</strong><br>
                  <span style="font-size:11px">Tgl: {{ new Date(receiptData.paid_at).toLocaleString('id-ID') }}</span><br>
                  <span style="font-size:11px">Kasir: {{ receiptData.cashier_name || 'Kasir' }}</span><br>
                  <span style="font-size:11px">
                    Pembayaran: {{ receiptData.payment_method?.toUpperCase() }} 
                    <template v-if="receiptData.payment_method === 'debit' && receiptData.debit_bank">({{ receiptData.debit_bank }})</template>
                  </span><br>
                  <span style="font-size:11px">No: {{ receiptData.order_number || '-' }}</span>
                </div>
                <div style="border-top: 1px dashed black; border-bottom: 1px dashed black; padding: 5px 0; margin-bottom: 5px;">
                  <div v-for="(item, i) in receiptData.items" :key="'rint'+i" class="d-flex justify-content-between mb-1">
                    <div style="flex: 1; padding-right:10px">
                      {{ item.item_name || item.name }}<br>
                      {{ item.qty }} x {{ formatMoney(item.price) }}
                    </div>
                    <div class="text-end fw-bold">
                      {{ formatMoney(item.qty * item.price) }}
                    </div>
                  </div>
                </div>
                <div class="d-flex justify-content-between mb-0"><span>Subtotal:</span><span>{{ formatMoney(receiptData.subtotal) }}</span></div>
                <div class="d-flex justify-content-between mb-0" v-if="receiptData.discount_pct > 0">
                  <span>Diskon ({{ receiptData.discount_pct }}%):</span>
                  <span>-{{ formatMoney(receiptData.subtotal * (receiptData.discount_pct/100)) }}</span>
                </div>
                <div class="d-flex justify-content-between fw-bold fs-6 mt-1" style="border-top: 1px solid black; padding-top: 3px;">
                  <span>TOTAL:</span><span>Rp {{ formatMoney(receiptData.total) }}</span>
                </div>
                <div class="d-flex justify-content-between mt-2"><span>Bayar ({{ receiptData.payment_method?.toUpperCase() }}):</span><span>{{ formatMoney(receiptData.cash_paid) }}</span></div>
                <div class="d-flex justify-content-between mt-0 pb-1" style="border-bottom: 1px dashed black;"><span>Kembali:</span><span>{{ formatMoney(receiptData.change) }}</span></div>
                <div class="text-center mt-3 pt-2" style="font-size: 11px;">
                  * Terima kasih atas kunjungan Anda *
                </div>
              </div>
            </div>
          </div>
          <div class="modal-footer d-flex justify-content-between bg-light">
            <button class="btn btn-outline-secondary" @click="showReceiptModal = false">Tutup</button>
            <button class="btn btn-success fw-bold px-4" @click="printReceipt">
              <i class="bi bi-printer me-2"></i> Cetak Struk
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useBranchStore } from '@/stores/branch'
import { useToast } from '@/composables/useToast'
import { useCart } from '@/composables/useCart'
import * as salesApi from '@/services/sales/api'
import {
  getRestoRooms, getRestoTables, getRestoOrders, getRestoOrder,
  getRestoMenu, createRestoOrder, updateRestoOrderItems,
  updateRestoOrderStatus, checkoutRestoOrder
} from '@/services/sales/restoApi'

const router = useRouter()
const branchStore = useBranchStore()
const route = useRoute()
const toast = useToast()

const posSettings = ref({
  pos_require_opening_cash: true,
  pos_hide_stock: false,
  pos_payment_methods: 'cash,qris,transfer',
  pos_bank_name: '',
  pos_bank_holder: '',
  pos_bank_number: '',
  pos_qris_url: ''
})

// Session states
const activeSession = ref(null)
const sessionLoading = ref(true)
const openingCashInput = ref(0)
const openingBusy = ref(false)
const openingCashRef = ref(null)

const showTutupModal = ref(false)
const receiptData = ref(null)
const closingReport = ref(null)
const closingLoading = ref(false)
const closingBusy = ref(false)

const actualCashInput = ref('')
const showAdjustmentModal = ref(false)
const adjustmentForm = ref({ type: 'IN', amount: '', note: '' })
const adjustmentBusy = ref(false)

const loading = ref(false)
const loadingProducts = ref(false)
const rooms = ref([])
const tables = ref([])
const activeOrders = ref([])
const products = ref([])
const categories = ref([])
const selectedRoom = ref(null)
const selectedTable = ref(null)
const currentOrder = ref(null)
const searchQuery = ref('')
const selectedCategory = ref(null)
// Cart composable
const { addItem, removeItem: cartRemoveItem, updateQty, replaceAll: cartReplaceAll, clear: cartClear, items: cartItems, activeItems, subtotal, tax, total } = useCart()

// Checkout
const showCheckout = ref(false)
const showReceiptModal = ref(false)
const discountPct = ref(0)
const payMethod = ref('cash')
const cashPaid = ref(0)

const ALL_METHODS = [
  { value: 'cash', label: 'Tunai', icon: 'bi bi-cash' },
  { value: 'qris', label: 'QRIS', icon: 'bi bi-qr-code' },
  { value: 'transfer', label: 'Transfer Bank', icon: 'bi bi-bank' },
  { value: 'debit', label: 'Debit', icon: 'bi bi-credit-card' },
]

const paymentMethods = computed(() => {
  const allowed = (posSettings.value.pos_payment_methods || 'cash,qris,transfer').split(',').map(s => s.trim())
  return ALL_METHODS.filter(m => allowed.includes(m.value))
})

const filteredTables = computed(() => {
  if (!selectedRoom.value) return tables.value
  return tables.value.filter(t => t.room_id === selectedRoom.value)
})

const filteredProducts = computed(() => {
  let list = products.value.filter(p => p.is_available !== false)
  if (selectedCategory.value) list = list.filter(p => p.category === selectedCategory.value)
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(p => p.name?.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q))
  }
  return list
})

// Active (non-cancelled) items for display purposes
const visibleItems = activeItems

// subtotal, tax, total are provided by useCart composable
const checkoutTotal = computed(() => subtotal.value - (subtotal.value * (discountPct.value || 0) / 100))

const quickCash = computed(() => {
  const t = checkoutTotal.value
  if (t <= 0) return [10000, 20000, 50000, 100000]
  const rounded = Math.ceil(t / 10000) * 10000
  return [t, rounded, rounded + 10000, rounded + 50000].filter((v, i, a) => a.indexOf(v) === i)
})

// Items that haven't been sent (no uuid or changed) — exclude cancelled
const newItems = computed(() => cartItems.value.filter(i => i.status !== 'cancelled' && (!i.uuid || i._changed)))

function getCartQty(product) {
  return cartItems.value
    .filter(i => i.item_id === product.uuid && i.status !== 'cancelled')
    .reduce((sum, i) => sum + (parseFloat(i.qty) || 0), 0)
}

function canEditItem(item) {
  return !item.uuid || item.status === 'pending'
}

async function loadData(skipOrderReload = false) {
  loading.value = true
  try {
    const [roomRes, tableRes, orderRes] = await Promise.all([
      getRestoRooms(),
      getRestoTables(),
      getRestoOrders({ status: 'new,cooking,ready,served' })
    ])
    rooms.value = roomRes.data
    tables.value = tableRes.data
    activeOrders.value = orderRes.data

    // Sync table status from active orders
    const occupiedIds = new Set(activeOrders.value.map(o => o.table_id))
    tables.value.forEach(t => {
      if (occupiedIds.has(t.uuid)) t.status = 'occupied'
      else if (t.status === 'occupied') t.status = 'available'
    })

    // Refresh current table if selected (but skip if caller already handled it)
    if (selectedTable.value && !skipOrderReload) {
      const updatedTable = tables.value.find(t => t.uuid === selectedTable.value.uuid)
      if (updatedTable) {
        selectedTable.value = updatedTable
        await loadOrderForTable(updatedTable)
      } else {
        selectedTable.value = null
        cartClear()
        currentOrder.value = null
      }
    }
  } catch (e) {
    console.error('Load error:', e)
  } finally {
    loading.value = false
  }
}

async function loadProducts() {
  loadingProducts.value = true
  try {
    const res = await getRestoMenu({ available: 'true' })
    products.value = res.data || []
    const cats = new Set(products.value.map(p => p.category).filter(Boolean))
    categories.value = [...cats].sort()
  } catch (e) {
    console.error('Failed to load menu:', e)
  } finally {
    loadingProducts.value = false
  }
}

async function selectTable(table) {
  selectedTable.value = table
  cartClear()
  currentOrder.value = null
  searchQuery.value = ''
  selectedCategory.value = null
  await loadOrderForTable(table)
}

async function loadOrderForTable(table) {
  // Preserve unsent local items
  const localUnsent = cartItems.value.filter(i => !i.uuid || i._changed);
  
  const order = activeOrders.value.find(o => o.table_id === table.uuid)
  if (order) {
    try {
      const res = await getRestoOrder(order.uuid)
      currentOrder.value = res.data
      const serverItems = (res.data.items || []).map(i => ({ ...i, _changed: false }));
      
      // Merge local modifications into server data
      localUnsent.forEach(localItem => {
        if (localItem.uuid) {
          const sItem = serverItems.find(si => si.uuid === localItem.uuid);
          if (sItem) {
            sItem.qty = localItem.qty;
            sItem.status = localItem.status;
            sItem._changed = true;
          }
        } else {
          serverItems.push(localItem);
        }
      });
      cartReplaceAll(serverItems);
    } catch (err) {
      console.error('Failed to load order for table:', err)
      currentOrder.value = null
      cartReplaceAll(localUnsent);
    }
  } else {
    currentOrder.value = null
    cartReplaceAll(localUnsent);
  }
}

function addToOrder(product) {
  if (product.is_available === false) return
  // Use cart composable to add or increment product
  addItem(product, 1)
}

// Get the cart map key for an item (uuid for server items, item_id for local)
function cartKey(item) {
  return item.uuid || item.item_id
}

function changeQty(item, delta) {
  const newQty = Math.max(0, (parseFloat(item.qty) || 0) + delta)
  const key = cartKey(item)
  if (newQty === 0) {
    cartRemoveItem(key)
  } else {
    updateQty(key, newQty)
  }
}

function removeOrderItem(item) {
  cartRemoveItem(cartKey(item))
}

async function sendToKitchen() {
  if (visibleItems.value.length === 0) return
  loading.value = true
  try {
    if (!currentOrder.value) {
      // Create new order with items
      const res = await createRestoOrder({
        table_id: selectedTable.value.uuid,
        branch_id: branchStore.currentBranchId,
        items: visibleItems.value.map(i => ({
          item_id: i.item_id,
          item_name: i.item_name || i.name,
          qty: i.qty,
          price: i.price,
          notes: i.notes || '',
        })),
      })
      // Fetch full order detail once
      const orderRes = await getRestoOrder(res.data.uuid)
      currentOrder.value = orderRes.data
      cartReplaceAll((orderRes.data.items || []).map(i => ({ ...i, _changed: false })))
    } else {
      // Update existing order: send all items, backend merges updates and inserts
      const itemsToSend = cartItems.value
        .map(i => ({
          uuid: i.uuid || undefined,
          item_id: i.item_id,
          item_name: i.item_name || i.name,
          qty: i.qty,
          price: i.price,
          notes: i.notes || '',
          status: i.status,
        }))
      if (itemsToSend.length > 0) {
        await updateRestoOrderItems(currentOrder.value.uuid, { items: itemsToSend })
      }
      if (currentOrder.value.status === 'new') {
        await updateRestoOrderStatus(currentOrder.value.uuid, 'cooking')
      }
      // Re-fetch the order once to sync server state
      const orderRes = await getRestoOrder(currentOrder.value.uuid)
      currentOrder.value = orderRes.data
      cartReplaceAll((orderRes.data.items || []).map(i => ({ ...i, _changed: false })))
    }
    // Refresh tables/orders in background (skip order reload since we already synced)
    await loadData(true)
    toast.success('Pesanan berhasil disimpan! ✅')
  } catch (e) {
    alert(e.response?.data?.error || 'Gagal mengirim ke dapur')
  } finally {
    loading.value = false
  }
}

async function cancelCurrentOrder() {
  if (!currentOrder.value || !confirm('Batalkan pesanan ini?')) return
  try {
    await updateRestoOrderStatus(currentOrder.value.uuid, 'cancelled')
    currentOrder.value = null
    cartClear()
    await loadData()
  } catch (e) { alert(e.response?.data?.error || 'Gagal membatalkan') }
}

async function processCheckout() {
  loading.value = true
  try {
    // If there are unsent items, first create/update order
    if (newItems.value.length > 0) await sendToKitchen()
    if (!currentOrder.value) { alert('Tidak ada pesanan aktif'); return }
    
    const cPaid = payMethod.value === 'cash' ? cashPaid.value : checkoutTotal.value
    await checkoutRestoOrder(currentOrder.value.uuid, {
      payment_method: payMethod.value,
      cash_paid: cPaid,
      discount_pct: discountPct.value,
    })
    
    // --- LOKAL: update state Shift Harian ---
    const rawShift = localStorage.getItem('resto_shift_data')
    if (rawShift) {
      const sh = JSON.parse(rawShift)
      sh.transaction_count = (sh.transaction_count || 0) + 1
      if (payMethod.value === 'cash') {
        sh.total_sales_cash = (sh.total_sales_cash || 0) + checkoutTotal.value
        sh.total_cash_in = (sh.total_cash_in || 0) + cPaid
        sh.total_cash_out = (sh.total_cash_out || 0) + Math.max(0, cPaid - checkoutTotal.value)
      } else if (payMethod.value === 'qris') {
        sh.total_qris = (sh.total_qris || 0) + checkoutTotal.value
      } else if (payMethod.value === 'transfer') {
        sh.total_transfer = (sh.total_transfer || 0) + checkoutTotal.value
      } else {
        sh.total_debit = (sh.total_debit || 0) + checkoutTotal.value
      }
      localStorage.setItem('resto_shift_data', JSON.stringify(sh))
      activeSession.value = sh
    }
    
    receiptData.value = {
        resto_name: localStorage.getItem('resto_local_name') || 'Smart POS',
        resto_address: localStorage.getItem('resto_local_address') || '',
        cashier_name: activeSession.value?.cashier_name || 'Kasir',
        paid_at: new Date(),
        order_number: currentOrder.value.order_number,
        items: JSON.parse(JSON.stringify(visibleItems.value)),
        subtotal: subtotal.value,
        discount_pct: discountPct.value,
        total: checkoutTotal.value,
        payment_method: payMethod.value,
        debit_bank: posSettings.value.pos_debit_bank || '',
        cash_paid: cPaid,
        change: Math.max(0, cPaid - checkoutTotal.value)
    }

    showCheckout.value = false
    toast.success('Pembayaran berhasil! ✅')
    
    // Tampilkan popup nota Receipt
    showReceiptModal.value = true;
    
    
    discountPct.value = 0; cashPaid.value = 0; payMethod.value = 'cash'
    currentOrder.value = null
    cartClear()
    selectedTable.value = null
    await loadData()
  } catch (e) {
    alert(e.response?.data?.error || 'Gagal checkout')
  } finally {
    loading.value = false
  }
}

function printReceipt() {
  const content = document.getElementById('print-area').innerHTML;
  const printWindow = document.createElement('iframe');
  printWindow.style.position = 'absolute';
  printWindow.style.top = '-1000px';
  printWindow.style.left = '-1000px';
  document.body.appendChild(printWindow);
  
  const doc = printWindow.contentWindow.document;
  doc.open();
  doc.write('<html><head><title>Print Receipt</title>');
  doc.write('<style>');
  doc.write('body { font-family: monospace; font-size: 13px; color: black; margin: 0; padding: 10px; width: 80mm; }');
  doc.write('</style>');
  doc.write('</head><body>');
  doc.write(content);
  doc.write('</body></html>');
  doc.close();
  
  printWindow.contentWindow.focus();
  setTimeout(() => {
    printWindow.contentWindow.print();
    setTimeout(() => { document.body.removeChild(printWindow); }, 1000);
  }, 250);
}

// Helpers
function formatMoney(val) { return new Intl.NumberFormat('id-ID').format(parseFloat(val) || 0) }
function authImageUrl(url) {
  if (!url) return ''
  const token = localStorage.getItem('erp_access_token')
  if (!token) return url
  return url + (url.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(token)
}
function statusLabel(s) { return { available: 'Kosong', occupied: 'Terisi', reserved: 'Reservasi', cleaning: 'Bersih-bersih' }[s] || s }
function statusBadge(s) { return { available: 'bg-success', occupied: 'bg-danger', reserved: 'bg-warning text-dark', cleaning: 'bg-secondary' }[s] || 'bg-secondary' }
function orderStatusLabel(s) { return { new: 'Baru', cooking: 'Dimasak', ready: 'Siap', served: 'Disajikan', paid: 'Lunas', cancelled: 'Batal' }[s] || s }
function orderStatusBadge(s) { return { new: 'bg-info', cooking: 'bg-warning text-dark', ready: 'bg-success', served: 'bg-primary', paid: 'bg-secondary', cancelled: 'bg-danger' }[s] || 'bg-secondary' }
function itemStatusLabel(s) { return { pending: 'Belum Dikirim', cooking: 'Dimasak', ready: 'Siap', served: 'Disajikan', cancelled: 'Batal' }[s] || s }
function itemStatusBadge(s) { return { pending: 'bg-secondary', cooking: 'bg-warning text-dark', ready: 'bg-success', served: 'bg-primary', cancelled: 'bg-danger' }[s] || 'bg-secondary' }

let refreshInterval
onMounted(async () => {
  await getPosSettings()
  await loadCurrentSession()
  await loadData()
  await loadProducts()
  
  if (route.query.table_id) {
    const t = tables.value.find(tbl => tbl.uuid === route.query.table_id)
    if (t) await selectTable(t)
  }
  
  refreshInterval = setInterval(loadData, 30000)
})
onUnmounted(() => clearInterval(refreshInterval))

async function getPosSettings() {
  try {
    const { data } = await salesApi.getPosSettings()
    posSettings.value = {
      pos_require_opening_cash: data.pos_require_opening_cash !== false,
      pos_hide_stock: Boolean(data.pos_hide_stock),
      pos_payment_methods: data.pos_payment_methods || 'cash,qris,transfer',
      pos_bank_name: data.pos_bank_name || '',
      pos_bank_holder: data.pos_bank_holder || '',
      pos_bank_number: data.pos_bank_number || '',
      pos_qris_url: data.pos_qris_url || '',
      pos_debit_bank: data.pos_debit_bank || ''
    }
  } catch (e) {
    console.error('Failed to load pos settings', e)
  }
}

function formatSessionTime(ts) {
  if (!ts) return '-'
  return new Date(ts).toLocaleString('id-ID', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

async function loadCurrentSession() {
  sessionLoading.value = true
  try {
    const raw = localStorage.getItem('resto_shift_data')
    if (raw) {
      activeSession.value = JSON.parse(raw)
    } else {
      activeSession.value = null
    }
  } catch (e) {
    activeSession.value = null
  } finally {
    sessionLoading.value = false
    if (!activeSession.value) {
      await nextTick()
      openingCashRef.value?.focus()
    }
  }
}

async function doBukaKasir() {
  if (openingBusy.value) return
  openingBusy.value = true
  try {
    const sessionData = {
      cashier_name: JSON.parse(localStorage.getItem('erp_user'))?.name || 'Kasir Luring',
      opened_at: new Date().toISOString(),
      opening_cash: openingCashInput.value || 0,
      total_cash_in: 0,
      total_cash_out: 0,
      total_sales_cash: 0,
      total_qris: 0,
      total_transfer: 0,
      total_debit: 0,
      transaction_count: 0,
      status: 'open'
    }
    localStorage.setItem('resto_shift_data', JSON.stringify(sessionData))
    activeSession.value = sessionData
    openingCashInput.value = 0
    toast.success('Sesi kasir berhasil dibuka (Lokal)!')
  } catch (e) {
    toast.error('Gagal buka kasir.')
  } finally {
    openingBusy.value = false
  }
}

async function openCloseModal() {
  showTutupModal.value = true
  closingLoading.value = true
  closingReport.value = null
  actualCashInput.value = ''
  try {
    const raw = localStorage.getItem('resto_shift_data')
    if (raw) {
      const data = JSON.parse(raw)
      activeSession.value = data
      const op = parseFloat(data.opening_cash) || 0
      const ci = parseFloat(data.total_cash_in) || 0
      const co = parseFloat(data.total_cash_out) || 0
      const sc = parseFloat(data.total_sales_cash) || 0
      const exp = op + ci - co + sc

      closingReport.value = {
        cashier_name: data.cashier_name,
        opened_at: data.opened_at,
        opening_cash: op,
        total_cash_in: ci + sc, // Display sales + IN as total in
        total_cash_out: co,
        expected_cash: exp,
        total_qris: parseFloat(data.total_qris) || 0,
        total_transfer: parseFloat(data.total_transfer) || 0,
        total_debit: parseFloat(data.total_debit) || 0,
        total_sales: (parseFloat(data.total_sales_cash) || 0) + (parseFloat(data.total_qris) || 0) + (parseFloat(data.total_transfer) || 0) + (parseFloat(data.total_debit) || 0),
        transaction_count: data.transaction_count || 0
      }
      actualCashInput.value = closingReport.value.expected_cash
    }
  } catch (e) {
    toast.error('Gagal memuat detail sesi lokal.')
  } finally {
    closingLoading.value = false
  }
}

async function doTutupKasir() {
  if (closingBusy.value) return
  if (actualCashInput.value === '' || actualCashInput.value === null) {
    toast.error('Uang fisik aktual wajib diisi'); return
  }
  closingBusy.value = true
  try {
    const todayStr = new Date().toISOString().split('T')[0]
    const currentData = JSON.parse(localStorage.getItem('resto_shift_data'))
    
    currentData.closed_at = new Date().toISOString()
    currentData.actual_cash = parseFloat(actualCashInput.value)
    currentData.expected_cash = closingReport.value.expected_cash
    currentData.difference = currentData.actual_cash - currentData.expected_cash
    currentData.status = 'closed'

    // We save this final state so daily report can read it.
    localStorage.setItem(`resto_shift_${todayStr}`, JSON.stringify(currentData))
    // We clear current shift
    localStorage.removeItem('resto_shift_data')

    activeSession.value = null
    closingReport.value = {
      ...closingReport.value,
      actual_cash: currentData.actual_cash,
      difference: currentData.difference
    }
    toast.success('Sesi kasir harian berhasil ditutup dan disimpan di sistem.')
  } catch (e) {
    toast.error('Gagal tutup kasir: ' + e.message)
  } finally {
    closingBusy.value = false
  }
}

async function doPenyesuaianKas() {
  if (adjustmentBusy.value) return
  if (!adjustmentForm.value.amount || adjustmentForm.value.amount <= 0) {
    toast.error('Nominal harus lebih dari 0'); return
  }
  adjustmentBusy.value = true
  try {
    const raw = localStorage.getItem('resto_shift_data')
    if (raw) {
      const data = JSON.parse(raw)
      const amt = parseFloat(adjustmentForm.value.amount)
      if (adjustmentForm.value.type === 'IN') {
        data.total_cash_in = (data.total_cash_in || 0) + amt
      } else {
        data.total_cash_out = (data.total_cash_out || 0) + amt
      }
      localStorage.setItem('resto_shift_data', JSON.stringify(data))
      activeSession.value = data
      toast.success('Penyesuaian kas tercatat!')
      showAdjustmentModal.value = false
      adjustmentForm.value = { type: 'IN', amount: '', note: '' }
    } else {
      toast.error('Sesi kasir belum dibuka.')
    }
  } catch (e) {
    toast.error('Gagal simpan: ' + e.message)
  } finally {
    adjustmentBusy.value = false
  }
}
</script>

<style scoped>
.resto-pos {
  display: flex; flex-direction: column; height: calc(100vh - 60px);
  position: relative; overflow: hidden; font-family: 'Inter', 'Segoe UI', sans-serif;
}

.rp-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 12px 20px; background: var(--bs-body-bg, #fff);
  border-bottom: 1px solid var(--bs-border-color, #dee2e6);
}
.rp-header-left { display: flex; align-items: center; gap: 12px; }
.rp-header-right { display: flex; align-items: center; gap: 8px; }
.rp-title { margin: 0; font-size: 1.1rem; font-weight: 700; display: flex; align-items: center; gap: 8px; }
.rp-title i { color: var(--bs-primary); }

.rp-body { display: flex; flex: 1; overflow: hidden; }

/* ═══ Table List ═══ */
.rp-table-list {
  width: 220px; min-width: 220px; background: var(--bs-body-bg, #fff);
  border-right: 1px solid var(--bs-border-color, #dee2e6); display: flex; flex-direction: column;
}
.rp-list-header {
  padding: 10px 12px; border-bottom: 1px solid var(--bs-border-color, #dee2e6);
  display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;
}
.rp-list-header h6 { margin: 0; font-weight: 700; display: flex; align-items: center; gap: 6px; font-size: 0.85rem; }
.rp-list-header h6 i { color: var(--bs-primary); }
.rp-room-select { width: 100%; font-size: 0.8rem; }
.rp-tables-scroll { flex: 1; overflow-y: auto; padding: 6px; }

.rp-table-item {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 10px; border-radius: 8px; cursor: pointer; margin-bottom: 3px;
  border: 1px solid transparent; transition: all 0.15s;
}
.rp-table-item:hover { background: var(--bs-tertiary-bg, #f8f9fa); }
.rp-table-item.active {
  background: rgba(var(--bs-primary-rgb,13,110,253), 0.08);
  border-color: var(--bs-primary);
}
.rp-table-item.occupied { border-left: 3px solid #ef4444; }

.rp-table-icon {
  width: 32px; height: 32px; border-radius: 6px;
  display: flex; align-items: center; justify-content: center;
  font-size: 0.9rem; flex-shrink: 0;
}
.rp-table-icon.status-available { background: #dcfce7; color: #16a34a; }
.rp-table-icon.status-occupied { background: #fecaca; color: #dc2626; }
.rp-table-icon.status-reserved { background: #fef08a; color: #ca8a04; }
.rp-table-icon.status-cleaning { background: #e5e7eb; color: #6b7280; }

.rp-table-info { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.rp-table-num { font-weight: 700; font-size: 0.82rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rp-table-label { font-size: 0.68rem; color: var(--bs-secondary-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rp-table-cap { font-size: 0.68rem; color: var(--bs-secondary-color); flex-shrink: 0; }

/* ═══ Order Panel ═══ */
.rp-order-panel {
  width: 300px; min-width: 280px; display: flex; flex-direction: column;
  background: var(--bs-body-bg, #fff); border-right: 1px solid var(--bs-border-color, #dee2e6);
}
.rp-panel-header {
  display: flex; justify-content: space-between; align-items: flex-start;
  padding: 10px 14px; border-bottom: 1px solid var(--bs-border-color, #dee2e6); flex-shrink: 0; gap: 8px;
}
.rp-panel-header h6 { margin: 0; font-weight: 700; font-size: 0.88rem; display: flex; align-items: center; gap: 5px; }
.rp-panel-header h6 i { color: var(--bs-primary); }

.rp-order-items { flex: 1; overflow-y: auto; padding: 8px 10px; }
.rp-order-item {
  display: flex; flex-direction: column; gap: 8px;
  padding: 10px 12px; border-radius: 8px; border: 1px solid var(--bs-border-color, #dee2e6);
  margin-bottom: 6px; background: var(--bs-tertiary-bg, #f8f9fa);
}
.rp-oi-row1 { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
.rp-oi-name-col { flex: 1; display: flex; flex-direction: column; }
.rp-oi-name { font-weight: 700; font-size: 0.88rem; color: var(--bs-heading-color); line-height: 1.3; }
.rp-oi-note { font-size: 0.72rem; color: var(--bs-secondary-color); margin-top: 2px; }
.rp-btn-del { flex-shrink: 0; padding: 2px !important; }

.rp-oi-row2 { display: flex; justify-content: space-between; align-items: center; }
.rp-qty-ctrl { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
.rp-qty-ctrl .btn { padding: 2px 6px; }
.rp-qty-badge {
  min-width: 24px; text-align: center; font-weight: 800; font-size: 0.9rem;
  color: var(--bs-primary); line-height: 1;
}
.rp-qty-fixed { font-weight: 700; font-size: 0.9rem; color: var(--bs-primary); flex-shrink: 0; }

.rp-oi-price-group { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.rp-oi-price { font-weight: 700; font-size: 0.85rem; color: var(--bs-success, #198754); }


.rp-order-empty {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  color: var(--bs-secondary-color, #6c757d); gap: 6px; padding: 20px; text-align: center;
}

.rp-order-footer {
  border-top: 1px solid var(--bs-border-color, #dee2e6);
  background: var(--bs-body-bg, #fff); flex-shrink: 0;
}
.rp-summary { padding: 10px 14px; }
.rp-sum-row { display: flex; justify-content: space-between; padding: 3px 0; font-size: 0.85rem; }
.rp-sum-row.total { font-weight: 800; font-size: 1rem; color: var(--bs-success); border-top: 1px solid var(--bs-border-color); padding-top: 6px; margin-top: 3px; }
.rp-bottom-actions { padding: 8px 10px; display: flex; gap: 6px; }

.rp-no-selection {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  color: var(--bs-secondary-color, #6c757d); gap: 8px;
}

/* ═══ Menu Panel ═══ */
.rp-menu-panel {
  flex: 1; display: flex; flex-direction: column;
  background: var(--bs-tertiary-bg, #f8f9fa); overflow: hidden;
}
.rp-search-bar { position: relative; flex: 1; max-width: 260px; }
.rp-search-bar i { position: absolute; left: 8px; top: 50%; transform: translateY(-50%); color: var(--bs-secondary-color); font-size: 0.8rem; }
.rp-search-bar input { padding-left: 28px; }

.rp-cat-tabs { display: flex; gap: 4px; padding: 6px 12px; overflow-x: auto; flex-shrink: 0; }
.rp-cat-tabs::-webkit-scrollbar { display: none; }
.rp-cat-tab {
  padding: 3px 12px; border-radius: 20px; border: 1px solid var(--bs-border-color, #dee2e6);
  background: var(--bs-body-bg, #fff); font-size: 0.75rem; white-space: nowrap; cursor: pointer;
  transition: all 0.15s;
}
.rp-cat-tab:hover { border-color: var(--bs-primary); }
.rp-cat-tab.active { background: var(--bs-primary); color: #fff; border-color: var(--bs-primary); }

.rp-product-grid {
  flex: 1; overflow-y: auto; display: grid;
  grid-template-columns: repeat(auto-fill, minmax(155px, 1fr));
  gap: 10px; padding: 10px 12px; align-content: start;
}
.rp-product-card {
  background: var(--bs-body-bg, #fff); border-radius: 12px;
  border: 1.5px solid var(--bs-border-color, #e5e7eb); cursor: pointer; transition: all 0.18s ease;
  position: relative; overflow: hidden; display: flex; flex-direction: column;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
  min-height: 220px;
}
.rp-product-card:hover {
  border-color: var(--bs-primary);
  box-shadow: 0 4px 16px rgba(0, 180, 171, 0.25);
  transform: translateY(-3px);
}
.rp-product-card:active { transform: scale(0.97); }
.rp-product-card.unavailable { opacity: 0.45; pointer-events: none; filter: grayscale(0.5); }
.rp-product-img {
  height: 130px; background: linear-gradient(135deg, #E0F7F5, #B2DFDB);
  display: flex; align-items: center; justify-content: center;
  font-size: 2rem; color: var(--bs-primary); flex-shrink: 0; overflow: hidden; position: relative;
  width: 100%;
}
.rp-product-photo { width: 100%; height: 100%; object-fit: cover; display: block; }
.rp-badge-unavail {
  position: absolute; top: 6px; left: 6px; background: #ef4444; color: #fff;
  font-size: 0.6rem; padding: 2px 8px; border-radius: 10px; font-weight: 700;
  letter-spacing: 0.3px;
}
.rp-product-info {
  padding: 10px 12px; flex: 1; display: flex; flex-direction: column;
  background: var(--bs-body-bg, #fff); 
  min-height: 90px; justify-content: space-between;
}
.rp-product-cat {
  font-size: 0.6rem; color: #009A92; text-transform: uppercase;
  letter-spacing: 0.6px; margin-bottom: 3px; font-weight: 600;
}
.rp-product-name {
  font-weight: 700; font-size: 0.78rem; display: -webkit-box;
  -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden; line-height: 1.3; color: var(--bs-body-color, #1f2937);
}
.rp-product-desc {
  font-size: 0.65rem; color: var(--bs-secondary-color, #9ca3af); margin-top: 2px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; width: 100%;
}
.rp-product-price {
  font-size: 0.82rem; font-weight: 800; color: #009A92;
  margin-top: auto; padding-top: 5px; display: block;
}
.rp-product-badge {
  position: absolute; top: 6px; right: 6px;
  background: var(--bs-primary); color: #fff;
  min-width: 22px; height: 22px; border-radius: 50%; padding: 0 4px;
  display: flex; align-items: center; justify-content: center;
  font-size: 0.7rem; font-weight: 800;
  box-shadow: 0 2px 6px rgba(0,0,0,0.2);
}
.rp-empty-products { grid-column: 1 / -1; text-align: center; padding: 40px; }

/* ═══ Modal ═══ */
.rp-modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.5);
  z-index: 1050; display: flex; align-items: center; justify-content: center;
}
.rp-checkout-modal {
  background: var(--bs-body-bg, #fff); border-radius: 16px;
  width: 460px; max-width: 90vw;
  box-shadow: 0 20px 60px rgba(0,0,0,0.3); overflow: hidden;
}
.rp-modal-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 16px 20px; border-bottom: 1px solid var(--bs-border-color);
}
.rp-modal-header h5 { margin: 0; font-weight: 700; display: flex; align-items: center; gap: 8px; }
.rp-modal-body { padding: 20px; }
.rp-modal-footer {
  display: flex; justify-content: flex-end; gap: 8px;
  padding: 12px 20px; border-top: 1px solid var(--bs-border-color);
}
.rp-checkout-summary {
  padding: 14px; background: var(--bs-tertiary-bg, #f8f9fa);
  border-radius: 10px; margin-bottom: 16px;
}

.rp-loading {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  background: rgba(255,255,255,0.7); z-index: 999;
}
</style>

<!-- Unscoped print styles — must be outside scoped block to target body/layout -->
<style>
@media print {
  /* Hide EVERYTHING first */
  body * {
    visibility: hidden !important;
  }

  /* Then show ONLY the print area and its children */
  #print-area,
  #print-area * {
    visibility: visible !important;
  }

  /* Make print area take over the page */
  #print-area {
    display: block !important;
    position: fixed !important;
    left: 0 !important;
    top: 0 !important;
    width: 80mm !important;
    z-index: 99999 !important;
    background: white !important;
    padding: 5mm !important;
    margin: 0 !important;
    color: black !important;
    font-family: 'Courier New', monospace !important;
    font-size: 12px !important;
  }

  /* Hide sidebar, nav, modals completely */
  #sidebar,
  .sidebar,
  .sidebar-overlay,
  .rp-modal-overlay,
  .rp-loading,
  .modal,
  .toast-container {
    display: none !important;
  }

  /* Remove backgrounds and shadows */
  body, html {
    background: white !important;
    margin: 0 !important;
    padding: 0 !important;
  }

  /* Thermal paper sizing */
  @page {
    size: 80mm auto;
    margin: 2mm;
  }
}
</style>
