<template>
  <div>
    <div class="page-header">
      <div>
        <h1>Skenario Testing Manual</h1>
        <span class="breadcrumb-custom">Settings / Skenario Testing</span>
      </div>
      <button class="btn btn-primary" @click="downloadPDF" :disabled="generating">
        <span v-if="generating"><span class="spinner-border spinner-border-sm me-1"></span>Generating...</span>
        <span v-else><i class="bi bi-file-earmark-pdf me-1"></i>Download PDF</span>
      </button>
    </div>
    <div class="card">
      <div class="card-body">
        <div class="text-center py-4">
          <i class="bi bi-file-earmark-check display-3 text-primary d-block mb-3"></i>
          <h4>Dokumen Skenario Testing Manual</h4>
          <p class="text-muted mb-4">Klik tombol di atas untuk mengunduh dokumen PDF berisi skenario testing lengkap<br>dari modul Login hingga RBAC & Multi-Branch.</p>
          <div class="row justify-content-center g-3">
            <div class="col-auto" v-for="s in sections" :key="s.icon">
              <div class="border rounded-3 p-3 text-center" style="width:140px">
                <i :class="'bi bi-' + s.icon + ' fs-3 text-primary d-block mb-1'"></i>
                <div class="small fw-semibold">{{ s.label }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useToast } from '@/composables/useToast'
import { jsPDF } from 'jspdf'

const generating = ref(false)
const toast = useToast()
const sections = [
  { icon: 'key', label: 'Login' },
  { icon: 'speedometer2', label: 'Dashboard' },
  { icon: 'cart-check', label: 'Penjualan' },
  { icon: 'tv', label: 'POS' },
  { icon: 'bag-check', label: 'Pembelian' },
  { icon: 'boxes', label: 'Inventori' },
  { icon: 'journal-text', label: 'Akuntansi' },
  { icon: 'gear', label: 'Settings' },
  { icon: 'shield-lock', label: 'RBAC' },
  { icon: 'people', label: 'Akun Test' }
]

