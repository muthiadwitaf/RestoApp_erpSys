const router = require('express').Router();
const { query, getClient } = require('../../config/db');
const { authenticateToken, requirePermission } = require('../../middleware/auth');
const { validateUUID } = require('../../middleware/validate');
const { asyncHandler, resolveUUID, updateCoaBalancesForJournal } = require('../../utils/helpers');
const { generateAutoNumber } = require('../../utils/autoNumber');

router.use(authenticateToken);

// Helper: compute status from expiry_date
function computeStatus(expiryDate) {
    if (!expiryDate) return 'active';
    const today = new Date();
    const expiry = new Date(expiryDate);
    const daysLeft = Math.ceil((expiry - today) / 86400000);
    if (daysLeft < 0) return 'expired';
    if (daysLeft <= 30) return 'expiring';
    return 'active';
}

// GET /api/inventory/batches -- list all batches (filterable)
router.get('/', requirePermission('inventory:view'), asyncHandler(async (req, res) => {
    const { warehouse_id, item_id, status, branch_id } = req.query;
    const companyId = req.user.company_id;
    const conditions = ['br.company_id = $1'];
    const values = [companyId];
    let idx = 2;

    // Default: sembunyikan depleted kecuali diminta
    if (status) {
        conditions.push(`b.status = $${idx++}`);
        values.push(status);
    } else {
        conditions.push(`b.status != 'depleted'`);
    }

    if (item_id) {
        const rItem = await resolveUUID(item_id, 'items', query);
        conditions.push(`b.item_id = $${idx++}`);
        values.push(rItem);
    }
    if (warehouse_id) {
        const rWh = await resolveUUID(warehouse_id, 'warehouses', query);
        conditions.push(`b.warehouse_id = $${idx++}`);
        values.push(rWh);
    }
    if (branch_id) {
        const rBranch = await resolveUUID(branch_id, 'branches', query);
        conditions.push(`w.branch_id = $${idx++}`);
        values.push(rBranch);
    }

    const wc = 'WHERE ' + conditions.join(' AND ');
    const result = await query(
        `SELECT b.uuid, b.batch_no, b.expiry_date, b.received_date, b.qty, b.status, b.notes,
                i.uuid as item_id, i.name as item_name, i.code as item_code,
                w.uuid as warehouse_id, w.name as warehouse_name,
                gr.uuid as gr_id, gr.number as gr_number
         FROM batches b
         JOIN items i ON b.item_id = i.id
         JOIN warehouses w ON b.warehouse_id = w.id
         JOIN branches br ON w.branch_id = br.id
         LEFT JOIN goods_receives gr ON b.gr_id = gr.id
         ${wc}
         ORDER BY
           CASE b.status
             WHEN 'expired' THEN 1
             WHEN 'expiring' THEN 2
             WHEN 'active' THEN 3
             WHEN 'depleted' THEN 4
           END,
           b.expiry_date ASC NULLS LAST`, values
    );
    res.json(result.rows);
}));

