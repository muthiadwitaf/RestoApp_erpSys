-- ═══════════════════════════════════════════════════════════════════════════════
-- RestoApp ERPsys — RBAC Redesign for Restaurant Operations
-- Migration: 020_rbac_resto_redesign.sql
-- Date: 2026-04-23
-- ═══════════════════════════════════════════════════════════════════════════════
-- TUJUAN: Mendesain ulang seluruh roles & permissions agar sesuai dengan
-- kebutuhan operasional restoran, bukan ERP generik.
--
-- STRATEGI: Hapus data lama (roles, permissions, mappings) lalu insert ulang.
--           Tabel schema (DDL) TIDAK diubah — hanya DATA (DML).
--           user_roles yang sudah ada akan di-reset → perlu di-assign ulang.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── STEP 1: CLEAN SLATE ────────────────────────────────────────────────────
-- Hapus mapping dulu (FK), lalu roles & permissions.
TRUNCATE TABLE role_permissions CASCADE;
TRUNCATE TABLE user_roles CASCADE;
DELETE FROM roles;
DELETE FROM permissions;

-- Reset sequence agar ID mulai dari 1 (clean)
ALTER SEQUENCE roles_id_seq RESTART WITH 1;
ALTER SEQUENCE permissions_id_seq RESTART WITH 1;


-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 2: INSERT ROLES
-- ═══════════════════════════════════════════════════════════════════════════════
-- 7 role khusus restoran + 1 Super Admin (platform-level)

INSERT INTO roles (name, description, company_id) VALUES
-- Platform-level (company_id = NULL)
('Super Admin',       'Full system access — platform owner, lintas semua company & branch', NULL),

-- Company-level roles (company_id = NULL → berlaku global, bisa di-override per company)
('Owner',             'Pemilik restoran — full read access ke semua modul, approve & reporting', NULL),
('Manager',           'Manager operasional — kelola menu, inventory, staff, laporan harian', NULL),
('Kasir',             'Kasir restoran — operasikan POS, terima pembayaran, buka/tutup sesi', NULL),
('Waiter',            'Pelayan — input order, lihat menu, assign ke meja', NULL),
('Kitchen',           'Dapur/Chef — lihat order masuk, update status masakan', NULL),
('Inventory Staff',   'Staff gudang — kelola stok bahan baku, terima barang, opname', NULL),
('HR Admin',          'Admin HRD — kelola karyawan, absensi, payroll, cuti', NULL);


-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 3: INSERT PERMISSIONS
-- ═══════════════════════════════════════════════════════════════════════════════
-- Dikelompokkan per modul. Format: module:action
-- Total: 68 permissions (mencakup seluruh route yang ada)

INSERT INTO permissions (name) VALUES
-- ─── Dashboard ──────────────────────────────────────────
('dashboard:view'),

-- ─── Resto: Order Management ────────────────────────────
('resto:order:view'),          -- Lihat daftar order restoran
('resto:order:create'),        -- Buat order baru (dari POS/waiter)
('resto:order:edit'),          -- Edit order (tambah item, ubah qty)
('resto:order:delete'),        -- Void/hapus order
('resto:order:checkout'),      -- Proses pembayaran (checkout)
('resto:order:move_table'),    -- Pindah meja

-- ─── Resto: Payment ─────────────────────────────────────
('resto:payment:process'),     -- Proses pembayaran (cash, QRIS, transfer)
('resto:payment:refund'),      -- Proses refund/void pembayaran
('resto:payment:view_report'), -- Lihat laporan pembayaran harian

-- ─── Resto: Menu Management ─────────────────────────────
('resto:menu:view'),           -- Lihat daftar menu
('resto:menu:create'),         -- Tambah menu baru
('resto:menu:edit'),           -- Edit detail menu (nama, harga, foto)
('resto:menu:delete'),         -- Hapus menu
('resto:menu:toggle'),         -- Aktifkan/nonaktifkan ketersediaan menu

-- ─── Resto: Recipe Management ───────────────────────────
('resto:recipe:view'),         -- Lihat resep per menu
('resto:recipe:manage'),       -- Tambah/edit/hapus resep

-- ─── Resto: Table & Room Management ─────────────────────
('resto:table:view'),          -- Lihat daftar meja & room
('resto:table:manage'),        -- Tambah/edit/hapus meja & room

-- ─── Resto: Kitchen Display ─────────────────────────────
('resto:kitchen:view'),        -- Lihat antrian order di dapur (KDS)
('resto:kitchen:update'),      -- Update status item (preparing → ready → served)

