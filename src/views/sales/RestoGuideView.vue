<template>
  <div class="guide-view" id="resto-guide-view">
    <!-- Header -->
    <div class="guide-header">
      <div class="guide-header-left">
        <h4 class="guide-title"><i class="bi bi-map text-info"></i> Alur & Panduan Aplikasi</h4>
        <span class="badge bg-info">Smart POS + ERP Resto</span>
      </div>
      <div class="guide-header-right">
        <router-link to="/resto/pos" class="btn btn-sm btn-primary">
          <i class="bi bi-display me-1"></i> Kembali ke POS
        </router-link>
      </div>
    </div>

    <div class="guide-body">
      <!-- ═══ Main Flow Chart ═══ -->
      <section class="guide-section">
        <h5 class="section-title"><i class="bi bi-diagram-3"></i> Alur Transaksi POS</h5>
        <div class="flow-chart">
          <!-- Row 1: Login -->
          <div class="flow-row">
            <div class="flow-node node-start" @click="activeStep = 'login'">
              <div class="flow-icon"><i class="bi bi-box-arrow-in-right"></i></div>
              <div class="flow-label">Login</div>
            </div>
          </div>
          <div class="flow-connector"><i class="bi bi-arrow-down"></i></div>

          <!-- Row 2: Buka Kasir -->
          <div class="flow-row">
            <div class="flow-node node-action" @click="activeStep = 'buka-kasir'">
              <div class="flow-icon"><i class="bi bi-cash-stack"></i></div>
              <div class="flow-label">Buka Kasir</div>
              <div class="flow-sub">Isi kas awal</div>
            </div>
          </div>
          <div class="flow-connector"><i class="bi bi-arrow-down"></i></div>

          <!-- Row 3: Pilih Meja -->
          <div class="flow-row">
            <div class="flow-node node-action" @click="activeStep = 'pilih-meja'">
              <div class="flow-icon"><i class="bi bi-grid-3x3-gap-fill"></i></div>
              <div class="flow-label">Pilih Meja</div>
              <div class="flow-sub">Klik meja kosong</div>
            </div>
          </div>
          <div class="flow-connector"><i class="bi bi-arrow-down"></i></div>

          <!-- Row 4: Tambah Menu -->
          <div class="flow-row">
            <div class="flow-node node-action" @click="activeStep = 'tambah-menu'">
              <div class="flow-icon"><i class="bi bi-cart-plus"></i></div>
              <div class="flow-label">Tambah Menu ke Pesanan</div>
              <div class="flow-sub">Klik item dari katalog</div>
            </div>
          </div>
          <div class="flow-connector"><i class="bi bi-arrow-down"></i></div>

          <!-- Row 5: Simpan / Kirim -->
          <div class="flow-row">
            <div class="flow-node node-action" @click="activeStep = 'simpan'">
              <div class="flow-icon"><i class="bi bi-send"></i></div>
              <div class="flow-label">Simpan / Kirim ke Dapur</div>
              <div class="flow-sub">Klik "Kirim ke Dapur"</div>
            </div>
          </div>
          <div class="flow-connector"><i class="bi bi-arrow-down"></i></div>

          <!-- Row 6: Diamond - Dapur Masak -->
          <div class="flow-row">
            <div class="flow-node node-diamond" @click="activeStep = 'dapur'">
              <div class="diamond-inner">
                <div class="flow-icon"><i class="bi bi-fire"></i></div>
                <div class="flow-label">Dapur Masak</div>
              </div>
            </div>
          </div>

          <!-- Branch connector -->
          <div class="flow-branch">
            <div class="branch-left">
              <div class="flow-connector"><i class="bi bi-arrow-down"></i></div>
              <div class="flow-node node-warning" @click="activeStep = 'bayar'">
                <div class="flow-icon"><i class="bi bi-cash-coin"></i></div>
                <div class="flow-label">Bayar / Checkout</div>
              </div>
              <div class="flow-connector"><i class="bi bi-arrow-down"></i></div>
              <div class="flow-node node-action" @click="activeStep = 'struk'">
                <div class="flow-icon"><i class="bi bi-receipt"></i></div>
                <div class="flow-label">Cetak Struk</div>
              </div>
              <div class="flow-connector"><i class="bi bi-arrow-down"></i></div>
              <div class="flow-node node-end">
                <div class="flow-icon"><i class="bi bi-check-circle"></i></div>
                <div class="flow-label">Meja Kembali Kosong</div>
              </div>
            </div>
            <div class="branch-right">
              <div class="flow-connector"><i class="bi bi-arrow-down"></i></div>
              <div class="flow-node node-kitchen" @click="activeStep = 'kitchen'">
                <div class="flow-icon"><i class="bi bi-fire"></i></div>
                <div class="flow-label">Kitchen Display</div>
              </div>
              <div class="flow-connector"><i class="bi bi-arrow-down"></i></div>
              <div class="flow-node node-action" @click="activeStep = 'kitchen'">
                <div class="flow-icon"><i class="bi bi-arrow-right"></i></div>
                <div class="flow-label">Mulai Masak → Siap → Sajikan</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ═══ Modul ERP ═══ -->
      <section class="guide-section mt-5 border-top pt-5">
        <h5 class="section-title text-success"><i class="bi bi-buildings text-success"></i> Panduan Modul Back-Office (ERP)</h5>
        <div class="feature-grid">
          <div class="feature-card" @click="activeStep = 'erp-hr'">
            <div class="feature-icon bg-info"><i class="bi bi-people"></i></div>
            <h6>HR & Payroll</h6>
            <p>Manajemen karyawan, absensi Waiter via PIN otomatis, penggajian (Slip Gaji), potongan, dan komisi.</p>
          </div>
          <div class="feature-card" @click="activeStep = 'erp-inv'">
            <div class="feature-icon bg-success"><i class="bi bi-box-seam"></i></div>
            <h6>Inventory</h6>
            <p>Manajemen data barang, bahan baku, stok opname, mutasi gudang Pusat & Cabang secara realtime.</p>
          </div>
          <div class="feature-card" @click="activeStep = 'erp-purchasing'">
            <div class="feature-icon bg-primary"><i class="bi bi-cart4"></i></div>
            <h6>Purchasing (PO & Bill)</h6>
            <p>Pemesanan barang ke Supplier (Purchase Order), tagihan bayar (Bills), dan pelunasan bertahap.</p>
          </div>
          <div class="feature-card" @click="activeStep = 'erp-accounting'">
            <div class="feature-icon bg-warning text-dark"><i class="bi bi-journal-check"></i></div>
            <h6>Accounting</h6>
            <p>Pencatatan Buku Besar otomatis (Chart of Accounts), pembuatan Jurnal, dan Laporan Keuangan.</p>
          </div>
        </div>
        <p class="text-muted mt-3 small"><i>*Klik kartu modul di atas untuk melihat alur kerja dari setiap modul Back-Office.</i></p>
      </section>

      <!-- ═══ Fitur Tambahan ═══ -->
      <section class="guide-section mt-4">
        <h5 class="section-title"><i class="bi bi-grid-1x2"></i> Fitur POS Tambahan</h5>
        <div class="feature-grid">
          <div class="feature-card" @click="activeStep = 'pindah-meja'">
            <div class="feature-icon" style="background:#475569"><i class="bi bi-arrow-left-right"></i></div>
            <h6>Pindah Meja</h6>
            <p>Pindahkan pesanan aktif ke meja lain yang kosong</p>
          </div>
          <div class="feature-card" @click="activeStep = 'tutup-kasir'">
            <div class="feature-icon bg-danger"><i class="bi bi-lock"></i></div>
            <h6>Tutup Kasir</h6>
            <p>Rekap shift: kas masuk/keluar, selisih, laporan per metode pembayaran</p>
          </div>
          <div class="feature-card" @click="activeStep = 'laporan'">
            <div class="feature-icon bg-secondary"><i class="bi bi-bar-chart-line"></i></div>
            <h6>Laporan Harian</h6>
            <p>Omset harian, breakdown transaksi, dan filter per tanggal</p>
          </div>
        </div>
      </section>

      <!-- ═══ Detail Panel (Sidebar-like) ═══ -->
      <transition name="slide-up">
        <section v-if="activeStep" class="guide-detail">
          <div class="detail-header">
            <h5 class="mb-0"><i class="bi bi-info-circle me-2"></i>{{ stepDetails[activeStep]?.title }}</h5>
            <button class="btn-close btn-close-white" @click="activeStep = null"></button>
          </div>
          <div class="detail-body">
            <div class="detail-steps" v-if="stepDetails[activeStep]?.steps">
              <div v-for="(step, idx) in stepDetails[activeStep].steps" :key="idx" class="detail-step">
                <div class="step-num">{{ idx + 1 }}</div>
                <div class="step-text" v-html="step"></div>
              </div>
            </div>
            <div class="detail-note" v-if="stepDetails[activeStep]?.note">
              <i class="bi bi-lightbulb me-2 text-warning"></i>
              <span v-html="stepDetails[activeStep].note"></span>
            </div>
          </div>
        </section>
      </transition>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const activeStep = ref(null)