// GET /api/inventory/batches/expiring?days=30 -- for dashboard
router.get('/expiring', requirePermission('inventory:view'), asyncHandler(async (req, res) => {
    const days = Math.min(Math.max(parseInt(req.query.days) || 30, 1), 365);
    const { branch_id } = req.query;
    const companyId = req.user.company_id;

    const conditions = [`b.status IN ('expired','expiring') AND b.qty > 0`, `br.company_id = $1`];
    const values = [companyId];
    let idx = 2;

    if (branch_id) {
        const rBranch = await resolveUUID(branch_id, 'branches', query);
        conditions.push(`w.branch_id = $${idx++}`);
        values.push(rBranch);
    } else {
        // filter by days for non-expired ones
        conditions.push(`(b.expiry_date IS NULL OR b.expiry_date <= CURRENT_DATE + INTERVAL '${days} days')`);
    }

    const result = await query(
        `SELECT b.uuid, b.batch_no, b.expiry_date, b.qty, b.status,
                i.uuid as item_id, i.name as item_name, i.code as item_code,
                w.uuid as warehouse_id, w.name as warehouse_name
         FROM batches b
         JOIN items i ON b.item_id = i.id
         JOIN warehouses w ON b.warehouse_id = w.id
         JOIN branches br ON w.branch_id = br.id
         WHERE ${conditions.join(' AND ')}
         ORDER BY b.expiry_date ASC NULLS LAST
         LIMIT 20`, values
    );
    res.json(result.rows);
}));

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/inventory/batches/for-issue -- FEFO-ordered batches for GI selection
// Hanya batch active + expiring (EXPIRED diblok dari penjualan)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/for-issue', requirePermission('inventory:view'), asyncHandler(async (req, res) => {
    const { item_id, warehouse_id } = req.query;
    const companyId = req.user.company_id;

    if (!item_id || !warehouse_id) {
        return res.status(400).json({ error: 'item_id dan warehouse_id wajib diisi' });
    }

    const rItem = await resolveUUID(item_id, 'items', query);
    const rWh = await resolveUUID(warehouse_id, 'warehouses', query);

    const result = await query(
        `SELECT b.uuid, b.batch_no, b.expiry_date, b.qty, b.status,
                CASE
                  WHEN b.expiry_date IS NULL THEN NULL
                  ELSE (b.expiry_date - CURRENT_DATE)
                END as days_until_expiry
         FROM batches b
         JOIN warehouses w ON b.warehouse_id = w.id
         JOIN branches br ON w.branch_id = br.id
         WHERE b.item_id = $1
           AND b.warehouse_id = $2
           AND b.qty > 0
           AND b.status IN ('active', 'expiring')
           AND br.company_id = $3
         ORDER BY b.expiry_date ASC NULLS LAST`,
        [rItem, rWh, companyId]
    );
    res.json(result.rows);
}));

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/inventory/batches/:uuid/dispose -- Musnahkan Batch
// Mengurangi inventory, mencatat stock movement, membuat jurnal kerugian
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:uuid/dispose', requirePermission('inventory:edit'), validateUUID(), asyncHandler(async (req, res) => {
    const { notes, reason, qty: disposeQty } = req.body;

    // Ambil data batch
    const batchRes = await query(
        `SELECT b.id, b.uuid, b.batch_no, b.qty, b.item_id, b.warehouse_id, b.status,
                i.name as item_name, i.hpp, w.name as warehouse_name,
                w.branch_id, br.code as branch_code
         FROM batches b
         JOIN items i ON b.item_id = i.id
         JOIN warehouses w ON b.warehouse_id = w.id
         JOIN branches br ON w.branch_id = br.id
         WHERE b.uuid = $1 AND b.status != 'depleted' AND b.qty > 0`,
        [req.params.uuid]
    );
    if (batchRes.rows.length === 0) {
        return res.status(404).json({ error: 'Batch tidak ditemukan, sudah habis, atau qty = 0' });
    }

    const batch = batchRes.rows[0];
    // Partial dispose: jika disposeQty diberikan, buang sebagian. Jika tidak, buang semua.
    const qtyToDispose = (disposeQty !== undefined && disposeQty !== null && !isNaN(parseFloat(disposeQty)))
        ? Math.min(Math.max(parseInt(disposeQty), 1), batch.qty)
        : batch.qty;
    const newBatchQty = batch.qty - qtyToDispose;
    const disposalValue = qtyToDispose * (parseFloat(batch.hpp) || 0);

    const client = await getClient();
    try {
        await client.query('BEGIN');

        // 1. Update batch qty & status
        const newStatus = newBatchQty <= 0 ? 'depleted' : batch.status;
        await client.query(
            `UPDATE batches SET qty = $1, status = $2, notes = COALESCE($3, notes), updated_at = NOW()
             WHERE id = $4`,
            [newBatchQty, newStatus, notes || null, batch.id]
        );

        // 2. Kurangi inventory.qty
        await client.query(
            `UPDATE inventory SET qty = qty - $1, updated_at = NOW()
             WHERE item_id = $2 AND warehouse_id = $3`,
            [qtyToDispose, batch.item_id, batch.warehouse_id]
        );

        // 3. Catat stock movement
        await client.query(
            `INSERT INTO stock_movements (item_id, date, type, qty, ref, warehouse_id, description)
             VALUES ($1, CURRENT_DATE, 'out', $2, $3, $4, $5)`,
            [
                batch.item_id, qtyToDispose,
                `DISPOSE-${batch.batch_no}`,
                batch.warehouse_id,
                `Pemusnahan batch ${batch.batch_no}: ${reason || 'Kadaluarsa'} (${qtyToDispose} unit)`
            ]
        );

        // 4. Jurnal akuntansi: Debit Kerugian/Pemusnahan, Credit Persediaan
        if (disposalValue > 0) {
            const branchCode = batch.branch_code || 'JKT';
            const journalNumber = await generateAutoNumber(branchCode, 'JU');

            // Cari atau buat akun
            const getOrCreateAccount = async (likeClause, typeClause, code, name, type, cat) => {
                const r = await client.query(
                    `SELECT id FROM chart_of_accounts WHERE company_id=$1 AND (${likeClause}) AND (${typeClause}) ORDER BY code LIMIT 1`,
                    [req.user.company_id]
                );
                if (r.rows.length > 0) return r.rows[0].id;
                const ins = await client.query(
                    `INSERT INTO chart_of_accounts (code,name,type,category,currency,company_id)
                     VALUES ($1,$2,$3,$4,'IDR',$5)
                     ON CONFLICT (code,company_id) DO UPDATE SET name=EXCLUDED.name RETURNING id`,
                    [code, name, type, cat, req.user.company_id]
                );
                return ins.rows[0].id;
            };

            const rugiId = await getOrCreateAccount(
                `LOWER(name) LIKE '%rugi%pemusnahan%' OR LOWER(name) LIKE '%kerugian%' OR LOWER(name) LIKE '%disposal%' OR LOWER(name) LIKE '%loss%'`,
                `type='expense' OR type='Beban'`,
                '6200', 'Kerugian Pemusnahan Barang', 'expense', 'beban_lainnya'
            );
            const persediaanId = await getOrCreateAccount(
                `LOWER(name) LIKE '%persediaan%' OR LOWER(name) LIKE '%inventory%' OR LOWER(name) LIKE '%stok%'`,
                `type='asset' OR type='Aset'`,
                '1300', 'Persediaan Barang', 'asset', 'persediaan'
            );

            const journalRes = await client.query(
                `INSERT INTO journal_entries (number,date,branch_id,description,status,created_by,ref_number,ref_type)
                 VALUES ($1,CURRENT_DATE,$2,$3,'posted',$4,$5,'DISPOSE') RETURNING id`,
                [journalNumber, batch.branch_id,
                    `Pemusnahan Batch ${batch.batch_no} - ${batch.item_name} (${reason || 'Kadaluarsa'})`,
                    req.user.name, `DISPOSE-${batch.batch_no}`]
            );
            const journalId = journalRes.rows[0].id;
            const desc = `Pemusnahan ${batch.item_name} - Batch ${batch.batch_no} (${qtyToDispose} unit)`;

            await client.query(
                `INSERT INTO journal_lines (journal_id,account_id,debit,credit,description)
                 VALUES ($1,$2,$3,0,$4), ($1,$5,0,$3,$4)`,
                [journalId, rugiId, disposalValue, desc, persediaanId]
            );

            await updateCoaBalancesForJournal(client, journalId);
        }

        await client.query('COMMIT');

        // 5. Audit trail
        await query(
            `INSERT INTO audit_trail (action, module, description, user_id, user_name, branch_id)
             VALUES ('dispose','inventory',$1,$2,$3,$4)`,
            [
                `Pemusnahan Batch ${batch.batch_no}: ${qtyToDispose} unit ${batch.item_name} (${reason || 'Kadaluarsa'})` +
                (disposalValue > 0 ? ` — Nilai: Rp ${Math.round(disposalValue).toLocaleString()}` : ''),
                req.user.id, req.user.name, batch.branch_id
            ]
        ).catch(() => { });

        res.json({
            message: `Batch ${batch.batch_no} berhasil dimusnahkan (${qtyToDispose} unit). Stok dan jurnal telah diperbarui.`,
            batch: { uuid: batch.uuid, batch_no: batch.batch_no, disposed_qty: qtyToDispose, remaining_qty: newBatchQty },
            disposal_value: disposalValue
        });
    } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
}));

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/inventory/batches/dispose-bulk -- Musnahkan beberapa batch sekaligus
// ─────────────────────────────────────────────────────────────────────────────
router.post('/dispose-bulk', requirePermission('inventory:edit'), asyncHandler(async (req, res) => {
    const { batch_uuids, reason, notes } = req.body;
    if (!batch_uuids || !Array.isArray(batch_uuids) || batch_uuids.length === 0) {
        return res.status(400).json({ error: 'batch_uuids harus berupa array UUID' });
    }

    const companyId = req.user.company_id;

    // Ambil semua batch yang valid
    const placeholders = batch_uuids.map((_, i) => `$${i + 2}`).join(',');
    const batchesRes = await query(
        `SELECT b.id, b.uuid, b.batch_no, b.qty, b.item_id, b.warehouse_id, b.status,
                i.name as item_name, i.hpp, w.name as warehouse_name,
                w.branch_id, br.code as branch_code
         FROM batches b
         JOIN items i ON b.item_id = i.id
         JOIN warehouses w ON b.warehouse_id = w.id
         JOIN branches br ON w.branch_id = br.id
         WHERE br.company_id = $1 AND b.uuid IN (${placeholders})
           AND b.status != 'depleted' AND b.qty > 0`,
        [companyId, ...batch_uuids]
    );

    if (batchesRes.rows.length === 0) {
        return res.status(404).json({ error: 'Tidak ada batch valid yang bisa dimusnahkan' });
    }

    const batches = batchesRes.rows;
    const client = await getClient();

    try {
        await client.query('BEGIN');

        let totalDisposed = 0;
        let totalValue = 0;

        for (const batch of batches) {
            const disposalValue = batch.qty * (parseFloat(batch.hpp) || 0);
            totalValue += disposalValue;
            totalDisposed += batch.qty;

            // 1. Update batch
            await client.query(
                `UPDATE batches SET qty = 0, status = 'depleted', notes = COALESCE($1, notes), updated_at = NOW()
                 WHERE id = $2`,
                [notes || null, batch.id]
            );

            // 2. Kurangi inventory
            await client.query(
                `UPDATE inventory SET qty = qty - $1, updated_at = NOW()
                 WHERE item_id = $2 AND warehouse_id = $3`,
                [batch.qty, batch.item_id, batch.warehouse_id]
            );

            // 3. Stock movement
            await client.query(
                `INSERT INTO stock_movements (item_id, date, type, qty, ref, warehouse_id, description)
                 VALUES ($1, CURRENT_DATE, 'out', $2, $3, $4, $5)`,
                [batch.item_id, batch.qty, `DISPOSE-BULK`, batch.warehouse_id,
                    `Pemusnahan massal batch ${batch.batch_no}: ${reason || 'Kadaluarsa'} (${batch.qty} unit)`]
            );
        }

        // 4. Satu jurnal untuk semua disposal (jika ada nilai)
        if (totalValue > 0) {
            const branchCode = batches[0].branch_code || 'JKT';
            const journalNumber = await generateAutoNumber(branchCode, 'JU');

            const getOrCreateAccount = async (likeClause, typeClause, code, name, type, cat) => {
                const r = await client.query(
                    `SELECT id FROM chart_of_accounts WHERE company_id=$1 AND (${likeClause}) AND (${typeClause}) ORDER BY code LIMIT 1`,
                    [companyId]
                );
                if (r.rows.length > 0) return r.rows[0].id;
                const ins = await client.query(
                    `INSERT INTO chart_of_accounts (code,name,type,category,currency,company_id)
                     VALUES ($1,$2,$3,$4,'IDR',$5)
                     ON CONFLICT (code,company_id) DO UPDATE SET name=EXCLUDED.name RETURNING id`,
                    [code, name, type, cat, companyId]
                );
                return ins.rows[0].id;
            };

            const rugiId = await getOrCreateAccount(
                `LOWER(name) LIKE '%rugi%pemusnahan%' OR LOWER(name) LIKE '%kerugian%' OR LOWER(name) LIKE '%disposal%'`,
                `type='expense' OR type='Beban'`, '6200', 'Kerugian Pemusnahan Barang', 'expense', 'beban_lainnya'
            );
            const persediaanId = await getOrCreateAccount(
                `LOWER(name) LIKE '%persediaan%' OR LOWER(name) LIKE '%inventory%' OR LOWER(name) LIKE '%stok%'`,
                `type='asset' OR type='Aset'`, '1300', 'Persediaan Barang', 'asset', 'persediaan'
            );

            const batchList = batches.map(b => b.batch_no).join(', ');
            const journalRes = await client.query(
                `INSERT INTO journal_entries (number,date,branch_id,description,status,created_by,ref_number,ref_type)
                 VALUES ($1,CURRENT_DATE,$2,$3,'posted',$4,$5,'DISPOSE') RETURNING id`,
                [journalNumber, batches[0].branch_id,
                    `Pemusnahan Massal ${batches.length} Batch (${reason || 'Kadaluarsa'})`,
                    req.user.name, `DISPOSE-BULK`]
            );
            const journalId = journalRes.rows[0].id;
            const desc = `Pemusnahan massal: ${batchList} — total ${totalDisposed} unit`;

            await client.query(
                `INSERT INTO journal_lines (journal_id,account_id,debit,credit,description)
                 VALUES ($1,$2,$3,0,$4), ($1,$5,0,$3,$4)`,
                [journalId, rugiId, totalValue, desc, persediaanId]
            );

            await updateCoaBalancesForJournal(client, journalId);
        }

        await client.query('COMMIT');

        // 5. Audit trail
        await query(
            `INSERT INTO audit_trail (action, module, description, user_id, user_name, branch_id)
             VALUES ('dispose','inventory',$1,$2,$3,$4)`,
            [
                `Pemusnahan Massal ${batches.length} batch (${totalDisposed} unit). Reason: ${reason || 'Kadaluarsa'}` +
                (totalValue > 0 ? ` — Nilai total: Rp ${Math.round(totalValue).toLocaleString()}` : ''),
                req.user.id, req.user.name, batches[0].branch_id
            ]
        ).catch(() => { });

        res.json({
            message: `${batches.length} batch berhasil dimusnahkan (${totalDisposed} unit total). Stok dan jurnal telah diperbarui.`,
            disposed_count: batches.length,
            total_qty: totalDisposed,
            total_value: totalValue
        });
    } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
}));

