BEGIN;

-- 1. Insert all 46 discovered permissions used in the codebase
INSERT INTO permissions (name)
VALUES
    ('accounting:approve'),
    ('accounting:create'),
    ('accounting:delete'),
    ('accounting:edit'),
    ('accounting:export'),
    ('accounting:view'),
    ('branch:create'),
    ('branch:edit'),
    ('branch:view'),
    ('delivery:create'),
    ('delivery:edit'),
    ('delivery:edit_self'),
    ('delivery:manage'),
    ('delivery:view'),
    ('delivery:view_self'),
    ('hr:create'),
    ('hr:delete'),
    ('hr:edit'),
    ('hr:view'),
    ('inventory:approve'),
    ('inventory:create'),
    ('inventory:delete'),
    ('inventory:edit'),
    ('inventory:manage'),
    ('inventory:view'),
    ('kitchen:update'),
    ('kitchen:view'),
    ('pos:create'),
    ('pos:settings'),
    ('pos:view'),
    ('purchasing:approve'),
    ('purchasing:create'),
    ('purchasing:delete'),
    ('purchasing:edit'),
    ('purchasing:view'),
    ('reportingsales:view'),
    ('sales:approve'),
    ('sales:create'),
    ('sales:delete'),
    ('sales:edit'),
    ('sales:manage'),
    ('sales:view'),
    ('settings:create'),
    ('settings:delete'),
    ('settings:edit'),
    ('settings:view')
ON CONFLICT (name) DO NOTHING;

-- 2. Grant all discovered permissions to the 'admin' role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

COMMIT;
