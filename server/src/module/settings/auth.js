const router = require('express').Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { query } = require('../../config/db');
const { jwtSecret, jwtRefreshSecret, jwtExpiresIn, jwtRefreshExpiresIn } = require('../../config/auth');
const { authLimiter } = require('../../middleware/rateLimiter');
const { asyncHandler } = require('../../utils/helpers');

// Helper: build JWT payload untuk user + company tertentu
async function buildTokenPayload(userId, companyId) {
    // Query 1: data dasar user dari tabel users (cepat, tanpa JOIN)
    const userResult = await query(
        `SELECT u.id, u.uuid, u.username, u.name, u.email, u.theme_preference, u.is_super_admin
         FROM users u WHERE u.id = $1 AND u.is_active = true`, [userId]
    );
    if (userResult.rows.length === 0) throw new Error('User not found');
    const user = userResult.rows[0];

    // Query 2: override name/email dari Master Karyawan jika ada link (best-effort)
    let employee_uuid = null, employee_nik = null;
    if (companyId) {
        try {
            const empResult = await query(
                `SELECT e.uuid, e.nik, e.nama_lengkap, e.email_kerja
                 FROM employees e WHERE e.user_id = $1 AND e.company_id = $2`,
                [userId, companyId]
            );
            if (empResult.rows.length > 0) {
                const emp = empResult.rows[0];
                if (emp.nama_lengkap) user.name = emp.nama_lengkap;
                if (emp.email_kerja)  user.email = emp.email_kerja;
                employee_uuid = emp.uuid || null;
                employee_nik  = emp.nik  || null;
            }
        } catch (empErr) {
            // Graceful fallback: jika employees query gagal, tetap gunakan data dari users
            console.warn('[buildTokenPayload] employees query failed, fallback to users data:', empErr.message);
        }
    }


    // Roles & permissions
    const rolesResult = await query(
        `SELECT r.id, r.name FROM roles r JOIN user_roles ur ON r.id = ur.role_id WHERE ur.user_id = $1`, [userId]
    );
    const roleIds = rolesResult.rows.map(r => r.id);
    const roleNames = rolesResult.rows.map(r => r.name);

    const permsResult = await query(
        `SELECT DISTINCT p.name FROM permissions p
         JOIN role_permissions rp ON p.id = rp.permission_id
         WHERE rp.role_id = ANY($1)`, [roleIds]
    );
    const permissions = permsResult.rows.map(p => p.name);

    // Branches (filter by company if provided)
    let branchQuery, branchParams;
    if (user.is_super_admin) {
        // Super Admin: all branches in the specified company (atau semua jika tidak ada company)
        if (companyId) {
            branchQuery = `SELECT b.uuid as id, b.id as int_id, b.code, b.name FROM branches b WHERE b.company_id = $1`;
            branchParams = [companyId];
        } else {
            branchQuery = `SELECT b.uuid as id, b.id as int_id, b.code, b.name FROM branches b`;
            branchParams = [];
        }
    } else {
        // User biasa: hanya branch yang di-assign DAN milik company aktif
        branchQuery = `SELECT b.uuid as id, b.id as int_id, b.code, b.name
                       FROM branches b
                       JOIN user_branches ub ON b.id = ub.branch_id
                       WHERE ub.user_id = $1 AND b.company_id = $2`;
        branchParams = [userId, companyId];
    }
    const branchResult = await query(branchQuery, branchParams);
    const branchIds = branchResult.rows.map(b => b.id); // UUID

    // Company info
    let companyUuid = null, companyName = null;
    if (companyId) {
        const cRes = await query(`SELECT uuid, name FROM companies WHERE id = $1`, [companyId]);
        if (cRes.rows.length > 0) {
            companyUuid = cRes.rows[0].uuid;
            companyName = cRes.rows[0].name;
        }
    }

    return {
        payload: {
            id: user.id,
            uuid: user.uuid,
            username: user.username,
            name: user.name,
            email: user.email,
            is_super_admin: user.is_super_admin,
            company_id: companyId || null,
            company_uuid: companyUuid,
            company_name: companyName,
            employee_uuid: employee_uuid,
            employee_nik: employee_nik,
            roleIds,
            roleNames,
            permissions,
            branchIds,
        },
        user,
        roleNames,
        branches: branchResult.rows.map(b => ({ id: b.id, int_id: b.int_id, code: b.code, name: b.name })),
    };
}

const logger = require('../../utils/logger');