const stepDetails = {
  'login': {
    title: 'Login ke Aplikasi',
    steps: [
      'Buka aplikasi di browser (otomatis diarahkan ke halaman Login)',
      'Masukkan <strong>Email</strong> dan <strong>Password</strong>',
      'Klik tombol <strong>"Masuk ke Kasir"</strong> untuk Mode Kasir atau pilih Modul ERP dari bilah sebelah kiri.',
      'Jika akun terdaftar di lebih dari satu perusahaan, pilih perusahaan yang diinginkan'
    ],
    note: 'Sesi login berlaku 30 menit. Jika tidak aktif, Anda akan otomatis logout.'
  },
  'buka-kasir': {
    title: 'Buka Kasir (Mulai Shift)',
    steps: [
      'Setelah login, modal <strong>"Buka Kasir"</strong> akan muncul otomatis jika Hak Akses Kasir.',
      'Pilih <strong>Shift / Jadwal</strong> dan <strong>Waiter/Kasir Absen (jika pakai PIN)</strong>.',
      'Masukkan nominal <strong>Uang Kas Awal</strong> (modal/deposit).',
      'Klik <strong>"Buka Kasir"</strong> untuk memulai sesi kerja.'
    ],
    note: 'Sesi kasir wajib dibuka sebelum bisa melakukan transaksi apapun. Absensi otomatis ditarik ke ERP HR.'
  },
  'pilih-meja': {
    title: 'Pilih Meja',
    steps: [
      'Di panel <strong>kiri</strong>, lihat daftar semua meja',
      'Meja berstatus <strong class="text-success">Kosong</strong> bisa dipilih untuk pesanan baru',
      'Meja berstatus <strong class="text-danger">Terisi</strong> sudah memiliki pesanan aktif',
      'Gunakan dropdown <strong>"Semua Ruangan"</strong> untuk filter per lantai/area',
      'Klik meja yang diinginkan → panel tengah & kanan akan aktif'
    ],
    note: 'Anda juga bisa melihat layout visual meja di halaman <strong>Denah Meja</strong>.'
  },
  'tambah-menu': {
    title: 'Tambah Menu ke Pesanan',
    steps: [
      'Setelah memilih meja, lihat <strong>Katalog Menu</strong> di panel kanan',
      'Klik item menu yang ingin ditambahkan → otomatis masuk ke keranjang',
      'Gunakan filter kategori (Beverage, Main Course, dll) atau cari di kolom pencarian',
      'Atur jumlah dengan tombol <strong>+</strong> / <strong>-</strong> di panel tengah'
    ],
    note: 'Menu yang sudah ditandai "Habis" oleh admin tidak akan muncul di katalog.'
  },
  'simpan': {
    title: 'Simpan / Kirim ke Dapur',
    steps: [
      'Setelah menambahkan item, klik <strong>"Kirim ke Dapur"</strong> (tombol biru)',
      'Pesanan akan terkirim ke server dan muncul di <strong>Kitchen Display</strong>',
      'Status meja berubah menjadi <strong class="text-danger">Terisi</strong>',
      'Untuk menambahkan item lagi, klik menu → klik <strong>"Simpan"</strong>'
    ],
    note: 'Tombol "Kirim ke Dapur" untuk pesanan baru. Tombol "Simpan" untuk update pesanan yang sudah ada.'
  },
  'dapur': {
    title: 'Proses di Dapur',
    steps: [
      'Pesanan yang dikirim muncul sebagai tiket di <strong>Kitchen Display</strong>',
      'Koki klik <strong>"MULAI MASAK"</strong> untuk menandai pesanan sedang diproses',
      'Klik setiap item untuk mengubah status: Pending → Dimasak → Siap',
      'Ketika semua item siap, klik <strong>"SEMUA SIAP"</strong>',
      'Klik <strong>"PANGGIL & SAJIKAN"</strong> ketika makanan diantar ke pelanggan'
    ],
    note: 'Timer berubah warna: 🟢 Hijau (<15 menit) → 🟡 Kuning (15-25 menit) → 🔴 Merah (>25 menit, berkedip).'
  },
  'bayar': {
    title: 'Pembayaran / Checkout',
    steps: [
      'Klik tombol <strong>"Bayar"</strong> di panel tengah atau footer',
      'Pilih metode pembayaran: <strong>Tunai, QRIS, Transfer, atau Debit</strong>',
      'Untuk tunai: masukkan nominal pembayaran → lihat kembalian otomatis',
      'Untuk QRIS: QR Code akan ditampilkan untuk di-scan pelanggan',
      'Klik <strong>"Konfirmasi Pembayaran"</strong> untuk menyelesaikan',
      'Struk pembayaran akan muncul untuk dicetak'
    ],
    note: 'Penjualan Otomatis masuk ke Jurnal Penjualan ERP (Accounting) jika diaktifkan.'
  },
  'struk': {
    title: 'Cetak Struk',
    steps: [
      'Setelah pembayaran dikonfirmasi, modal struk otomatis muncul',
      'Struk berisi: nama resto, tanggal, kasir, item, total, metode bayar, kembalian',
      'Klik <strong>"Cetak Struk"</strong> untuk mencetak ke printer',
      'Klik <strong>"Tutup"</strong> jika tidak ingin mencetak'
    ]
  },
  'kitchen': {
    title: 'Kitchen Display System (KDS)',
    steps: [
      'Buka menu <strong>"Kitchen Display"</strong> di sidebar',
      'Klik <strong>"Aktifkan Audio"</strong> untuk notifikasi suara pesanan baru',
      'Setiap pesanan tampil sebagai kartu dengan nomor meja dan daftar item',
      'Klik item untuk mengubah status: <strong>Pending → Dimasak → Siap</strong>',
      'Gunakan tombol di bawah kartu: <strong>MULAI MASAK → SEMUA SIAP → SAJIKAN</strong>'
    ],
    note: 'Data auto-refresh setiap 5 detik. Pesanan baru akan membunyikan notifikasi.'
  },
  'pindah-meja': {
    title: 'Pindah Meja',
    steps: [
      'Pilih meja yang <strong>sudah memiliki pesanan aktif</strong> (status Terisi)',
      'Klik tombol <strong>↔</strong> (ikon panah kiri-kanan) di header panel pesanan',
      'Modal akan menampilkan daftar meja yang <strong>kosong/tersedia</strong>',
      'Klik meja tujuan yang diinginkan dari daftar',
      'Klik <strong>"Pindahkan"</strong> untuk mengonfirmasi perpindahan',
      'Pesanan berpindah, meja lama menjadi Kosong, meja baru menjadi Terisi'
    ]
  },
  'tutup-kasir': {
    title: 'Tutup Kasir (Akhir Shift)',
    steps: [
      'Di header POS, klik tombol <strong>"Tutup"</strong> (merah)',
      'Modal laporan shift muncul: kasir, waktu, jumlah transaksi, kas masuk/keluar',
      'Masukkan <strong>Uang Fisik Aktual</strong> yang ada di laci kas',
      'Sistem menghitung <strong>selisih</strong> otomatis (surplus/defisit)',
      'Klik <strong>"Tutup Shift Sekarang"</strong> untuk menutup sesi. Absensi Waiter dicatat Pulang.'
    ]
  },
  'laporan': {
    title: 'Laporan Harian Resto',
    steps: [
      'Buka menu <strong>"Laporan Harian Resto"</strong> di sidebar',
      'Lihat total transaksi dan omset per hari',
      'Breakdown per metode pembayaran (Tunai, QRIS, Transfer, Debit)',
      'Filter berdasarkan <strong>rentang tanggal</strong> yang diinginkan'
    ]
  },
  // --- Modul ERP ---
  'erp-hr': {
    title: 'Alur HR & Payroll',
    steps: [
      '<strong>1. Master Data Karyawan:</strong> HR/Manager menambahkan Karyawan/Waiter di menu Data Karyawan ERP.',
      '<strong>2. Absensi Terintegrasi:</strong> Waiter melakukan Clock-In saat masuk POS menggunakan PIN rahasia. Data ditarik otomatis ke menu <strong>Kehadiran</strong>.',
      '<strong>3. Komisi Otomatis:</strong> Setiap transaksi restoran yang dibantu Waiter akan otomatis dihitung insentif sesuai Rate (%), dan ditarik ke Slip Gaji.',
      '<strong>4. Cetak Slip:</strong> Buka menu <strong>Slip Gaji</strong> → Klik Generate Payroll → Slip jadi memuat Gaji, Insentif (Bonus Waiter), hingga POTONGAN otomatis.'
    ],
    note: 'Pastikan "Waiter" di pengaturan POS divalidasi ke karyawan HR yang valid agar komisi dibayarkan akurat.'
  },
  'erp-inv': {
    title: 'Alur Inventory (Stok Barang)',
    steps: [
      '<strong>1. Master Barang:</strong> Daftarkan bahan mentah (beras, sayur, daging, saos) di menu <strong>Master Items</strong>.',
      '<strong>2. Gudang & Lokasi:</strong> Modul Inventori memantau Stok antar Pusat Resto dan Cabang.',
      '<strong>3. Mutasi Kasir otomatis:</strong> Anda dapat memberlakukan relasi resep: saat Nasi Goreng terjual di POS, otomatis stok Beras berkurang di Inventory.',
      '<strong>4. Stok Opname:</strong> Lakukan pencocokan Stok pada akhir bulan. Buka menu <strong>Stok Opname</strong> → Isi Jumlah Aktual → Sistem akan memotong/naikkan perbedaan ke laporan Jurnal.'
    ]
  },
  'erp-purchasing': {
    title: 'Alur Purchasing (Pembelian)',
    steps: [
      '<strong>1. Daftar Supplier:</strong> Data suplier didaftarkan di menu <strong>Suppliers</strong>. (Misal: Agen Telur, Pemasok Daging).',
      '<strong>2. Order Barang (PO):</strong> Buka menu <strong>Purchase Order</strong> → Tulis kebutuhan bahan.',
      '<strong>3. Terima Barang (GR):</strong> Saat pesanan datang, konfirmasi masuk melalui fitur Goods Receipt. Stok di Inventori bertambah otomatis.',
      '<strong>4. Tagihan (Bills):</strong> Setelah stok masuk, daftarkan hutang ke Supplier di menu <strong>Bills</strong>.',
      '<strong>5. Pelunasan:</strong> Lakukan pembayaran tagihan menggunakan Saldo Rekening/Kas. Tagihan berubah menjadi PAID.'
    ]
  },
  'erp-accounting': {
    title: 'Alur Accounting & Keuangan',
    steps: [
      '<strong>1. Chart of Accounts:</strong> Penyesuaian kode klasifikasi Keuangan (Misal: 1-1002 Kas Resto, 4-1001 Omzet).',
      '<strong>2. Auto-Jurnal Integrasi:</strong>',
      '&nbsp; • Penjualan Kasir POS otomatis direkap ke <strong>Jurnal Penjualan Restoran</strong>.',
      '&nbsp; • Pembayaran Tagihan Supplier (Purchasing) otomatis masuk ke <strong>Pengeluaran Keuangan</strong>.',
      '&nbsp; • Generate Slip Gaji (HR) langsung dibukukan menjadi <strong>Beban Gaji & Komisi</strong>.',
      '<strong>3. Buku Besar Manual:</strong> Akuntan dapat menambah Jurnal Umum terpisah (Contoh: Beban Listrik, Iuran RT).',
      '<strong>4. Neraca Laporan:</strong> Keseluruhan dari kas, piutang, hutang (Supplier AP), dan modal diringkas dalam Laporan Neraca & Laba Rugi akhir bulan.'
    ],
    note: 'Jika semua Modul (POS, HR, Purchasing) diaktifkan, 80% laporan keuangan harian dan akhir bulan sudah berjalan secara Otopilot.'
  }
}
</script>

