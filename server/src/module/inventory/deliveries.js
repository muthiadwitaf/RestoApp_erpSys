const router = require('express').Router();
const { query, getClient } = require('../../config/db');
const { requirePermission } = require('../../middleware/auth');
const { asyncHandler, resolveUUID } = require('../../utils/helpers');
const { generateAutoNumber } = require('../../utils/autoNumber');
const { uploadDoc, uploadCapture, processAndSaveDoc, processAndSaveJpeg, UPLOAD_DIR } = require('../../middleware/upload');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// ─────────────────────────────────────────────────────────────────────────────
// Permission helpers untuk delivery:*_self
// ─────────────────────────────────────────────────────────────────────────────

// Cek apakah user punya salah satu dari permissions yang diberikan (NO bypass)
function hasPerm(req, ...perms) {
    if (!req.permissions) return false;
    return perms.some(p => req.permissions.has(p));
}

// Resolve employee integer id dari JWT — coba via employee_uuid, fallback via user_id
async function getMyEmployeeId(req) {
    // Cara 1: via employee_uuid di JWT
    const empUuid = req.user?.employee_uuid;
    if (empUuid) {
        const r = await query(`SELECT id FROM employees WHERE uuid = $1`, [empUuid]);
        if (r.rows[0]?.id) return r.rows[0].id;
    }
    // Cara 2: via user_id di tabel employees
    const userId = req.user?.id;
    if (userId) {
        const r = await query(`SELECT id FROM employees WHERE user_id = $1`, [userId]);
        if (r.rows[0]?.id) return r.rows[0].id;
    }
    return null;
}

// Validasi akses ke DO tertentu berdasarkan permission _self
// mode: 'view' | 'edit'
// Return: { allowed: bool, selfOnly: bool, reason?: string }
async function canAccessDO(req, doUuid, mode = 'view') {
    const isEdit = mode === 'edit';
    const allPerm = isEdit ? ['delivery:edit', 'delivery:manage'] : ['delivery:view', 'delivery:manage'];
    const selfPerm = isEdit ? 'delivery:edit_self' : 'delivery:view_self';

    if (hasPerm(req, ...allPerm)) return { allowed: true, selfOnly: false };

    if (hasPerm(req, selfPerm)) {
        const empId = await getMyEmployeeId(req);
        if (!empId) return { allowed: false, reason: 'Akun Anda belum terhubung ke data karyawan. Hubungi HR Admin.' };
        const r = await query(
            `SELECT 1 FROM deliveries WHERE uuid = $1 AND driver_employee_id = $2`,
            [doUuid, empId]
        );
        if (r.rows.length === 0) return { allowed: false, reason: 'Anda bukan driver pada Delivery Order ini' };
        return { allowed: true, selfOnly: true };
    }

    return { allowed: false, reason: 'Akses ditolak' };
}

// GET /drivers/list — Daftar karyawan aktif untuk lookup driver
// ─────────────────────────────────────────────────────────────────────────────
router.get('/drivers/list', requirePermission('delivery:view', 'delivery:manage'), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const { search } = req.query;
    let wc = ['e.company_id = $1', 'e.is_active = TRUE', "e.status = 'aktif'"];
    let values = [companyId];
    if (search) {
        wc.push(`(e.nama_lengkap ILIKE $2 OR e.nik ILIKE $2)`);
        values.push(`%${search}%`);
    }
    const result = await query(
        `SELECT e.uuid, e.nik, e.nama_lengkap, e.nama_panggilan, e.no_hp,
                e.foto_url, ej.jabatan, ej.departemen
         FROM employees e
         LEFT JOIN employee_jobs ej ON ej.employee_id = e.id AND ej.is_current = TRUE
         WHERE ${wc.join(' AND ')}
         ORDER BY e.nama_lengkap ASC
         LIMIT 100`,
        values
    );
    res.json(result.rows);
}));