// POST /api/settings/auth/login
router.post('/login', authLimiter, asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        logger.warn(`Login failed: missing email or password (IP: ${req.ip})`);
        return res.status(400).json({ error: 'Email dan password diperlukan' });
    }
    
    // Validasi sintaks email
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        logger.warn(`Login failed: invalid email format '${email}' (IP: ${req.ip})`);
        return res.status(400).json({ error: 'Format email tidak valid' });
    }

    const userResult = await query(
        `SELECT u.id, u.uuid, u.username, u.password_hash, u.name, u.email, u.phone, u.theme_preference, u.is_active, u.is_super_admin
         FROM users u WHERE u.email = $1`, [email]
    );
    if (userResult.rows.length === 0) {
        logger.warn(`Login failed: email not found '${email}' (IP: ${req.ip})`);
        return res.status(401).json({ error: 'Email atau password salah' });
    }

    const user = userResult.rows[0];
    if (!user.is_active) {
        logger.warn(`Login failed: user '${email}' is inactive (IP: ${req.ip})`);
        return res.status(403).json({ error: 'Akun tidak aktif' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
        logger.warn(`Login failed: invalid password for '${email}' (IP: ${req.ip})`);
        return res.status(401).json({ error: 'Email atau password salah' });
    }

    // Ambil companies yang bisa diakses user (+ branch & user count)
    let companies;
    if (user.is_super_admin) {
        const cRes = await query(`
            SELECT c.id, c.uuid, c.name, c.code, c.short_name,
                (SELECT COUNT(*) FROM branches b WHERE b.company_id = c.id) AS branch_count,
                (SELECT COUNT(DISTINCT uc2.user_id) FROM user_companies uc2 WHERE uc2.company_id = c.id) AS user_count
            FROM companies c WHERE c.is_active = true ORDER BY c.name`);
        companies = cRes.rows;
    } else {
        const cRes = await query(`
            SELECT c.id, c.uuid, c.name, c.code, c.short_name,
                (SELECT COUNT(*) FROM branches b WHERE b.company_id = c.id) AS branch_count,
                (SELECT COUNT(DISTINCT uc2.user_id) FROM user_companies uc2 WHERE uc2.company_id = c.id) AS user_count
            FROM companies c
            JOIN user_companies uc ON c.id = uc.company_id
            WHERE uc.user_id = $1 AND c.is_active = true ORDER BY c.name`, [user.id]);
        companies = cRes.rows;
    }

    if (companies.length === 0) return res.status(403).json({ error: 'User belum di-assign ke company manapun. Hubungi Admin.' });

    // Jika hanya 1 company → langsung issue token
    if (companies.length === 1) {
        const { payload, branches } = await buildTokenPayload(user.id, companies[0].id);
        const accessToken = jwt.sign(payload, jwtSecret, { expiresIn: jwtExpiresIn });
        const refreshToken = jwt.sign({ uuid: user.uuid, company_uuid: companies[0].uuid }, jwtRefreshSecret, { expiresIn: jwtRefreshExpiresIn });
        const expiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000);
        await query(`INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)`, [user.id, refreshToken, expiresAt]);

        return res.json({
            accessToken, refreshToken,
            user: {
                uuid: payload.uuid, username: payload.username, name: payload.name,
                email: payload.email, theme_preference: user.theme_preference,
                employee_uuid: payload.employee_uuid, employee_nik: payload.employee_nik,
                company_uuid: companies[0].uuid, company_name: companies[0].name,
                roleNames: payload.roleNames, permissions: payload.permissions,
                branches,
            }
        });
    }

    // Jika >1 company → minta user pilih company
    // Issue temp token (short lived, tidak punya company_id)
    const tempToken = jwt.sign({ id: user.id, uuid: user.uuid, temp: true }, jwtSecret, { expiresIn: '30m' });
    return res.json({
        requires_company_selection: true,
        temp_token: tempToken,
        is_super_admin: !!user.is_super_admin,
        companies: companies.map(c => ({ uuid: c.uuid, name: c.name, code: c.code, short_name: c.short_name || null, branch_count: parseInt(c.branch_count) || 0, user_count: parseInt(c.user_count) || 0 })),
    });
}));

