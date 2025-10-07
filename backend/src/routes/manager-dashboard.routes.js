// routes/manager-dashboard.routes.js
import { Router } from "express";
import { db } from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";

const managerDashboardRouter = Router();

/**
 * Helpers
 */
function toNum(n, d = 0) {
  return Number(n ?? d);
}
function isValidId(x) {
  return Number.isInteger(Number(x)) && Number(x) > 0;
}

/**
 * GET /manager/overview?shop_id=#
 * Focused on a single shop (required).
 * Returns:
 * {
 *   kpis: { todaySales, billsToday, taxesToday, avgBill },
 *   paymentMixToday: { Cash, Card, UPI, total },
 *   recentBills: [...10],
 *   pendingBills: [...10], // UNPAID or PARTIAL
 *   topSelling14d: [...10],
 *   lowStock: [{id,name,stock_quantity,price,suggested_reorder}],
 *   zeroSales30d: [... up to 50]
 * }
 */
managerDashboardRouter.get("/overview", requireAuth(["Owner", "Manager"]), async (req, res) => {
  const { shop_id } = req.query;
  if (!isValidId(shop_id)) {
    return res.status(400).json({ message: "shop_id is required" });
  }

  const conn = await db.getConnection();
  try {
    // --- KPIs (Today)
    const [kpiRows] = await conn.query(
      `
      SELECT
        COALESCE(SUM(b.total_amount),0) AS todaySales,
        COUNT(*) AS billsToday,
        COALESCE(SUM(b.tax),0) AS taxesToday,
        CASE WHEN COUNT(*)=0 THEN 0 ELSE COALESCE(SUM(b.total_amount),0)/COUNT(*) END AS avgBill
      FROM bills b
      WHERE b.shop_id = ?
        AND DATE(b.created_at) = CURDATE()
      `,
      [shop_id]
    );
    const k = kpiRows[0] || {};
    const kpis = {
      todaySales: toNum(k.todaySales),
      billsToday: toNum(k.billsToday),
      taxesToday: toNum(k.taxesToday),
      avgBill: toNum(k.avgBill),
    };

    // --- Payment mix (Today) from payments table
    const [payRows] = await conn.query(
      `
      SELECT p.method, COALESCE(SUM(p.amount),0) AS amt
      FROM payments p
      JOIN bills b ON b.bill_id = p.bill_id
      WHERE b.shop_id = ?
        AND DATE(p.created_at) = CURDATE()
      GROUP BY p.method
      `,
      [shop_id]
    );
    const paymentMixToday = { Cash: 0, Card: 0, UPI: 0, total: 0 };
    for (const r of payRows) {
      const m = (r.method || "").toString();
      const val = toNum(r.amt);
      if (m === "Cash" || m === "Card" || m === "UPI") paymentMixToday[m] = val;
      paymentMixToday.total += val;
    }

    // --- Recent bills (latest 10)
    const [recentBills] = await conn.query(
      `
      SELECT 
        b.bill_id, b.created_at, b.total_amount, b.status,
        COALESCE(c.name, 'Walk-in') AS customer_name
      FROM bills b
      LEFT JOIN customers c ON c.customer_id = b.customer_id
      WHERE b.shop_id = ?
      ORDER BY b.created_at DESC
      LIMIT 10
      `,
      [shop_id]
    );

    // --- Pending bills (UNPAID/PARTIAL) latest 10
    const [pendingBills] = await conn.query(
      `
      SELECT 
        b.bill_id, b.created_at, b.total_amount, b.status,
        COALESCE(c.name, 'Walk-in') AS customer_name
      FROM bills b
      LEFT JOIN customers c ON c.customer_id = b.customer_id
      WHERE b.shop_id = ?
        AND b.status IN ('UNPAID','PARTIAL')
      ORDER BY b.created_at DESC
      LIMIT 10
      `,
      [shop_id]
    );

    // --- Top selling (last 14 days)
    const [topSelling14d] = await conn.query(
      `
      SELECT 
        bi.saree_id, s.name,
        SUM(bi.quantity) AS total_qty,
        SUM(bi.quantity * bi.price) AS sales_amount
      FROM bill_items bi
      JOIN bills b ON b.bill_id = bi.bill_id
      JOIN sarees s ON s.id = bi.saree_id
      WHERE b.shop_id = ?
        AND b.created_at >= (NOW() - INTERVAL 14 DAY)
      GROUP BY bi.saree_id, s.name
      ORDER BY total_qty DESC, sales_amount DESC
      LIMIT 10
      `,
      [shop_id]
    );

    // --- Low stock list + suggested reorder
    const LOW_STOCK_THRESHOLD = 5;
    const [lowStockRows] = await conn.query(
      `
      SELECT id, name, price, stock_quantity
      FROM sarees
      WHERE shop_id = ?
        AND stock_quantity <= ?
      ORDER BY stock_quantity ASC, name ASC
      LIMIT 100
      `,
      [shop_id, LOW_STOCK_THRESHOLD]
    );
    const lowStock = lowStockRows.map(r => ({
      id: r.id,
      name: r.name,
      price: toNum(r.price),
      stock_quantity: toNum(r.stock_quantity),
      suggested_reorder: Math.max(0, 10 - toNum(r.stock_quantity)) // simple target=10
    }));

    // --- Zero-sales in 30 days (items that DIDN'T sell)
    const [zeroRows] = await conn.query(
      `
      SELECT s.id, s.name, s.price, s.stock_quantity
      FROM sarees s
      WHERE s.shop_id = ?
        AND s.id NOT IN (
          SELECT DISTINCT bi.saree_id
          FROM bill_items bi
          JOIN bills b ON b.bill_id = bi.bill_id
          WHERE b.shop_id = ?
            AND b.created_at >= (NOW() - INTERVAL 30 DAY)
        )
      ORDER BY s.stock_quantity DESC, s.name ASC
      LIMIT 50
      `,
      [shop_id, shop_id]
    );

    res.json({
      kpis,
      paymentMixToday,
      recentBills,
      pendingBills,
      topSelling14d,
      lowStock,
      zeroSales30d: zeroRows
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: e.message || "Failed to load manager overview" });
  } finally {
    conn.release();
  }
});

