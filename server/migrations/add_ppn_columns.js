/**
 * migrations/add_ppn_columns.js
 * Tambah kolom tax_amount ke purchase_bills dan invoices
 * untuk mendukung pencatatan jurnal PPN Masukan & PPN Keluaran terpisah.
 *
 * Usage: node migrations/add_ppn_columns.js
 */
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'erpsys',
});

async function run() {
    const client = await pool.connect();
    try {
        console.log('Memulai migrasi add_ppn_columns...\n');

        // 1. Tambah tax_amount ke purchase_bills
        await client.query(`
            ALTER TABLE purchase_bills
            ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(15,2) DEFAULT 0
        `);
        console.log('  [1/3] Kolom tax_amount ditambahkan ke purchase_bills');

        // 2. Tambah tax_amount ke invoices
        await client.query(`
            ALTER TABLE invoices
            ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(15,2) DEFAULT 0
        `);
        console.log('  [2/3] Kolom tax_amount ditambahkan ke invoices');

        // 3a. Bill dengan gr_id: backfill proportional tax (GR subtotal / PO subtotal × PO tax)
        await client.query(`
            UPDATE purchase_bills pb
            SET tax_amount = (
                SELECT ROUND(
                    po.tax_amount *
                    NULLIF(
                        COALESCE(gr_subtotal.val, 0) * (1 - COALESCE(po.extra_discount, 0)/100) /
                        NULLIF(po_subtotal.val * (1 - COALESCE(po.extra_discount, 0)/100), 0)
                    , 0)
                )
                FROM purchase_orders po
                LEFT JOIN LATERAL (
                    SELECT COALESCE(SUM(grl.qty * pol.price * (1 - COALESCE(pol.discount,0)/100)), 0) as val
                    FROM goods_receive_lines grl
                    JOIN purchase_order_lines pol ON pol.po_id = po.id AND pol.item_id = grl.item_id
                    WHERE grl.gr_id = pb.gr_id
                ) gr_subtotal ON true
                LEFT JOIN LATERAL (
                    SELECT COALESCE(SUM(pol.qty * pol.price * (1 - COALESCE(pol.discount,0)/100)), 0) as val
                    FROM purchase_order_lines pol WHERE pol.po_id = po.id
                ) po_subtotal ON true
                WHERE po.id = pb.po_id AND po.tax_amount > 0
            )
            WHERE pb.gr_id IS NOT NULL
              AND pb.po_id IS NOT NULL
              AND (pb.tax_amount IS NULL OR pb.tax_amount = 0)
        `);
        console.log('  [3a] tax_amount purchase_bills (per GR proporisonal) diisi');

        // 3b. Bill tanpa gr_id (manual): copy dari po.tax_amount
        await client.query(`
            UPDATE purchase_bills pb
            SET tax_amount = po.tax_amount
            FROM purchase_orders po
            WHERE pb.po_id = po.id
              AND pb.gr_id IS NULL
              AND po.tax_amount > 0
              AND (pb.tax_amount IS NULL OR pb.tax_amount = 0)
        `);
        console.log('  [3b] tax_amount purchase_bills (manual bill) diisi dari purchase_orders');

        // 3c. Invoices dengan gi_id: backfill proportional (gi_subtotal / so_subtotal × so_tax)
        await client.query(`
            UPDATE invoices inv
            SET tax_amount = (
                SELECT ROUND(
                    so.tax_amount *
                    NULLIF(
                        COALESCE(gi_sub.val, 0) /
                        NULLIF(so_sub.val, 0)
                    , 0)
                )
                FROM sales_orders so
                LEFT JOIN LATERAL (
                    SELECT COALESCE(SUM(
                        gil.qty * sol.price * (1 - COALESCE(sol.discount,0)/100)
                    ), 0) as val
                    FROM goods_issue_lines gil
                    JOIN sales_order_lines sol ON sol.so_id = so.id AND sol.item_id = gil.item_id
                    WHERE gil.gi_id = inv.gi_id
                ) gi_sub ON true
                LEFT JOIN LATERAL (
                    SELECT COALESCE(SUM(
                        sol.qty * sol.price * (1 - COALESCE(sol.discount,0)/100)
                    ), 0) as val
                    FROM sales_order_lines sol WHERE sol.so_id = so.id
                ) so_sub ON true
                WHERE so.id = inv.so_id AND so.tax_amount > 0
            )
            WHERE inv.gi_id IS NOT NULL
              AND inv.so_id IS NOT NULL
              AND (inv.tax_amount IS NULL OR inv.tax_amount = 0)
        `);
        console.log('  [3c] tax_amount invoices (dari GI proporsional) diisi dari sales_orders');

        // 3d. Invoices tanpa gi_id (langsung dari SO): copy dari so.tax_amount
        await client.query(`
            UPDATE invoices inv
            SET tax_amount = so.tax_amount
            FROM sales_orders so
            WHERE inv.so_id = so.id
              AND inv.gi_id IS NULL
              AND so.tax_amount > 0
              AND (inv.tax_amount IS NULL OR inv.tax_amount = 0)
        `);
        console.log('  [3d] tax_amount invoices (tanpa GI) disalin dari sales_orders');

        console.log('\nMigrasi selesai.');
    } catch (e) {
        console.error('Error:', e.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

run();