<style scoped>
.guide-view {
  display: flex;
  flex-direction: column;
  min-height: calc(100vh - 60px);
  background: #1a1d23;
  color: #e2e8f0;
  font-family: 'Inter', -apple-system, sans-serif;
}

/* Header */
.guide-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  background: #22262e;
  border-bottom: 1px solid #2d3139;
}
.guide-header-left { display: flex; align-items: center; gap: 12px; }
.guide-title {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 700;
  color: #f1f5f9;
}
.guide-title i { color: #38bdf8; }

/* Body */
.guide-body {
  flex: 1;
  overflow-y: auto;
  padding: 32px;
  max-width: 1100px;
  margin: 0 auto;
  width: 100%;
}

/* Sections */
.guide-section {
  margin-bottom: 48px;
}
.section-title {
  font-weight: 700;
  font-size: 1.1rem;
  color: #94a3b8;
  margin-bottom: 24px;
  display: flex;
  align-items: center;
  gap: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-size: 0.9rem;
}
.section-title i { color: #38bdf8; }

/* ═══ Flow Chart ═══ */
.flow-chart {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
}

.flow-row {
  display: flex;
  justify-content: center;
}

.flow-node {
  background: #2a2e37;
  border: 2px solid #3b4049;
  border-radius: 12px;
  padding: 16px 28px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s ease;
  min-width: 220px;
}
.flow-node:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0,0,0,0.3);
}

