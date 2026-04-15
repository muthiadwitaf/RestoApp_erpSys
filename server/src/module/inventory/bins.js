/**
 * bins.js — Warehouse Bin Location API
 * Route: /api/inventory/bins
 *
 * Bin Endpoints:
 *   GET    /bins?warehouse_id=<uuid>              — list semua bin + items
 *   GET    /bins/:uuid                            — detail bin
 *   POST   /bins                                  — buat satu bin
 *   POST   /bins/bulk                             — buat rak + bin sekaligus
 *   PUT    /bins/:uuid                            — edit label/is_active bin
 *   DELETE /bins/:uuid                            — hapus bin (hanya jika kosong)
 *   DELETE /bins/rack/:warehouseUuid/:rack        — hapus seluruh rak
 *
 * Rack Position Endpoints:
 *   GET    /bins/racks?warehouse_id=<uuid>        — list rak + posisi di lantai
 *   PUT    /bins/racks/:uuid                      — update floor_row, floor_col rak
 *
 * Bin Item Endpoints:
 *   POST   /bins/:uuid/items                      — masukkan barang ke bin
 *   PUT    /bins/:uuid/items/:itemUuid            — update qty
 *   DELETE /bins/:uuid/items/:itemUuid            — keluarkan barang
 */

const router = require('express').Router();
const { query } = require('../../config/db');
const { authenticateToken, requirePermission } = require('../../middleware/auth');
const { validateUUID } = require('../../middleware/validate');
const { asyncHandler, resolveUUID } = require('../../utils/helpers');

