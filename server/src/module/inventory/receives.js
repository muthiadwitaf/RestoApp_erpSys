const router = require('express').Router();
const { query, getClient } = require('../../config/db');
const { requirePermission } = require('../../middleware/auth');
const { validateUUID } = require('../../middleware/validate');
const { asyncHandler, resolveUUID, updateCoaBalancesForJournal } = require('../../utils/helpers');
const { generateAutoNumber } = require('../../utils/autoNumber');

// GET (optionally filtered by po_id uuid)
router.get('/', requirePermission('inventory:view'), asyncHandler(async (req, res) => {
    const { branch_id, po_id } = req.query;
    const companyId = req.user.company_id;
    let where = ['b.company_id = $1']; let values = [companyId]; let idx = 2;
    if (branch_id) {
        const rBranch = await resolveUUID(branch_id, 'branches', query);
        where.push(`g.branch_id = $${idx++}`); values.push(rBranch);
    }
    if (po_id) {
        const rPo = await resolveUUID(po_id, 'purchase_orders', query);
        where.push(`g.po_id = $${idx++}`); values.push(rPo);
    }
    const wc = 'WHERE ' + where.join(' AND ');
    const result = await query(
        `SELECT g.uuid, g.number, g.date, g.status, g.notes, g.created_by,
           w.name AS warehouse_name, w.uuid AS warehouse_id,
           b.name AS branch_name, b.uuid AS branch_id,
           po.number AS po_number, po.uuid AS po_uuid,
           s.name AS supplier_name,
           COALESCE(
             json_agg(
               json_build_object(
                 'item_code', i.code,
                 'item_name', i.name,
                 'qty',       grl.qty,
                 'uom',       grl.uom,
                 'batch_no',  bt.batch_no,
                 'expiry_date', bt.expiry_date,
                 'batch_status', bt.status
               ) ORDER BY grl.id
             ) FILTER (WHERE grl.id IS NOT NULL),
             '[]'
           ) AS lines
         FROM goods_receives g
         LEFT JOIN warehouses w ON g.warehouse_id = w.id
         LEFT JOIN branches b ON g.branch_id = b.id
         LEFT JOIN purchase_orders po ON g.po_id = po.id
         LEFT JOIN suppliers s ON po.supplier_id = s.id
         LEFT JOIN goods_receive_lines grl ON grl.gr_id = g.id
         LEFT JOIN items i ON grl.item_id = i.id
         LEFT JOIN batches bt ON grl.batch_id = bt.id
         ${wc}
         GROUP BY g.id, w.name, w.uuid, b.name, b.uuid, po.number, po.uuid, s.name
         ORDER BY g.date DESC, g.id DESC`,
        values
    );
    res.json(result.rows);
}));

// GET /:uuid -- detail with lines
router.get('/:uuid', requirePermission('inventory:view'), validateUUID(), asyncHandler(async (req, res) => {
    const headerResult = await query(
        `SELECT g.uuid, g.number, g.date, g.status, g.notes, g.created_by,
         w.name AS warehouse_name, w.uuid AS warehouse_id,
         b.name AS branch_name, b.uuid AS branch_id,
         po.number AS po_number, po.uuid AS po_uuid,
         s.name AS supplier_name
       FROM goods_receives g
       LEFT JOIN warehouses w ON g.warehouse_id = w.id
       LEFT JOIN branches b ON g.branch_id = b.id
       LEFT JOIN purchase_orders po ON g.po_id = po.id
       LEFT JOIN suppliers s ON po.supplier_id = s.id
       WHERE g.uuid = $1`, [req.params.uuid]
    );
    if (headerResult.rows.length === 0) return res.status(404).json({ error: 'Penerimaan tidak ditemukan' });
    const grId = (await query(`SELECT id FROM goods_receives WHERE uuid = $1`, [req.params.uuid])).rows[0].id;
    const lines = await query(
        `SELECT grl.qty, grl.uom, i.uuid as item_id, i.name as item_name, i.code as item_code,
                b.uuid as batch_id, b.batch_no, b.expiry_date, b.status as batch_status
         FROM goods_receive_lines grl
         JOIN items i ON grl.item_id = i.id
         LEFT JOIN batches b ON grl.batch_id = b.id
         WHERE grl.gr_id = $1`, [grId]
    );
    res.json({ ...headerResult.rows[0], lines: lines.rows });
}));


