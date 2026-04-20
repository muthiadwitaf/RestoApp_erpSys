// Wrap async route handlers to catch errors automatically
function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

// Strip internal id from response, keep uuid
function sanitizeResponse(obj) {
    if (!obj) return obj;
    if (Array.isArray(obj)) return obj.map(sanitizeResponse);
    const { id, ...rest } = obj;
    return rest;
}

// Parse pagination params
function parsePagination(query) {
    const page = Math.max(1, parseInt(query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 20));
    const offset = (page - 1) * limit;
    return { page, limit, offset };
}

// SECURITY: Allowlist of tables that can be used in resolveUUID
const ALLOWED_RESOLVE_TABLES = new Set([
    'items', 'warehouses', 'categories', 'branches', 'suppliers',
    'resto_waiters', 'units', 'customers', 'users', 'roles',
    'companies', 'resto_menu_items', 'resto_tables', 'chart_of_accounts',
]);

// Resolve UUID to integer id from a table
async function resolveUUID(value, table, queryFn) {
    if (!value || value === "") return null;
    if (typeof value === 'number') return value;
    if (!ALLOWED_RESOLVE_TABLES.has(table)) {
        throw new Error(`resolveUUID: table '${table}' is not in the allowlist`);
    }
    if (typeof value === 'string' && value.includes('-')) {
        const r = await queryFn(`SELECT id FROM ${table} WHERE uuid = $1`, [value]);
        return r.rows[0]?.id || null;
    }
    return parseInt(value) || value;
}

/**
 * Update chart_of_accounts.balance for every line of a posted journal.
 * Call this immediately after inserting all journal_lines when status='posted'.
 * Formula: balance += debit - credit  (standard double-entry bookkeeping)
 *
 * @param {object} client - pg transaction client (or the query function itself)
 * @param {number} journalId - internal integer id of the journal_entries row
 */
async function updateCoaBalancesForJournal(client, journalId) {
    const lines = await client.query(
        `SELECT account_id, debit, credit FROM journal_lines WHERE journal_id = $1`,
        [journalId]
    );
    for (const l of lines.rows) {
        await client.query(
            `UPDATE chart_of_accounts SET balance = balance + $1 - $2, updated_at = NOW() WHERE id = $3`,
            [parseFloat(l.debit) || 0, parseFloat(l.credit) || 0, l.account_id]
        );
    }
}

module.exports = { asyncHandler, sanitizeResponse, parsePagination, resolveUUID, updateCoaBalancesForJournal };