// ─────────────────────────────────────────────────────────────────────────────
// GET / — Daftar semua delivery order (per branch)
// delivery:view/manage → semua DO | delivery:view_self → hanya DO yang saya driver-nya
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', requirePermission('delivery:view', 'delivery:manage', 'delivery:view_self'), asyncHandler(async (req, res) => {
    const { branch_id } = req.query;
    const companyId = req.user.company_id;
    let wc = 'WHERE b.company_id = $1';
    let values = [companyId];
    let idx = 2;
    if (branch_id) {
        const rB = await resolveUUID(branch_id, 'branches', query);
        wc += ` AND d.branch_id = $${idx++}`;
        values.push(rB);
    }

    // Jika hanya punya delivery:view_self → filter hanya DO milik saya
    const viewAll = hasPerm(req, 'delivery:view', 'delivery:manage');
    if (!viewAll) {
        const empId = await getMyEmployeeId(req);
        if (!empId) return res.status(403).json({ error: 'Akun Anda belum terhubung ke data karyawan. Hubungi HR Admin.' });
        wc += ` AND d.driver_employee_id = $${idx++}`;
        values.push(empId);
    }

    const result = await query(
        `SELECT d.uuid, d.number, d.date, d.status, d.driver_name, d.vehicle_no,
                d.notes, d.created_by, d.dispatched_by, d.dispatched_at,
                d.delivered_by, d.delivered_at, d.created_at,
                b.name as branch_name, b.uuid as branch_uuid,
                e.uuid as driver_employee_uuid, e.nik as driver_nik,
                e.foto_url as driver_foto,
                COUNT(dgl.id) as gi_count
         FROM deliveries d
         JOIN branches b ON b.id = d.branch_id
         LEFT JOIN employees e ON e.id = d.driver_employee_id
         LEFT JOIN delivery_gi_links dgl ON dgl.delivery_id = d.id
         ${wc}
         GROUP BY d.id, b.name, b.uuid, e.uuid, e.nik, e.foto_url
         ORDER BY d.date DESC, d.id DESC`, values
    );
    res.json(result.rows);
}));

// ─────────────────────────────────────────────────────────────────────────────
// GET /:uuid — Detail satu delivery beserta GI yang terlampir
// delivery:view/manage → semua | delivery:view_self → hanya jika saya driver-nya
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:uuid', requirePermission('delivery:view', 'delivery:manage', 'delivery:view_self'), asyncHandler(async (req, res) => {
    // Cek akses: view_self hanya boleh lihat DO miliknya
    const access = await canAccessDO(req, req.params.uuid, 'view');
    if (!access.allowed) return res.status(403).json({ error: access.reason });
    const dRes = await query(
        `SELECT d.uuid, d.number, d.date, d.status, d.driver_name, d.vehicle_no,
                d.notes, d.created_by, d.dispatched_by, d.dispatched_at,
                d.delivered_by, d.delivered_at, d.created_at,
                b.name as branch_name, b.uuid as branch_uuid,
                e.uuid as driver_employee_uuid, e.nik as driver_nik,
                e.no_hp as driver_phone, e.foto_url as driver_foto,
                ej.jabatan as driver_jabatan
         FROM deliveries d
         JOIN branches b ON b.id = d.branch_id
         LEFT JOIN employees e ON e.id = d.driver_employee_id
         LEFT JOIN employee_jobs ej ON ej.employee_id = d.driver_employee_id AND ej.is_current = TRUE
         WHERE d.uuid = $1`, [req.params.uuid]
    );
    if (dRes.rows.length === 0) return res.status(404).json({ error: 'Delivery tidak ditemukan' });
    const header = dRes.rows[0];

    const dId = (await query(`SELECT id FROM deliveries WHERE uuid = $1`, [req.params.uuid])).rows[0].id;

    // Ambil GI yang terlampir beserta detail
    const giRes = await query(
        `SELECT g.uuid as gi_uuid, g.number as gi_number, g.date as gi_date,
                g.status as gi_status, g.notes as gi_notes,
                g.approved_by, g.approved_at, g.ready_by, g.ready_at,
                w.name as warehouse_name,
                so.number as so_number,
                c.name as customer_name, c.address as customer_address
         FROM delivery_gi_links dgl
         JOIN goods_issues g ON g.id = dgl.gi_id
         LEFT JOIN warehouses w ON w.id = g.warehouse_id
         LEFT JOIN sales_orders so ON so.id = g.so_id
         LEFT JOIN customers c ON c.id = so.customer_id
         WHERE dgl.delivery_id = $1
         ORDER BY g.number`, [dId]
    );

    res.json({ ...header, gi_list: giRes.rows });
}));

// ─────────────────────────────────────────────────────────────────────────────
// GET /ready-gi — Daftar GI berstatus ready_to_delivery (belum punya delivery aktif)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/ready-gi/list', requirePermission('delivery:view', 'delivery:manage'), asyncHandler(async (req, res) => {
    const { branch_id } = req.query;
    const companyId = req.user.company_id;
    let wc = 'WHERE b.company_id = $1 AND g.status = $2';
    let values = [companyId, 'ready_to_delivery'];
    let idx = 3;
    if (branch_id) {
        const rB = await resolveUUID(branch_id, 'branches', query);
        wc += ` AND g.branch_id = $${idx++}`;
        values.push(rB);
    }
    const result = await query(
        `SELECT g.uuid, g.number, g.date, g.status, g.notes,
                g.ready_by, g.ready_at, g.approved_by, g.approved_at,
                w.name as warehouse_name,
                b.name as branch_name, b.uuid as branch_uuid,
                so.number as so_number, so.uuid as so_uuid,
                c.name as customer_name, c.address as customer_address, c.phone as customer_phone
         FROM goods_issues g
         JOIN branches b ON b.id = g.branch_id
         LEFT JOIN warehouses w ON g.warehouse_id = w.id
         LEFT JOIN sales_orders so ON so.id = g.so_id
         LEFT JOIN customers c ON c.id = so.customer_id
         ${wc}
         ORDER BY g.date ASC, g.number ASC`, values
    );
    res.json(result.rows);
}));

