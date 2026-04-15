const router = require('express').Router();
const { query } = require('../../config/db');
const { authenticateToken, requirePermission } = require('../../middleware/auth');
const { validateUUID } = require('../../middleware/validate');
const { asyncHandler } = require('../../utils/helpers');
const { upload, processImage, deleteImageFile } = require('../../middleware/upload');

router.use(authenticateToken);

// Helper: build image_url from stored columns
function buildImageUrl(image_id, image_company_uuid) {
    if (!image_id || !image_company_uuid) return null;
    return `/uploadedImage/${image_company_uuid}/${image_id}.webp`;
}

// GET /api/inventory/items
router.get('/', requirePermission('inventory:view', 'pos:view', 'accounting:view', 'purchasing:view'), asyncHandler(async (req, res) => {
    const { category_id, search, barcode, branch_id } = req.query;
    const companyId = req.user.company_id;
    let where = ['i.company_id = $1'];
    let values = [companyId];
    let idx = 2;

    const page = parseInt(req.query.page);
    const limit = parseInt(req.query.limit);
    let paginationSql = '';
    if (page && limit) {
        const offset = (page - 1) * limit;
        paginationSql = ` LIMIT $${idx++} OFFSET $${idx++}`;
        values.push(limit, offset);
    }

    if (category_id) { where.push(`i.category_id = $${idx++}`); values.push(category_id); }
    if (barcode) { where.push(`i.barcode = $${idx++}`); values.push(barcode); }
    if (search) { where.push(`(i.name ILIKE $${idx} OR i.code ILIKE $${idx} OR i.barcode ILIKE $${idx})`); values.push(`%${search}%`); idx++; }

    const whereClause = 'WHERE ' + where.join(' AND ');

    // Build stock subquery — filter by branch if provided, else sum all branches of company
    const stockSubquery = branch_id
        ? `(SELECT COALESCE(SUM(s.qty), 0) FROM inventory s JOIN warehouses w ON s.warehouse_id = w.id JOIN branches b ON w.branch_id = b.id WHERE s.item_id = i.id AND b.uuid::text = '${branch_id.replace(/'/g, "''")}')`
        : `(SELECT COALESCE(SUM(s.qty), 0) FROM inventory s JOIN warehouses w ON s.warehouse_id = w.id JOIN branches b ON w.branch_id = b.id WHERE s.item_id = i.id AND b.company_id = $1)`;

    const result = await query(
        `SELECT i.uuid, i.code, i.barcode, i.name, i.buy_price, i.sell_price, i.hpp,
       i.min_stock, i.conversion_factor, i.min_sell_qty, i.is_active,
       i.image_id, i.image_company_uuid, i.image_size_bytes,
       CASE WHEN i.image_id IS NOT NULL
            THEN '/uploadedImage/' || i.image_company_uuid || '/' || i.image_id || '.webp'
            ELSE NULL END AS image_url,
       i.category_id,
       su.uuid as small_uom_id, bu.uuid as big_uom_id,
       su.name as small_uom_name, bu.name as big_uom_name,
       c.name as category, c.name as category_name,
       ${stockSubquery} as stock,
       COALESCE(json_agg(json_build_object('min_qty',pt.min_qty,'price',pt.price,'label',pt.label)) FILTER (WHERE pt.id IS NOT NULL), '[]') as price_tiers
     FROM items i
     LEFT JOIN units su ON i.small_uom_id = su.id
     LEFT JOIN units bu ON i.big_uom_id = bu.id
     LEFT JOIN categories c ON i.category_id = c.id
     LEFT JOIN item_price_tiers pt ON pt.item_id = i.id
     ${whereClause}
     GROUP BY i.id, su.uuid, su.name, bu.uuid, bu.name, c.name
     ORDER BY i.id${paginationSql}`, values
    );
    res.json(result.rows);
}));

