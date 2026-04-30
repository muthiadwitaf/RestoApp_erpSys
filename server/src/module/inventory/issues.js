const router = require('express').Router();
const { query, getClient } = require('../../config/db');
const { requirePermission } = require('../../middleware/auth');
const { asyncHandler, resolveUUID, updateCoaBalancesForJournal } = require('../../utils/helpers');
const { generateAutoNumber } = require('../../utils/autoNumber');

router.get('/', requirePermission('inventory:view'), asyncHandler(async (req, res) => {
    const { branch_id } = req.query;
    const companyId = req.user.company_id;
    let wc = 'WHERE b.company_id = $1'; let values = [companyId]; let idx = 2;
    if (branch_id) { const rB = await resolveUUID(branch_id, 'branches', query); wc += ` AND g.branch_id = $${idx++}`; values.push(rB); }
    const result = await query(
        `SELECT g.uuid, g.number, g.date, g.status, g.notes, g.created_by,
               g.approved_by, g.approved_at, g.ready_by, g.ready_at,
       w.name as warehouse_name, b.name as branch_name, b.uuid as branch_id,
       so.number as so_number, so.uuid as so_uuid,
       c.name as customer_name, c.address as customer_address, c.phone as customer_phone
     FROM goods_issues g
     LEFT JOIN warehouses w ON g.warehouse_id = w.id
     LEFT JOIN branches b ON g.branch_id = b.id
     LEFT JOIN sales_orders so ON g.so_id = so.id
     LEFT JOIN customers c ON so.customer_id = c.id
     ${wc} ORDER BY g.date DESC`, values
    );
    res.json(result.rows);
}));

// GET /:uuid -- detail with lines + batch allocations
router.get('/:uuid', requirePermission('inventory:view'), asyncHandler(async (req, res) => {
    const headerResult = await query(
        `SELECT g.uuid, g.number, g.date, g.status, g.notes, g.created_by,
               g.approved_by, g.approved_at, g.ready_by, g.ready_at,
         w.name as warehouse_name, b.name as branch_name, b.uuid as branch_id,
         so.number as so_number, so.uuid as so_uuid,
         c.name as customer_name, c.address as customer_address, c.phone as customer_phone
       FROM goods_issues g
       LEFT JOIN warehouses w ON g.warehouse_id = w.id
       LEFT JOIN branches b ON g.branch_id = b.id
       LEFT JOIN sales_orders so ON g.so_id = so.id
       LEFT JOIN customers c ON so.customer_id = c.id
       WHERE g.uuid = $1`, [req.params.uuid]
    );
    if (headerResult.rows.length === 0) return res.status(404).json({ error: 'Pengeluaran tidak ditemukan' });
    const giId = (await query(`SELECT id FROM goods_issues WHERE uuid = $1`, [req.params.uuid])).rows[0].id;
    const lines = await query(
        `SELECT gil.id as line_id, gil.qty, gil.uom, i.uuid as item_id, i.name as item_name, i.code as item_code
         FROM goods_issue_lines gil JOIN items i ON gil.item_id = i.id WHERE gil.gi_id = $1`, [giId]
    );

    // Load batch allocations per line
    const linesWithBatches = [];
    for (const line of lines.rows) {
        const allocs = await query(
            `SELECT giba.qty, bt.uuid as batch_uuid, bt.batch_no, bt.expiry_date, bt.status as batch_status
             FROM goods_issue_batch_allocations giba
             JOIN batches bt ON giba.batch_id = bt.id
             WHERE giba.gi_line_id = $1
             ORDER BY bt.expiry_date ASC NULLS LAST`, [line.line_id]
        );
        linesWithBatches.push({
            ...line,
            batch_allocations: allocs.rows
        });
    }
    res.json({ ...headerResult.rows[0], lines: linesWithBatches });
}));


