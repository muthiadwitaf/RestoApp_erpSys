// pos_sessions.js -- POS Cash Register Session (Buka / Tutup Kasir)
// Uses only plain ASCII characters.
// Table created automatically on first load via CREATE TABLE IF NOT EXISTS.

const router = require('express').Router();
const { query } = require('../../config/db');
const { authenticateToken, requirePermission } = require('../../middleware/auth');
const { asyncHandler } = require('../../utils/helpers');

router.use(authenticateToken);

// ── Bootstrap: create pos_sessions table if not exists ─────────────────────
;(async () => {
    try {
        await query(`
            CREATE TABLE IF NOT EXISTS pos_sessions (
                id                SERIAL PRIMARY KEY,
                uuid              UUID DEFAULT gen_random_uuid() UNIQUE,
                company_id        INTEGER NOT NULL,
                branch_id         INTEGER,
                cashier_id        INTEGER NOT NULL,
                cashier_name      VARCHAR(100),
                opened_at         TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                closed_at         TIMESTAMP WITH TIME ZONE,
                opening_cash      DECIMAL(15,2) NOT NULL DEFAULT 0,
                closing_cash      DECIMAL(15,2),
                total_cash        DECIMAL(15,2) DEFAULT 0,
                total_cash_in     DECIMAL(15,2) DEFAULT 0,
                total_cash_out    DECIMAL(15,2) DEFAULT 0,
                expected_cash     DECIMAL(15,2) DEFAULT 0,
                actual_cash       DECIMAL(15,2),
                difference        DECIMAL(15,2),
                total_qris        DECIMAL(15,2) DEFAULT 0,
                total_transfer    DECIMAL(15,2) DEFAULT 0,
                total_debit       DECIMAL(15,2) DEFAULT 0,
                total_sales       DECIMAL(15,2) DEFAULT 0,
                transaction_count INTEGER DEFAULT 0,
                status            VARCHAR(20) DEFAULT 'open',
                notes             TEXT
            )
        `);
        // Index for fast current-session lookup
        await query(`
            CREATE INDEX IF NOT EXISTS idx_pos_sessions_company_status
              ON pos_sessions (company_id, status, closed_at)
        `);
    } catch (e) {
        console.error('pos_sessions bootstrap error:', e.message);
    }
})();

// ── Helper: resolve branch integer id from uuid ─────────────────────────────
async function resolveBranchId(branchUuid, companyId) {
    if (!branchUuid) return null;
    const r = await query(
        `SELECT id FROM branches WHERE uuid::text = $1 AND company_id = $2`,
        [branchUuid, companyId]
    );
    return r.rows[0]?.id || null;
}

// ── GET /api/sales/pos-sessions/current ────────────────────────────────────
// Returns the active open session for THIS cashier + branch. Since V2, values are tracked real-time.
router.get('/current', requirePermission('pos:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const cashierId = req.user.id;
    const branchUuid = req.query.branch_id || null;

    const branchId = branchUuid ? await resolveBranchId(branchUuid, companyId) : null;

    const r = await query(
        `SELECT * FROM pos_sessions
          WHERE company_id = $1
            AND cashier_id = $2
            AND status = 'open'
            ${branchId ? 'AND branch_id = $3' : ''}
          ORDER BY opened_at DESC
          LIMIT 1`,
        branchId ? [companyId, cashierId, branchId] : [companyId, cashierId]
    );

    const session = r.rows[0];
    res.json(session || null);
}));