router.use(authenticateToken);

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
async function resolveBin(uuid) {
    const r = await query(`SELECT id, warehouse_id FROM warehouse_bins WHERE uuid = $1`, [uuid]);
    if (r.rows.length === 0) throw Object.assign(new Error('Bin tidak ditemukan'), { status: 404 });
    return r.rows[0];
}
async function resolveWarehouse(uuid) {
    const r = await query(`SELECT id FROM warehouses WHERE uuid = $1`, [uuid]);
    if (r.rows.length === 0) throw Object.assign(new Error('Gudang tidak ditemukan'), { status: 404 });
    return r.rows[0].id;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /bins/racks?warehouse_id=<uuid>  — list rak + posisi di lantai gudang
router.get('/racks', requirePermission('inventory:view', 'inventory:manage'), asyncHandler(async (req, res) => {
    const { warehouse_id } = req.query;
    if (!warehouse_id) return res.status(400).json({ error: 'warehouse_id wajib diisi' });
    const whId = await resolveWarehouse(warehouse_id);

    const result = await query(`
        SELECT uuid, rack, floor_row, floor_col, total_rows, total_cols
        FROM warehouse_racks
        WHERE warehouse_id = $1
        ORDER BY floor_row, floor_col, rack
    `, [whId]);
    res.json(result.rows);
}));

// ─────────────────────────────────────────────────────────────────────────────
// PUT /bins/racks/:uuid  — update floor_row, floor_col sebuah rak (atur posisi layout)
router.put('/racks/:uuid', requirePermission('inventory:edit', 'inventory:manage'), asyncHandler(async (req, res) => {
    const { floor_row, floor_col } = req.body;
    if (!floor_row || !floor_col) return res.status(400).json({ error: 'floor_row dan floor_col wajib diisi' });

    const r = await query(`
        UPDATE warehouse_racks
        SET floor_row = $1, floor_col = $2, updated_at = NOW()
        WHERE uuid = $3
        RETURNING uuid, rack, floor_row, floor_col, total_rows, total_cols
    `, [floor_row, floor_col, req.params.uuid]);

    if (r.rows.length === 0) return res.status(404).json({ error: 'Rak tidak ditemukan' });
    res.json(r.rows[0]);
}));

// ─────────────────────────────────────────────────────────────────────────────
// GET /bins?warehouse_id=<uuid>  — list semua bin di satu gudang
router.get('/', requirePermission('inventory:view', 'inventory:manage'), asyncHandler(async (req, res) => {
    const { warehouse_id } = req.query;
    if (!warehouse_id) return res.status(400).json({ error: 'warehouse_id wajib diisi' });
    const whId = await resolveWarehouse(warehouse_id);

    const bins = await query(`
        SELECT
            wb.uuid, wb.rack, wb.row_num, wb.col_num, wb.label, wb.is_active,
            wr.floor_row, wr.floor_col, wr.total_rows, wr.total_cols,
            COALESCE(
                json_agg(
                    json_build_object(
                        'item_uuid',  i.uuid,
                        'item_code',  i.code,
                        'item_name',  i.name,
                        'batch_uuid', b.uuid,
                        'batch_no',   b.batch_no,
                        'qty',        bi.qty,
                        'uom',        bi.uom,
                        'stored_at',  bi.stored_at,
                        'stored_by',  bi.stored_by
                    ) ORDER BY i.name
                ) FILTER (WHERE bi.id IS NOT NULL),
                '[]'
            ) AS items
        FROM warehouse_bins wb
        LEFT JOIN warehouse_racks wr ON wr.warehouse_id = wb.warehouse_id AND wr.rack = wb.rack
        LEFT JOIN bin_items bi ON bi.bin_id = wb.id
        LEFT JOIN items i      ON i.id = bi.item_id
        LEFT JOIN batches b    ON b.id = bi.batch_id
        WHERE wb.warehouse_id = $1
        GROUP BY wb.id, wr.floor_row, wr.floor_col, wr.total_rows, wr.total_cols
        ORDER BY wb.rack, wb.row_num, wb.col_num
    `, [whId]);

    res.json(bins.rows);
}));

// ─────────────────────────────────────────────────────────────────────────────
// GET /bins/:uuid — detail satu bin
router.get('/:uuid', requirePermission('inventory:view', 'inventory:manage'), validateUUID(), asyncHandler(async (req, res) => {
    const r = await query(`
        SELECT wb.uuid, wb.rack, wb.row_num, wb.col_num, wb.label, wb.is_active,
               w.uuid as warehouse_uuid, w.name as warehouse_name
        FROM warehouse_bins wb
        JOIN warehouses w ON w.id = wb.warehouse_id
        WHERE wb.uuid = $1`, [req.params.uuid]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'Bin tidak ditemukan' });

    const binId = (await query(`SELECT id FROM warehouse_bins WHERE uuid = $1`, [req.params.uuid])).rows[0].id;
    const items = await query(`
        SELECT bi.qty, bi.uom,
               i.uuid as item_uuid, i.code as item_code, i.name as item_name,
               b.uuid as batch_uuid, b.batch_no, b.expiry_date
        FROM bin_items bi
        JOIN items i ON i.id = bi.item_id
        LEFT JOIN batches b ON b.id = bi.batch_id
        WHERE bi.bin_id = $1 ORDER BY i.name`, [binId]);

    res.json({ ...r.rows[0], items: items.rows });
}));

// ─────────────────────────────────────────────────────────────────────────────
// POST /bins — buat satu bin baru
router.post('/', requirePermission('inventory:create', 'inventory:manage'), asyncHandler(async (req, res) => {
    const { warehouse_id, rack, row_num, col_num, label } = req.body;
    if (!warehouse_id || !rack || !row_num || !col_num)
        return res.status(400).json({ error: 'warehouse_id, rack, row_num, col_num wajib diisi' });

    const whId = await resolveWarehouse(warehouse_id);
    const r = await query(`
        INSERT INTO warehouse_bins (warehouse_id, rack, row_num, col_num, label)
        VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (warehouse_id, rack, row_num, col_num) DO NOTHING
        RETURNING uuid, rack, row_num, col_num, label`,
        [whId, rack.trim().toUpperCase(), row_num, col_num, label || null]);

    if (r.rows.length === 0) return res.status(409).json({ error: 'Bin di posisi tersebut sudah ada' });
    res.status(201).json(r.rows[0]);
}));

