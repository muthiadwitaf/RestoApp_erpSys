const router = require('express').Router();
const { query, getClient } = require('../../config/db');
const { authenticateToken, requirePermission } = require('../../middleware/auth');
const { asyncHandler } = require('../../utils/helpers');

router.use(authenticateToken);

// GET /api/resto/tables
router.get('/', requirePermission('pos:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const roomUuid = req.query.room_id;
    let where = ['t.company_id = $1'];
    let values = [companyId];
    let idx = 2;
    if (roomUuid) {
        where.push(`r.uuid = $${idx++}`);
        values.push(roomUuid);
    }
    const result = await query(
        `SELECT t.uuid, t.number, t.label, t.capacity, t.shape,
                t.pos_x, t.pos_y, t.width, t.height, t.status, t.is_active,
                r.uuid as room_id, r.name as room_name
         FROM resto_tables t
         LEFT JOIN resto_rooms r ON t.room_id = r.id
         WHERE ${where.join(' AND ')}
         ORDER BY t.number`,
        values
    );
    res.json(result.rows);
}));

// POST /api/resto/tables
router.post('/', requirePermission('pos:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const { room_id, number, label, capacity, shape, pos_x, pos_y, width, height } = req.body;
    if (!number) return res.status(400).json({ error: 'Nomor meja wajib diisi' });

    let roomIntId = null;
    if (room_id) {
        const rr = await query(`SELECT id FROM resto_rooms WHERE uuid=$1 AND company_id=$2`, [room_id, companyId]);
        roomIntId = rr.rows[0]?.id || null;
    }
    const result = await query(
        `INSERT INTO resto_tables (company_id, room_id, number, label, capacity, shape, pos_x, pos_y, width, height)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING uuid, number, label, capacity, shape, pos_x, pos_y, width, height, status`,
        [companyId, roomIntId, number, label || null, capacity || 4, shape || 'square',
         pos_x || 0, pos_y || 0, width || 80, height || 80]
    );
    res.status(201).json(result.rows[0]);
}));

// PUT /api/resto/tables/:uuid
router.put('/:uuid', requirePermission('pos:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const { number, label, capacity, shape, pos_x, pos_y, width, height, status, room_id, is_active } = req.body;

    let roomIntId = undefined;
    if (room_id !== undefined) {
        if (room_id) {
            const rr = await query(`SELECT id FROM resto_rooms WHERE uuid=$1 AND company_id=$2`, [room_id, companyId]);
            roomIntId = rr.rows[0]?.id || null;
        } else {
            roomIntId = null;
        }
    }

    const result = await query(
        `UPDATE resto_tables SET
            number=COALESCE($1,number), label=COALESCE($2,label), capacity=COALESCE($3,capacity),
            shape=COALESCE($4,shape), pos_x=COALESCE($5,pos_x), pos_y=COALESCE($6,pos_y),
            width=COALESCE($7,width), height=COALESCE($8,height), status=COALESCE($9,status),
            room_id=COALESCE($10,room_id), is_active=COALESCE($11,is_active), updated_at=NOW()
         WHERE uuid=$12 AND company_id=$13
         RETURNING uuid, number, label, capacity, shape, pos_x, pos_y, width, height, status`,
        [number, label, capacity, shape, pos_x, pos_y, width, height, status,
         roomIntId, is_active, req.params.uuid, companyId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Meja tidak ditemukan' });
    res.json(result.rows[0]);
}));

// DELETE /api/resto/tables/:uuid
router.delete('/:uuid', requirePermission('pos:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const result = await query(
        `DELETE FROM resto_tables WHERE uuid=$1 AND company_id=$2 RETURNING uuid`,
        [req.params.uuid, companyId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Meja tidak ditemukan' });
    res.json({ message: 'Meja dihapus' });
}));

// POST /api/resto/tables/bulk — save layout positions
router.post('/bulk', requirePermission('pos:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const { tables } = req.body;
    if (!Array.isArray(tables)) return res.status(400).json({ error: 'Data meja tidak valid' });

    const client = await getClient();
    try {
        await client.query('BEGIN');
        for (const t of tables) {
            await client.query(
                `UPDATE resto_tables SET pos_x=$1, pos_y=$2, width=COALESCE($3,width), height=COALESCE($4,height), updated_at=NOW()
                 WHERE uuid=$5 AND company_id=$6`,
                [t.pos_x, t.pos_y, t.width, t.height, t.uuid, companyId]
            );
        }
        await client.query('COMMIT');
        res.json({ message: 'Layout disimpan', count: tables.length });
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}));

module.exports = router;