router.post('/', requirePermission('inventory:create'), asyncHandler(async (req, res) => {
    const { po_id, warehouse_id, branch_id, lines, notes } = req.body;
    const rBranch = await resolveUUID(branch_id, 'branches', query);
    const rPo = po_id ? await resolveUUID(po_id, 'purchase_orders', query) : null;
    const rWh = await resolveUUID(warehouse_id, 'warehouses', query);
    const branchResult = await query(`SELECT code FROM branches WHERE id = $1`, [rBranch]);
    const branchCode = branchResult.rows[0]?.code || 'JKT';
    const number = await generateAutoNumber(branchCode, 'GR');

    // -- Validasi: qty tidak melebihi SISA (PO qty - sudah diterima sebelumnya) --
    if (rPo && lines?.length) {
        for (const line of lines) {
            if (!line.qty || line.qty <= 0) continue;
            const rItem = await resolveUUID(line.item_id, 'items', query);
            const poLine = await query(
                `SELECT qty FROM purchase_order_lines WHERE po_id = $1 AND item_id = $2 LIMIT 1`,
                [rPo, rItem]
            );
            if (poLine.rows.length > 0) {
                const poQty = parseInt(poLine.rows[0].qty);
                // Hitung qty yang sudah diterima sebelumnya dari GR lain
                const alreadyReceived = await query(
                    `SELECT COALESCE(SUM(grl.qty), 0) as received
                     FROM goods_receive_lines grl
                     JOIN goods_receives gr ON grl.gr_id = gr.id
                     WHERE gr.po_id = $1 AND grl.item_id = $2`,
                    [rPo, rItem]
                );
                const previousQty = parseInt(alreadyReceived.rows[0].received || 0);
                const remainingQty = poQty - previousQty;
                if (parseInt(line.qty) > remainingQty) {
                    return res.status(400).json({
                        error: `Qty melebihi sisa PO untuk item ID ${line.item_id}. Sisa: ${remainingQty}, diterima: ${line.qty}`
                    });
                }
            }
        }
    }

    const client = await getClient();
    try {
        await client.query('BEGIN');
        const grResult = await client.query(
            `INSERT INTO goods_receives (number, date, po_id, warehouse_id, branch_id, notes, created_by)
       VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6) RETURNING id, uuid, number`,
            [number, rPo || null, rWh, rBranch, notes, req.user.name]
        );
        const grId = grResult.rows[0].id;

        for (const line of (lines || [])) {
            const rItem = await resolveUUID(line.item_id, 'items', query);

            // -- UOM Conversion: convert to small UOM before writing stock --
            const itemUomRow = await client.query(
                `SELECT i.conversion_factor,
                        u_small.name AS small_uom_name,
                        u_big.name   AS big_uom_name
                 FROM items i
                 LEFT JOIN units u_small ON u_small.id = i.small_uom_id
                 LEFT JOIN units u_big   ON u_big.id   = i.big_uom_id
                 WHERE i.id = $1`,
                [rItem]
            );
            const itemUom = itemUomRow.rows[0] || {};
            let stockQty = line.qty;
            let stockUom = line.uom;
            let conversionFactor = 1;
            if (
                itemUom.big_uom_name &&
                itemUom.conversion_factor > 1 &&
                line.uom === itemUom.big_uom_name
            ) {
                conversionFactor = itemUom.conversion_factor;
                stockQty = line.qty * conversionFactor;
                stockUom = itemUom.small_uom_name || line.uom;
            }

            // If batch info provided -> save to batches table (qty in small UOM)
            let batchId = null;
            if (line.expiry_date) {
                const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
                const seqRes = await client.query(
                    `SELECT COUNT(*) as cnt FROM batches WHERE item_id = $1 AND received_date = CURRENT_DATE`,
                    [rItem]
                );
                const seq = String(parseInt(seqRes.rows[0].cnt) + 1).padStart(5, '0');
                const batchNo = `BTH-${dateStr}-${rItem}-${seq}`;
                const expiryDate = line.expiry_date || null;
                let batchStatus = 'active';
                if (expiryDate) {
                    const daysLeft = Math.ceil((new Date(expiryDate) - new Date()) / 86400000);
                    if (daysLeft < 0) batchStatus = 'expired';
                    else if (daysLeft <= 30) batchStatus = 'expiring';
                }
                const batchResult = await client.query(
                    `INSERT INTO batches (item_id, warehouse_id, batch_no, expiry_date, received_date, qty, status, gr_id)
                     VALUES ($1, $2, $3, $4, CURRENT_DATE, $5, $6, $7)
                     RETURNING id`,
                    [rItem, rWh, batchNo, expiryDate, stockQty, batchStatus, grResult.rows[0].id]
                );
                batchId = batchResult.rows[0].id;
            }

            await client.query(
                `INSERT INTO inventory (item_id, warehouse_id, qty) VALUES ($1,$2,$3)
         ON CONFLICT (item_id, warehouse_id) DO UPDATE SET qty = inventory.qty + $3, updated_at = NOW()`,
                [rItem, rWh, stockQty]
            );
            await client.query(
                `INSERT INTO stock_movements (item_id, date, type, qty, ref, warehouse_id, description)
         VALUES ($1, CURRENT_DATE, 'in', $2, $3, $4, $5)`,
                [rItem, stockQty, number, rWh, `Penerimaan barang - ${number} (${line.qty} ${line.uom} = ${stockQty} ${stockUom})`]
            );

            // -- Simpan detail line ke goods_receive_lines --
            await client.query(
                `INSERT INTO goods_receive_lines (gr_id, item_id, qty, uom, batch_id)
                 VALUES ($1, $2, $3, $4, $5)`,
                [grId, rItem, line.qty, line.uom, batchId]
            );

            // -- HPP Weighted Average Recalculation --
            let purchasePrice = 0;
            if (rPo) {
                const poLineResult = await client.query(
                    `SELECT price, discount FROM purchase_order_lines WHERE po_id = $1 AND item_id = $2 LIMIT 1`,
                    [rPo, rItem]
                );
                if (poLineResult.rows.length > 0) {
                    const pl = poLineResult.rows[0];
                    const rawPrice = parseFloat(pl.price) * (1 - (parseFloat(pl.discount) || 0) / 100);
                    purchasePrice = conversionFactor > 1 ? rawPrice / conversionFactor : rawPrice;
                }
            }
            if (purchasePrice > 0) {
                const totalResult = await client.query(
                    `SELECT COALESCE(SUM(qty), 0) as total_qty FROM inventory WHERE item_id = $1 FOR UPDATE`, [rItem]
                );
                const totalQtyAfter = parseInt(totalResult.rows[0].total_qty);
                const oldQty = totalQtyAfter - stockQty;
                const oldHpp = (await client.query(`SELECT hpp FROM items WHERE id = $1`, [rItem])).rows[0]?.hpp || 0;
                const newHpp = oldQty > 0
                    ? ((oldQty * parseFloat(oldHpp)) + (stockQty * purchasePrice)) / totalQtyAfter
                    : purchasePrice;
                await client.query(`UPDATE items SET hpp = $1, updated_at = NOW() WHERE id = $2`, [Math.round(newHpp * 100) / 100, rItem]);

                // -- Auto-fill pricelist (base tier) from HPP x margin_default --
                const marginRow = await client.query(
                    `SELECT margin_pct FROM margin_defaults WHERE company_id = $1`,
                    [req.user.company_id]
                );
                const marginPct = parseFloat(marginRow.rows[0]?.margin_pct ?? 20);
                const suggestedSellPrice = Math.round(newHpp * (1 + marginPct / 100));

                const existingBase = await client.query(
                    `SELECT id FROM item_price_tiers WHERE item_id = $1 AND min_qty = 1`,
                    [rItem]
                );
                if (existingBase.rows.length > 0) {
                    await client.query(
                        `UPDATE item_price_tiers SET price = $1 WHERE item_id = $2 AND min_qty = 1`,
                        [suggestedSellPrice, rItem]
                    );
                } else {
                    await client.query(
                        `INSERT INTO item_price_tiers (item_id, min_qty, price, label) VALUES ($1, 1, $2, 'Eceran')`,
                        [rItem, suggestedSellPrice]
                    );
                }
                await client.query(
                    `UPDATE items SET sell_price = $1, updated_at = NOW() WHERE id = $2`,
                    [suggestedSellPrice, rItem]
                );
            }
        }

        // -- Update PO status + Auto-create Bill (AP) + Auto-create Journal --
        if (rPo) {
            // Ambil data PO (harga, diskon, pajak)
            const poData = await client.query(
                `SELECT po.number, po.currency, po.extra_discount, po.tax_amount, po.payment_term_days,
                        s.name as supplier_name
                 FROM purchase_orders po
                 LEFT JOIN suppliers s ON po.supplier_id = s.id
                 WHERE po.id = $1`, [rPo]
            );

            if (poData.rows.length > 0) {
                const po = poData.rows[0];
                const extraDiscPct = parseFloat(po.extra_discount || 0);
                const termDays = parseInt(po.payment_term_days || 30);
                const supplierName = po.supplier_name || 'Supplier';

                // -- Hitung Bill total dari GR lines (bukan PO lines) --
                // GR subtotal = qty diterima x harga PO per item x (1 - diskon item)
                let grSubtotal = 0;
                for (const line of (lines || [])) {
                    if (!line.qty || line.qty <= 0) continue;
                    const rItem = await resolveUUID(line.item_id, 'items', query);
                    const poLinePrice = await client.query(
                        `SELECT price, discount FROM purchase_order_lines WHERE po_id = $1 AND item_id = $2 LIMIT 1`,
                        [rPo, rItem]
                    );
                    if (poLinePrice.rows.length > 0) {
                        const pl = poLinePrice.rows[0];
                        grSubtotal += line.qty * parseFloat(pl.price) * (1 - (parseFloat(pl.discount) || 0) / 100);
                    }
                }

                // PO subtotal (untuk hitung rasio PPN proporsional)
                const poSubtotalRes = await client.query(
                    `SELECT COALESCE(SUM(qty * price * (1 - COALESCE(discount,0)/100)), 0) as subtotal
                     FROM purchase_order_lines WHERE po_id = $1`,
                    [rPo]
                );
                const poSubtotal = parseFloat(poSubtotalRes.rows[0].subtotal || 0);

                // Apply extra discount ke GR subtotal
                const grAfterDisc = grSubtotal * (1 - extraDiscPct / 100);

                // PPN proporsional: tax_amount PO x (gr_after_disc / po_after_disc)
                const poAfterDisc = poSubtotal * (1 - extraDiscPct / 100);
                const poTaxAmount = parseFloat(po.tax_amount || 0);
                let grTaxAmount = 0;
                if (poAfterDisc > 0 && poTaxAmount > 0) {
                    grTaxAmount = Math.round(poTaxAmount * (grAfterDisc / poAfterDisc));
                }
                const billTotal = Math.round(grAfterDisc + grTaxAmount);

                // -- Cek apakah semua item PO sudah fully received (termasuk GR baru ini) --
                const poLines = await client.query(
                    `SELECT pol.item_id, pol.qty as po_qty,
                            COALESCE(SUM(grl.qty), 0) as total_received
                     FROM purchase_order_lines pol
                     LEFT JOIN goods_receive_lines grl ON grl.item_id = pol.item_id
                         AND grl.gr_id IN (SELECT id FROM goods_receives WHERE po_id = $1)
                     WHERE pol.po_id = $1
                     GROUP BY pol.item_id, pol.qty`,
                    [rPo]
                );
                const allFull = poLines.rows.every(r => parseInt(r.total_received) >= parseInt(r.po_qty));
                const newPoStatus = allFull ? 'processed' : 'partial';

                await client.query(
                    `UPDATE purchase_orders SET status=$1, updated_at=NOW() WHERE id=$2 AND status IN ('approved','partial')`,
                    [newPoStatus, rPo]
                );

                // Insert bill dengan total dari GR actual (simpan tax_amount proporsional)
                const billNumber = await generateAutoNumber(branchCode, 'BILL');
                await client.query(
                    `INSERT INTO purchase_bills (number, po_id, gr_id, date, due_date, branch_id, total, tax_amount, currency, created_by, status, amount_paid)
                     VALUES ($1, $2, $3, CURRENT_DATE, CURRENT_DATE + ($4 || ' days')::INTERVAL, $5, $6, $7, $8, $9, 'unpaid', 0)`,
                    [billNumber, rPo, grId, `${termDays}`, rBranch, billTotal, grTaxAmount, po.currency || 'IDR', req.user.name]
                );

                // -- Auto-create Journal: Dr. Persediaan / Cr. Hutang Dagang --
                const journalNumber = await generateAutoNumber(branchCode, 'JU');

                // Cari akun Persediaan (asset)
                let persediaanId = null;
                const persRes = await client.query(
                    `SELECT id FROM chart_of_accounts
                     WHERE company_id = $1 AND (LOWER(name) LIKE '%persediaan%')
                       AND (type = 'asset' OR type = 'Aset')
                     ORDER BY code LIMIT 1`, [req.user.company_id]
                );
                if (persRes.rows.length > 0) {
                    persediaanId = persRes.rows[0].id;
                } else {
                    const newAcc = await client.query(
                        `INSERT INTO chart_of_accounts (code, name, type, category, currency, company_id)
                         VALUES ('1300','Persediaan Barang','asset','persediaan','IDR',$1)
                         ON CONFLICT (code, company_id) DO UPDATE SET name=EXCLUDED.name RETURNING id`,
                        [req.user.company_id]
                    );
                    persediaanId = newAcc.rows[0].id;
                }

                // Cari akun Hutang Dagang (liability)
                let hutangId = null;
                const hutangRes = await client.query(
                    `SELECT id FROM chart_of_accounts
                     WHERE company_id = $1 AND (type = 'liability' OR type = 'Liabilitas')
                       AND (LOWER(name) LIKE '%hutang usaha%' OR LOWER(name) LIKE '%utang dagang%'
                            OR LOWER(name) LIKE '%accounts payable%' OR LOWER(name) LIKE '%utang usaha%')
                     ORDER BY code LIMIT 1`, [req.user.company_id]
                );
                if (hutangRes.rows.length > 0) {
                    hutangId = hutangRes.rows[0].id;
                } else {
                    const newAp = await client.query(
                        `INSERT INTO chart_of_accounts (code, name, type, category, currency, company_id)
                         VALUES ('2100','Hutang Usaha','liability','hutang','IDR',$1)
                         ON CONFLICT (code, company_id) DO UPDATE SET name=EXCLUDED.name RETURNING id`,
                        [req.user.company_id]
                    );
                    hutangId = newAp.rows[0].id;
                }

                // Cari / buat akun PPN Masukan (jika ada PPN)
                let ppnMasukanId = null;
                if (grTaxAmount > 0) {
                    const ppnRes = await client.query(
                        `SELECT id FROM chart_of_accounts
                         WHERE company_id = $1
                           AND (LOWER(name) LIKE '%ppn masukan%' OR LOWER(name) LIKE '%pajak masukan%'
                                OR LOWER(name) LIKE '%input vat%' OR LOWER(name) LIKE '%vat masukan%')
                         ORDER BY code LIMIT 1`, [req.user.company_id]
                    );
                    if (ppnRes.rows.length > 0) {
                        ppnMasukanId = ppnRes.rows[0].id;
                    } else {
                        const r = await client.query(
                            `INSERT INTO chart_of_accounts (code, name, type, category, currency, company_id)
                             VALUES ('1510','PPN Masukan','asset','pajak','IDR',$1)
                             ON CONFLICT (code, company_id) DO UPDATE SET name=EXCLUDED.name RETURNING id`,
                            [req.user.company_id]
                        );
                        ppnMasukanId = r.rows[0].id;
                    }
                }

                const journalRes = await client.query(
                    `INSERT INTO journal_entries (number, date, branch_id, description, status, created_by, ref_number, ref_type)
                     VALUES ($1, CURRENT_DATE, $2, $3, 'posted', $4, $5, 'GR') RETURNING id`,
                    [journalNumber, rBranch,
                        `Penerimaan Barang ${number} - ${supplierName}`,
                        req.user.name,
                        number]
                );
                const journalId = journalRes.rows[0].id;
                const jDesc = `Penerimaan Barang ${number} dari ${supplierName}`;

                if (grTaxAmount > 0 && ppnMasukanId) {
                    // 3 baris: Dr. Persediaan (DPP) + Dr. PPN Masukan / Cr. Hutang Usaha (total)
                    const dpp = Math.round(grAfterDisc);
                    await client.query(
                        `INSERT INTO journal_lines (journal_id, account_id, debit, credit, description) VALUES
                         ($1,$2,$3,0,$6),
                         ($1,$4,$5,0,$6),
                         ($1,$7,0,$8,$6)`,
                        [journalId, persediaanId, dpp, ppnMasukanId, grTaxAmount, jDesc, hutangId, billTotal]
                    );
                } else {
                    // Tanpa PPN — 2 baris: Dr. Persediaan / Cr. Hutang Usaha
                    await client.query(
                        `INSERT INTO journal_lines (journal_id, account_id, debit, credit, description)
                         VALUES ($1,$2,$3,0,$4), ($1,$5,0,$3,$4)`,
                        [journalId, persediaanId, billTotal, jDesc, hutangId]
                    );
                }
                // Update COA balances
                await updateCoaBalancesForJournal(client, journalId);
            }
        }

        await client.query('COMMIT');
        await query(
            `INSERT INTO audit_trail (action, module, description, user_id, user_name, branch_id) VALUES ('create','inventory',$1,$2,$3,$4)`,
            [`Penerimaan Barang ${grResult.rows[0].number}`, req.user.id, req.user.name, rBranch]
        );
        res.status(201).json(grResult.rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}));

// Mount document sub-router
router.use('/:uuid/documents', require('./receives.documents'));

module.exports = router;

