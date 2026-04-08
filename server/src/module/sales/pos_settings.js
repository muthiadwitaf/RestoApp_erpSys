// pos_settings.js -- POS Configuration: QRIS image + Bank transfer info
// Uses only plain ASCII characters.
// Stored as columns on the companies table (added via safeAlter at startup).
// Upload path: uploadedImage/{company_uuid}/POS/

const router = require('express').Router();
const path   = require('path');
const fs     = require('fs');
const { query }                              = require('../../config/db');
const { authenticateToken, requirePermission } = require('../../middleware/auth');
const { asyncHandler }                       = require('../../utils/helpers');
const { upload, UPLOAD_DIR }                 = require('../../middleware/upload');
const sharp  = require('sharp');

router.use(authenticateToken);

// ── Bootstrap: ensure POS columns exist on companies table ─────────────────
// Called once at module load — uses safeAlter pattern (ignores "already exists")
;(async () => {
    const safeAlter = async (sql) => {
        try { await query(sql); } catch (e) {
            if (!e.message.includes('already exists') &&
                !e.message.includes('duplicate column')) {
                console.error('pos_settings alter error:', e.message);
            }
        }
    };
    await safeAlter(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS pos_bank_name VARCHAR(100)`);
    await safeAlter(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS pos_bank_holder VARCHAR(100)`);
    await safeAlter(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS pos_bank_number VARCHAR(50)`);
    await safeAlter(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS pos_qris_url VARCHAR(500)`);
    // Pengaturan Kasir columns
    await safeAlter(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS pos_require_opening_cash BOOLEAN DEFAULT true`);
    await safeAlter(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS pos_hide_stock BOOLEAN DEFAULT false`);
    await safeAlter(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS pos_payment_methods VARCHAR(200) DEFAULT 'cash,qris,transfer'`);
    await safeAlter(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS pos_auto_close_time VARCHAR(10)`);
    // Ensure pos:settings permission row exists
    await query(`INSERT INTO permissions (name) VALUES ('pos:settings') ON CONFLICT (name) DO NOTHING`).catch(() => {});
})();

// -- GET /api/sales/pos-settings --------------------------------------------
// Readable by any authenticated user with pos:view (kasir needs this).
// Resilient: if POS columns not yet on companies table, falls back gracefully.
// Also checks disk for QRIS file as fallback if pos_qris_url col is missing.
router.get('/', requirePermission('pos:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    if (!companyId) return res.json({
        pos_bank_name: '', pos_bank_holder: '', pos_bank_number: '', pos_qris_url: ''
    });

    // Get company UUID (always available — not a new column)
    const compRow = await query(
        `SELECT uuid FROM companies WHERE id = $1`, [companyId]
    );
    const companyUuid = compRow.rows[0]?.uuid || null;

    // Try to read POS columns — they may not exist yet if safeAlter hasn't run
    let row = {};
    try {
        const result = await query(
            `SELECT COALESCE(pos_bank_name,'')   AS pos_bank_name,
                    COALESCE(pos_bank_holder,'') AS pos_bank_holder,
                    COALESCE(pos_bank_number,'') AS pos_bank_number,
                    COALESCE(pos_qris_url,'')    AS pos_qris_url,
                    COALESCE(pos_require_opening_cash, true)           AS pos_require_opening_cash,
                    COALESCE(pos_hide_stock, false)                    AS pos_hide_stock,
                    COALESCE(pos_payment_methods,'cash,qris,transfer') AS pos_payment_methods,
                    COALESCE(pos_auto_close_time,'')                   AS pos_auto_close_time
               FROM companies WHERE id = $1`, [companyId]
        );
        row = result.rows[0] || {};
    } catch (e) {
        // Columns not yet added -- silently continue with empty values
        row = { pos_bank_name: '', pos_bank_holder: '', pos_bank_number: '', pos_qris_url: '',
                pos_require_opening_cash: true, pos_hide_stock: false,
                pos_payment_methods: 'cash,qris,transfer', pos_auto_close_time: '' };
    }

    // Disk fallback: if pos_qris_url is empty but file exists on disk, serve it
    if (!row.pos_qris_url && companyUuid) {
        const qrisPath = path.join(UPLOAD_DIR, companyUuid, 'POS', 'qris.webp');
        if (fs.existsSync(qrisPath)) {
            row.pos_qris_url = `/uploadedImage/${companyUuid}/POS/qris.webp`;
            // Best-effort: update the DB column so next call won't need disk check
            query(
                `UPDATE companies SET pos_qris_url = $1 WHERE id = $2`,
                [row.pos_qris_url, companyId]
            ).catch(() => {});
        }
    }

    res.json(row);
}));