-- ─── Resto: Waiter Management ───────────────────────────
('resto:waiter:view'),         -- Lihat daftar waiter
('resto:waiter:manage'),       -- Tambah/edit/hapus waiter
('resto:waiter:attendance'),   -- Clock-in/clock-out waiter

-- ─── POS (General Point of Sale) ────────────────────────
('pos:view'),                  -- Akses POS (bisa jual)
('pos:create'),                -- Buat transaksi POS
('pos:settings'),              -- Kelola pengaturan POS (QRIS, kategori, dll)

-- ─── Inventory ──────────────────────────────────────────
('inventory:view'),            -- Lihat stok, item, gudang
('inventory:create'),          -- Tambah item, buat GR/GI/transfer
('inventory:edit'),            -- Edit item, ubah stok
('inventory:delete'),          -- Hapus item
('inventory:approve'),         -- Approve opname, transfer
('inventory:manage'),          -- Full manage (bins, zones, rack)
('inventory:export'),          -- Export laporan stok

-- ─── Purchasing ─────────────────────────────────────────
('purchasing:view'),           -- Lihat PO, supplier, bills
('purchasing:create'),         -- Buat PO, tambah supplier
('purchasing:edit'),           -- Edit PO draft, update supplier
('purchasing:delete'),         -- Hapus supplier
('purchasing:approve'),        -- Approve/reject PO
('purchasing:export'),         -- Export laporan purchasing

-- ─── Sales (SO, Invoice — bukan POS Resto) ──────────────
('sales:view'),                -- Lihat SO, invoice, retur
('sales:create'),              -- Buat SO
('sales:edit'),                -- Edit SO draft
('sales:delete'),              -- Hapus SO
('sales:approve'),             -- Approve SO
('sales:export'),              -- Export laporan sales

-- ─── Reporting ──────────────────────────────────────────
('reporting:view'),            -- Akses modul laporan (dashboard report)
('reporting:sales'),           -- Laporan penjualan harian/bulanan
('reporting:inventory'),       -- Laporan stok & movement
('reporting:financial'),       -- Laporan keuangan (accounting)

-- ─── Accounting ─────────────────────────────────────────
('accounting:view'),           -- Lihat CoA, jurnal, pajak
('accounting:create'),         -- Buat jurnal entry
('accounting:edit'),           -- Edit jurnal, closing
('accounting:delete'),         -- Hapus jurnal
('accounting:approve'),        -- Approve jurnal, closing period
('accounting:export'),         -- Export laporan keuangan

-- ─── HR & Payroll ───────────────────────────────────────
('hr:view'),                   -- Lihat karyawan, absensi
('hr:create'),                 -- Tambah karyawan
('hr:edit'),                   -- Edit data karyawan
('hr:delete'),                 -- Hapus karyawan

-- ─── Delivery ───────────────────────────────────────────
('delivery:view'),             -- Lihat delivery order
('delivery:create'),           -- Buat DO
('delivery:edit'),             -- Edit DO
('delivery:manage'),           -- Dispatch, complete DO

-- ─── Branch Management ──────────────────────────────────
('branch:view'),               -- Lihat cabang
('branch:create'),             -- Tambah cabang
('branch:edit'),               -- Edit cabang

-- ─── Settings & User Management ─────────────────────────
('settings:view'),             -- Lihat pengaturan, users, roles
('settings:create'),           -- Tambah user, role
('settings:edit'),             -- Edit pengaturan, user, role
('settings:delete'),           -- Hapus user

-- ─── Company ────────────────────────────────────────────
('company:view');              -- Lihat info company


-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 4: ROLE ↔ PERMISSION MAPPING
-- ═══════════════════════════════════════════════════════════════════════════════
-- Setiap INSERT diberi komentar agar mudah di-audit.

