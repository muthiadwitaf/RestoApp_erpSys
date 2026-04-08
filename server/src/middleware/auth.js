const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../config/auth');
const { query } = require('../config/db');

// Verify JWT access token
function authenticateToken(req, res, next) {
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
    const branchId = req.params.branchId || req.body.branch_id || req.query.branch_id;
    if (!branchId) return next();
    if (req.user?.is_super_admin) return next(); // Super Admin bypass

    // Pastikan branch ada di daftar branch user (sudah difilter per company saat login)
    if (req.user?.branchIds && !req.user.branchIds.includes(branchId)) {
        return res.status(403).json({ error: 'Anda tidak memiliki akses ke cabang ini' });
    }
    next();
}

module.exports = { authenticateToken, requirePermission, requireCompany, requireBranch, requireSuperAdmin };