// POST /api/settings/auth/select-company -- dipakai setelah company picker
router.post('/select-company', asyncHandler(async (req, res) => {
    const { temp_token, company_uuid } = req.body;
    if (!temp_token || !company_uuid) return res.status(400).json({ error: 'temp_token dan company_uuid diperlukan' });

    // Validasi temp token
    let decoded;
    try { decoded = jwt.verify(temp_token, jwtSecret); } catch (e) { return res.status(401).json({ error: 'Token tidak valid atau expired' }); }
    if (!decoded.temp) return res.status(401).json({ error: 'Token bukan temp token' });

    // Validasi company + akses user
    const userRes = await query(`SELECT id, is_super_admin FROM users WHERE id = $1 AND is_active = true`, [decoded.id]);
    if (userRes.rows.length === 0) return res.status(401).json({ error: 'User tidak ditemukan' });
    const user = userRes.rows[0];

    const companyRes = await query(`SELECT id, uuid, name, code FROM companies WHERE uuid = $1 AND is_active = true`, [company_uuid]);
    if (companyRes.rows.length === 0) return res.status(404).json({ error: 'Company tidak ditemukan' });
    const company = companyRes.rows[0];

    // Validasi user punya akses ke company ini (Super Admin bypass)
    if (!user.is_super_admin) {
        const accessRes = await query(`SELECT 1 FROM user_companies WHERE user_id = $1 AND company_id = $2`, [user.id, company.id]);
        if (accessRes.rows.length === 0) return res.status(403).json({ error: 'Akses ditolak ke company ini' });
    }

    const { payload, branches } = await buildTokenPayload(user.id, company.id);
    const accessToken = jwt.sign(payload, jwtSecret, { expiresIn: jwtExpiresIn });
    const refreshToken = jwt.sign({ uuid: user.uuid, company_uuid: company.uuid }, jwtRefreshSecret, { expiresIn: jwtRefreshExpiresIn });
    const expiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000);
    await query(`INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)`, [user.id, refreshToken, expiresAt]);

    res.json({
        accessToken, refreshToken,
        user: {
            uuid: payload.uuid, username: payload.username, name: payload.name,
            email: payload.email, is_super_admin: payload.is_super_admin,
            employee_uuid: payload.employee_uuid, employee_nik: payload.employee_nik,
            company_uuid: company.uuid, company_name: company.name,
            roleNames: payload.roleNames, permissions: payload.permissions, branches,
        }
    });
}));

// POST /api/settings/auth/refresh
router.post('/refresh', asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'Refresh token diperlukan' });

    let decoded;
    try { decoded = jwt.verify(refreshToken, jwtRefreshSecret); } catch (e) { return res.status(401).json({ error: 'Refresh token tidak valid atau expired' }); }

    const userRow = await query(`SELECT id FROM users WHERE uuid = $1 AND is_active = true`, [decoded.uuid]);
    if (userRow.rows.length === 0) return res.status(401).json({ error: 'User tidak ditemukan' });
    const userId = userRow.rows[0].id;

    const tokenResult = await query(`SELECT token, user_id, expires_at FROM refresh_tokens WHERE token = $1 AND user_id = $2 AND expires_at > NOW()`, [refreshToken, userId]);
    if (tokenResult.rows.length === 0) return res.status(401).json({ error: 'Refresh token tidak ditemukan atau expired' });

    const compRow = decoded.company_uuid
        ? await query(`SELECT id FROM companies WHERE uuid = $1 AND is_active = true`, [decoded.company_uuid])
        : { rows: [{ id: null }] };

    const companyId = compRow.rows[0]?.id || null;

    // VALIDATE COMPANY ACCESS (For non-superadmins)
    if (companyId) {
        const checkAdmin = await query(`SELECT is_super_admin FROM users WHERE id = $1`, [userId]);
        const isSuperAdmin = checkAdmin.rows[0]?.is_super_admin;

        if (!isSuperAdmin) {
            const accessCheck = await query(`SELECT 1 FROM user_companies WHERE user_id = $1 AND company_id = $2`, [userId, companyId]);
            if (accessCheck.rows.length === 0) {
                return res.status(403).json({ error: 'Akses ke perusahaan ini telah dicabut.' });
            }
        }
    }

    const { payload } = await buildTokenPayload(userId, companyId);
    const newAccessToken = jwt.sign(payload, jwtSecret, { expiresIn: jwtExpiresIn });
    res.json({ accessToken: newAccessToken });
}));

// POST /api/settings/auth/logout
router.post('/logout', asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;
    if (refreshToken) await query(`DELETE FROM refresh_tokens WHERE token = $1`, [refreshToken]);
    res.json({ message: 'Logout berhasil' });
}));

module.exports = router;