function downloadPDF() {
  generating.value = true
  try {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pw = doc.internal.pageSize.getWidth()
    const ph = doc.internal.pageSize.getHeight()
    const m = 15
    const cw = pw - m * 2
    let y = 0
    let pg = 1
    const P = [79, 70, 229]
    const D = [33, 33, 33]
    const G = [100, 100, 100]

    function cp(n) {
      if (y + n > ph - 20) {
        doc.setFontSize(8); doc.setTextColor(150, 150, 150)
        doc.text('Skenario Testing Manual - ERP System', m, ph - 8)
        doc.text('Halaman ' + pg, pw - m, ph - 8, { align: 'right' })
        doc.addPage(); pg++; y = 20
      }
    }
    function title(t) { cp(20); doc.setFontSize(18); doc.setTextColor(...P); doc.setFont(undefined, 'bold'); doc.text(t, m, y); y += 8; doc.setDrawColor(...P); doc.setLineWidth(0.8); doc.line(m, y, pw - m, y); y += 8 }
    function sub(t) { cp(14); doc.setFontSize(13); doc.setTextColor(...D); doc.setFont(undefined, 'bold'); doc.text(t, m, y); y += 7 }
    function txt(t, indent) { cp(7); const x = m + (indent || 0); doc.setFontSize(9); doc.setTextColor(...D); doc.setFont(undefined, 'normal'); doc.splitTextToSize(t, cw - (indent || 0)).forEach(l => { cp(5); doc.text(l, x, y); y += 4.5 }) }
    function step(n, desc, exp) {
      cp(16); doc.setFontSize(9); doc.setFont(undefined, 'bold'); doc.setTextColor(...P)
      doc.text('Step ' + n + ':', m + 4, y)
      doc.setFont(undefined, 'normal'); doc.setTextColor(...D)
      const dl = doc.splitTextToSize(desc, cw - 24); doc.text(dl, m + 22, y); y += dl.length * 4.5
      if (exp) { doc.setFont(undefined, 'italic'); doc.setTextColor(...G); doc.splitTextToSize('Expected: ' + exp, cw - 10).forEach(l => { cp(5); doc.text(l, m + 10, y); y += 4.5 }) }
      y += 2
    }
    function chk(t) { cp(7); doc.setDrawColor(150, 150, 150); doc.setLineWidth(0.3); doc.rect(m + 4, y - 3, 3.5, 3.5); doc.setFontSize(9); doc.setTextColor(...D); doc.setFont(undefined, 'normal'); doc.splitTextToSize(t, cw - 14).forEach(l => { doc.text(l, m + 10, y); y += 4.5 }); y += 1 }
    function gap() { y += 6 }
    function tRow(cols, isH) {
      cp(8); const ws = [12, 50, 50, cw - 112]; let x = m
      if (isH) { doc.setFillColor(...P); doc.rect(m, y - 4, cw, 7, 'F'); doc.setTextColor(255, 255, 255); doc.setFont(undefined, 'bold') }
      else { doc.setTextColor(...D); doc.setFont(undefined, 'normal'); doc.setDrawColor(220, 220, 220); doc.line(m, y + 2.5, pw - m, y + 2.5) }
      doc.setFontSize(8); cols.forEach((c, i) => { doc.text(String(c), x + 1, y, { maxWidth: ws[i] - 2 }); x += ws[i] }); y += isH ? 5 : 5.5
    }

    // COVER
    y = 60
    doc.setFontSize(32); doc.setTextColor(...P); doc.setFont(undefined, 'bold')
    doc.text('SKENARIO TESTING', pw / 2, y, { align: 'center' }); y += 12
    doc.text('MANUAL', pw / 2, y, { align: 'center' }); y += 16
    doc.setFontSize(16); doc.setTextColor(...D); doc.setFont(undefined, 'normal')
    doc.text('ERP System - ERPsys', pw / 2, y, { align: 'center' }); y += 10
    doc.setFontSize(11); doc.setTextColor(...G)
    const today = new Date().toISOString().split('T')[0]
    doc.text('Versi 1.0 | ' + today, pw / 2, y, { align: 'center' }); y += 30
    doc.setDrawColor(...P); doc.setLineWidth(1); doc.line(60, y, pw - 60, y); y += 15
    doc.setFontSize(10); doc.setTextColor(...D); doc.setFont(undefined, 'bold')
    doc.text('Daftar Isi:', m + 10, y); y += 7
    doc.setFont(undefined, 'normal'); doc.setFontSize(9)
    ;['1. Login & Autentikasi', '2. Dashboard & Navigasi', '3. Penjualan (SO, Invoice, Retur)', '4. POS (Point of Sale)', '5. Pembelian (PO, Tagihan, Retur)', '6. Inventori (Barang, Kategori, Gudang)', '7. Akuntansi (Jurnal, CoA, Laporan)', '8. Settings (User, Roles, Audit Trail)', '9. RBAC & Multi-Branch', '10. Data Akun Testing'].forEach(i => { doc.text(i, m + 14, y); y += 5.5 })
    doc.setFontSize(8); doc.setTextColor(150, 150, 150)
    doc.text('Skenario Testing Manual - ERP System', m, ph - 8)
    doc.text('Halaman ' + pg, pw - m, ph - 8, { align: 'right' })

    // 1. LOGIN
    doc.addPage(); pg++; y = 20
    title('1. Login & Autentikasi')
    sub('1.1 Login Berhasil')
    step(1, 'Buka aplikasi di browser (http://localhost:5173)', 'Halaman login muncul dengan form username & password')
    step(2, 'Masukkan username: admin, password: admin123', 'Field terisi')
    step(3, 'Klik tombol Login', 'Redirect ke Dashboard, nama user terlihat di header')
    step(4, 'Cek sidebar menu', 'Semua menu tersedia untuk role Super Admin')
    gap()
    sub('1.2 Login Gagal')
    step(1, 'Masukkan username: admin, password: salah123', 'Muncul pesan error "Username atau password salah"')
    step(2, 'Kosongkan username, klik Login', 'Validasi form: field required')
    gap()
    sub('1.3 Logout')
    step(1, 'Klik nama user di pojok kanan atas', 'Dropdown menu muncul')
    step(2, 'Klik "Keluar"', 'Redirect ke halaman login, session terhapus')
    gap()

    // 2. DASHBOARD
    title('2. Dashboard & Navigasi')
    sub('2.1 Dashboard Overview')
    step(1, 'Login sebagai admin, pastikan di Dashboard', 'Terlihat 4 stat card: Penjualan, Piutang, Hutang, Stok Menipis')
    step(2, 'Cek chart Tren Penjualan', 'Bar chart 7 hari terakhir muncul dengan data')
    step(3, 'Cek Pending Approvals', 'List SO/PO yang pending muncul')
    step(4, 'Cek Quick Actions', 'Tombol aksi cepat sesuai permission role')
    gap()
    sub('2.2 Dashboard Flexible Layout')
    step(1, 'Logout, login sebagai kasir (kasir/kasir123)', 'Dashboard tampil tanpa kolom kosong')
    step(2, 'Cek card yang muncul', 'Hanya card yang sesuai permission, tidak ada gap/kosong')
    step(3, 'Logout, login sebagai gudang (gudang/gudang123)', 'Card inventory muncul, card sales/finance tidak ada gap')
    gap()
    sub('2.3 Pindah Cabang')
    step(1, 'Login sebagai admin', 'Terlihat dropdown cabang di header')
    step(2, 'Pilih cabang "Surabaya"', 'Dashboard data berubah sesuai cabang Surabaya')
    step(3, 'Pilih kembali cabang "Jakarta"', 'Data kembali ke Jakarta')
    gap()

    // 3. PENJUALAN
    doc.addPage(); pg++; y = 20
    title('3. Modul Penjualan')
    sub('3.1 Sales Order - Buat Baru')
    step(1, 'Navigasi ke Penjualan > Sales Order', 'Tabel SO muncul dengan data existing')
    step(2, 'Klik "Buat SO"', 'Modal form muncul')
    step(3, 'Isi tanggal, pilih pelanggan, pilih gudang', 'Form terisi')
    step(4, 'Tambah item: pilih barang, qty, harga', 'Baris item muncul, subtotal terhitung')
    step(5, 'Klik "Simpan"', 'SO baru muncul di tabel, status = draft')
    step(6, 'Cek Audit Trail', 'Entry "Membuat SO xxx" tercatat')
    gap()
    sub('3.2 Sales Order - Submit & Approve')
    step(1, 'Klik tombol Submit pada SO draft', 'Status berubah ke "pending"')
    step(2, 'Klik tombol Approve', 'Status berubah ke "approved"')
    step(3, 'Cek Audit Trail', 'Entry submit & approve tercatat')
    gap()
    sub('3.3 Sales Order - Reject')
    step(1, 'Buat SO baru, submit', 'SO status pending')
    step(2, 'Klik tombol Reject', 'Status berubah ke "rejected"')
    gap()
    sub('3.4 Pelanggan - CRUD')
    step(1, 'Navigasi ke Penjualan > Pelanggan', 'Tabel pelanggan muncul')
    step(2, 'Klik "Tambah Pelanggan", isi form, klik Simpan', 'Pelanggan baru muncul di tabel')
    step(3, 'Klik tombol Edit', 'Modal form terisi data, ubah dan simpan')
    step(4, 'Klik tombol Delete', 'Pelanggan terhapus dari tabel')
    step(5, 'Cek Audit Trail', 'Entry create, edit, delete tercatat')
    gap()
    sub('3.5 Invoice - PDF')
    step(1, 'Navigasi ke Penjualan > Invoice', 'Tabel invoice muncul')
    step(2, 'Klik tombol PDF pada invoice', 'File PDF terdownload: "Invoice xxx.pdf"')
    step(3, 'Buka file PDF', 'Isi invoice lengkap: header, detail item, total')
    gap()
    sub('3.6 Retur Penjualan')
    step(1, 'Navigasi ke Penjualan > Retur Penjualan', 'Tabel retur muncul')
    step(2, 'Klik "Buat Retur", pilih SO, centang item, isi alasan', 'Form terisi')
    step(3, 'Klik Simpan Retur', 'Retur baru muncul, status = draft')
    step(4, 'Klik Approve / Tolak / Edit', 'Aksi berfungsi, audit tercatat')
    gap()

    // 4. POS
    doc.addPage(); pg++; y = 20
    title('4. POS (Point of Sale)')
    step(1, 'Navigasi ke Penjualan > POS', 'Tampilan POS fullscreen muncul')
    step(2, 'Cari barang di search bar', 'Produk terfilter sesuai pencarian')
    step(3, 'Klik produk untuk menambahkan ke keranjang', 'Item muncul di sidebar keranjang, qty = 1')
    step(4, 'Ubah qty di keranjang', 'Subtotal berubah otomatis')
    step(5, 'Klik "Bayar"', 'Modal pembayaran muncul')
    step(6, 'Isi nominal bayar, klik "Proses Pembayaran"', 'Transaksi selesai, kembalian ditampilkan')
    gap()

    // 5. PEMBELIAN
    title('5. Modul Pembelian')
    sub('5.1 Purchase Order')
    step(1, 'Navigasi ke Pembelian > Purchase Order', 'Tabel PO muncul')
    step(2, 'Klik "Buat PO", isi form (supplier, gudang, item)', 'PO tersimpan, status = draft')
    step(3, 'Submit > Approve/Reject PO', 'Status berubah sesuai aksi')
    step(4, 'Cek Audit Trail', 'Entry create, submit, approve/reject tercatat')
    gap()
    sub('5.2 Supplier - CRUD')
    step(1, 'Navigasi ke Pembelian > Supplier', 'Tabel supplier muncul')
    step(2, 'Tambah, Edit, Delete supplier', 'CRUD berfungsi, audit tercatat')
    gap()
    sub('5.3 Tagihan Pembelian')
    step(1, 'Navigasi ke Pembelian > Tagihan', 'Tabel tagihan muncul dengan data')
    step(2, 'Klik tombol Bayar', 'Status berubah ke "Lunas"')
    step(3, 'Klik tombol PDF', 'File PDF terdownload')
    step(4, 'Cek Audit Trail', 'Pembayaran tercatat')
    gap()
    sub('5.4 Retur Pembelian')
    step(1, 'Navigasi ke Pembelian > Retur Pembelian', 'Tabel retur muncul')
    step(2, 'Klik "Buat Retur", pilih PO, centang item, alasan', 'Retur tersimpan draft')
    step(3, 'Approve / Tolak / Edit retur', 'Aksi berfungsi, audit tercatat')
    gap()

    // 6. INVENTORI
    doc.addPage(); pg++; y = 20
    title('6. Modul Inventori')
    sub('6.1 Master Barang & Kategori')
    step(1, 'Navigasi ke Inventori > Barang', 'Tabel barang muncul')
    step(2, 'Tambah, Edit, Delete barang', 'CRUD berfungsi, audit tercatat')
    step(3, 'Navigasi ke Inventori > Kategori', 'Tabel kategori muncul')
    step(4, 'Tambah, Edit, Delete kategori', 'CRUD berfungsi')
    gap()
    sub('6.2 Stok per Gudang')
    step(1, 'Navigasi ke Gudang > Stok', 'Tabel stok per gudang muncul')
    step(2, 'Cek indikator stok menipis', 'Item stok <= min stock ditandai "Menipis"')
    gap()
    sub('6.3 Penerimaan Barang')
    step(1, 'Navigasi ke Gudang > Penerimaan', 'Tabel penerimaan muncul')
    step(2, 'Klik "Terima Barang", pilih PO (approved)', 'Item & qty otomatis terisi dari PO')
    step(3, 'Pilih gudang tujuan, Simpan', 'Penerimaan tercatat, audit tercatat')
    gap()
    sub('6.4 Pengeluaran Barang')
    step(1, 'Navigasi ke Gudang > Pengeluaran', 'Tabel pengeluaran muncul')
    step(2, 'Klik "Keluarkan Barang", pilih SO (approved)', 'Item & qty terisi dari SO')
    step(3, 'Pilih gudang asal, Simpan', 'Pengeluaran tercatat, audit tercatat')
    gap()
    sub('6.5 Transfer Stok')
    step(1, 'Navigasi ke Gudang > Transfer', 'Tabel transfer muncul')
    step(2, 'Klik "Buat Transfer", pilih gudang asal & tujuan', 'Dropdown gudang muncul')
    step(3, 'Tambah item, isi qty, Simpan', 'Transfer tercatat, audit tercatat')
    gap()
    sub('6.6 Stok Opname')
    step(1, 'Navigasi ke Gudang > Stok Opname', 'Tabel opname muncul')
    step(2, 'Klik "Buat Opname", pilih gudang', 'Item stok otomatis dimuat')
    step(3, 'Ubah stok aktual, Simpan, lalu Approve', 'Opname tersimpan & approved, audit tercatat')
    step(4, 'Klik Detail (eye icon)', 'Detail per item muncul')
    gap()

    // 7. AKUNTANSI
    doc.addPage(); pg++; y = 20
    title('7. Modul Akuntansi')
    sub('7.1 Jurnal Umum')
    step(1, 'Navigasi ke Akuntansi > Jurnal', 'Tabel jurnal muncul')
    step(2, 'Klik "Buat Jurnal", isi tanggal, deskripsi', 'Form muncul')
    step(3, 'Tambah baris: akun, debit, kredit', 'Total debit & kredit terhitung')
    step(4, 'Pastikan debit != kredit lalu simpan', 'Error "Debit dan Kredit harus balance!"')
    step(5, 'Balance-kan, Simpan', 'Jurnal tersimpan, audit tercatat')
    gap()
    sub('7.2 Chart of Accounts')
    step(1, 'Navigasi ke Akuntansi > CoA', 'Tabel akun muncul')
    step(2, 'Tambah, Edit, Delete akun', 'CRUD berfungsi, audit tercatat')
    gap()
    sub('7.3 Laporan Keuangan')
    step(1, 'Navigasi ke Akuntansi > Laporan', 'Halaman laporan muncul')
    step(2, 'Klik "Export PDF"', 'PDF terdownload: "Laporan Keuangan yyyy-mm-dd.pdf"')
    gap()

    // 8. SETTINGS
    title('8. Settings & Audit Trail')
    sub('8.1 Audit Trail')
    step(1, 'Navigasi ke Settings > Audit Trail', 'Tabel audit log muncul')
    step(2, 'Filter modul: pilih "Penjualan"', 'Hanya log modul penjualan')
    step(3, 'Filter aksi: pilih "create"', 'Hanya log create')
    step(4, 'Search: ketik nama user', 'Log terfilter berdasarkan nama')
    step(5, 'Kombinasi filter + search', 'Hasil sesuai kombinasi')
    step(6, 'Pastikan semua aksi sebelumnya tercatat', 'Lengkap: create, edit, delete, approve, reject')
    gap()

    // 9. RBAC
    doc.addPage(); pg++; y = 20
    title('9. RBAC & Multi-Branch Testing')
    sub('9.1 Role-Based Access Control')
    txt('Uji akses tiap role berikut:')
    gap()
    tRow(['No', 'Role', 'Login', 'Yang Harus Dicek'], true)
    tRow(['1', 'Super Admin', 'admin / admin123', 'Semua menu & aksi tersedia'])
    tRow(['2', 'Regional Manager', 'regional / regional123', 'Read & approve di 2 cabang'])
    tRow(['3', 'Manajer Cabang', 'manager_jkt / manager123', 'Full akses cabang Jakarta saja'])
    tRow(['4', 'Manajer Keuangan', 'finance / finance123', 'Akuntansi full, approval'])
    tRow(['5', 'Staff Sales', 'sales / sales123', 'Penjualan + POS, inventori read'])
    tRow(['6', 'Staff Purchasing', 'purchasing / purchasing123', 'Pembelian full, inventori read'])
    tRow(['7', 'Staff Gudang', 'gudang / gudang123', 'Inventori full, PO & SO read'])
    tRow(['8', 'Kasir', 'kasir / kasir123', 'Hanya POS, redirect otomatis'])
    gap()
    sub('9.2 Checklist per Role')
    chk('Admin: Semua menu visible, semua tombol CRUD aktif')
    chk('Kasir: Hanya POS, redirect otomatis, menu lain tidak muncul')
    chk('Sales: Menu penjualan ada, purchasing tidak ada tombol create')
    chk('Gudang: Menu inventori lengkap, SO hanya read')
    chk('Finance: Menu akuntansi lengkap, bisa approve')
    chk('Dashboard: Tidak ada kolom kosong untuk role apapun')
    gap()
    sub('9.3 Multi-Branch')
    step(1, 'Login sebagai admin', 'Dropdown cabang terlihat')
    step(2, 'Pindah ke cabang Surabaya', 'Data berubah sesuai Surabaya')
    step(3, 'Buat SO di Surabaya, pindah ke Jakarta', 'SO Surabaya tidak muncul di Jakarta')
    step(4, 'Login sebagai manager_jkt', 'Hanya bisa akses cabang Jakarta')
    gap()

    // 10. AKUN TESTING
    title('10. Data Akun Testing')
    gap()
    tRow(['No', 'Username', 'Password', 'Role'], true)
    tRow(['1', 'admin', 'admin123', 'Super Admin'])
    tRow(['2', 'regional', 'regional123', 'Regional Manager'])
    tRow(['3', 'manager_jkt', 'manager123', 'Manajer Cabang'])
    tRow(['4', 'finance', 'finance123', 'Manajer Keuangan'])
    tRow(['5', 'sales', 'sales123', 'Staff Sales'])
    tRow(['6', 'purchasing', 'purchasing123', 'Staff Purchasing'])
    tRow(['7', 'gudang', 'gudang123', 'Staff Gudang'])
    tRow(['8', 'kasir', 'kasir123', 'Kasir'])
    gap(); gap()
    txt('Catatan:')
    txt('• URL: http://localhost:5173', 4)
    txt('• Semua data bersifat mock (simulasi), tidak ada backend database', 4)
    txt('• Data akan reset saat browser di-refresh', 4)
    txt('• Pastikan audit trail dicek setelah setiap aksi penting', 4)

    // last footer
    doc.setFontSize(8); doc.setTextColor(150, 150, 150)
    doc.text('Skenario Testing Manual - ERP System', m, ph - 8)
    doc.text('Halaman ' + pg, pw - m, ph - 8, { align: 'right' })

    // Save
    const blob = doc.output('blob')
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'Skenario Testing Manual - ERP System.pdf'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  } catch (e) {
    console.error('PDF generation error:', e)
    toast.error('Gagal generate PDF: ' + e.message)
  } finally {
    generating.value = false
  }
}
</script>