// ─────────────────────────────────────────────────────────────────────────────
// POST / — Buat Delivery Order baru (status = draft)
// Body: { branch_id, gi_uuids: [], driver_employee_uuid, driver_name, vehicle_no, notes }
//   driver_employee_uuid : pilih driver dari employees (diutamakan)
//   driver_name          : fallback jika tidak dipilih dari employees
// ─────────────────────────────────────────────────────────────────────────────
router.post('/', requirePermission('delivery:create', 'delivery:manage'), asyncHandler(async (req, res) => {
    const { branch_id, gi_uuids, driver_employee_uuid, driver_name, vehicle_no, notes } = req.body;
    if (!gi_uuids || gi_uuids.length === 0) {
        return res.status(400).json({ error: 'Pilih minimal 1 Good Issue untuk delivery' });
    }
    const rBranch = await resolveUUID(branch_id, 'branches', query);
    const branchResult = await query(`SELECT code FROM branches WHERE id = $1`, [rBranch]);
    const branchCode = branchResult.rows[0]?.code || 'JKT';
    const number = await generateAutoNumber(branchCode, 'DO');

    // Resolve driver dari employees jika ada
    let resolvedDriverId = null;
    let resolvedDriverName = driver_name || null;
    if (driver_employee_uuid) {
        const empRes = await query(
            `SELECT id, nama_lengkap FROM employees WHERE uuid = $1 AND company_id = $2 AND is_active = TRUE`,
            [driver_employee_uuid, req.user.company_id]
        );
        if (empRes.rows.length === 0) {
            return res.status(400).json({ error: 'Driver (karyawan) tidak ditemukan' });
        }
        resolvedDriverId = empRes.rows[0].id;
        resolvedDriverName = empRes.rows[0].nama_lengkap; // auto-populate dari nama karyawan
    }

    const client = await getClient();
    try {
        await client.query('BEGIN');

        // Insert header delivery
        const dRes = await client.query(
            `INSERT INTO deliveries (number, date, branch_id, driver_employee_id, driver_name, vehicle_no, notes, created_by, status)
             VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6, $7, 'draft')
             RETURNING id, uuid, number, status`,
            [number, rBranch, resolvedDriverId, resolvedDriverName, vehicle_no || null, notes || null, req.user.name]
        );
        const deliveryId = dRes.rows[0].id;

        // Link GI ke delivery, validasi status
        for (const giUuid of gi_uuids) {
            const giRow = await client.query(
                `SELECT id, status, number FROM goods_issues WHERE uuid = $1`, [giUuid]
            );
            if (giRow.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: `GI dengan uuid ${giUuid} tidak ditemukan` });
            }
            if (giRow.rows[0].status !== 'ready_to_delivery') {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    error: `GI ${giRow.rows[0].number} belum berstatus Ready to Delivery (status: ${giRow.rows[0].status})`
                });
            }
            await client.query(
                `INSERT INTO delivery_gi_links (delivery_id, gi_id) VALUES ($1, $2)`,
                [deliveryId, giRow.rows[0].id]
            );
        }

        await client.query('COMMIT');
        await query(
            `INSERT INTO audit_trail (action, module, description, user_id, user_name, branch_id)
             VALUES ('create','inventory',$1,$2,$3,$4)`,
            [`Buat Delivery Order ${number} (${gi_uuids.length} GI)`, req.user.id, req.user.name, rBranch]
        );
        res.status(201).json(dRes.rows[0]);
    } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
}));

