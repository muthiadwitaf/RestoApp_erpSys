const router = require('express').Router();
const bcrypt = require('bcrypt');
const { query } = require('../../config/db');
const { bcryptRounds } = require('../../config/auth');
const { authenticateToken, requirePermission } = require('../../middleware/auth');
const { validateUUID } = require('../../middleware/validate');
const { asyncHandler, sanitizeResponse, parsePagination } = require('../../utils/helpers');

router.use(authenticateToken);

// GET /api/settings/users
router.get('/', requirePermission('settings:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const result = await query(
        `SELECT u.uuid, u.name, u.email, u.phone, u.theme_preference, u.is_active, u.created_at,
       COALESCE(json_agg(DISTINCT jsonb_build_object('id', r.id, 'name', r.name)) FILTER (WHERE r.id IS NOT NULL), '[]') as roles,
       COALESCE(json_agg(DISTINCT jsonb_build_object('id', b.id, 'code', b.code, 'name', b.name)) FILTER (WHERE b.id IS NOT NULL), '[]') as branches,
       e.uuid AS employee_uuid, e.nik AS employee_nik,
       ej.jabatan AS employee_jabatan
     FROM users u
     JOIN user_companies uc ON u.id = uc.user_id AND uc.company_id = $1
     LEFT JOIN user_roles ur ON u.id = ur.user_id
     LEFT JOIN roles r ON ur.role_id = r.id
     LEFT JOIN user_branches ub ON u.id = ub.user_id
     LEFT JOIN branches b ON ub.branch_id = b.id
     LEFT JOIN employees e ON e.user_id = u.id AND e.company_id = $1
     LEFT JOIN employee_jobs ej ON ej.employee_id = e.id AND ej.is_current = TRUE
     WHERE u.is_super_admin = false
     GROUP BY u.id, e.uuid, e.nik, ej.jabatan ORDER BY u.id`,
        [companyId]
    );
    res.json(result.rows);
}));

