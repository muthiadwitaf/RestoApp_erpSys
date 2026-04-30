/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * RestoERP — Permission-Based Authorization Middleware (NO BYPASS)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Dynamic permission checking middleware.
 * Must be used AFTER authenticateToken (requires req.user).
 *
 * Features:
 *   • Caches permissions per request on req.permissions (avoids duplicate DB calls)
 *   • Supports single or multiple permissions (OR logic)
 *   • Uses the optimized getUserPermissions() single-query helper
 *
 * ❌ NO super admin bypass — admin role has ALL permissions via DB mapping
 *
 * Usage:
 *   const { authorize } = require('../rbac/middleware/authorize');
 *   router.post('/orders', authorize('orders:create'), handler);
 *   router.get('/dashboard', authorize('reports:view', 'orders:view'), handler);
 */

const { getUserPermissions, hasPermission } = require('../helpers/permissionHelper');

/**
 * Creates an Express middleware that checks if the authenticated user
 * has at least one of the specified permissions.
 *
 * @param {...string} requiredPermissions - One or more permission names (OR logic)
 * @returns {import('express').RequestHandler} Express middleware function
 */
function authorize(...requiredPermissions) {
    return async (req, res, next) => {
        try {
            if (!req.user?.id) {
                return res.status(401).json({
                    error: 'Autentikasi diperlukan',
                    code: 'NOT_AUTHENTICATED',
                });
            }

            // Load and cache permissions for this request
            if (!req.permissions) {
                req.permissions = await getUserPermissions(req.user.id);
            }

            // OR logic: any one permission match = granted
            const allowed = requiredPermissions.some(perm =>
                hasPermission(req.permissions, perm)
            );

            if (!allowed) {
                return res.status(403).json({
                    error: 'Akses ditolak — izin tidak mencukupi',
                    code: 'FORBIDDEN',
                    required: requiredPermissions,
                });
            }

            next();
        } catch (err) {
            console.error('[authorize] Permission check failed:', err.message);
            return res.status(500).json({
                error: 'Server error saat cek otorisasi',
                code: 'AUTH_CHECK_ERROR',
            });
        }
    };
}

module.exports = { authorize };
