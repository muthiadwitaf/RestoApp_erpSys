BEGIN;

-- 1. Grant pos:view to Cashier and Kitchen Staff
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.name IN ('cashier', 'kitchen_staff') AND p.name IN ('pos:view', 'sales:view')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 2. Grant inventory:view and inventory:manage to Inventory Staff
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.name = 'inventory_staff' AND p.name IN ('inventory:view', 'inventory:manage', 'inventory:edit')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 3. Grant purchasing:view to Supplier Manager
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.name = 'supplier_manager' AND p.name IN ('purchasing:view', 'purchasing:edit')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 4. Grant reporting and overview permissions to Manager
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.name = 'manager' AND p.name IN ('reportingsales:view', 'pos:view', 'inventory:view', 'purchasing:view', 'sales:view')
ON CONFLICT (role_id, permission_id) DO NOTHING;

COMMIT;
