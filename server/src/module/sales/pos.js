const router = require('express').Router();
const { query, getClient } = require('../../config/db');
const { authenticateToken, requirePermission } = require('../../middleware/auth');
const { asyncHandler, resolveUUID } = require('../../utils/helpers');
const { generateAutoNumber } = require('../../utils/autoNumber');

router.use(authenticateToken);

// GET POS transactions
router.get('/', requirePermission('pos:view', 'sales:view'), asyncHandler(async (req, res) => {
    const { branch_id, from, to } = req.query;
    const companyId = req.user.company_id;
    let where = ['b.company_id = $1']; let values = [companyId]; let idx = 2;
    if (branch_id) {
        const rBranch = await resolveUUID(branch_id, 'branches', query);
        where.push(`tx.branch_id = $${idx++}`); values.push(rBranch);
    }
    if (from) { where.push(`tx.date >= $${idx++}`); values.push(from); }
    if (to) { where.push(`tx.date <= $${idx++}::timestamptz + interval '1 day'`); values.push(to); }
    const wc = 'WHERE ' + where.join(' AND ');

    const result = await query(
        `SELECT tx.uuid, tx.number, tx.date, tx.subtotal, tx.discount_pct, tx.total,
       tx.payment_method, tx.cash_paid, tx.change, tx.items_json,
       u.name as cashier_name, b.name as branch_name, b.uuid as branch_id
     FROM (
        SELECT pt.uuid, pt.number, pt.date, pt.subtotal, pt.discount_pct, pt.total,
               pt.payment_method, pt.cash_paid, pt.change, pt.items_json, pt.cashier_id, pt.branch_id
        FROM pos_transactions pt
        UNION ALL
        SELECT ro.uuid, ro.order_number AS number, ro.paid_at AS date, ro.subtotal, ro.discount_pct, ro.total,
               ro.payment_method, ro.cash_paid, ro.change, 
               (
                 SELECT COALESCE(jsonb_agg(
                         json_build_object(
                             'uuid', ri.uuid,
                             'name', ri.item_name,
                             'price', ri.price,
                             'qty', ri.qty,
                             'subtotal', ri.subtotal
                         )
                       ), '[]'::jsonb)
                 FROM resto_order_items ri WHERE ri.order_id = ro.id
               ) AS items_json,
               ro.cashier_id, ro.branch_id
        FROM resto_orders ro
        WHERE ro.status = 'paid'
     ) tx
     LEFT JOIN users u ON tx.cashier_id = u.id LEFT JOIN branches b ON tx.branch_id = b.id
     ${wc} ORDER BY tx.date DESC`, values
    );
    res.json(result.rows);
}));