// GET /api/inventory/items/:uuid
router.get('/:uuid', requirePermission('inventory:view', 'purchasing:view'), validateUUID(), asyncHandler(async (req, res) => {
    const result = await query(
        `SELECT i.uuid, i.code, i.barcode, i.name, i.buy_price, i.sell_price, i.hpp,
       i.min_stock, i.conversion_factor, i.min_sell_qty, i.is_active,
       i.image_id, i.image_company_uuid, i.image_size_bytes,
       CASE WHEN i.image_id IS NOT NULL
            THEN '/uploadedImage/' || i.image_company_uuid || '/' || i.image_id || '.webp'
            ELSE NULL END AS image_url,
       i.category_id,
       su.uuid as small_uom_id, bu.uuid as big_uom_id,
       su.name as small_uom_name, bu.name as big_uom_name, c.name as category, c.name as category_name
     FROM items i
     LEFT JOIN units su ON i.small_uom_id = su.id LEFT JOIN units bu ON i.big_uom_id = bu.id
     LEFT JOIN categories c ON i.category_id = c.id
     WHERE i.uuid = $1`, [req.params.uuid]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Item tidak ditemukan' });

    const item = result.rows[0];
    const itemId = (await query(`SELECT id FROM items WHERE uuid = $1`, [req.params.uuid])).rows[0].id;
    const tiers = await query(`SELECT min_qty, price, label FROM item_price_tiers WHERE item_id = $1 ORDER BY min_qty`, [itemId]);
    item.price_tiers = tiers.rows;

    res.json(item);
}));

// POST /api/inventory/items/upload-image
// Must be defined BEFORE /:uuid to avoid route conflict
router.post('/upload-image', requirePermission('inventory:create', 'inventory:edit', 'purchasing:create', 'purchasing:edit'),
    upload.single('image'), asyncHandler(async (req, res) => {
        if (!req.file) return res.status(400).json({ error: 'File gambar diperlukan' });

        // Get company UUID for directory scoping
        const companyRes = await query(`SELECT uuid FROM companies WHERE id = $1`, [req.user.company_id]);
        if (!companyRes.rows.length) return res.status(400).json({ error: 'Company tidak ditemukan' });
        const companyUuid = companyRes.rows[0].uuid;

        const result = await processImage(req.file.buffer, companyUuid);
        res.json({
            image_id: result.image_id,
            image_company_uuid: result.image_company_uuid,
            image_size_bytes: result.image_size_bytes,
            image_url: result.image_url,
        });
    })
);

// Helper: resolve UUID or integer ID to integer ID for units/categories
async function resolveUnitId(val) {
    if (!val) return null;
    if (typeof val === 'string' && val.includes('-')) {
        const r = await query(`SELECT id FROM units WHERE uuid = $1`, [val]);
        return r.rows[0]?.id || null;
    }
    return val;
}
async function resolveCategoryId(val) {
    if (!val) return null;
    if (typeof val === 'string' && val.includes('-')) {
        const r = await query(`SELECT id FROM categories WHERE uuid = $1`, [val]);
        return r.rows[0]?.id || null;
    }
    return val;
}

// POST /api/inventory/items
router.post('/', requirePermission('inventory:create', 'purchasing:create'), asyncHandler(async (req, res) => {
    const { code, barcode, name, small_uom_id, big_uom_id, conversion_factor,
        min_stock, category_id, min_sell_qty,
        image_id, image_company_uuid, image_size_bytes } = req.body;
    if (!code || !name) return res.status(400).json({ error: 'Kode dan nama item wajib diisi' });

    const existing = await query(`SELECT id FROM items WHERE code = $1 AND company_id = $2`, [code, req.user.company_id]);
    if (existing.rows.length > 0) return res.status(409).json({ error: 'Kode item sudah digunakan' });

    const smallUomIntId = await resolveUnitId(small_uom_id);
    const bigUomIntId = await resolveUnitId(big_uom_id);
    const categoryIntId = await resolveCategoryId(category_id);

    const result = await query(
        `INSERT INTO items (code, barcode, name, small_uom_id, big_uom_id, conversion_factor,
         hpp, min_stock, category_id, min_sell_qty, company_id,
         image_id, image_company_uuid, image_size_bytes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id, uuid, code, name`,
        [code.trim(), barcode?.trim() || null, name.trim(), smallUomIntId || null, bigUomIntId || null,
        conversion_factor || 1, 0, min_stock || 0,
        categoryIntId || null, min_sell_qty || 1, req.user.company_id,
        image_id || null, image_company_uuid || null, image_size_bytes || null]
    );

    res.status(201).json({ uuid: result.rows[0].uuid, code: result.rows[0].code, name: result.rows[0].name });
    await query(`INSERT INTO audit_trail (action, module, description, user_id, user_name) VALUES ('create','inventory',$1,$2,$3)`,
        [`Tambah barang: ${result.rows[0].code} - ${result.rows[0].name}`, req.user.id, req.user.name]);
}));

// PUT /api/inventory/items/:uuid
router.put('/:uuid', requirePermission('inventory:edit', 'purchasing:edit'), validateUUID(), asyncHandler(async (req, res) => {
    const itemResult = await query(
        `SELECT id, image_id, image_company_uuid FROM items WHERE uuid = $1`, [req.params.uuid]
    );
    if (itemResult.rows.length === 0) return res.status(404).json({ error: 'Item tidak ditemukan' });
    const { id: itemId, image_id: oldImageId, image_company_uuid: oldImageCompanyUuid } = itemResult.rows[0];

    const { name, barcode, small_uom_id, big_uom_id, conversion_factor,
        min_stock, category_id, min_sell_qty, is_active,
        image_id, image_company_uuid, image_size_bytes } = req.body;

    const smallUomIntId = small_uom_id !== undefined ? await resolveUnitId(small_uom_id) : undefined;
    const bigUomIntId = big_uom_id !== undefined ? await resolveUnitId(big_uom_id) : undefined;
    const categoryIntId = category_id !== undefined ? await resolveCategoryId(category_id) : undefined;

    await query(
        `UPDATE items SET
         name=COALESCE($1,name), barcode=COALESCE($2,barcode),
         small_uom_id=COALESCE($3,small_uom_id), big_uom_id=$4,
         conversion_factor=COALESCE($5,conversion_factor),
         min_stock=COALESCE($6,min_stock), category_id=COALESCE($7,category_id),
         min_sell_qty=COALESCE($8,min_sell_qty), is_active=COALESCE($9,is_active),
         image_id=$10, image_company_uuid=$11, image_size_bytes=$12,
         updated_at=NOW() WHERE id=$13`,
        [name?.trim(), barcode?.trim() || null, smallUomIntId, bigUomIntId, conversion_factor,
            min_stock, categoryIntId, min_sell_qty, is_active,
        image_id !== undefined ? (image_id || null) : oldImageId,
        image_company_uuid !== undefined ? (image_company_uuid || null) : oldImageCompanyUuid,
        image_size_bytes !== undefined ? (image_size_bytes || null) : null,
            itemId]
    );

    // If image changed, delete old file from disk
    if (image_id !== undefined && image_id !== oldImageId && oldImageId && oldImageCompanyUuid) {
        deleteImageFile(oldImageCompanyUuid, oldImageId);
    }

    res.json({ message: 'Item berhasil diupdate' });
    await query(`INSERT INTO audit_trail (action, module, description, user_id, user_name) VALUES ('update','inventory',$1,$2,$3)`,
        [`Update barang: ${name || req.params.uuid}`, req.user.id, req.user.name]);
}));

// DELETE /api/inventory/items/:uuid (soft delete — nonaktifkan)
router.delete('/:uuid', requirePermission('inventory:delete', 'purchasing:delete'), validateUUID(), asyncHandler(async (req, res) => {
    const existing = await query(`SELECT name, code FROM items WHERE uuid = $1`, [req.params.uuid]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Item tidak ditemukan' });
    const { name, code } = existing.rows[0];
    await query(`UPDATE items SET is_active = false, updated_at = NOW() WHERE uuid = $1`, [req.params.uuid]);
    await query(`INSERT INTO audit_trail (action, module, description, user_id, user_name) VALUES ('delete','inventory',$1,$2,$3)`,
        [`Nonaktifkan barang: ${code} - ${name}`, req.user.id, req.user.name]);
    res.json({ message: 'Item dinonaktifkan' });
}));

module.exports = router;