// ─────────────────────────────────────────────────────────────────────────────
// POST /  ─ Buat GI baru dengan status DRAFT
// Tidak ada pengurangan stok, tidak ada invoice, tidak ada jurnal.
// Semua proses terjadi saat approve (PUT /:uuid/approve).
// ─────────────────────────────────────────────────────────────────────────────
router.post('/', requirePermission('inventory:create'), asyncHandler(async (req, res) => {
    const { so_id, warehouse_id, branch_id, lines, notes } = req.body;
    const rBranch = await resolveUUID(branch_id, 'branches', query);
    const rSo = await resolveUUID(so_id, 'sales_orders', query);
    const rWh = await resolveUUID(warehouse_id, 'warehouses', query);

    const branchResult = await query(`SELECT code FROM branches WHERE id = $1`, [rBranch]);
    const branchCode = branchResult.rows[0]?.code || 'JKT';
    const number = await generateAutoNumber(branchCode, 'GI');

    // Guard: SO harus approved atau partial
    if (rSo) {
        const soStatus = await query(`SELECT status FROM sales_orders WHERE id = $1`, [rSo]);
        const currentStatus = soStatus.rows[0]?.status;
        if (!['approved', 'partial'].includes(currentStatus)) {
            return res.status(400).json({
                error: `SO tidak bisa diproses (status: ${currentStatus}). Hanya SO berstatus Approved atau Partial yang bisa dibuat GI.`
            });
        }
    }

    const client = await getClient();
    try {
        await client.query('BEGIN');

        // Insert GI header — status='draft' (default dari DB)
        const result = await client.query(
            `INSERT INTO goods_issues (number, date, so_id, warehouse_id, branch_id, notes, created_by)
             VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6) RETURNING id, uuid, number, status`,
            [number, rSo || null, rWh, rBranch, notes, req.user.name]
        );
        const giId = result.rows[0].id;

        // Insert lines + batch allocations — stok BELUM dikurangi
        for (const line of (lines || [])) {
            const rItem = await resolveUUID(line.item_id, 'items', query);
            const lineResult = await client.query(
                `INSERT INTO goods_issue_lines (gi_id, item_id, qty, uom) VALUES ($1,$2,$3,$4) RETURNING id`,
                [giId, rItem, line.qty, line.uom]
            );
            const giLineId = lineResult.rows[0].id;

            // Simpan batch allocations jika ada
            if (line.batch_allocations && Array.isArray(line.batch_allocations)) {
                for (const alloc of line.batch_allocations) {
                    if (!alloc.batch_uuid || !alloc.qty || alloc.qty <= 0) continue;
                    const rBatch = await resolveUUID(alloc.batch_uuid, 'batches', query);
                    // Validasi: batch tidak boleh expired
                    const batchCheck = await client.query(
                        `SELECT status FROM batches WHERE id = $1`, [rBatch]
                    );
                    if (batchCheck.rows[0]?.status === 'expired') {
                        await client.query('ROLLBACK');
                        return res.status(400).json({
                            error: `Batch yang sudah expired tidak boleh digunakan untuk pengeluaran barang. Gunakan fitur Pemusnahan untuk membuang stok expired.`
                        });
                    }
                    await client.query(
                        `INSERT INTO goods_issue_batch_allocations (gi_line_id, batch_id, qty) VALUES ($1,$2,$3)`,
                        [giLineId, rBatch, alloc.qty]
                    );
                }
            }
        }

        await client.query('COMMIT');
        await query(
            `INSERT INTO audit_trail (action, module, description, user_id, user_name, branch_id)
             VALUES ('create','inventory',$1,$2,$3,$4)`,
            [`Buat GI Draft ${number}`, req.user.id, req.user.name, rBranch]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
}));

// ─────────────────────────────────────────────────────────────────────────────
// PUT /:uuid/approve  ─ Approve GI: kurangi stok, buat invoice & jurnal
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:uuid/approve', requirePermission('inventory:approve', 'inventory:manage'), asyncHandler(async (req, res) => {
    // Ambil data GI
    const giRes = await query(
        `SELECT g.id, g.uuid, g.number, g.status, g.so_id, g.warehouse_id, g.branch_id, g.notes,
                b.code as branch_code, b.id as branch_int_id
         FROM goods_issues g
         JOIN branches b ON b.id = g.branch_id
         WHERE g.uuid = $1`, [req.params.uuid]
    );
    if (giRes.rows.length === 0) return res.status(404).json({ error: 'GI tidak ditemukan' });
    const gi = giRes.rows[0];

    if (gi.status !== 'draft') {
        return res.status(400).json({ error: `GI tidak bisa di-approve (status saat ini: ${gi.status})` });
    }

    const giId = gi.id;
    const rWh = gi.warehouse_id;
    const rSo = gi.so_id;
    const rBranch = gi.branch_int_id;
    const branchCode = gi.branch_code || 'JKT';
    const number = gi.number;

    // Ambil lines GI
    const linesRes = await query(
        `SELECT gil.item_id, gil.qty, gil.uom,
                i.name, i.conversion_factor, i.hpp,
                su.name as small_uom_name, bu.name as big_uom_name
         FROM goods_issue_lines gil
         JOIN items i ON i.id = gil.item_id
         LEFT JOIN units su ON su.id = i.small_uom_id
         LEFT JOIN units bu ON bu.id = i.big_uom_id
         WHERE gil.gi_id = $1`, [giId]
    );
    const giLines = linesRes.rows;

    const client = await getClient();
    try {
        await client.query('BEGIN');

        // ── 1. Validasi stok & kurangi ───────────────────────────────────────
        for (const line of giLines) {
            const convFactor = (line.uom && line.big_uom_name && line.uom === line.big_uom_name)
                ? (line.conversion_factor || 1) : 1;
            const baseQty = line.qty * convFactor;

            const inv = await client.query(
                `SELECT COALESCE(qty, 0) as qty FROM inventory WHERE item_id=$1 AND warehouse_id=$2 FOR UPDATE`,
                [line.item_id, rWh]
            );
            const available = inv.rows[0]?.qty || 0;
            if (available < baseQty) {
                const unitLabel = convFactor > 1
                    ? ` (${line.qty} ${line.uom} = ${baseQty} ${line.small_uom_name || 'Pcs'})` : '';
                await client.query('ROLLBACK');
                return res.status(400).json({
                    error: `Stok ${line.name} tidak cukup saat approve. Tersedia: ${available} ${line.small_uom_name || 'Pcs'}, dibutuhkan: ${baseQty} ${line.small_uom_name || 'Pcs'}${unitLabel}`
                });
            }
            // Kurangi stok
            await client.query(
                `UPDATE inventory SET qty = qty - $1, updated_at = NOW() WHERE item_id=$2 AND warehouse_id=$3`,
                [baseQty, line.item_id, rWh]
            );
            // Stock movement
            await client.query(
                `INSERT INTO stock_movements (item_id, date, type, qty, ref, warehouse_id, description)
                 VALUES ($1, CURRENT_DATE, 'out', $2, $3, $4, $5)`,
                [line.item_id, baseQty, number, rWh, `Pengeluaran barang - ${number} (${line.qty} ${line.uom})`]
            );

            // ── 1b. Kurangi batch qty sesuai alokasi (FEFO) ─────────────────
            const giLineIdRes = await client.query(
                `SELECT id FROM goods_issue_lines WHERE gi_id = $1 AND item_id = $2 LIMIT 1`, [giId, line.item_id]
            );
            if (giLineIdRes.rows.length > 0) {
                const giLineId = giLineIdRes.rows[0].id;
                const allocations = await client.query(
                    `SELECT giba.batch_id, giba.qty, bt.batch_no, bt.qty as batch_qty
                     FROM goods_issue_batch_allocations giba
                     JOIN batches bt ON giba.batch_id = bt.id
                     WHERE giba.gi_line_id = $1`, [giLineId]
                );
                for (const alloc of allocations.rows) {
                    const allocBaseQty = alloc.qty * convFactor;
                    if (alloc.batch_qty < allocBaseQty) {
                        await client.query('ROLLBACK');
                        return res.status(400).json({
                            error: `Batch ${alloc.batch_no} tidak cukup. Tersedia: ${alloc.batch_qty}, dibutuhkan: ${allocBaseQty}`
                        });
                    }
                    // Kurangi batch qty
                    await client.query(
                        `UPDATE batches SET qty = qty - $1, updated_at = NOW() WHERE id = $2`,
                        [allocBaseQty, alloc.batch_id]
                    );
                    // Auto-deplete jika habis
                    await client.query(
                        `UPDATE batches SET status = 'depleted' WHERE id = $1 AND qty <= 0 AND status != 'depleted'`,
                        [alloc.batch_id]
                    );
                }
            }
        }

        // ── 2. Update GI status → approved ──────────────────────────────────
        await client.query(
            `UPDATE goods_issues
             SET status='approved', approved_by=$1, approved_at=NOW(), updated_at=NOW()
             WHERE id=$2`,
            [req.user.name, giId]
        );

        // ── 3. Update SO status (kumulatif semua GI approved) ────────────────
        if (rSo) {
            const cumulativeDelivery = await client.query(
                `SELECT
                    sol.item_id, sol.qty AS so_qty, i.name AS item_name, su.name AS small_uom_name,
                    COALESCE(SUM(
                        CASE
                          WHEN bu.name IS NOT NULL AND gil.uom = bu.name AND i.conversion_factor > 1
                          THEN gil.qty * COALESCE(i.conversion_factor, 1)
                          ELSE COALESCE(gil.qty, 0)
                        END
                    ), 0) AS total_sent
                 FROM sales_order_lines sol
                 JOIN items i ON i.id = sol.item_id
                 LEFT JOIN units su ON su.id = i.small_uom_id
                 LEFT JOIN units bu ON bu.id = i.big_uom_id
                 LEFT JOIN goods_issue_lines gil ON gil.item_id = sol.item_id
                     AND gil.gi_id IN (
                         SELECT id FROM goods_issues WHERE so_id = $1 AND status IN ('approved', 'ready_to_delivery', 'completed')
                     )
                 WHERE sol.so_id = $1
                 GROUP BY sol.item_id, sol.qty, i.name, i.conversion_factor, su.name`,
                [rSo]
            );

            const partialItems = [];
            for (const row of cumulativeDelivery.rows) {
                const totalSent = parseInt(row.total_sent || 0);
                const soQty = parseInt(row.so_qty || 0);
                if (totalSent < soQty) {
                    partialItems.push({
                        name: row.item_name,
                        sent: totalSent,
                        total: soQty,
                        uom: row.small_uom_name || 'Pcs'
                    });
                }
            }
            const isPartial = partialItems.length > 0;

            if (isPartial) {
                const noteDate = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
                const noteLines = partialItems.map(p =>
                    `- ${p.name}: terkirim ${p.sent}/${p.total} ${p.uom} (sisa ${p.total - p.sent} ${p.uom})`
                ).join('\n');
                await client.query(
                    `UPDATE sales_orders
                     SET notes = CASE WHEN notes IS NULL OR notes = '' THEN $1 ELSE notes || chr(10) || $1 END,
                         updated_at = NOW()
                     WHERE id = $2`,
                    [`[${noteDate}] Pengiriman parsial disetujui via ${number}:\n${noteLines}`, rSo]
                );
            }
            const newSOStatus = isPartial ? 'partial' : 'processed';
            await client.query(
                `UPDATE sales_orders SET status=$1, updated_at=NOW() WHERE id=$2`,
                [newSOStatus, rSo]
            );

            // ── 4. Buat Invoice & Jurnal ─────────────────────────────────────
            const soMeta = await client.query(
                `SELECT so.number, so.currency, so.extra_discount, so.tax_amount,
                        c.name as customer_name,
                        COALESCE(SUM(sol.qty * sol.price * (1 - COALESCE(sol.discount,0)/100)), 0) as so_subtotal_after_disc
                 FROM sales_orders so
                 LEFT JOIN sales_order_lines sol ON sol.so_id = so.id
                 LEFT JOIN customers c ON so.customer_id = c.id
                 WHERE so.id = $1
                 GROUP BY so.id, c.name`, [rSo]
            );
            if (soMeta.rows.length > 0) {
                const so = soMeta.rows[0];
                const extraDiscPct = parseFloat(so.extra_discount || 0);
                const soSubtotalAfterDisc = parseFloat(so.so_subtotal_after_disc || 0);
                const customerName = so.customer_name || 'Customer';

                const giLinesData = await client.query(
                    `SELECT gil.qty as gi_qty, gil.uom, sol.price, sol.discount,
                            i.conversion_factor, bu.name as big_uom_name
                     FROM goods_issue_lines gil
                     JOIN items i ON i.id = gil.item_id
                     LEFT JOIN units bu ON bu.id = i.big_uom_id
                     JOIN sales_order_lines sol ON sol.so_id = $1 AND sol.item_id = gil.item_id
                     WHERE gil.gi_id = $2`, [rSo, giId]
                );
                const giSubtotal = giLinesData.rows.reduce((sum, l) => {
                    const cf = (l.uom && l.big_uom_name && l.uom === l.big_uom_name) ? (l.conversion_factor || 1) : 1;
                    return sum + (l.gi_qty * cf * parseFloat(l.price) * (1 - parseFloat(l.discount || 0) / 100));
                }, 0);
                const giAfterExtraDisc = giSubtotal * (1 - extraDiscPct / 100);
                const soTaxAmount = parseFloat(so.tax_amount || 0);
                const ppnProporsional = soSubtotalAfterDisc > 0
                    ? Math.round(soTaxAmount * (giSubtotal / soSubtotalAfterDisc)) : 0;
                const invoiceTotal = Math.round(giAfterExtraDisc + ppnProporsional);
                const invoiceDpp = invoiceTotal - ppnProporsional;
                const invoiceNumber = await generateAutoNumber(branchCode, 'INV');

                await client.query(
                    `INSERT INTO invoices (number, so_id, gi_id, date, due_date, branch_id, total, tax_amount, currency, created_by, status, amount_paid)
                     VALUES ($1,$2,$3,CURRENT_DATE,CURRENT_DATE + INTERVAL '30 days',$4,$5,$6,$7,$8,'unpaid',0)`,
                    [invoiceNumber, rSo, giId, rBranch, invoiceTotal, ppnProporsional, so.currency || 'IDR', req.user.name]
                );

                // Jurnal Piutang / Pendapatan / PPN
                const journalNumber = await generateAutoNumber(branchCode, 'JU');
                const getOrCreate = async (likeClause, typeClause, code, name, type, cat) => {
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

                const piutangId = await getOrCreate(`LOWER(name) LIKE '%piutang%'`, `type='asset' OR type='Aset'`, '1200', 'Piutang Usaha', 'asset', 'piutang');
                const pendapatanId = await getOrCreate(`LOWER(name) LIKE '%penjualan%' OR LOWER(name) LIKE '%pendapatan%' OR LOWER(name) LIKE '%revenue%'`, `type='revenue' OR type='Pendapatan'`, '4100', 'Pendapatan Penjualan', 'revenue', 'pendapatan');

                const journalRes = await client.query(
                    `INSERT INTO journal_entries (number,date,branch_id,description,status,created_by,ref_number,ref_type)
                     VALUES ($1,CURRENT_DATE,$2,$3,'posted',$4,$5,'GI') RETURNING id`,
                    [journalNumber, rBranch, `Pengiriman Barang ${number} - ${customerName}`, req.user.name, number]
                );
                const journalId = journalRes.rows[0].id;
                const desc = `Penjualan ${number} ke ${customerName}`;

                if (ppnProporsional > 0) {
                    const ppnId = await getOrCreate(
                        `LOWER(name) LIKE '%ppn keluaran%' OR LOWER(name) LIKE '%pajak keluaran%' OR LOWER(name) LIKE '%output vat%'`,
                        `type='Liabilitas' OR type='liability' OR type='Kewajiban'`, '2-2200', 'PPN Keluaran', 'Liabilitas', 'Utang Pajak'
                    );
                    await client.query(
                        `INSERT INTO journal_lines (journal_id,account_id,debit,credit,description) VALUES
                         ($1,$2,$3,0,$6), ($1,$4,0,$5,$6), ($1,$7,0,$8,$6)`,
                        [journalId, piutangId, invoiceTotal, pendapatanId, invoiceDpp, desc, ppnId, ppnProporsional]
                    );
                } else {
                    await client.query(
                        `INSERT INTO journal_lines (journal_id,account_id,debit,credit,description)
                         VALUES ($1,$2,$3,0,$4), ($1,$5,0,$3,$4)`,
                        [journalId, piutangId, invoiceTotal, desc, pendapatanId]
                    );
                }

                // Jurnal HPP
                const hppRes = await client.query(
                    `SELECT COALESCE(SUM(
                       CASE WHEN bu.name IS NOT NULL AND gil.uom=bu.name AND i.conversion_factor>1
                       THEN gil.qty*COALESCE(i.conversion_factor,1)*COALESCE(i.hpp,0)
                       ELSE gil.qty*COALESCE(i.hpp,0) END
                     ),0) as total_hpp
                     FROM goods_issue_lines gil
                     JOIN items i ON i.id=gil.item_id
                     LEFT JOIN units bu ON bu.id=i.big_uom_id
                     WHERE gil.gi_id=$1`, [giId]
                );
                const totalHpp = parseFloat(hppRes.rows[0]?.total_hpp || 0);
                if (totalHpp > 0) {
                    const hppId = await getOrCreate(`LOWER(name) LIKE '%hpp%' OR LOWER(name) LIKE '%harga pokok%' OR LOWER(name) LIKE '%cogs%'`, `type='expense' OR type='Beban'`, '5100', 'HPP Penjualan', 'expense', 'hpp');
                    const persediaanId = await getOrCreate(`LOWER(name) LIKE '%persediaan%' OR LOWER(name) LIKE '%inventory%' OR LOWER(name) LIKE '%stok%'`, `type='asset' OR type='Aset'`, '1300', 'Persediaan Barang', 'asset', 'persediaan');
                    await client.query(
                        `INSERT INTO journal_lines (journal_id,account_id,debit,credit,description)
                         VALUES ($1,$2,$3,0,$4), ($1,$5,0,$3,$4)`,
                        [journalId, hppId, totalHpp, `HPP pengeluaran barang ${number}`, persediaanId]
                    );
                }
                await updateCoaBalancesForJournal(client, journalId);
            }
        }

        await client.query('COMMIT');
        await query(
            `INSERT INTO audit_trail (action, module, description, user_id, user_name, branch_id)
             VALUES ('approve','inventory',$1,$2,$3,$4)`,
            [`Approve GI ${number}`, req.user.id, req.user.name, rBranch]
        );
        res.json({ message: `GI ${number} berhasil di-approve. Stok dikurangi dan invoice dibuat.`, number });
    } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
}));