// ─────────────────────────────────────────────────────────────────────────────
// PUT /:uuid/dispatch — Kirimkan delivery (status: draft → dispatched)
// GI TIDAK langsung completed; masing-masing GI diselesaikan secara individu
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:uuid/dispatch', requirePermission('delivery:edit', 'delivery:manage'), asyncHandler(async (req, res) => {
    const dRes = await query(
        `SELECT d.id, d.number, d.status, d.branch_id
         FROM deliveries d WHERE d.uuid = $1`, [req.params.uuid]
    );
    if (dRes.rows.length === 0) return res.status(404).json({ error: 'Delivery tidak ditemukan' });
    const delivery = dRes.rows[0];
    if (delivery.status !== 'draft') {
        return res.status(400).json({ error: `Delivery tidak dapat dikirim (status saat ini: ${delivery.status})` });
    }
    // Pastikan ada minimal 1 GI
    const giCount = await query(
        `SELECT COUNT(*) FROM delivery_gi_links WHERE delivery_id = $1`, [delivery.id]
    );
    if (parseInt(giCount.rows[0].count) === 0) {
        return res.status(400).json({ error: 'Delivery Order harus memiliki minimal 1 GI sebelum di-dispatch' });
    }

    // Update status delivery → dispatched SAJA (GI tidak diubah)
    await query(
        `UPDATE deliveries SET status='dispatched', dispatched_by=$1, dispatched_at=NOW(), updated_at=NOW()
         WHERE id=$2`,
        [req.user.name, delivery.id]
    );
    // Update SEMUA GI terlampir → 'delivery'
    await query(
        `UPDATE goods_issues SET status='delivery', updated_at=NOW()
         WHERE id IN (SELECT gi_id FROM delivery_gi_links WHERE delivery_id = $1)
           AND status IN ('ready_to_delivery')`,
        [delivery.id]
    );
    await query(
        `INSERT INTO audit_trail (action, module, description, user_id, user_name, branch_id)
         VALUES ('dispatch','inventory',$1,$2,$3,$4)`,
        [`Dispatch Delivery ${delivery.number} — ${giCount.rows[0].count} GI diubah ke status Delivery`, req.user.id, req.user.name, delivery.branch_id]
    );
    res.json({ message: `Delivery ${delivery.number} berhasil dikirim. Konfirmasi selesai untuk masing-masing GI.` });
}));

// ─────────────────────────────────────────────────────────────────────────────
// GET /:uuid/positions — Riwayat posisi/tracking DO
// delivery:view_self → hanya boleh lihat DO miliknya
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:uuid/positions', requirePermission('delivery:view', 'delivery:manage', 'delivery:view_self'), asyncHandler(async (req, res) => {
    const access = await canAccessDO(req, req.params.uuid, 'view');
    if (!access.allowed) return res.status(403).json({ error: access.reason });

    const dRes = await query(`SELECT id FROM deliveries WHERE uuid = $1`, [req.params.uuid]);
    if (dRes.rows.length === 0) return res.status(404).json({ error: 'Delivery tidak ditemukan' });
    const deliveryId = dRes.rows[0].id;

    const result = await query(
        `SELECT uuid, address, latitude, longitude, notes, recorded_by, created_at
         FROM delivery_positions
         WHERE delivery_id = $1
         ORDER BY created_at DESC`,
        [deliveryId]
    );
    res.json(result.rows);
}));