// GET /api/settings/users/:uuid
router.get('/:uuid', requirePermission('settings:view'), validateUUID(), asyncHandler(async (req, res) => {
    const result = await query(
        `SELECT u.uuid, u.username, u.name, u.email, u.theme_preference, u.is_active, u.created_at,
       COALESCE(json_agg(DISTINCT r.id) FILTER (WHERE r.id IS NOT NULL), '[]') as role_ids,
       COALESCE(json_agg(DISTINCT b.id) FILTER (WHERE b.id IS NOT NULL), '[]') as branch_ids
     FROM users u
     LEFT JOIN user_roles ur ON u.id = ur.user_id
     LEFT JOIN roles r ON ur.role_id = r.id
     LEFT JOIN user_branches ub ON u.id = ub.user_id
     LEFT JOIN branches b ON ub.branch_id = b.id
     WHERE u.uuid = $1 GROUP BY u.id`, [req.params.uuid]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User tidak ditemukan' });
    res.json(result.rows[0]);
}));

// POST /api/settings/users
router.post('/', requirePermission('settings:create'), asyncHandler(async (req, res) => {
    const { name, email, phone, password, roleIds, branchIds } = req.body;
    if (!name?.trim() || !email?.trim() || !password) {
        return res.status(400).json({ error: 'Nama, email, dan password wajib diisi' });
    }
    if (password.length < 6) {
        return res.status(400).json({ error: 'Password minimal 6 karakter' });
    }

    // Cek email sudah dipakai
    const existingEmail = await query(`SELECT id FROM users WHERE email = $1`, [email.trim()]);
    if (existingEmail.rows.length > 0) return res.status(409).json({ error: 'Email sudah digunakan' });

    // Auto-generate username dari email prefix (untuk kompatibilitas kolom DB)
    const baseUsername = email.trim().split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '_');
    let username = baseUsername;
    let suffix = 1;
    while ((await query(`SELECT id FROM users WHERE username = $1`, [username])).rows.length > 0) {
        username = `${baseUsername}_${suffix++}`;
    }

    const hash = await bcrypt.hash(password, bcryptRounds);
    const result = await query(
        `INSERT INTO users (username, password_hash, name, email, phone) VALUES ($1, $2, $3, $4, $5) RETURNING uuid, name, email, phone`,
        [username, hash, name.trim(), email.trim(), phone?.trim() || null]
    );
    const user = result.rows[0];
    const userId = (await query(`SELECT id FROM users WHERE uuid = $1`, [user.uuid])).rows[0].id;

    // Auto-assign ke company saat ini
    const companyId = req.user.company_id;
    if (companyId) {
        await query(`INSERT INTO user_companies (user_id, company_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [userId, companyId]);
    }

    if (roleIds?.length) {
        for (const ruuid of roleIds) {
            await query(
                `INSERT INTO user_roles (user_id, role_id)
                 SELECT $1, id FROM roles WHERE uuid = $2
                 ON CONFLICT DO NOTHING`,
                [userId, ruuid]
            );
        }
    }
    if (branchIds?.length) {
        for (const buuid of branchIds) {
            await query(
                `INSERT INTO user_branches (user_id, branch_id)
                 SELECT $1, id FROM branches WHERE uuid = $2
                 ON CONFLICT DO NOTHING`,
                [userId, buuid]
            );
        }
    }

    await query(
        `INSERT INTO audit_trail (action, module, description, user_id, user_name, company_id) VALUES ('create','settings',$1,$2,$3,$4)`,
        [`Tambah user: ${name.trim()} (${email.trim()})`, req.user.id, req.user.name, companyId]
    );

    res.status(201).json(user);
}));

// PUT /api/settings/users/:uuid
router.put('/:uuid', validateUUID(), asyncHandler(async (req, res) => {
    const { name, email, phone, password, roleIds, branchIds, is_active, theme_preference } = req.body;
    
    // Permission check: allow editing self profile, but restrict privileged fields
    const isTargetingSelf = req.user.uuid === req.params.uuid;
    const hasSettingsEdit = req.user.is_super_admin || (req.user.permissions && req.user.permissions.includes('settings:edit'));
    
    if (!isTargetingSelf && !hasSettingsEdit) {
        return res.status(403).json({ error: 'Anda tidak memiliki izin untuk mengedit user ini' });
    }
    
    if (isTargetingSelf && !hasSettingsEdit) {
        if (roleIds !== undefined || branchIds !== undefined || is_active !== undefined) {
             return res.status(403).json({ error: 'Anda tidak dapat mengubah peran, cabang, atau status aktif' });
        }
    }

    const userResult = await query(`SELECT id FROM users WHERE uuid = $1`, [req.params.uuid]);
    if (userResult.rows.length === 0) return res.status(404).json({ error: 'User tidak ditemukan' });
    const userId = userResult.rows[0].id;

    // Cek apakah user ini terhubung ke karyawan -- jika ya, email hanya boleh diubah dari HR Master Karyawan
    if (email !== undefined) {
        // Ambil email saat ini untuk dibandingkan
        const currentUser = await query(`SELECT email FROM users WHERE id = $1`, [userId]);
        const currentEmail = currentUser.rows[0]?.email || '';
        const isEmailChanged = email.trim().toLowerCase() !== currentEmail.trim().toLowerCase();

        if (isEmailChanged) {
            const linkedEmp = await query(
                `SELECT e.nik, e.nama_lengkap FROM employees e WHERE e.user_id = $1`,
                [userId]
            );
            if (linkedEmp.rows.length > 0) {
                const kary = linkedEmp.rows[0];
                return res.status(400).json({
                    error: `Email user ini dikelola melalui Master Karyawan (${kary.nama_lengkap} / ${kary.nik}). Ubah email kerja di menu HR > Master Karyawan.`
                });
            }

            // Cek email conflict kalau benar-benar diubah
            const emailCheck = await query(`SELECT id FROM users WHERE email = $1 AND uuid != $2`, [email.trim(), req.params.uuid]);
            if (emailCheck.rows.length > 0) return res.status(409).json({ error: 'Email sudah digunakan oleh user lain' });
        }
    }

    let updates = [];
    let values = [];
    let idx = 1;

    if (name !== undefined) { updates.push(`name = $${idx++}`); values.push(name.trim()); }
    if (email !== undefined) { updates.push(`email = $${idx++}`); values.push(email?.trim() || null); }
    if (phone !== undefined) { updates.push(`phone = $${idx++}`); values.push(phone?.trim() || null); }
    if (is_active !== undefined) { updates.push(`is_active = $${idx++}`); values.push(is_active); }
    if (theme_preference !== undefined) { updates.push(`theme_preference = $${idx++}`); values.push(theme_preference); }
    if (password) {
        if (password.length < 6) return res.status(400).json({ error: 'Password minimal 6 karakter' });
        const hash = await bcrypt.hash(password, bcryptRounds);
        updates.push(`password_hash = $${idx++}`); values.push(hash);
    }

    if (updates.length > 0) {
        updates.push(`updated_at = NOW()`);
        values.push(req.params.uuid);
        await query(`UPDATE users SET ${updates.join(', ')} WHERE uuid = $${idx}`, values);
    }

    // roleIds & branchIds dikirim sebagai UUID dari frontend -- resolve ke integer ID di sini
    if (roleIds !== undefined) {
        await query(`DELETE FROM user_roles WHERE user_id = $1`, [userId]);
        for (const ruuid of roleIds) {
            await query(
                `INSERT INTO user_roles (user_id, role_id)
                 SELECT $1, id FROM roles WHERE uuid = $2`,
                [userId, ruuid]
            );
        }
    }
    if (branchIds !== undefined) {
        await query(`DELETE FROM user_branches WHERE user_id = $1`, [userId]);
        for (const buuid of branchIds) {
            await query(
                `INSERT INTO user_branches (user_id, branch_id)
                 SELECT $1, id FROM branches WHERE uuid = $2`,
                [userId, buuid]
            );
        }
    }

    // Ambil data user terbaru untuk deskripsi audit
    const updatedUser = await query(`SELECT name, email FROM users WHERE uuid = $1`, [req.params.uuid]);
    const uName = updatedUser.rows[0]?.name || req.params.uuid;
    const uEmail = updatedUser.rows[0]?.email || '';
    await query(
        `INSERT INTO audit_trail (action, module, description, user_id, user_name, company_id) VALUES ('update','settings',$1,$2,$3,$4)`,
        [`Edit user: ${uName} (${uEmail})`, req.user.id, req.user.name, req.user.company_id]
    );

    res.json({ message: 'User berhasil diupdate' });
}));

// PUT /api/settings/users/preferences (current user)
router.put('/me/preferences', asyncHandler(async (req, res) => {
    const { theme } = req.body;
    if (theme && ['light', 'dark'].includes(theme)) {
        await query(`UPDATE users SET theme_preference = $1, updated_at = NOW() WHERE id = $2`, [theme, req.user.id]);
    }
    res.json({ message: 'Preferences updated' });
}));

// DELETE /api/settings/users/:uuid
router.delete('/:uuid', requirePermission('settings:delete'), validateUUID(), asyncHandler(async (req, res) => {
    const targetUser = await query(`SELECT name, email FROM users WHERE uuid = $1`, [req.params.uuid]);
    if (targetUser.rows.length === 0) return res.status(404).json({ error: 'User tidak ditemukan' });
    const { name: tName, email: tEmail } = targetUser.rows[0];

    await query(`UPDATE users SET is_active = false, updated_at = NOW() WHERE uuid = $1`, [req.params.uuid]);

    await query(
        `INSERT INTO audit_trail (action, module, description, user_id, user_name, company_id) VALUES ('delete','settings',$1,$2,$3,$4)`,
        [`Nonaktifkan user: ${tName} (${tEmail})`, req.user.id, req.user.name, req.user.company_id]
    );

    res.json({ message: 'User dinonaktifkan' });
}));

module.exports = router;