// ─────────────────────────────────────────────────────────────────────────────
// PUT /:uuid/reject  ─ Tolak / batalkan GI draft
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:uuid/reject', requirePermission('inventory:approve', 'inventory:manage'), asyncHandler(async (req, res) => {
    const result = await query(
        `UPDATE goods_issues SET status='rejected', updated_at=NOW()
         WHERE uuid=$1 AND status='draft'
         RETURNING uuid, number, branch_id`,
        [req.params.uuid]
    );
    if (result.rows.length === 0)
        return res.status(400).json({ error: 'GI tidak bisa ditolak (mungkin sudah approved atau tidak ditemukan)' });

    const { number, branch_id } = result.rows[0];
    await query(
        `INSERT INTO audit_trail (action, module, description, user_id, user_name, branch_id)
         VALUES ('reject','inventory',$1,$2,$3,$4)`,
        [`Tolak GI ${number}`, req.user.id, req.user.name, branch_id]
    );
    res.json({ message: `GI ${number} ditolak.` });
}));

// ─────────────────────────────────────────────────────────────────────────────
// PUT /:uuid/ready  ─ Tandai GI siap dikirim (ready_to_delivery)
// Hanya bisa dari status 'approved'.
// Tidak ada perubahan stok — ini adalah status logistik / operasional gudang.
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:uuid/ready', requirePermission('inventory:edit', 'inventory:manage'), asyncHandler(async (req, res) => {
    const result = await query(
        `UPDATE goods_issues
         SET status = 'ready_to_delivery',
             ready_by = $1,
             ready_at = NOW(),
             updated_at = NOW()
         WHERE uuid = $2 AND status = 'approved'
         RETURNING uuid, number, branch_id`,
        [req.user.name, req.params.uuid]
    );
    if (result.rows.length === 0)
        return res.status(400).json({
            error: 'GI tidak bisa ditandai siap kirim (harus berstatus Approved, atau tidak ditemukan)'
        });

    const { number, branch_id } = result.rows[0];
    await query(
        `INSERT INTO audit_trail (action, module, description, user_id, user_name, branch_id)
         VALUES ('ready','inventory',$1,$2,$3,$4)`,
        [`GI ${number} siap dikirim — Ready to Delivery`, req.user.id, req.user.name, branch_id]
    );
    res.json({ message: `GI ${number} siap untuk dikirim.` });
}));

module.exports = router;