// ─────────────────────────────────────────────────────────────────────────────
// POST /:uuid/positions — Tambah posisi baru ke DO (hanya saat dispatched)
// Body: { address, latitude, longitude, notes }
// → Otomatis insert ke gi_position_history untuk semua GI berstatus 'delivery'
// delivery:edit_self → hanya boleh update DO yang driver-nya adalah saya
// ─────────────────────────────────────────────────────────────────────────────
router.post('/:uuid/positions', requirePermission('delivery:edit', 'delivery:manage', 'delivery:edit_self'), asyncHandler(async (req, res) => {
    // Cek akses: edit_self hanya boleh input posisi DO miliknya
    const access = await canAccessDO(req, req.params.uuid, 'edit');
    if (!access.allowed) return res.status(403).json({ error: access.reason });

    const { address, latitude, longitude, notes } = req.body;
    if (!address && !latitude && !longitude) {
        return res.status(400).json({ error: 'Isi minimal satu dari: address, latitude, longitude' });
    }

    const dRes = await query(
        `SELECT id, number, status, branch_id FROM deliveries WHERE uuid = $1`, [req.params.uuid]
    );
    if (dRes.rows.length === 0) return res.status(404).json({ error: 'Delivery tidak ditemukan' });
    const delivery = dRes.rows[0];
    if (delivery.status !== 'dispatched') {
        return res.status(400).json({ error: `Posisi hanya bisa ditambahkan saat DO berstatus Dispatched (saat ini: ${delivery.status})` });
    }

    const client = await getClient();
    try {
        await client.query('BEGIN');

        // 1. Insert posisi ke delivery_positions
        const posRes = await client.query(
            `INSERT INTO delivery_positions (delivery_id, address, latitude, longitude, notes, recorded_by)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, uuid, address, latitude, longitude, notes, recorded_by, created_at`,
            [delivery.id, address || null, latitude || null, longitude || null, notes || null, req.user.name]
        );
        const pos = posRes.rows[0];

        // 2. Ambil semua GI dalam DO ini yang masih berstatus 'delivery'
        const giRes = await client.query(
            `SELECT g.id, g.uuid, g.number
             FROM delivery_gi_links dgl
             JOIN goods_issues g ON g.id = dgl.gi_id
             WHERE dgl.delivery_id = $1 AND g.status = 'delivery'`,
            [delivery.id]
        );

        // 3. Insert ke gi_position_history untuk setiap GI delivery
        for (const gi of giRes.rows) {
            await client.query(
                `INSERT INTO gi_position_history
                    (gi_id, delivery_id, delivery_pos_id, address, latitude, longitude, notes, recorded_by)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [gi.id, delivery.id, pos.id, address || null, latitude || null, longitude || null, notes || null, req.user.name]
            );
        }

        await client.query('COMMIT');

        res.status(201).json({
            ...pos,
            gi_updated: giRes.rows.length,
            message: `Posisi berhasil direkam. ${giRes.rows.length} GI dalam pengiriman diperbarui.`
        });
    } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
}));

// ─────────────────────────────────────────────────────────────────────────────
// GET /gi/:giUuid/positions — Riwayat posisi untuk satu GI tertentu
// ─────────────────────────────────────────────────────────────────────────────
router.get('/gi-pos/:giUuid/history', requirePermission('delivery:view', 'delivery:manage'), asyncHandler(async (req, res) => {
    const giRes = await query(`SELECT id, number FROM goods_issues WHERE uuid = $1`, [req.params.giUuid]);
    if (giRes.rows.length === 0) return res.status(404).json({ error: 'GI tidak ditemukan' });

    const result = await query(
        `SELECT ph.uuid, ph.address, ph.latitude, ph.longitude, ph.notes, ph.recorded_by, ph.created_at,
                d.number as delivery_number
         FROM gi_position_history ph
         LEFT JOIN deliveries d ON d.id = ph.delivery_id
         WHERE ph.gi_id = $1
         ORDER BY ph.created_at DESC`,
        [giRes.rows[0].id]
    );
    res.json({ gi_number: giRes.rows[0].number, history: result.rows });
}));



// ─────────────────────────────────────────────────────────────────────────────
// PUT /:uuid/gi/:giUuid/complete — Selesaikan satu GI dalam DO yang dispatched
// GI status: delivery → completed
// Jika SEMUA GI sudah completed, DO otomatis di-complete
// delivery:edit_self → hanya boleh complete GI di DO miliknya (dia sebagai driver)
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:uuid/gi/:giUuid/complete', requirePermission('delivery:edit', 'delivery:manage', 'delivery:edit_self'), asyncHandler(async (req, res) => {
    // Cek akses: edit_self hanya boleh complete GI di DO miliknya
    const access = await canAccessDO(req, req.params.uuid, 'edit');
    if (!access.allowed) return res.status(403).json({ error: access.reason });

    // Validasi DO
    const dRes = await query(
        `SELECT d.id, d.number, d.status, d.branch_id FROM deliveries d WHERE d.uuid = $1`, [req.params.uuid]
    );
    if (dRes.rows.length === 0) return res.status(404).json({ error: 'Delivery tidak ditemukan' });
    const delivery = dRes.rows[0];
    if (delivery.status !== 'dispatched') {
        return res.status(400).json({ error: `GI hanya bisa diselesaikan saat DO berstatus Dispatched (saat ini: ${delivery.status})` });
    }

    // Validasi GI milik DO ini
    const linkRes = await query(
        `SELECT g.id, g.number, g.status
         FROM delivery_gi_links dgl
         JOIN goods_issues g ON g.id = dgl.gi_id
         WHERE dgl.delivery_id = $1 AND g.uuid = $2`,
        [delivery.id, req.params.giUuid]
    );
    if (linkRes.rows.length === 0) {
        return res.status(404).json({ error: 'GI tidak ditemukan dalam Delivery Order ini' });
    }
    const gi = linkRes.rows[0];
    if (gi.status === 'completed') {
        return res.status(400).json({ error: `GI ${gi.number} sudah berstatus Completed` });
    }
    if (gi.status !== 'delivery') {
        return res.status(400).json({ error: `GI ${gi.number} tidak bisa diselesaikan (status: ${gi.status}, harus berstatus Delivery)` });
    }

    const client = await getClient();
    try {
        await client.query('BEGIN');

        // Selesaikan GI ini
        await client.query(
            `UPDATE goods_issues SET status='completed', updated_at=NOW() WHERE id = $1`,
            [gi.id]
        );

        // Cek apakah SEMUA GI dalam DO sudah completed
        const remaining = await client.query(
            `SELECT COUNT(*) FROM delivery_gi_links dgl
             JOIN goods_issues g ON g.id = dgl.gi_id
             WHERE dgl.delivery_id = $1 AND g.status != 'completed'`,
            [delivery.id]
        );
        const allDone = parseInt(remaining.rows[0].count) === 0;

        // Jika semua GI selesai → auto-complete DO
        if (allDone) {
            await client.query(
                `UPDATE deliveries SET status='completed', delivered_by=$1, delivered_at=NOW(), updated_at=NOW()
                 WHERE id=$2`,
                [req.user.name, delivery.id]
            );
        }

        await client.query('COMMIT');

        await query(
            `INSERT INTO audit_trail (action, module, description, user_id, user_name, branch_id)
             VALUES ('gi_complete','inventory',$1,$2,$3,$4)`,
            [
                `GI ${gi.number} selesai dalam Delivery ${delivery.number}${allDone ? ' — DO otomatis completed' : ''}`,
                req.user.id, req.user.name, delivery.branch_id
            ]
        );

        res.json({
            message: `GI ${gi.number} berhasil diselesaikan.${allDone ? ' Semua GI selesai — Delivery Order otomatis Completed!' : ''}`,
            delivery_completed: allDone
        });
    } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
}));

// ─────────────────────────────────────────────────────────────────────────────
// PUT /:uuid/complete — Manual complete DO (opsional, jika semua GI sudah selesai)
// Auto-complete sudah ditangani oleh endpoint gi/:giUuid/complete
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:uuid/complete', requirePermission('delivery:edit', 'delivery:manage'), asyncHandler(async (req, res) => {
    const dRes = await query(
        `SELECT id, number, status, branch_id FROM deliveries WHERE uuid = $1`, [req.params.uuid]
    );
    if (dRes.rows.length === 0) return res.status(404).json({ error: 'Delivery tidak ditemukan' });
    const delivery = dRes.rows[0];
    if (delivery.status !== 'dispatched') {
        return res.status(400).json({ error: 'Delivery tidak bisa dikonfirmasi (harus berstatus Dispatched)' });
    }
    // Pastikan semua GI sudah completed
    const pending = await query(
        `SELECT COUNT(*) FROM delivery_gi_links dgl
         JOIN goods_issues g ON g.id = dgl.gi_id
         WHERE dgl.delivery_id = $1 AND g.status NOT IN ('completed')`,
        [delivery.id]
    );
    const pendingCount = parseInt(pending.rows[0].count);
    if (pendingCount > 0) {
        return res.status(400).json({
            error: `Masih ada ${pendingCount} GI yang belum selesai. Selesaikan semua GI terlebih dahulu.`
        });
    }
    await query(
        `UPDATE deliveries SET status='completed', delivered_by=$1, delivered_at=NOW(), updated_at=NOW()
         WHERE id=$2`,
        [req.user.name, delivery.id]
    );
    await query(
        `INSERT INTO audit_trail (action, module, description, user_id, user_name, branch_id)
         VALUES ('complete','inventory',$1,$2,$3,$4)`,
        [`Delivery ${delivery.number} selesai — semua GI telah diterima customer`, req.user.id, req.user.name, delivery.branch_id]
    );
    res.json({ message: `Delivery ${delivery.number} selesai. Semua GI telah diterima customer.` });
}));


// ─────────────────────────────────────────────────────────────────────────────
// DELETE /:uuid — Hapus Delivery Order (hanya jika status = draft)
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/:uuid', requirePermission('delivery:edit', 'delivery:manage'), asyncHandler(async (req, res) => {
    const dRes = await query(
        `SELECT id, number, status, branch_id FROM deliveries WHERE uuid = $1`, [req.params.uuid]
    );
    if (dRes.rows.length === 0) return res.status(404).json({ error: 'Delivery tidak ditemukan' });
    const delivery = dRes.rows[0];
    if (delivery.status !== 'draft') {
        return res.status(400).json({ error: `Delivery hanya bisa dihapus saat berstatus Draft (status saat ini: ${delivery.status})` });
    }
    // CASCADE delete akan otomatis hapus delivery_gi_links
    await query(`DELETE FROM deliveries WHERE id = $1`, [delivery.id]);
    await query(
        `INSERT INTO audit_trail (action, module, description, user_id, user_name, branch_id)
         VALUES ('delete','inventory',$1,$2,$3,$4)`,
        [`Hapus Delivery Order ${delivery.number}`, req.user.id, req.user.name, delivery.branch_id]
    );
    res.json({ message: `Delivery Order ${delivery.number} berhasil dihapus.` });
}));

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /:uuid/gi/:giUuid — Hapus (remove) satu GI dari DO draft
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/:uuid/gi/:giUuid', requirePermission('delivery:edit', 'delivery:manage'), asyncHandler(async (req, res) => {
    const dRes = await query(
        `SELECT id, number, status, branch_id FROM deliveries WHERE uuid = $1`, [req.params.uuid]
    );
    if (dRes.rows.length === 0) return res.status(404).json({ error: 'Delivery tidak ditemukan' });
    const delivery = dRes.rows[0];
    if (delivery.status !== 'draft') {
        return res.status(400).json({ error: 'GI hanya bisa dihapus dari DO berstatus Draft' });
    }

    const giRes = await query(
        `SELECT id, number FROM goods_issues WHERE uuid = $1`, [req.params.giUuid]
    );
    if (giRes.rows.length === 0) return res.status(404).json({ error: 'GI tidak ditemukan' });
    const gi = giRes.rows[0];

    const del = await query(
        `DELETE FROM delivery_gi_links WHERE delivery_id = $1 AND gi_id = $2 RETURNING id`,
        [delivery.id, gi.id]
    );
    if (del.rows.length === 0) {
        return res.status(404).json({ error: 'GI ini tidak terdapat dalam Delivery Order tersebut' });
    }
    res.json({ message: `GI ${gi.number} berhasil dihapus dari Delivery Order ${delivery.number}.` });
}));

// ─────────────────────────────────────────────────────────────────────────────
// POST /:uuid/gi — Tambahkan GI ke DO yang sudah ada (hanya jika draft)
// Body: { gi_uuids: [] }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/:uuid/gi', requirePermission('delivery:edit', 'delivery:manage'), asyncHandler(async (req, res) => {
    const { gi_uuids } = req.body;
    if (!gi_uuids || gi_uuids.length === 0) {
        return res.status(400).json({ error: 'Pilih minimal 1 GI untuk ditambahkan' });
    }

    const dRes = await query(
        `SELECT id, number, status, branch_id FROM deliveries WHERE uuid = $1`, [req.params.uuid]
    );
    if (dRes.rows.length === 0) return res.status(404).json({ error: 'Delivery tidak ditemukan' });
    const delivery = dRes.rows[0];
    if (delivery.status !== 'draft') {
        return res.status(400).json({ error: 'GI hanya bisa ditambahkan ke DO berstatus Draft' });
    }

    const added = [];
    const skipped = [];
    for (const giUuid of gi_uuids) {
        const giRow = await query(
            `SELECT id, status, number FROM goods_issues WHERE uuid = $1`, [giUuid]
        );
        if (giRow.rows.length === 0) { skipped.push(giUuid + ' (tidak ditemukan)'); continue; }
        const gi = giRow.rows[0];
        if (gi.status !== 'ready_to_delivery') {
            skipped.push(`${gi.number} (status: ${gi.status})`); continue;
        }
        const exists = await query(
            `SELECT 1 FROM delivery_gi_links WHERE delivery_id = $1 AND gi_id = $2`,
            [delivery.id, gi.id]
        );
        if (exists.rows.length > 0) { skipped.push(`${gi.number} (sudah ada)`); continue; }

        await query(
            `INSERT INTO delivery_gi_links (delivery_id, gi_id) VALUES ($1, $2)`,
            [delivery.id, gi.id]
        );
        added.push(gi.number);
    }

    res.json({
        message: `${added.length} GI berhasil ditambahkan ke ${delivery.number}${skipped.length ? `. Dilewati: ${skipped.join(', ')}` : ''}`,
        added, skipped
    });
}));

// ─────────────────────────────────────────────────────────────────────────────
// DO File Captures — Upload, List, Delete
// NOTE: tabel deliveries TIDAK punya company_id, hanya branch_id
//       company_id didapat via: JOIN branches b ON b.id = d.branch_id
// ─────────────────────────────────────────────────────────────────────────────

// GET /deliveries/:uuid/captures
router.get('/:uuid/captures', asyncHandler(async (req, res) => {
    // Akses: siapapun yang punya permission delivery:*
    const hasAnyDeliveryPerm = hasPerm(req,
        'delivery:view', 'delivery:view_self',
        'delivery:edit', 'delivery:edit_self',
        'delivery:manage'
    );
    if (!hasAnyDeliveryPerm) return res.status(403).json({ error: 'Akses ditolak' });

    // Ambil DO via uuid + verifikasi company (lewat branch)
    const doRow = await query(
        `SELECT d.id FROM deliveries d
         JOIN branches b ON b.id = d.branch_id
         WHERE d.uuid = $1 AND b.company_id = $2`,
        [req.params.uuid, req.user.company_id]
    );
    if (!doRow.rows.length) return res.status(404).json({ error: 'DO tidak ditemukan' });

    const result = await query(
        `SELECT uuid, file_url, filename, file_size, caption, captured_by_name, created_at
         FROM do_file_captures
         WHERE delivery_id = $1
         ORDER BY created_at DESC`,
        [doRow.rows[0].id]
    );
    res.json(result.rows);
}));

// Helper: jalankan multer sebagai Promise agar error bisa di-catch asyncHandler
function runMulter(multerMiddleware, req, res) {
    return new Promise((resolve, reject) => {
        multerMiddleware(req, res, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

// POST /deliveries/:uuid/captures  — Upload file/capture
router.post('/:uuid/captures', asyncHandler(async (req, res) => {
    // Jalankan multer terlebih dahulu (async, error bisa di-catch)
    try {
        await runMulter(uploadCapture.single('file'), req, res);
    } catch (multerErr) {
        const msg = multerErr.code === 'LIMIT_FILE_SIZE'
            ? 'File terlalu besar (maksimal 15MB). Coba kompres foto terlebih dahulu.'
            : (multerErr.message || 'Tipe file tidak didukung (hanya JPG/PNG/WebP)');
        return res.status(400).json({ error: msg });
    }

    // Akses: siapapun dengan permission delivery:*
    const hasAnyDeliveryPerm = hasPerm(req,
        'delivery:view', 'delivery:view_self',
        'delivery:edit', 'delivery:edit_self',
        'delivery:manage'
    );
    if (!hasAnyDeliveryPerm) return res.status(403).json({ error: 'Akses ditolak' });

    if (!req.file) return res.status(400).json({ error: 'File diperlukan (jpg/png/webp, max 15MB)' });

    // Ambil DO + company_id via branch
    const doRow = await query(
        `SELECT d.id, b.company_id
         FROM deliveries d
         JOIN branches b ON b.id = d.branch_id
         WHERE d.uuid = $1 AND b.company_id = $2`,
        [req.params.uuid, req.user.company_id]
    );
    if (!doRow.rows.length) return res.status(404).json({ error: 'DO tidak ditemukan' });
    const { id: deliveryId, company_id } = doRow.rows[0];

    // Simpan sebagai JPEG (strip EXIF, resize max 1920px, quality 85)
    const destDir = path.join(UPLOAD_DIR, 'do_captures', String(company_id));
    const { fileUuid, filename, sizeBytes } = await processAndSaveJpeg(
        req.file.buffer,
        destDir
    );

    const fileUrl = `/uploadedImage/do_captures/${company_id}/${filename}`;
    const caption = req.body.caption || null;

    const inserted = await query(
        `INSERT INTO do_file_captures
            (delivery_id, company_id, file_uuid, filename, file_url, file_size, caption, captured_by, captured_by_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING uuid, file_url, filename, file_size, caption, captured_by_name, created_at`,
        [deliveryId, company_id, fileUuid, filename, fileUrl,
         sizeBytes, caption, req.user.id, req.user.name]
    );

    res.status(201).json(inserted.rows[0]);
}));

// DELETE /deliveries/:uuid/captures/:captureUuid
router.delete('/:uuid/captures/:captureUuid', asyncHandler(async (req, res) => {
    const hasAnyDeliveryPerm = hasPerm(req,
        'delivery:view', 'delivery:view_self',
        'delivery:edit', 'delivery:edit_self',
        'delivery:manage'
    );
    if (!hasAnyDeliveryPerm) return res.status(403).json({ error: 'Akses ditolak' });

    const doRow = await query(
        `SELECT d.id FROM deliveries d
         JOIN branches b ON b.id = d.branch_id
         WHERE d.uuid = $1 AND b.company_id = $2`,
        [req.params.uuid, req.user.company_id]
    );
    if (!doRow.rows.length) return res.status(404).json({ error: 'DO tidak ditemukan' });

    const cap = await query(
        `SELECT id, filename, company_id FROM do_file_captures WHERE uuid = $1 AND delivery_id = $2`,
        [req.params.captureUuid, doRow.rows[0].id]
    );
    if (!cap.rows.length) return res.status(404).json({ error: 'File tidak ditemukan' });

    const { filename, company_id } = cap.rows[0];
    const filepath = path.join(UPLOAD_DIR, 'do_captures', String(company_id), filename);
    if (fs.existsSync(filepath)) fs.unlinkSync(filepath);

    await query(`DELETE FROM do_file_captures WHERE id = $1`, [cap.rows[0].id]);
    res.json({ message: 'File berhasil dihapus' });
}));

module.exports = router;
