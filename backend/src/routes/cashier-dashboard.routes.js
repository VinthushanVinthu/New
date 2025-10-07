// routes/cashier-dashboard.routes.js
import { Router } from "express";
import { db } from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";

const cashierDashboardRouter = Router();

function getRanges(now = new Date()) {
  const end = new Date(now);
  const startToday = new Date(now);
  startToday.setHours(0, 0, 0, 0);

  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  startMonth.setHours(0, 0, 0, 0);

  const startYear = new Date(now.getFullYear(), 0, 1);
  startYear.setHours(0, 0, 0, 0);

  return {
    today: { start: startToday, end },
    month: { start: startMonth, end },
    year: { start: startYear, end }
  };
}

/**
 * GET /cashier/dashboard?shop_id=OPTIONAL
 * Returns the cashier's own metrics/lists.
 *
 * {
 *   summary: {
 *     today: { totalCollected, bills, customersServed, avgBill },
 *     month: { ... },
 *     year:  { ... }
 *   },
 *   paymentMixToday: [{ method, amount }],
 *   recentBills: [{ bill_id, created_at, total_amount, status, customer_name }],
 *   topItems30d: [{ saree_id, name, total_qty, sales_amount }]
 * }
 */
cashierDashboardRouter.get(
  "/dashboard",
  requireAuth(["Cashier"]),
  async (req, res) => {
    const userId = req.user.id;
    const { shop_id } = req.query; // optional filter if your cashiers can bill in multiple shops
    const conn = await db.getConnection();

    try {
      // validate optional shop if provided (not strictly required)
      let shopWhere = "";
      const params = [];

      if (shop_id) {
        shopWhere = " AND b.shop_id = ? ";
        params.push(Number(shop_id));
      }

      const { today, month, year } = getRanges();

      async function kpiBetween(start, end) {
        // Total collected = sum of payments made by cashier on their bills in window
        // Bills = count of bills created by cashier in window
        // Customers served = distinct of IFNULL(customer_id, bill_id) over cashier's bills in window (counts walk-ins distinctly)
        const [rows] = await conn.query(
          `
          SELECT
            COALESCE((
              SELECT SUM(p.amount)
              FROM payments p
              JOIN bills bb ON bb.bill_id = p.bill_id
              WHERE bb.user_id = ?
                ${shopWhere}
                AND p.created_at >= ?
                AND p.created_at <= ?
            ), 0) AS totalCollected,

            (SELECT COUNT(*)
             FROM bills b
             WHERE b.user_id = ?
               ${shopWhere}
               AND b.created_at >= ?
               AND b.created_at <= ?
            ) AS bills,

            (SELECT COUNT(DISTINCT COALESCE(b.customer_id, b.bill_id))
             FROM bills b
             WHERE b.user_id = ?
               ${shopWhere}
               AND b.created_at >= ?
               AND b.created_at <= ?
            ) AS customersServed,

            COALESCE((
              SELECT AVG(b2.total_amount)
              FROM bills b2
              WHERE b2.user_id = ?
                ${shopWhere}
                AND b2.created_at >= ?
                AND b2.created_at <= ?
            ), 0) AS avgBill
          `,
          [
            userId, ...params, start, end, // totalCollected
            userId, ...params, start, end, // bills
            userId, ...params, start, end, // customersServed
            userId, ...params, start, end  // avgBill
          ]
        );
        const r = rows?.[0] || {};
        return {
          totalCollected: Number(r.totalCollected || 0),
          bills: Number(r.bills || 0),
          customersServed: Number(r.customersServed || 0),
          avgBill: Number(r.avgBill || 0),
        };
      }

      // Compute KPIs
      const [kToday, kMonth, kYear] = await Promise.all([
        kpiBetween(today.start, today.end),
        kpiBetween(month.start, month.end),
        kpiBetween(year.start, year.end),
      ]);

      // Payment mix — today
      const [mix] = await conn.query(
        `
        SELECT p.method, COALESCE(SUM(p.amount), 0) AS amount
        FROM payments p
        JOIN bills b ON b.bill_id = p.bill_id
        WHERE b.user_id = ?
          ${shopWhere}
          AND p.created_at >= ?
          AND p.created_at <= ?
        GROUP BY p.method
        ORDER BY amount DESC
        `,
        [userId, ...params, today.start, today.end]
      );

      // Recent bills (yours) — latest 10
      const [recentBills] = await conn.query(
        `
        SELECT
          b.bill_id,
          b.created_at,
          b.total_amount,
          b.status,
          COALESCE(c.name, 'Walk-in') AS customer_name
        FROM bills b
        LEFT JOIN customers c ON c.customer_id = b.customer_id
        WHERE b.user_id = ?
          ${shopWhere}
        ORDER BY b.created_at DESC
        LIMIT 10
        `,
        [userId, ...params]
      );

      // Top items sold by you — last 30 days
      const [topItems30d] = await conn.query(
        `
        SELECT
          bi.saree_id,
          s.name,
          SUM(bi.quantity) AS total_qty,
          SUM(bi.quantity * bi.price) AS sales_amount
        FROM bill_items bi
        JOIN bills b ON b.bill_id = bi.bill_id
        JOIN sarees s ON s.id = bi.saree_id
        WHERE b.user_id = ?
          ${shopWhere}
          AND b.created_at >= (NOW() - INTERVAL 30 DAY)
        GROUP BY bi.saree_id, s.name
        ORDER BY total_qty DESC, sales_amount DESC
        LIMIT 10
        `,
        [userId, ...params]
      );

      res.json({
        summary: {
          today: kToday,
          month: kMonth,
          year:  kYear
        },
        paymentMixToday: mix,
        recentBills,
        topItems30d
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: e.message || "Failed to load cashier dashboard" });
    } finally {
      conn.release();
    }
  }
);

/**
 * Optional: your own bill history endpoint (paged)
 * GET /cashier/bills?limit=50&offset=0&shop_id=OPTIONAL
 */
cashierDashboardRouter.get(
  "/bills",
  requireAuth(["Cashier"]),
  async (req, res) => {
    const userId = req.user.id;
    const { limit = 50, offset = 0, shop_id } = req.query;
    const conn = await db.getConnection();
    try {
      let shopWhere = "";
      const params = [userId];

      if (shop_id) {
        shopWhere = " AND b.shop_id = ? ";
        params.push(Number(shop_id));
      }

      params.push(Number(limit), Number(offset));

      const [rows] = await conn.query(
        `
        SELECT
          b.bill_id, b.created_at, b.total_amount, b.status,
          COALESCE(c.name, 'Walk-in') AS customer_name
        FROM bills b
        LEFT JOIN customers c ON c.customer_id = b.customer_id
        WHERE b.user_id = ?
          ${shopWhere}
        ORDER BY b.created_at DESC
        LIMIT ? OFFSET ?
        `,
        params
      );

      res.json(rows);
    } catch (e) {
      res.status(500).json({ message: e.message });
    } finally {
      conn.release();
    }
  }
);

export default cashierDashboardRouter;