.flow-icon {
  font-size: 1.4rem;
  margin-bottom: 6px;
}
.flow-label {
  font-weight: 700;
  font-size: 0.95rem;
  color: #f1f5f9;
}
.flow-sub {
  font-size: 0.75rem;
  color: #64748b;
  margin-top: 4px;
}

/* Node types */
.node-start {
  background: linear-gradient(135deg, #00B4AB, #059669);
  border-color: #10b981;
  color: #fff;
}
.node-start .flow-icon, .node-start .flow-label { color: #fff; }

.node-action {
  background: #2a2e37;
  border-color: #475569;
}
.node-action .flow-icon { color: #38bdf8; }

.node-warning {
  background: linear-gradient(135deg, #d97706, #b45309);
  border-color: #f59e0b;
}
.node-warning .flow-icon, .node-warning .flow-label { color: #fff; }

.node-kitchen {
  background: linear-gradient(135deg, #ea580c, #c2410c);
  border-color: #f97316;
}
.node-kitchen .flow-icon, .node-kitchen .flow-label { color: #fff; }

.node-end {
  background: #1e293b;
  border-color: #334155;
  border-style: dashed;
}
.node-end .flow-icon { color: #22c55e; }

/* Diamond */
.node-diamond {
  background: transparent;
  border: none;
  padding: 0;
  min-width: auto;
}
.node-diamond:hover { transform: none; box-shadow: none; }
.diamond-inner {
  width: 160px;
  height: 100px;
  background: #2a2e37;
  border: 2px solid #475569;
  transform: rotate(0deg);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%);
  cursor: pointer;
}
.diamond-inner .flow-icon { color: #f59e0b; font-size: 1.2rem; }
.diamond-inner .flow-label { font-size: 0.8rem; }

.flow-connector {
  display: flex;
  justify-content: center;
  padding: 8px 0;
  color: #475569;
  font-size: 1.2rem;
}

/* Branch */
.flow-branch {
  display: flex;
  justify-content: center;
  gap: 80px;
  margin-top: 0;
}
.branch-left, .branch-right {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
}

/* ═══ Feature Grid ═══ */
.feature-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}
.feature-card {
  background: #22262e;
  border: 1px solid #2d3139;
  border-radius: 14px;
  padding: 24px;
  cursor: pointer;
  transition: all 0.2s ease;
}
.feature-card:hover {
  border-color: #38bdf8;
  transform: translateY(-3px);
  box-shadow: 0 8px 30px rgba(56,189,248,0.1);
}
.feature-card h6 { font-weight: 700; color: #f1f5f9; margin-bottom: 6px; }
.feature-card p { font-size: 0.82rem; color: #94a3b8; margin: 0; line-height: 1.5; }
.feature-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.2rem;
  margin-bottom: 14px;
  color: #fff;
}

/* ═══ Detail Panel ═══ */
.guide-detail {
  background: #22262e;
  border: 1px solid #38bdf8;
  border-radius: 16px;
  margin-bottom: 40px;
  overflow: hidden;
  box-shadow: 0 12px 40px rgba(56,189,248,0.12);
}
.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  background: linear-gradient(135deg, #0369a1, #0284c7);
  color: #fff;
}
.detail-header h5 { font-weight: 700; font-size: 1rem; }
.detail-body { padding: 24px; }
.detail-steps { display: flex; flex-direction: column; gap: 14px; }
.detail-step {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}
.step-num {
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  background: #334155;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 0.85rem;
  color: #38bdf8;
}
.step-text {
  font-size: 0.9rem;
  line-height: 1.6;
  color: #cbd5e1;
  padding-top: 3px;
}

.detail-note {
  margin-top: 20px;
  padding: 14px 18px;
  background: rgba(250,204,21,0.08);
  border: 1px solid rgba(250,204,21,0.2);
  border-radius: 10px;
  font-size: 0.85rem;
  color: #fbbf24;
  line-height: 1.5;
}

/* Transition */
.slide-up-enter-active, .slide-up-leave-active {
  transition: all 0.3s ease;
}
.slide-up-enter-from, .slide-up-leave-to {
  opacity: 0;
  transform: translateY(20px);
}

/* Responsive */
@media (max-width: 768px) {
  .flow-branch { flex-direction: column; gap: 24px; }
  .daily-connector { transform: rotate(90deg); justify-content: center; }
  .feature-grid { grid-template-columns: 1fr; }
  .guide-body { padding: 16px; }
}
</style>
