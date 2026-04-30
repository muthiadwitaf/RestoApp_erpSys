/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * RestoERP — Unified Authentication Middleware
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * SINGLE SOURCE OF TRUTH for JWT verification.
 * Applied GLOBALLY at /api level in server.js.
 *
 * Exports:
 *   1. authenticateToken  — JWT verification (global)
 *   2. requirePermission  — Permission-based authorization (granular, NO bypass)
 *   3. requireTenant      — Ensures company_id context is present
 *   4. requireSuperAdmin  — DB-validated super admin check (platform module only)
 *   5. requireCompany     — Alias for requireTenant (backward compat)
 *
 * ❌ REMOVED:
 *   - is_super_admin bypass from ALL permission/role checks
 *   - requireRole, requireAnyRole (use permission-based checks only)
 *   - requireBranch bypass
 *
 * ✅ DESIGN:
 *   - Permission-based, never role-based
 *   - No bypass logic anywhere
 *   - Admin role has ALL permissions via DB, not via code bypass
 */

const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../config/auth');
const { query } = require('../config/db');


// ─── 1. VERIFY JWT ACCESS TOKEN ──────────────────────────────────────────────
/**
 * Extracts and verifies JWT from Authorization: Bearer <token>
 * On success, attaches decoded payload to req.user.
 *
 * Applied GLOBALLY at /api level. Public routes are excluded in server.js.
 */
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7)
        : null;

    if (!token) {
        return res.status(401).json({ error: 'Token diperlukan', code: 'NO_TOKEN' });
    }

    try {
        const decoded = jwt.verify(token, jwtSecret);

        // Reject temp tokens (company-selection flow only)
        if (decoded.temp) {
            return res.status(401).json({ error: 'Token tidak valid untuk akses API', code: 'TEMP_TOKEN' });
        }

        req.user = decoded;
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
        }
        return res.status(403).json({ error: 'Token tidak valid', code: 'INVALID_TOKEN' });
    }
}


// ─── 2. REQUIRE PERMISSION (NO BYPASS — Permission-based only) ──────────────
/**
 * Checks if user has at least ONE of the specified permissions (OR logic).
 * Permissions are loaded from DB on first call per request, then cached on req.permissions.
 *
 * ❌ NO is_super_admin bypass — admin role simply has all permissions in DB.
 *
 * @param {...string} permissions - One or more namespaced permission names
 * @returns {Function} Express middleware
 *
 * @example
 * router.get('/orders', requirePermission('orders:view'), handler)
 * router.post('/orders', requirePermission('orders:create'), handler)
 */
function requirePermission(...permissions) {
    return async (req, res, next) => {
        try {
            if (!req.user?.id) {
                return res.status(401).json({ error: 'Autentikasi diperlukan', code: 'NOT_AUTHENTICATED' });
            }

            // Load and cache permissions for this request (single DB query)
            if (!req.permissions) {
                const result = await query(
                    `SELECT DISTINCT p.name
                     FROM permissions p
                     INNER JOIN role_permissions rp ON p.id = rp.permission_id
                     INNER JOIN user_roles ur ON rp.role_id = ur.role_id
                     WHERE ur.user_id = $1`,
                    [req.user.id]
                );
                req.permissions = new Set(result.rows.map(r => r.name));
            }

            // OR logic: any one permission match = granted
            const has = permissions.some(p => req.permissions.has(p));
            if (!has) {
                return res.status(403).json({
                    error: 'Anda tidak memiliki izin untuk aksi ini',
                    code: 'FORBIDDEN',
                    required: permissions,
                });
            }
            next();
        } catch (err) {
            console.error('[requirePermission] Error:', err.message);
            return res.status(500).json({ error: 'Server error saat cek izin', code: 'AUTH_CHECK_ERROR' });
        }
    };
}


// ─── 3. REQUIRE TENANT (Company context) ─────────────────────────────────────
/**
 * Ensures req.user has a company_id (user has selected a company).
 * Applied globally after authenticateToken.
 */
function requireTenant(req, res, next) {
    if (!req.user?.company_id) {
        return res.status(403).json({ error: 'Company context diperlukan', code: 'NO_COMPANY' });
    }
    next();
}


// ─── 4. REQUIRE SUPER ADMIN (DB-validated, platform module only) ─────────────
/**
 * Only super admins can access platform-level management (company module).
 * Always re-validates from database to prevent JWT tampering.
 *
 * ⚠️ This is NOT a bypass — it's a dedicated access control for the platform module.
 */
function requireSuperAdmin(req, res, next) {
    if (!req.user?.is_super_admin) {
        return res.status(403).json({ error: 'Akses Super Admin diperlukan' });
    }
    // Re-validate from DB
    query(`SELECT is_super_admin FROM users WHERE id = $1 AND is_active = true`, [req.user.id])
        .then(r => {
            if (r.rows.length === 0 || !r.rows[0].is_super_admin) {
                return res.status(403).json({ error: 'Akses Super Admin ditolak' });
            }
            next();
        })
        .catch(() => res.status(500).json({ error: 'Server error' }));
}


// ─── 5. REQUIRE COMPANY (backward compat alias) ─────────────────────────────
const requireCompany = requireTenant;


module.exports = {
    authenticateToken,
    requirePermission,
    requireTenant,
    requireCompany,
    requireSuperAdmin,
};