-- ─── 4.1 Owner ──────────────────────────────────────────────────────────────
-- Pemilik restoran: bisa lihat semua, approve, laporan.
-- Tidak perlu operasional langsung (create order, input stok, dll).
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'Owner'
  AND p.name IN (
    'dashboard:view',
    -- Resto (read + approve, no create/edit order langsung)
    'resto:order:view', 'resto:order:checkout',
    'resto:payment:view_report',
    'resto:menu:view', 'resto:menu:create', 'resto:menu:edit', 'resto:menu:delete', 'resto:menu:toggle',
    'resto:recipe:view', 'resto:recipe:manage',
    'resto:table:view', 'resto:table:manage',
    'resto:kitchen:view',
    'resto:waiter:view', 'resto:waiter:manage',
    -- POS
    'pos:view', 'pos:settings',
    -- Inventory (full read, approve)
    'inventory:view', 'inventory:approve', 'inventory:export',
    -- Purchasing (full read, approve)
    'purchasing:view', 'purchasing:approve', 'purchasing:export',
    -- Sales
    'sales:view', 'sales:approve', 'sales:export',
    -- Reporting (full)
    'reporting:view', 'reporting:sales', 'reporting:inventory', 'reporting:financial',
    -- Accounting (full)
    'accounting:view', 'accounting:create', 'accounting:edit', 'accounting:approve', 'accounting:export',
    -- HR (view & approve)
    'hr:view',
    -- Delivery
    'delivery:view',
    -- Branch & Settings
    'branch:view', 'branch:create', 'branch:edit',
    'settings:view', 'settings:create', 'settings:edit', 'settings:delete',
    'company:view'
  );

-- ─── 4.2 Manager ────────────────────────────────────────────────────────────
-- Manager operasional: full akses harian, kelola menu, staf, stok.
-- Tidak bisa ubah settings company & branch.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'Manager'
  AND p.name IN (
    'dashboard:view',
    -- Resto (full operational)
    'resto:order:view', 'resto:order:create', 'resto:order:edit', 'resto:order:delete',
    'resto:order:checkout', 'resto:order:move_table',
    'resto:payment:process', 'resto:payment:refund', 'resto:payment:view_report',
    'resto:menu:view', 'resto:menu:create', 'resto:menu:edit', 'resto:menu:delete', 'resto:menu:toggle',
    'resto:recipe:view', 'resto:recipe:manage',
    'resto:table:view', 'resto:table:manage',
    'resto:kitchen:view', 'resto:kitchen:update',
    'resto:waiter:view', 'resto:waiter:manage', 'resto:waiter:attendance',
    -- POS
    'pos:view', 'pos:create', 'pos:settings',
    -- Inventory (full)
    'inventory:view', 'inventory:create', 'inventory:edit', 'inventory:delete',
    'inventory:approve', 'inventory:manage', 'inventory:export',
    -- Purchasing (full)
    'purchasing:view', 'purchasing:create', 'purchasing:edit', 'purchasing:delete', 'purchasing:approve', 'purchasing:export',
    -- Sales (full)
    'sales:view', 'sales:create', 'sales:edit', 'sales:delete', 'sales:approve', 'sales:export',
    -- Reporting
    'reporting:view', 'reporting:sales', 'reporting:inventory',
    -- HR (manage staff)
    'hr:view', 'hr:create', 'hr:edit',
    -- Delivery
    'delivery:view', 'delivery:create', 'delivery:edit', 'delivery:manage',
    -- Branch (view only)
    'branch:view',
    'settings:view',
    'company:view'
  );

-- ─── 4.3 Kasir ──────────────────────────────────────────────────────────────
-- Kasir: fokus pada POS & pembayaran. Lihat menu, buat order, checkout.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'Kasir'
  AND p.name IN (
    'dashboard:view',
    -- Resto (order + payment focused)
    'resto:order:view', 'resto:order:create', 'resto:order:edit',
    'resto:order:checkout', 'resto:order:move_table',
    'resto:payment:process', 'resto:payment:view_report',
    'resto:menu:view', 'resto:menu:toggle',
    'resto:table:view',
    'resto:kitchen:view',
    'resto:waiter:view', 'resto:waiter:attendance',
    -- POS
    'pos:view', 'pos:create',
    -- Read-only untuk referensi
    'inventory:view',
    'reporting:view', 'reporting:sales',
    'company:view'
  );

-- ─── 4.4 Waiter ─────────────────────────────────────────────────────────────
-- Waiter: input order, lihat menu, assign meja. Tidak bisa checkout/bayar.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'Waiter'
  AND p.name IN (
    'dashboard:view',
    -- Resto (order input, table view)
    'resto:order:view', 'resto:order:create', 'resto:order:edit',
    'resto:order:move_table',
    'resto:menu:view',
    'resto:table:view',
    'resto:kitchen:view',
    'resto:waiter:attendance',
    -- POS (view only for menu reference)
    'pos:view',
    'company:view'
  );