// PUT /api/inventory/batches/:uuid/deplete -- Legacy: Tandai Habis (redirect ke dispose)
router.put('/:uuid/deplete', requirePermission('inventory:edit'), validateUUID(), asyncHandler(async (req, res) => {
    // Forward ke dispose endpoint untuk backward compatibility
    req.body.reason = req.body.reason || 'Tandai Habis (legacy)';
    // Re-route internally
    const { notes } = req.body;

    const batchRes = await query(
        `SELECT b.id, b.uuid, b.batch_no, b.qty, b.item_id, b.warehouse_id, b.status,
                i.name as item_name, i.hpp, w.name as warehouse_name,
                w.branch_id, br.code as branch_code
         FROM batches b
         JOIN items i ON b.item_id = i.id
         JOIN warehouses w ON b.warehouse_id = w.id
         JOIN branches br ON w.branch_id = br.id
         WHERE b.uuid = $1 AND b.status != 'depleted' AND b.qty > 0`,
        [req.params.uuid]
    );
    if (batchRes.rows.length === 0) {
        // Fallback: mungkin qty sudah 0, hanya update status
        const result = await query(
            `UPDATE batches SET status = 'depleted', notes = COALESCE($1, notes), updated_at = NOW()
             WHERE uuid = $2 AND status != 'depleted'
             RETURNING uuid, batch_no, status`,
            [notes || null, req.params.uuid]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Batch tidak ditemukan atau sudah ditandai habis' });
        return res.json({ message: 'Batch berhasil ditandai habis', batch: result.rows[0] });
    }

    // Delegate to dispose logic
    const batch = batchRes.rows[0];
    const disposalValue = batch.qty * (parseFloat(batch.hpp) || 0);

    const client = await getClient();
    try {
        await client.query('BEGIN');

        await client.query(
            `UPDATE batches SET qty = 0, status = 'depleted', notes = COALESCE($1, notes), updated_at = NOW() WHERE id = $2`,
            [notes || null, batch.id]
        );
        await client.query(
            `UPDATE inventory SET qty = qty - $1, updated_at = NOW() WHERE item_id = $2 AND warehouse_id = $3`,
            [batch.qty, batch.item_id, batch.warehouse_id]
        );
        await client.query(
            `INSERT INTO stock_movements (item_id, date, type, qty, ref, warehouse_id, description)
             VALUES ($1, CURRENT_DATE, 'out', $2, $3, $4, $5)`,
            [batch.item_id, batch.qty, `DEPLETE-${batch.batch_no}`, batch.warehouse_id,
                `Tandai habis batch ${batch.batch_no} (${batch.qty} unit)`]
        );

        if (disposalValue > 0) {
            const branchCode = batch.branch_code || 'JKT';
            const journalNumber = await generateAutoNumber(branchCode, 'JU');
            const getOrCreateAccount = async (likeClause, typeClause, code, name, type, cat) => {
                const r = await client.query(
                    `SELECT id FROM chart_of_accounts WHERE company_id=$1 AND (${likeClause}) AND (${typeClause}) ORDER BY code LIMIT 1`,
                    [req.user.company_id]
                );
                if (r.rows.length > 0) return r.rows[0].id;
                const ins = await client.query(
                    `INSERT INTO chart_of_accounts (code,name,type,category,currency,company_id)
                     VALUES ($1,$2,$3,$4,'IDR',$5)
                     ON CONFLICT (code,company_id) DO UPDATE SET name=EXCLUDED.name RETURNING id`,
                    [code, name, type, cat, req.user.company_id]
                );
                return ins.rows[0].id;
            };
            const rugiId = await getOrCreateAccount(
                `LOWER(name) LIKE '%rugi%pemusnahan%' OR LOWER(name) LIKE '%kerugian%' OR LOWER(name) LIKE '%disposal%'`,
                `type='expense' OR type='Beban'`, '6200', 'Kerugian Pemusnahan Barang', 'expense', 'beban_lainnya'
            );
            const persediaanId = await getOrCreateAccount(
                `LOWER(name) LIKE '%persediaan%' OR LOWER(name) LIKE '%inventory%' OR LOWER(name) LIKE '%stok%'`,
                `type='asset' OR type='Aset'`, '1300', 'Persediaan Barang', 'asset', 'persediaan'
            );
            const journalRes = await client.query(
                `INSERT INTO journal_entries (number,date,branch_id,description,status,created_by,ref_number,ref_type)
                 VALUES ($1,CURRENT_DATE,$2,$3,'posted',$4,$5,'DISPOSE') RETURNING id`,
                [journalNumber, batch.branch_id, `Tandai Habis Batch ${batch.batch_no} - ${batch.item_name}`,
                    req.user.name, `DEPLETE-${batch.batch_no}`]
            );
            const journalId = journalRes.rows[0].id;
            await client.query(
                `INSERT INTO journal_lines (journal_id,account_id,debit,credit,description)
                 VALUES ($1,$2,$3,0,$4), ($1,$5,0,$3,$4)`,
                [journalId, rugiId, disposalValue, `Tandai habis ${batch.item_name} - Batch ${batch.batch_no}`, persediaanId]
            );
            await updateCoaBalancesForJournal(client, journalId);
        }

        await client.query('COMMIT');
        await query(
            `INSERT INTO audit_trail (action, module, description, user_id, user_name, branch_id)
             VALUES ('dispose','inventory',$1,$2,$3,$4)`,
            [`Tandai Habis Batch ${batch.batch_no}: ${batch.qty} unit ${batch.item_name}`, req.user.id, req.user.name, batch.branch_id]
        ).catch(() => { });

        res.json({ message: 'Batch berhasil ditandai habis. Stok dan jurnal diperbarui.', batch: { uuid: batch.uuid, batch_no: batch.batch_no, status: 'depleted' } });
    } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
}));

// PUT /api/inventory/batches/:uuid -- Sesuaikan Qty
router.put('/:uuid', requirePermission('inventory:edit'), validateUUID(), asyncHandler(async (req, res) => {
    const { qty, notes } = req.body;
    if (qty === undefined || isNaN(parseFloat(qty)) || parseFloat(qty) < 0) {
        return res.status(400).json({ error: 'Qty tidak valid (harus angka >= 0)' });
    }

    const result = await query(
        `UPDATE batches SET qty = $1, notes = COALESCE($2, notes), updated_at = NOW()
         WHERE uuid = $3 AND status != 'depleted'
         RETURNING uuid, batch_no, qty, status`,
        [parseFloat(qty), notes || null, req.params.uuid]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Batch tidak ditemukan atau sudah habis' });

    // Audit trail
    await query(
        `INSERT INTO audit_trail (action, module, description, user_id, user_name) VALUES ('update','inventory',$1,$2,$3)`,
        [`Sesuaikan Qty Batch ${result.rows[0].batch_no}: ${result.rows[0].qty}`, req.user.id, req.user.name]
    ).catch(() => { });

    res.json({ message: 'Qty batch berhasil diperbarui', batch: result.rows[0] });
}));

module.exports = router;