// ── POST /api/sales/pos-sessions/open ──────────────────────────────────────
// Buka Kasir: record opening cash, start session, set expected_cash.
router.post('/open', requirePermission('pos:view'), asyncHandler(async (req, res) => {
    const companyId  = req.user.company_id;
    const cashierId  = req.user.id;
    const cashierName = req.user.name || req.user.username || 'Kasir';
    const { opening_cash = 0, branch_id: branchUuid, notes } = req.body;

    if (!companyId) return res.status(403).json({ error: 'Company ID diperlukan.' });
    if (opening_cash < 0) return res.status(400).json({ error: 'Kas awal tidak boleh negatif.' });

    const branchId = branchUuid ? await resolveBranchId(branchUuid, companyId) : null;

    try {
        const existing = await query(
            `SELECT id FROM pos_sessions
              WHERE company_id = $1 AND cashier_id = $2 AND status = 'open'
                ${branchId ? 'AND branch_id = $3' : ''}
              LIMIT 1`,
            branchId ? [companyId, cashierId, branchId] : [companyId, cashierId]
        );
        if (existing.rows.length > 0) {
            return res.status(409).json({ error: 'Sesi kasir sudah terbuka. Tutup sesi sebelumnya.' });
        }

        const r = await query(
            `INSERT INTO pos_sessions
               (company_id, branch_id, cashier_id, cashier_name, opening_cash, notes, status)
             VALUES ($1,$2,$3,$4,$5,$6,'open')
             RETURNING *`,
            [companyId, branchId, cashierId, cashierName, opening_cash, notes || null]
        );

        const session = r.rows[0];

        // Audit Trail
        await query(
            `INSERT INTO audit_trail (action, module, description, user_id, user_name)
             VALUES ('OPEN','pos', $1, $2, $3)`,
            [JSON.stringify({ shift_id: session.uuid, opening_cash, note: notes }), cashierId, cashierName]
        );

        res.status(201).json(session);
    } catch (e) {
        console.error("pos_sessions open DB Error: ", e);
        res.status(500).json({ error: "Gagal membuka sesi kasir: " + e.message });
    }
}));

// ── POST /api/sales/pos-sessions/close ─────────────────────────────────────
// Tutup Kasir: seal shift.
router.post('/close', requirePermission('pos:view'), asyncHandler(async (req, res) => {
    const companyId  = req.user.company_id;
    const cashierId  = req.user.id;
    const cashierName = req.user.name || req.user.username || 'Kasir';
    const { session_uuid, actual_cash, notes } = req.body;

    let sessionQuery = `SELECT * FROM pos_sessions WHERE company_id = $1 AND status = 'open' `;
    let sessionParams = [companyId];
    
    if (session_uuid) {
        sessionQuery += `AND uuid = $2`;
        sessionParams.push(session_uuid);
    } else {
        sessionQuery += `AND cashier_id = $2 ORDER BY opened_at DESC LIMIT 1`;
        sessionParams.push(cashierId);
    }

    const sessionRes = await query(sessionQuery, sessionParams);
    if (!sessionRes.rows.length) {
        return res.status(404).json({ error: 'Tidak ada sesi kasir yang sedang terbuka.' });
    }
    const session = sessionRes.rows[0];

    const updated = await query(
        `UPDATE pos_sessions
            SET closed_at    = NOW(),
                status       = 'closed',
                closing_cash = $1, 
                notes        = COALESCE($2, notes)
          WHERE id = $3
          RETURNING *`,
        [actual_cash || session.total_cash, notes || null, session.id]
    );

    // Audit Trail
    await query(
        `INSERT INTO audit_trail (action, module, description, user_id, user_name)
         VALUES ('CLOSE','pos', $1, $2, $3)`,
        [JSON.stringify({
            shift_id: session.uuid,
            closing_cash: actual_cash || session.total_cash
        }), cashierId, cashierName]
    );

    res.json({ session: updated.rows[0] });
}));

// ── GET /api/sales/pos-sessions ─────────────────────────────────────────────
// List sessions for admin reporting (pos:view + optional date filter)
router.get('/', requirePermission('pos:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const { from, to, branch_id: branchUuid } = req.query;
    const branchId = branchUuid ? await resolveBranchId(branchUuid, companyId) : null;

    const params = [companyId];
    let extra = '';
    if (from)     { params.push(from);     extra += ` AND opened_at >= $${params.length}` }
    if (to)       { params.push(to + ' 23:59:59'); extra += ` AND opened_at <= $${params.length}` }
    if (branchId) { params.push(branchId); extra += ` AND branch_id = $${params.length}` }

    const r = await query(
        `SELECT * FROM pos_sessions
          WHERE company_id = $1 ${extra}
          ORDER BY opened_at DESC
          LIMIT 200`,
        params
    );
    res.json(r.rows);
}));

module.exports = router;