-- ─── 4.5 Kitchen ────────────────────────────────────────────────────────────
-- Kitchen/Chef: lihat antrian order, update status masakan. Minimal access.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'Kitchen'
  AND p.name IN (
    'dashboard:view',
    -- Resto (kitchen display only)
    'resto:order:view',
    'resto:menu:view',
    'resto:kitchen:view', 'resto:kitchen:update',
    'pos:view',
    'company:view'
  );

-- ─── 4.6 Inventory Staff ────────────────────────────────────────────────────
-- Staff gudang: kelola stok bahan baku, terima barang dari supplier.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'Inventory Staff'
  AND p.name IN (
    'dashboard:view',
    -- Inventory (full CRUD, no delete master item)
    'inventory:view', 'inventory:create', 'inventory:edit', 'inventory:manage',
    -- Purchasing (view PO, create receive)
    'purchasing:view', 'purchasing:create', 'purchasing:edit',
    -- Delivery (view + receive)
    'delivery:view', 'delivery:create', 'delivery:edit',
    -- Reporting (stok only)
    'reporting:view', 'reporting:inventory',
    'company:view'
  );

-- ─── 4.7 HR Admin ───────────────────────────────────────────────────────────
-- Admin HRD: full akses ke modul karyawan, absensi, payroll, cuti.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'HR Admin'
  AND p.name IN (
    'dashboard:view',
    -- HR (full)
    'hr:view', 'hr:create', 'hr:edit', 'hr:delete',
    -- View waiter (for attendance cross-reference)
    'resto:waiter:view', 'resto:waiter:manage', 'resto:waiter:attendance',
    -- Settings (view user data for linking)
    'settings:view',
    -- Reporting
    'reporting:view',
    'company:view'
  );

-- ─── 4.8 Super Admin (all permissions) ──────────────────────────────────────
-- Super Admin juga di-bypass di middleware (is_super_admin = true),
-- tapi kita tetap map semua permissions untuk konsistensi & audit.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'Super Admin';


-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 5: ASSIGN DEFAULT ROLES KE EXISTING USERS
-- ═══════════════════════════════════════════════════════════════════════════════
-- Semua user yang is_super_admin = true → assign ke role 'Super Admin'
-- Sisanya → assign ke role 'Manager' (default safe agar tidak kehilangan akses)

INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM users u, roles r
WHERE u.is_super_admin = TRUE AND r.name = 'Super Admin'
ON CONFLICT DO NOTHING;

INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM users u, roles r
WHERE u.is_super_admin = FALSE AND r.name = 'Manager'
  AND NOT EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id)
ON CONFLICT DO NOTHING;


COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════════
-- CONTOH: Assign role ke user tertentu
-- ═══════════════════════════════════════════════════════════════════════════════
/*
-- Assign role 'Kasir' ke user dengan username 'budi'
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM users u, roles r
WHERE u.username = 'budi' AND r.name = 'Kasir'
ON CONFLICT DO NOTHING;

-- Assign multiple roles ke satu user (mis: Manager + Kasir)
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM users u, roles r
WHERE u.username = 'ahmad' AND r.name IN ('Manager', 'Kasir')
ON CONFLICT DO NOTHING;

-- Hapus role dari user
DELETE FROM user_roles
WHERE user_id = (SELECT id FROM users WHERE username = 'budi')
  AND role_id = (SELECT id FROM roles WHERE name = 'Waiter');
*/


-- ═══════════════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERIES (jalankan setelah migration)
-- ═══════════════════════════════════════════════════════════════════════════════
/*
-- Cek jumlah roles
SELECT COUNT(*) as total_roles FROM roles;  -- Expected: 8

-- Cek jumlah permissions
SELECT COUNT(*) as total_permissions FROM permissions;  -- Expected: 68

-- Cek mapping per role
SELECT r.name as role, COUNT(rp.permission_id) as perm_count
FROM roles r
LEFT JOIN role_permissions rp ON r.id = rp.role_id
GROUP BY r.name ORDER BY perm_count DESC;

-- Lihat detail permission per role
SELECT r.name as role, p.name as permission
FROM roles r
JOIN role_permissions rp ON r.id = rp.role_id
JOIN permissions p ON rp.permission_id = p.id
ORDER BY r.name, p.name;

-- Cek user → role assignments
SELECT u.username, u.name, r.name as role
FROM users u
JOIN user_roles ur ON u.id = ur.user_id
JOIN roles r ON ur.role_id = r.id
ORDER BY u.username;
*/