// POST checkout
router.post('/checkout', requirePermission('pos:create'), asyncHandler(async (req, res) => {
    const { branch_id, items, subtotal, discount_pct, total, payment_method, cash_paid, change } = req.body;
    if (!items?.length) return res.status(400).json({ error: 'Keranjang kosong' });

    const rBranch = await resolveUUID(branch_id, 'branches', query);
    const branchResult = await query(`SELECT code FROM branches WHERE id = $1`, [rBranch]);
    const number = await generateAutoNumber(branchResult.rows[0]?.code || 'JKT', 'POS');

    const client = await getClient();
    try {
        await client.query('BEGIN');

        // ── Pricelist Guard: blok item yang belum punya harga jual ──────────────
        // Cek item.price (harga aktual di keranjang) — bukan sell_price dari master item
        for (const item of items) {
            if (!item.bundleItems && (parseFloat(item.price) || 0) <= 0) {
                return res.status(400).json({ error: `Barang "${item.name || item.item_id}" belum memiliki harga jual. Isi Pricelist terlebih dahulu.` });
            }
        }

        const result = await client.query(
            `INSERT INTO pos_transactions (number, branch_id, items_json, subtotal, discount_pct, total, payment_method, cash_paid, change, cashier_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING uuid, number`,
            [number, rBranch, JSON.stringify(items), subtotal || 0, discount_pct || 0, total || 0, payment_method || 'cash', cash_paid || 0, change || 0, req.user.id]
        );

        // Update inventory for each item sold
        for (const item of items) {
            // Bundle: deduct stock for each component
            if (item.bundleItems && item.bundleItems.length > 0) {
                for (const comp of item.bundleItems) {
                    const rCompId = await resolveUUID(comp.item_id, 'items', query);
                    const whResult = await client.query(`SELECT id FROM warehouses WHERE branch_id = $1 LIMIT 1`, [rBranch]);
                    const warehouseId = whResult.rows[0]?.id;
                    const deductQty = comp.qty * item.qty;
                    if (warehouseId) {
                        // Validate stock
                        const inv = await client.query(`SELECT COALESCE(qty, 0) as qty FROM inventory WHERE item_id=$1 AND warehouse_id=$2 FOR UPDATE`, [rCompId, warehouseId]);
                        const available = inv.rows[0]?.qty || 0;
                        if (available < deductQty) {
                            const compName = (await client.query(`SELECT name FROM items WHERE id=$1`, [rCompId])).rows[0]?.name || comp.item_name || 'Unknown';
                            await client.query('ROLLBACK');
                            return res.status(400).json({ error: `Stok ${compName} tidak cukup. Tersedia: ${available}, dibutuhkan: ${deductQty}` });
                        }
                        await client.query(`UPDATE inventory SET qty = qty - $1, updated_at=NOW() WHERE item_id = $2 AND warehouse_id = $3`, [deductQty, rCompId, warehouseId]);
                        await client.query(
                            `INSERT INTO stock_movements (item_id, date, type, qty, ref, warehouse_id, description) VALUES ($1, CURRENT_DATE, 'out', $2, $3, $4, $5)`,
                            [rCompId, deductQty, number, warehouseId, `Penjualan POS (Paket: ${item.name})`]
                        );
                    }

                    // Check consignment for component
                    const consResult = await client.query(`SELECT id, commission_pct FROM consignments WHERE item_id = $1 AND status = 'active' LIMIT 1`, [rCompId]);
                    if (consResult.rows.length > 0) {
                        await client.query(`UPDATE consignments SET sold_qty = sold_qty + $1, status = CASE WHEN sold_qty + $1 >= qty THEN 'completed' ELSE status END, updated_at=NOW() WHERE id = $2`, [deductQty, consResult.rows[0].id]);
                    }
                }
            } else {
                // Regular item
                const rItemId = await resolveUUID(item.item_id || item.uuid || item.id, 'items', query);
                // Get default warehouse for branch
                const whResult = await client.query(`SELECT id FROM warehouses WHERE branch_id = $1 LIMIT 1`, [rBranch]);
                const warehouseId = whResult.rows[0]?.id;
                if (warehouseId) {
                    // Validate stock
                    const inv = await client.query(`SELECT COALESCE(qty, 0) as qty FROM inventory WHERE item_id=$1 AND warehouse_id=$2 FOR UPDATE`, [rItemId, warehouseId]);
                    const available = inv.rows[0]?.qty || 0;
                    if (available < item.qty) {
                        const itemName = (await client.query(`SELECT name FROM items WHERE id=$1`, [rItemId])).rows[0]?.name || item.name || 'Unknown';
                        await client.query('ROLLBACK');
                        return res.status(400).json({ error: `Stok ${itemName} tidak cukup. Tersedia: ${available}, dibutuhkan: ${item.qty}` });
                    }
                    await client.query(`UPDATE inventory SET qty = qty - $1, updated_at=NOW() WHERE item_id = $2 AND warehouse_id = $3`, [item.qty, rItemId, warehouseId]);
                    await client.query(
                        `INSERT INTO stock_movements (item_id, date, type, qty, ref, warehouse_id, description) VALUES ($1, CURRENT_DATE, 'out', $2, $3, $4, 'Penjualan POS')`,
                        [rItemId, item.qty, number, warehouseId]
                    );
                }

                // Check consignment
                const consResult = await client.query(`SELECT id, commission_pct FROM consignments WHERE item_id = $1 AND status = 'active' LIMIT 1`, [rItemId]);
                if (consResult.rows.length > 0) {
                    await client.query(`UPDATE consignments SET sold_qty = sold_qty + $1, status = CASE WHEN sold_qty + $1 >= qty THEN 'completed' ELSE status END, updated_at=NOW() WHERE id = $2`, [item.qty, consResult.rows[0].id]);
                }
            }
        }

        // ── AUTO JOURNAL: POS → Akuntansi ──────────────────────────────
        // Debit Kas (1-0001), Credit Pendapatan (4-0001) → revenue
        // Debit HPP (5-0001), Credit Persediaan (1-2001) → cost of goods sold
        const posTotal = parseFloat(total) || 0;
        if (posTotal > 0) {
            // Calculate total HPP (buy_price × qty for each item)
            let totalHPP = 0;
            for (const item of items) {
                if (item.bundleItems && item.bundleItems.length > 0) {
                    for (const comp of item.bundleItems) {
                        const rCompId = await resolveUUID(comp.item_id, 'items', query);
                        const priceRes = await client.query(`SELECT hpp FROM items WHERE id = $1`, [rCompId]);
                        totalHPP += (parseFloat(priceRes.rows[0]?.hpp) || 0) * comp.qty * item.qty;
                    }
                } else {
                    const rItemId = await resolveUUID(item.item_id || item.uuid || item.id, 'items', query);
                    const priceRes = await client.query(`SELECT hpp FROM items WHERE id = $1`, [rItemId]);
                    totalHPP += (parseFloat(priceRes.rows[0]?.hpp) || 0) * item.qty;
                }
            }

            // Get CoA accounts
            const coaRes = await client.query(
                `SELECT id, code FROM chart_of_accounts WHERE code IN ('1-0001','4-0001','5-0001','1-2001') AND company_id = $1`, [req.user.company_id]
            );
            const coa = Object.fromEntries(coaRes.rows.map(r => [r.code, r.id]));

            if (coa['1-0001'] && coa['4-0001']) {
                // Generate journal number
                const jnRes = await client.query(
                    `INSERT INTO auto_number_counters (prefix, year, letter, counter)
                     VALUES ($1, $2, 'A', 1)
                     ON CONFLICT (prefix, year, letter) DO UPDATE SET counter = auto_number_counters.counter + 1
                     RETURNING counter`,
                    [`${branchResult.rows[0]?.code || 'JKT'}-JU`, new Date().getFullYear().toString()]
                );
                const jnNumber = `${branchResult.rows[0]?.code || 'JKT'}-JU-${new Date().getFullYear()}-A-${String(jnRes.rows[0].counter).padStart(8, '0')}`;

                const jeRes = await client.query(
                    `INSERT INTO journal_entries (number, date, description, branch_id, created_by, status, ref_number, ref_type)
                     VALUES ($1, CURRENT_DATE, $2, $3, $4, 'posted', $5, 'POS') RETURNING id`,
                    [jnNumber, `Penjualan POS ${number}`, rBranch, req.user.name, number]
                );
                const jeId = jeRes.rows[0].id;

                // Line 1: Debit Kas Tunai (uang masuk)
                await client.query(
                    `INSERT INTO journal_lines (journal_id, account_id, debit, credit, description) VALUES ($1,$2,$3,0,$4)`,
                    [jeId, coa['1-0001'], posTotal, `Kas masuk POS ${number}`]
                );
                // Line 2: Credit Pendapatan Penjualan (revenue)
                await client.query(
                    `INSERT INTO journal_lines (journal_id, account_id, debit, credit, description) VALUES ($1,$2,0,$3,$4)`,
                    [jeId, coa['4-0001'], posTotal, `Pendapatan POS ${number}`]
                );

                // Update balances: Kas naik, Pendapatan naik
                await client.query(`UPDATE chart_of_accounts SET balance = balance + $1, updated_at=NOW() WHERE id = $2`, [posTotal, coa['1-0001']]);
                await client.query(`UPDATE chart_of_accounts SET balance = balance + $1, updated_at=NOW() WHERE id = $2`, [posTotal, coa['4-0001']]);

                // HPP lines (if applicable)
                if (totalHPP > 0 && coa['5-0001'] && coa['1-2001']) {
                    // Line 3: Debit HPP (cost recognized)
                    await client.query(
                        `INSERT INTO journal_lines (journal_id, account_id, debit, credit, description) VALUES ($1,$2,$3,0,$4)`,
                        [jeId, coa['5-0001'], totalHPP, `HPP POS ${number}`]
                    );
                    // Line 4: Credit Persediaan (inventory reduced)
                    await client.query(
                        `INSERT INTO journal_lines (journal_id, account_id, debit, credit, description) VALUES ($1,$2,0,$3,$4)`,
                        [jeId, coa['1-2001'], totalHPP, `Pengurangan persediaan POS ${number}`]
                    );
                    // Update balances: HPP naik, Persediaan turun
                    await client.query(`UPDATE chart_of_accounts SET balance = balance + $1, updated_at=NOW() WHERE id = $2`, [totalHPP, coa['5-0001']]);
                    await client.query(`UPDATE chart_of_accounts SET balance = balance - $1, updated_at=NOW() WHERE id = $2`, [totalHPP, coa['1-2001']]);
                }
            }
        }

        await client.query('COMMIT');
        await query(`INSERT INTO audit_trail (action, module, description, user_id, user_name, branch_id) VALUES ('create','pos',$1,$2,$3,$4)`, [`POS Checkout ${result.rows[0].number} - Total: ${total}`, req.user.id, req.user.name, rBranch]);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}));

module.exports = router;
