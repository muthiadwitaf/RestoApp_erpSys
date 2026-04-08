// Audit is now handled by the backend automatically.
// This composable is kept for backward compatibility but does nothing.
// BE logs audit trail on every CRUD operation automatically.

export function useAudit() {
    function addAudit(action, module, description, details = {}) {
        // No-op: BE handles audit logging automatically
    }

    return { addAudit }
}