// -- PUT /api/sales/pos-settings -------------------------------------------
// Accepts pos:settings OR settings:edit (company admin)
// Only updates fields that are explicitly present in the request body,
// so saving one settings tab won't reset values from another tab.
router.put('/', requirePermission('pos:view', 'pos:settings', 'settings:edit'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    if (!companyId) return res.status(400).json({ error: 'Company context diperlukan.' });

    const fieldMap = {
        pos_bank_name:            (v) => v || null,
        pos_bank_holder:          (v) => v || null,
        pos_bank_number:          (v) => v || null,
        pos_require_opening_cash: (v) => Boolean(v),
        pos_hide_stock:           (v) => Boolean(v),
        pos_payment_methods:      (v) => v || 'cash,qris,transfer',
        pos_auto_close_time:      (v) => v || null,
    };

    const sets = [];
    const values = [];
    let idx = 1;
    for (const [field, transform] of Object.entries(fieldMap)) {
        if (req.body[field] !== undefined) {
            sets.push(`${field} = $${idx++}`);
            values.push(transform(req.body[field]));
        }
    }

    if (sets.length === 0) {
        return res.json({ message: 'Tidak ada perubahan.' });
    }

    sets.push('updated_at = NOW()');
    values.push(companyId);

    await query(
        `UPDATE companies SET ${sets.join(', ')} WHERE id = $${idx}`,
        values
    );
    await query(
        `INSERT INTO audit_trail (action, module, description, user_id, user_name)
         VALUES ('update','pos','Update POS Settings',$1,$2)`,
        [req.user.id, req.user.name]
    ).catch(() => {});
    res.json({ message: 'Konfigurasi POS berhasil disimpan.' });
}));

// -- POST /api/sales/pos-settings/qris -------------------------------------
// Upload QRIS image -> uploadedImage/{company_uuid}/POS/qris.webp
// Accepts pos:settings OR settings:edit (super-admin / company admin)
router.post('/qris', requirePermission('pos:view', 'pos:settings', 'settings:edit'), upload.single('image'), asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'File gambar diperlukan (jpg/png/webp).' });
    const companyId = req.user.company_id;
    if (!companyId) return res.status(400).json({ error: 'Company context diperlukan.' });

    // Get company uuid
    const compRow = await query(`SELECT uuid FROM companies WHERE id = $1`, [companyId]);
    if (!compRow.rows.length) return res.status(404).json({ error: 'Company tidak ditemukan.' });
    const companyUuid = compRow.rows[0].uuid;

    // Ensure POS subdirectory exists: uploadedImage/{company_uuid}/POS/
    const posDir = path.join(UPLOAD_DIR, companyUuid, 'POS');
    if (!fs.existsSync(posDir)) fs.mkdirSync(posDir, { recursive: true });

    // Process image with sharp: max 400x400, WebP quality 85
    const outputBuffer = await sharp(req.file.buffer)
        .withMetadata(false)
        .resize({ width: 400, height: 400, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer();

    const filePath = path.join(posDir, 'qris.webp');
    fs.writeFileSync(filePath, outputBuffer);

    const qrisUrl = `/uploadedImage/${companyUuid}/POS/qris.webp`;

    // Best-effort DB update — if pos_qris_url column doesn't exist yet, silently skip
    // The disk fallback in GET endpoint will still serve the file
    try {
        await query(
            `UPDATE companies SET pos_qris_url = $1, updated_at = NOW() WHERE id = $2`,
            [qrisUrl, companyId]
        );
    } catch (e) {
        // Column may not exist yet — file is on disk, disk fallback will serve it
        console.warn('pos_settings: could not update pos_qris_url in DB:', e.message);
    }

    await query(
        `INSERT INTO audit_trail (action, module, description, user_id, user_name)
         VALUES ('update','pos','Upload QRIS image',$1,$2)`,
        [req.user.id, req.user.name]
    ).catch(() => {});

    res.json({ message: 'Gambar QRIS berhasil diupload.', url: qrisUrl });
}));

// ── GET /api/sales/pos-settings/categories ─────────────────────────────────
// Proxy endpoint so kasir (pos:view only) can read item categories
// without needing inventory:view permission
router.get('/categories', requirePermission('pos:view'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const result = await query(
        `SELECT id, uuid, code, name FROM categories
          WHERE company_id = $1
          ORDER BY name`, [companyId]
    );
    res.json(result.rows);
}));

module.exports = router;