/**
 * GET /manager/daily-series?shop_id=#&days=14
 * Returns daily buckets { day, revenue, bills, taxes } for N days back (including today)
 */
managerDashboardRouter.get("/daily-series", requireAuth(["Owner", "Manager"]), async (req, res) => {
  const { shop_id, days = 14 } = req.query;
  if (!isValidId(shop_id)) {
    return res.status(400).json({ message: "shop_id is required" });
  }
  const n = Math.max(1, Math.min(60, Number(days) || 14)); // clamp 1..60

  const conn = await db.getConnection();
  try {
    const [rows] = await conn.query(
      `
      SELECT
        DATE(b.created_at) AS d,
        COALESCE(SUM(b.total_amount),0) AS revenue,
        COUNT(*) AS bills,
        COALESCE(SUM(b.tax),0) AS taxes
      FROM bills b
      WHERE b.shop_id = ?
        AND b.created_at >= (CURDATE() - INTERVAL ? DAY)
      GROUP BY DATE(b.created_at)
      ORDER BY d ASC
      `,
      [shop_id, n - 1]
    );

    // Normalize to include all days even if 0 sales
    const map = new Map(rows.map(r => [String(r.d).slice(0,10), r]));
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      const dt = new Date();
      dt.setDate(dt.getDate() - i);
      const key = dt.toISOString().slice(0,10);
      const r = map.get(key);
      out.push({
        day: key,
        revenue: toNum(r?.revenue || 0),
        bills: toNum(r?.bills || 0),
        taxes: toNum(r?.taxes || 0),
      });
    }

    res.json(out);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: e.message || "Failed to load series" });
  } finally {
    conn.release();
  }
});

export default managerDashboardRouter;
