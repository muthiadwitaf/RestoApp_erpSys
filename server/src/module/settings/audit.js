const router = require('express').Router();
const { query } = require('../../config/db');
const { authenticateToken, requirePermission } = require('../../middleware/auth');
const { asyncHandler, parsePagination } = require('../../utils/helpers');

router.use(authenticateToken);

// GET /api/settings/audit
router.get('/', requirePermission('settings:view'), asyncHandler(async (req, res) => {
    const { module, action, search, from, to } = req.query;
    const { page, limit, offset } = parsePagination(req.query);
    const companyId = req.user.company_id;

    let where = ['b.company_id = $1'];
    let values = [companyId];
    let idx = 2;

    if (module) { where.push(`a.module = $${idx++}`); values.push(module); }
    if (action) { where.push(`a.action = $${idx++}`); values.push(action); }
    if (from) { where.push(`a.timestamp >= $${idx++}`); values.push(from); }
    if (to) { where.push(`a.timestamp <= $${idx++}::timestamptz + interval '1 day'`); values.push(to); }
    if (search) { where.push(`(a.description ILIKE $${idx} OR u.name ILIKE $${idx} OR u.email ILIKE $${idx})`); values.push(`%${search}%`); idx++; }

    const whereClause = 'WHERE ' + where.join(' AND ');

    const countResult = await query(
        `SELECT COUNT(*) FROM audit_trail a
         LEFT JOIN branches b ON a.branch_id = b.id
         LEFT JOIN users u ON a.user_id = u.id ${whereClause}`,
        values
    );
    const total = parseInt(countResult.rows[0].count);

    const result = await query(
        `SELECT a.id, a.action, a.module, a.description,
                a.user_name as user_name_stored,
                a.timestamp, a.details_json,
                b.name as branch_name, b.uuid as branch_id,
                u.name  as user_name,
                u.email as user_email
         FROM audit_trail a
         LEFT JOIN branches b ON a.branch_id = b.id
         LEFT JOIN users u ON a.user_id = u.id
         ${whereClause} ORDER BY a.timestamp DESC LIMIT $${idx++} OFFSET $${idx++}`,
        [...values, limit, offset]
    );

    res.json({ data: result.rows, total, page, limit });
}));

module.exports = router;