// ─────────────────────────────────────────────────────────────────────────────
// POST /bins/bulk — buat rak sekaligus (total_rows × total_cols bin)
router.post('/bulk', requirePermission('inventory:create', 'inventory:manage'), asyncHandler(async (req, res) => {
    const { warehouse_id, rack, total_rows, total_cols, floor_row, floor_col } = req.body;
    if (!warehouse_id || !rack || !total_rows || !total_cols)
        return res.status(400).json({ error: 'warehouse_id, rack, total_rows, total_cols wajib diisi' });
    if (total_rows > 20 || total_cols > 20)
        return res.status(400).json({ error: 'Maksimum 20 baris / 20 kolom per rak' });

    const whId = await resolveWarehouse(warehouse_id);
    const rackCode = rack.trim().toUpperCase();

    // Build bulk insert for bins
    const params = []; const vals = []; let idx = 1;
    for (let r = 1; r <= total_rows; r++) {
        for (let c = 1; c <= total_cols; c++) {
            vals.push(`($${idx++},$${idx++},$${idx++},$${idx++})`);
            params.push(whId, rackCode, r, c);
        }
    }
    const inserted = await query(`
        INSERT INTO warehouse_bins (warehouse_id, rack, row_num, col_num)
        VALUES ${vals.join(',')}
        ON CONFLICT (warehouse_id, rack, row_num, col_num) DO NOTHING
        RETURNING uuid, rack, row_num, col_num`, params);

    // Calculate default floor position: place to the right of last existing rack
    let fRow = floor_row || 1;
    let fCol = floor_col;
    if (!fCol) {
        const existing = await query(
            `SELECT COALESCE(MAX(floor_col), 0) as max_col FROM warehouse_racks WHERE warehouse_id = $1`,
            [whId]
        );
        fCol = parseInt(existing.rows[0].max_col) + 1;
    }

    // Upsert into warehouse_racks
    await query(`
        INSERT INTO warehouse_racks (warehouse_id, rack, floor_row, floor_col, total_rows, total_cols)
        VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (warehouse_id, rack)
        DO UPDATE SET total_rows=$5, total_cols=$6, updated_at=NOW()`,
        [whId, rackCode, fRow, fCol, total_rows, total_cols]);

    await query(`INSERT INTO audit_trail (action,module,description,user_id,user_name) VALUES ('create','inventory',$1,$2,$3)`,
        [`Buat rak ${rackCode} (${total_rows}×${total_cols}) di gudang`, req.user.id, req.user.name]);

    res.status(201).json({ created: inserted.rows.length, bins: inserted.rows });
}));

// ─────────────────────────────────────────────────────────────────────────────
// PUT /bins/:uuid — edit label / is_active
router.put('/:uuid', requirePermission('inventory:edit', 'inventory:manage'), validateUUID(), asyncHandler(async (req, res) => {
    const { label, is_active } = req.body;
    const r = await query(`
        UPDATE warehouse_bins
        SET label=$1, is_active=COALESCE($2,is_active), updated_at=NOW()
        WHERE uuid=$3
        RETURNING uuid, rack, row_num, col_num, label, is_active`,
        [label !== undefined ? label : null, is_active !== undefined ? is_active : null, req.params.uuid]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'Bin tidak ditemukan' });
    res.json(r.rows[0]);
}));

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /bins/:uuid — hapus bin (hanya jika kosong)
router.delete('/:uuid', requirePermission('inventory:delete', 'inventory:manage'), validateUUID(), asyncHandler(async (req, res) => {
    const bin = await resolveBin(req.params.uuid);
    const check = await query(`SELECT COUNT(*) as cnt FROM bin_items WHERE bin_id=$1 AND qty>0`, [bin.id]);
    if (parseInt(check.rows[0].cnt) > 0)
        return res.status(400).json({ error: 'Bin masih berisi barang. Kosongkan dulu.' });
    await query(`DELETE FROM warehouse_bins WHERE uuid=$1`, [req.params.uuid]);
    res.json({ message: 'Bin berhasil dihapus' });
}));

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /bins/rack/:warehouseUuid/:rack — hapus seluruh rak
router.delete('/rack/:warehouseUuid/:rack', requirePermission('inventory:delete', 'inventory:manage'), asyncHandler(async (req, res) => {
    const { warehouseUuid, rack } = req.params;
    const whId = await resolveWarehouse(warehouseUuid);
    const check = await query(`
        SELECT COUNT(*) as cnt FROM bin_items bi
        JOIN warehouse_bins wb ON wb.id=bi.bin_id
        WHERE wb.warehouse_id=$1 AND wb.rack=$2 AND bi.qty>0`,
        [whId, rack.toUpperCase()]);
    if (parseInt(check.rows[0].cnt) > 0)
        return res.status(400).json({ error: 'Rak masih berisi barang. Kosongkan dulu.' });

    await query(`DELETE FROM warehouse_bins WHERE warehouse_id=$1 AND rack=$2`, [whId, rack.toUpperCase()]);
    await query(`DELETE FROM warehouse_racks WHERE warehouse_id=$1 AND rack=$2`, [whId, rack.toUpperCase()]);
    res.json({ message: `Rak ${rack} berhasil dihapus` });
}));

