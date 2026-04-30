/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * RestoERP — RBAC Permission Helpers
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Utility functions for permission resolution:
 *   • getUserPermissions(userId) — Single optimized JOIN query
 *   • hasPermission(permissions, permission) — Check from cached set
 *
 * Design:
 *   - Permissions are loaded ONCE per request and cached on req.permissions
 *   - Uses a Set for O(1) lookup performance
 *   - Single SQL query with 3-table JOIN (no N+1 problem)
 */

const { query } = require('../../config/db');

/**
 * Fetch all permissions for a given user via their assigned roles.
 *
 * @param {number} userId - The user's internal SERIAL id
 * @returns {Promise<Set<string>>} Set of permission name strings
 */
async function getUserPermissions(userId) {
    const result = await query(
        `SELECT DISTINCT p.name
         FROM permissions p
         INNER JOIN role_permissions rp ON p.id = rp.permission_id
         INNER JOIN user_roles ur ON rp.role_id = ur.role_id
         WHERE ur.user_id = $1`,
        [userId]
    );

    return new Set(result.rows.map(row => row.name));
}

/**
 * Check whether a permission set contains a specific permission.
 *
 * @param {Set<string>} permissions - Set of permission names
 * @param {string} permission - The permission to check
 * @returns {boolean}
 */
function hasPermission(permissions, permission) {
    if (!(permissions instanceof Set)) return false;
    return permissions.has(permission);
}

module.exports = { getUserPermissions, hasPermission };
