const router = require('express').Router();
const { query } = require('../../config/db');
const { requirePermission } = require('../../middleware/auth');
const { validateUUID } = require('../../middleware/validate');
const { asyncHandler } = require('../../utils/helpers');

// GET /api/settings/roles
router.get('/', requirePermission('settings:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const result = await query(`
        SELECT r.id, r.uuid, r.name, r.description, r.created_at,
               COALESCE(json_agg(p.name ORDER BY p.name) FILTER (WHERE p.name IS NOT NULL), '[]') AS permissions
        FROM roles r
        LEFT JOIN role_permissions rp ON r.id = rp.role_id
        LEFT JOIN permissions p ON rp.permission_id = p.id
        WHERE r.company_id = $1
        GROUP BY r.id ORDER BY r.id`, [companyId]);
    res.json(result.rows);
}));

// GET /api/settings/roles/:uuid
router.get('/:uuid', requirePermission('settings:view'), validateUUID(), asyncHandler(async (req, res) => {
    const result = await query(`SELECT r.id, r.uuid, r.name, r.description FROM roles r WHERE r.uuid = $1`, [req.params.uuid]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Role tidak ditemukan' });

    const roleId = result.rows[0].id;
    const perms = await query(`SELECT p.name FROM permissions p JOIN role_permissions rp ON p.id = rp.permission_id WHERE rp.role_id = $1`, [roleId]);

    res.json({ ...result.rows[0], permissions: perms.rows.map(p => p.name) });
}));

// GET /api/settings/permissions
router.get('/all/permissions', requirePermission('settings:view'), asyncHandler(async (req, res) => {
    const result = await query(`SELECT id, name FROM permissions ORDER BY id`);
    res.json(result.rows);
}));

// POST /api/settings/roles
router.post('/', requirePermission('settings:create'), asyncHandler(async (req, res) => {
    const { name, description, permissions } = req.body;
    const companyId = req.user.company_id;

    if (!name || !name.trim()) return res.status(400).json({ error: 'Nama role wajib diisi' });

    // Cek duplikat nama dalam company
    const existing = await query(`SELECT id FROM roles WHERE LOWER(name) = LOWER($1) AND company_id = $2`, [name.trim(), companyId]);
    if (existing.rows.length > 0) return res.status(409).json({ error: `Role "${name}" sudah ada` });

    // Insert role baru
    const roleResult = await query(
        `INSERT INTO roles (uuid, name, description, company_id, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, NOW())
         RETURNING id, uuid, name, description, created_at`,
        [name.trim(), description?.trim() || null, companyId]
    );
    const newRole = roleResult.rows[0];

    // Insert permissions jika ada
    for (const pid of (permissions || [])) {
        if (typeof pid === 'string' && isNaN(pid)) {
            const r = await query(`SELECT id FROM permissions WHERE name = $1`, [pid]);
            if (r.rows.length > 0) {
                await query(`INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [newRole.id, r.rows[0].id]);
            }
        } else {
            await query(`INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [newRole.id, parseInt(pid)]);
        }
    }

    res.status(201).json({ ...newRole, permissions: permissions || [] });
}));

// PUT /api/settings/roles/:uuid/permissions
router.put('/:uuid/permissions', requirePermission('settings:edit'), validateUUID(), asyncHandler(async (req, res) => {
    const { permissionIds } = req.body; // can be array of IDs or names
    const roleResult = await query(`SELECT id FROM roles WHERE uuid = $1`, [req.params.uuid]);
    if (roleResult.rows.length === 0) return res.status(404).json({ error: 'Role tidak ditemukan' });
    const roleId = roleResult.rows[0].id;

    await query(`DELETE FROM role_permissions WHERE role_id = $1`, [roleId]);

    for (const pid of (permissionIds || [])) {
        if (typeof pid === 'string' && isNaN(pid)) {
            // It's a permission name -- resolve to id
            const r = await query(`SELECT id FROM permissions WHERE name = $1`, [pid]);
            if (r.rows.length > 0) {
                await query(`INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [roleId, r.rows[0].id]);
            }
        } else {
            // It's already a numeric ID
            await query(`INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [roleId, parseInt(pid)]);
        }
    }
    res.json({ message: 'Permissions updated' });
}));

module.exports = router;