// ─────────────────────────────────────────────────────────────────────────────
// POST /bins/:uuid/items — masukkan barang ke bin
router.post('/:uuid/items', requirePermission('inventory:edit', 'inventory:manage'), validateUUID(), asyncHandler(async (req, res) => {
    const { item_id, batch_id, qty, uom } = req.body;
    if (!item_id || !qty || qty <= 0) return res.status(400).json({ error: 'item_id dan qty(>0) wajib diisi' });
    const bin = await resolveBin(req.params.uuid);
    const rItem = await resolveUUID(item_id, 'items', query);
    const rBatch = batch_id ? await resolveUUID(batch_id, 'batches', query) : null;

    const storedBy = req.user?.name || req.user?.email || 'System';

    const r = await query(`
        INSERT INTO bin_items (bin_id, item_id, batch_id, qty, uom, stored_at, stored_by)
        VALUES ($1,$2,$3,$4,$5, NOW(), $6)
        ON CONFLICT (bin_id, item_id, batch_id) DO UPDATE
            SET qty        = bin_items.qty + EXCLUDED.qty,
                uom        = COALESCE(EXCLUDED.uom, bin_items.uom),
                updated_at = NOW()
                -- stored_at & stored_by TIDAK diupdate, tetap tanggal pertama kali masuk
        RETURNING *`,
        [bin.id, rItem, rBatch, qty, uom || null, storedBy]);
    res.status(201).json(r.rows[0]);
}));


// ─────────────────────────────────────────────────────────────────────────────
// PUT /bins/:uuid/items/:itemUuid — update qty barang di bin
router.put('/:uuid/items/:itemUuid', requirePermission('inventory:edit', 'inventory:manage'), asyncHandler(async (req, res) => {
    const { qty, uom } = req.body;
    const bin = await resolveBin(req.params.uuid);
    const rItem = await resolveUUID(req.params.itemUuid, 'items', query);
    if (qty !== undefined && qty <= 0) {
        await query(`DELETE FROM bin_items WHERE bin_id=$1 AND item_id=$2`, [bin.id, rItem]);
        return res.json({ message: 'Barang dikeluarkan dari bin' });
    }
    const r = await query(`UPDATE bin_items SET qty=$1, uom=COALESCE($2,uom), updated_at=NOW()
        WHERE bin_id=$3 AND item_id=$4 RETURNING *`, [qty, uom || null, bin.id, rItem]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'Item tidak ada di bin ini' });
    res.json(r.rows[0]);
}));

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /bins/:uuid/items/:itemUuid — keluarkan barang dari bin
router.delete('/:uuid/items/:itemUuid', requirePermission('inventory:edit', 'inventory:manage'), asyncHandler(async (req, res) => {
    const bin = await resolveBin(req.params.uuid);
    const rItem = await resolveUUID(req.params.itemUuid, 'items', query);
    await query(`DELETE FROM bin_items WHERE bin_id=$1 AND item_id=$2`, [bin.id, rItem]);
    res.json({ message: 'Barang dikeluarkan dari bin' });
}));

module.exports = router;
