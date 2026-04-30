/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * RestoERP — RBAC Module Index
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Central export for all RBAC components.
 *
 * Auth is unified in middleware/auth.js (single source of truth).
 * This module provides the authorize() helper and permission utilities.
 *
 *   const { authorize, getUserPermissions, hasPermission } = require('./rbac');
 */

const { authorize } = require('./middleware/authorize');
const { getUserPermissions, hasPermission } = require('./helpers/permissionHelper');

module.exports = {
    authorize,
    getUserPermissions,
    hasPermission,
};
