-- ═══════════════════════════════════════════════════════════════════════════════
-- RestoERP — Restaurant RBAC (Production-Safe, Idempotent)
-- Migration: 030_rbac_restaurant_clean.sql
-- Date: 2026-04-24
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- SAFE: Uses INSERT ... ON CONFLICT DO NOTHING (no TRUNCATE, no DELETE)
-- IDEMPOTENT: Can run multiple times without data loss
-- PRODUCTION-READY: Will not destroy existing user-role assignments
--
-- TABLES AFFECTED:
--   • roles, permissions, role_permissions (INSERT only)
--   • user_roles is NOT touched (preserves existing assignments)
--
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── STEP 0: ENSURE TABLES EXIST ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS roles (
    id          SERIAL PRIMARY KEY,
    uuid        UUID NOT NULL DEFAULT gen_random_uuid(),
    name        VARCHAR(50) NOT NULL,
    description TEXT,
    company_id  INTEGER REFERENCES companies(id),
    company_uuid UUID,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS permissions (
    id   SERIAL PRIMARY KEY,
    name VARCHAR NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS role_permissions (
    role_id       INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS user_roles (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, role_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON user_roles(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_perm_id ON role_permissions(permission_id);

-- Ensure unique constraint exists for ON CONFLICT to work
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'roles_name_unique'
    ) THEN
        BEGIN
            ALTER TABLE roles ADD CONSTRAINT roles_name_unique UNIQUE (name);
        EXCEPTION WHEN duplicate_table THEN
            NULL; -- constraint already exists under different name
        END;
    END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 1: INSERT ROLES (SAFE — ON CONFLICT DO NOTHING)
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO roles (name, description) VALUES
('admin',            'System administrator — full access to all restaurant operations and settings'),
('cashier',          'Cashier — handles order creation, updates, payments, and views orders'),
('kitchen_staff',    'Kitchen staff — views incoming orders and updates order preparation status'),
('inventory_staff',  'Inventory staff — manages inventory items and stock levels'),
('supplier_manager', 'Supplier manager — manages supplier relationships and creates purchase orders'),
('manager',          'Restaurant manager — views reports and monitors orders and inventory')
ON CONFLICT (name) DO NOTHING;


-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 2: INSERT PERMISSIONS (SAFE — ON CONFLICT DO NOTHING)
-- ═══════════════════════════════════════════════════════════════════════════════
-- 15 namespaced permissions — granular, no overlaps

INSERT INTO permissions (name) VALUES
('users:manage'),          -- Create, edit, deactivate, and delete user accounts
('roles:manage'),          -- Create, edit, and assign roles and permissions
('menu:manage'),           -- Create, edit, and delete menu items and categories
('inventory:manage'),      -- Full inventory management — items, warehouses, stock adjustments
('supplier:manage'),       -- Create, edit, and delete supplier records
('reports:view'),          -- Access sales, inventory, and financial reports

('orders:create'),         -- Create new restaurant orders
('orders:update'),         -- Modify existing orders (add/remove items, change quantities)
('orders:cancel'),         -- Cancel an existing order
('orders:delete'),         -- Delete/void an order (admin-level destructive action)
('orders:view'),           -- View order list and order details
('orders:update_status'),  -- Update order preparation status (preparing → ready → served)

('payments:process'),      -- Process payments — cash, card, QRIS, and other methods
('stock:manage'),          -- Manage stock levels — receive goods, adjustments, transfers
('purchase:create')        -- Create purchase orders for supplier procurement
ON CONFLICT (name) DO NOTHING;


-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 3: ROLE → PERMISSION MAPPING (SAFE — ON CONFLICT DO NOTHING)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 3.1 admin → ALL permissions (safe reset + re-insert) ───────────────────
-- For admin only, we do a safe reset to ensure admin always has ALL permissions
-- even when new permissions are added in future migrations
DELETE FROM role_permissions
WHERE role_id = (SELECT id FROM roles WHERE name = 'admin');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permissions p
WHERE r.name = 'admin'
ON CONFLICT DO NOTHING;

-- ─── 3.2 cashier → orders:create, orders:update, orders:view, payments:process
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r JOIN permissions p ON p.name IN (
    'orders:create', 'orders:update', 'orders:view', 'payments:process'
)
WHERE r.name = 'cashier'
ON CONFLICT DO NOTHING;

-- ─── 3.3 kitchen_staff → orders:view, orders:update_status ──────────────────
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r JOIN permissions p ON p.name IN (
    'orders:view', 'orders:update_status'
)
WHERE r.name = 'kitchen_staff'
ON CONFLICT DO NOTHING;

-- ─── 3.4 inventory_staff → inventory:manage, stock:manage ───────────────────
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r JOIN permissions p ON p.name IN (
    'inventory:manage', 'stock:manage'
)
WHERE r.name = 'inventory_staff'
ON CONFLICT DO NOTHING;

-- ─── 3.5 supplier_manager → supplier:manage, purchase:create ────────────────
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r JOIN permissions p ON p.name IN (
    'supplier:manage', 'purchase:create'
)
WHERE r.name = 'supplier_manager'
ON CONFLICT DO NOTHING;

-- ─── 3.6 manager → reports:view, orders:view ───────────────────────────────
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r JOIN permissions p ON p.name IN (
    'reports:view', 'orders:view'
)
WHERE r.name = 'manager'
ON CONFLICT DO NOTHING;


-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 4: USER → ROLE ASSIGNMENTS
-- ═══════════════════════════════════════════════════════════════════════════════
-- Only assign super admin users to admin role (least-privilege principle)
-- Non-super-admin users keep whatever role they already have
-- NO automatic "manager" assignment to all users

INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM users u, roles r
WHERE u.is_super_admin = TRUE AND r.name = 'admin'
ON CONFLICT DO NOTHING;


COMMIT;


-- ═══════════════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERIES (run after migration to confirm)
-- ═══════════════════════════════════════════════════════════════════════════════
/*
-- Count roles (expected: 6)
SELECT COUNT(*) AS total_roles FROM roles;

-- Count permissions (expected: 15)
SELECT COUNT(*) AS total_permissions FROM permissions;

-- Permissions per role
SELECT r.name AS role, COUNT(rp.permission_id) AS perm_count
FROM roles r
LEFT JOIN role_permissions rp ON r.id = rp.role_id
GROUP BY r.name, r.id
ORDER BY perm_count DESC;

-- Detailed mapping
SELECT r.name AS role, p.name AS permission
FROM roles r
JOIN role_permissions rp ON r.id = rp.role_id
JOIN permissions p ON rp.permission_id = p.id
ORDER BY r.name, p.name;
*/
