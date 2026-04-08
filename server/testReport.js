require('dotenv').config();
const { query } = require('./src/config/db');

async function test() {
  const companyId = 1;
  const date = '2026-04-08';
  try {
    const sessionRes = await query(
        `SELECT 
            COALESCE(SUM(opening_cash), 0) as total_opening_cash,
            COALESCE(SUM(expected_cash), 0) as total_expected_cash,
            COALESCE(SUM(actual_cash), 0) as total_actual_cash,
            COALESCE(SUM(difference), 0) as total_difference,
            COALESCE(SUM(total_cash_in), 0) as total_cash_in,
            COALESCE(SUM(total_cash_out), 0) as total_cash_out
         FROM pos_sessions 
         WHERE company_id = $1 AND DATE(opened_at) = $2`,
        [companyId, date]
    );
    console.log("Session:", sessionRes.rows[0]);

    const salesRes = await query(
        `SELECT 
            SUM(total_sales) as total_sales,
            SUM(transaction_count) as total_transactions,
            SUM(total_cash) as cash_total,
            SUM(total_qris) as qris_total,
            SUM(total_debit) as debit_total,
            SUM(total_transfer) as transfer_total
         FROM pos_sessions
         WHERE company_id = $1 AND DATE(opened_at) = $2`,
        [companyId, date]
    );
    console.log("Sales:", salesRes.rows[0]);

    const itemsRes = await query(
        `SELECT 
            i.item_name, 
            SUM(i.qty) as total_sold
         FROM resto_order_items i
         JOIN resto_orders o ON i.order_id = o.id
         WHERE o.company_id = $1 AND o.status = 'paid' AND DATE(o.paid_at) = $2
         GROUP BY i.item_name
         ORDER BY total_sold DESC
         LIMIT 10`,
        [companyId, date]
    );
    console.log("Items:", itemsRes.rows);

    const peakRes = await query(
        `SELECT 
            EXTRACT(HOUR FROM paid_at) as hour,
            COUNT(id) as order_count,
            SUM(total) as hour_sales
         FROM resto_orders
         WHERE company_id = $1 AND status = 'paid' AND DATE(paid_at) = $2
         GROUP BY hour
         ORDER BY hour ASC`,
        [companyId, date]
    );
    console.log("Peak:", peakRes.rows);

  } catch(e) {
    console.error("ERROR:", e);
  } finally {
    process.exit();
  }
}

test();
