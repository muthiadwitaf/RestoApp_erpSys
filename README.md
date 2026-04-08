# RestoApp POS System

Aplikasi **RestoApp** adalah sistem *Point of Sale* (POS) Kasir Restoran berbasis Full-Stack (*Monorepo*), yang sangat dioptimalkan untuk manajemen restoran, sistem shift kasir, dapur (Kitchen Display), layar pelanggan, dsb.

Proyek ini dipisahkan sebagai repositori mandiri yang terdiri dari dua lapis:
1. **Frontend**: Vue 3 + Vite + Bootstrap (di direktori utama `/`)
2. **Backend**: Node.js + Express + MySQL API (di dalam direktori `/server/`)

---

## 🛠 Prasyarat Sistem

Pastikan di Komputer/Server Anda sudah terinstal:
- **Node.js** (Minimal versi v18.x)
- **MySQL Server** (Minimal versi v5.7 atau v8.x)

---

## 🚀 Panduan Instalasi & Menjalankan Aplikasi

Secara total, Anda membutuhkan 2 terminal berjalan secara bersamaan di *development* atau saat *deployment* lokal.

### 1. Konfigurasi Backend (Server)

1. Buka Terminal / _Command Prompt_ pertama.
2. Masuk ke direktori server:
   ```bash
   cd server
   ```
3. Install semua *dependency* (jika baru di-clone):
   ```bash
   npm install
   ```
4. Atur konfigurasi Database:
   - Buat/kopi file `.env` yang merujuk pada `server/.env.example`.
   - Update `DB_NAME`, `DB_USER`, `DB_PASSWORD`, dan lain-lain menyesuaikan kredensial MySQL lokal Anda.
5. Nyalakan Backend Server:
   ```bash
   npm run dev
   ```
   *(Backend secara default berjalan di port **3999**)*

### 2. Konfigurasi Frontend (Vue/Vite)

1. Buka Terminal / _Command Prompt_ kedua.
2. Pastikan Anda berada di direktori akar (`RestoApp/`):
   ```bash
   # Masuk ke direktori RestoApp jika belum
   ```
3. Install semua *dependency* Frontend:
   ```bash
   npm install
   ```
4. Jalankan Vite Web Server:
   ```bash
   npm run dev
   ```
   *(Frontend secara default berjalan di port **5174**)*

---

## 📂 Struktur Folder Repositori

```text
RestoApp/
├── public/                 # Aset Frontend / Images / Favicon
├── src/                    # Kodingan Vue Aplikasi POS Restoran Frontend
│   ├── assets/             # CSS & SCSS
│   ├── components/         # Reusable Components (Tab, Modal, dll)
│   ├── router/             # Vue Router Config
│   ├── services/           # AXIOS HTTP Fetcher yang menembak API ke Backend
│   ├── stores/             # Pinia State Management
│   └── views/              # Halaman Tampilan (POS, Setting, Table, dll)
├── server/                 # Kodingan Backend API Node.js
│   ├── src/                # Folder Router dan Module Controller Express
│   ├── migrations/         # (opsional) Migrasi Database
│   ├── .env                # Config Rahasia Database
│   ├── server.js           # Main Entry File backend
│   └── package.json        # Dependensi khusus Backend
├── package.json            # Dependensi khusus Frontend
├── vite.config.js          # Pengaturan Vite / Port Web Frontend
└── README.md               # Dokumentasi Repositori
```

---

## ✨ Fitur Utama Tersedia:

- **Modul Pemesanan Meja**: Manajemen Table Map (Denah Resto) secara visual.
- **Sistem Checkout POS Offline-first**: Manajemen keranjang secara ringan melalui memori browser, dengan nota otomatis (Pop-up). Termasuk Integrasi Qris, Pembayaran Tunai, Debit (Mesin EDC), dan Transfer. 
- **Manajemen Shift Kasir**: Rekap tutup kasir akurat menggunakan penggabungan kalkulasi lokal & server (*Expected Cash vs Physical Cash*).
- **Laporan Harian POS**: Tarikan omset per hari, analitik menu terlaris dan jam ramai (*Peak Hour*).
- **Katalog Menu Terpisah**: Pengaturan Menu / Inventaris dan Gambar yang dikelola langsung.
- **Kitchen Display System (Dapur)**: Layar masak untuk memantau status pembuatan masakan secara *real-time*.

---

*Disusun & dioptimalisasi dari arsitektur ERP.*
