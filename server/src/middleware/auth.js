const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../config/auth');
const { query } = require('../config/db');

const authDisabled = process.env.AUTH_DISABLED === 'true';
let noLoginUserCache = null;

async function getNoLoginUser() {
    if (noLoginUserCache) return noLoginUserCache;

    const companyIdFromEnv = Number(process.env.AUTH_DISABLED_COMPANY_ID || 0) || null;
    const companyResult = await query(
        companyIdFromEnv
            ? `SELECT id, uuid, name FROM companies WHERE id = $1 LIMIT 1`
            : `SELECT id, uuid, name FROM companies WHERE is_active IS DISTINCT FROM false ORDER BY id LIMIT 1`,
        companyIdFromEnv ? [companyIdFromEnv] : []
    );
    const company = companyResult.rows[0] || { id: companyIdFromEnv || 1, uuid: null, name: 'Local Company' };

    const userResult = await query(
        `SELECT id, uuid, username, name, email
         FROM users
         WHERE is_active IS DISTINCT FROM false
         ORDER BY is_super_admin DESC, id
         LIMIT 1`
    );
    const user = userResult.rows[0] || {
        id: 1,
        uuid: 'no-login-user',
        username: 'guest',
        name: 'Local User',
        email: 'guest@local.app',
    };

    const branchResult = await query(
        `SELECT uuid FROM branches WHERE company_id = $1 ORDER BY id`,
        [company.id]
    );

    noLoginUserCache = {
        id: user.id,
        uuid: user.uuid,
        username: user.username,
        name: user.name,
        email: user.email,
        is_super_admin: true,
        company_id: company.id,
        company_uuid: company.uuid,
        company_name: company.name,
        roleNames: ['Super Admin'],
        permissions: ['*'],
        branchIds: branchResult.rows.map(b => b.uuid),
    };

    return noLoginUserCache;
}

// Verify JWT access token
async function authenticateToken(req, res, next) {
    if (authDisabled) {
        req.user = await getNoLoginUser();
        return next();
    }

    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Token diperlukan' });

    try {
        const decoded = jwt.verify(token, jwtSecret);
        // Reject temp tokens (hanya untuk company selection, bukan API access)
        if (decoded.temp) return res.status(401).json({ error: 'Token tidak valid untuk akses API' });
        req.user = decoded;
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
        return res.status(403).json({ error: 'Token tidak valid' });
    }
}

// Check permission (any of permissions must match)
function requirePermission(...permissions) {
    return (req, res, next) => {
        if (req.user?.is_super_admin) return next(); // Super Admin bypass
        if (!req.user?.permissions) return res.status(403).json({ error: 'Akses ditolak' });
        const has = permissions.some(p => req.user.permissions.includes(p));
        if (!has) return res.status(403).json({ error: 'Anda tidak memiliki izin untuk aksi ini' });
        next();
    };
}

// Require valid company context in JWT
function requireCompany(req, res, next) {
    if (req.user?.is_super_admin) return next(); // Super Admin bypass
    if (!req.user?.company_id) return res.status(403).json({ error: 'Company context diperlukan' });
    next();
}

// Require Super Admin — ALWAYS re-validate from DB (nicht trust JWT alone)
function requireSuperAdmin(req, res, next) {
    if (authDisabled) return next();
    if (!req.user?.is_super_admin) return res.status(403).json({ error: 'Akses Super Admin diperlukan' });
    // Re-validate dari DB untuk mencegah JWT tampering
    query(`SELECT is_super_admin FROM users WHERE id = $1 AND is_active = true`, [req.user.id])
        .then(r => {
            if (r.rows.length === 0 || !r.rows[0].is_super_admin) {
                return res.status(403).json({ error: 'Akses Super Admin ditolak' });
            }
            next();
        })
        .catch(() => res.status(500).json({ error: 'Server error' }));
}

// Check branch access — validasi branch milik company aktif
function requireBranch(req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'Token diperlukan' });
    const branchId = req.params.branchId || req.body.branch_id || req.query.branch_id;
    if (!branchId) return next();
    if (req.user.is_super_admin) return next(); // Super Admin bypass

    // Pastikan branch ada di daftar branch user (sudah difilter per company saat login)
    if (req.user.branchIds && !req.user.branchIds.includes(branchId)) {
        return res.status(403).json({ error: 'Anda tidak memiliki akses ke cabang ini' });
    }
    next();
}

module.exports = { authenticateToken, requirePermission, requireCompany, requireBranch, requireSuperAdmin };
