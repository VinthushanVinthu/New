// routes/owner-dashboard.routes.js
import { Router } from "express";
import { db } from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";

const ownerDashboardRouter = Router();

/**
 * Utility to format time windows.
 * Returns [startISO, endISO] for: 'today' | 'month' | 'year'
 * Uses DB server time; if you need strict local-tz, adjust with moment-timezone.
 */
function getRanges(now = new Date()) {
  const end = new Date(now); // now
  // today
  const startToday = new Date(now);
  startToday.setHours(0, 0, 0, 0);

  // month
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  startMonth.setHours(0, 0, 0, 0);

  // year
  const startYear = new Date(now.getFullYear(), 0, 1);
  startYear.setHours(0, 0, 0, 0);

  return {
    today: { start: startToday, end },
    month: { start: startMonth, end },
    year: { start: startYear, end }
  };
}

/**
 * GET /owner/dashboard
 * Aggregates across all shops owned by the logged-in Owner.
 * Response:
 * {
 *   summary: {
 *     today:  { revenue, bills, taxes },
 *     month:  { revenue, bills, taxes },
 *     year:   { revenue, bills, taxes },
 *     lowStockCount
 *   },
 *   recentCustomers: [{customer_id, name, phone, created_at, shop_id}],
 *   recentBills: [{bill_id, created_at, total_amount, status, customer_name, shop_id}],
 *   topSelling: [{saree_id, name, total_qty, sales_amount}],
 *   lowStock: [{id, name, stock_quantity, price, shop_id}]
 * }
 */
ownerDashboardRouter.get("/dashboard", requireAuth(["Owner"]), async (req, res) => {
  const userId = req.user.id;
  const { shop_id } = req.query; // optional fallback if you want a single shop view

  const conn = await db.getConnection();
  try {
    // 1) find owner shops
    let shopIds = [];
    if (shop_id) {
      // If you want to limit to one shop (fallback mode)
      shopIds = [Number(shop_id)];
    } else {
      const [shops] = await conn.query(
        "SELECT shop_id FROM shops WHERE owner_id = ?",
        [userId]
      );
      shopIds = shops.map(s => s.shop_id);
    }

    if (shopIds.length === 0) {
      return res.json({
        summary: {
          today: { revenue: 0, bills: 0, taxes: 0 },
          month: { revenue: 0, bills: 0, taxes: 0 },
          year:  { revenue: 0, bills: 0, taxes: 0 },
          lowStockCount: 0
        },
        recentCustomers: [],
        recentBills: [],
        topSelling: [],
        lowStock: []
      });
    }

    // helper to make IN (?) for shopIds
    const inShop = [shopIds];

    // time windows
    const { today, month, year } = getRanges();

    // ---- KPI helpers
    async function kpiBetween(start, end) {
      const [rows] = await conn.query(
        `
        SELECT
          COALESCE(SUM(b.total_amount), 0) AS revenue,
          COUNT(*) AS bills,
          COALESCE(SUM(b.tax), 0) AS taxes
        FROM bills b
        WHERE b.shop_id IN (?) AND b.created_at >= ? AND b.created_at <= ?
        `,
        [inShop, start, end]
      );
      const r = rows[0] || {};
      return {
        revenue: Number(r.revenue || 0),
        bills: Number(r.bills || 0),
        taxes: Number(r.taxes || 0)
      };
    }

    // compute KPIs
    const [kToday, kMonth, kYear] = await Promise.all([
      kpiBetween(today.start, today.end),
      kpiBetween(month.start, month.end),
      kpiBetween(year.start, year.end),
    ]);

    // ---- recent customers (latest 10)
    const [recentCustomers] = await conn.query(
      `
      SELECT c.customer_id, c.name, c.phone, c.email, c.created_at, c.shop_id
      FROM customers c
      WHERE c.shop_id IN (?)
      ORDER BY c.created_at DESC
      LIMIT 10
      `,
      [inShop]
    );

    // ---- recent bills (latest 10)
    const [recentBills] = await conn.query(
      `
      SELECT
        b.bill_id,
        b.shop_id,
        b.created_at,
        b.total_amount,
        b.status,
        COALESCE(c.name, 'Walk-in') AS customer_name
      FROM bills b
      LEFT JOIN customers c ON c.customer_id = b.customer_id
      WHERE b.shop_id IN (?)
      ORDER BY b.created_at DESC
      LIMIT 10
      `,
      [inShop]
    );

    // ---- top selling sarees in last 30 days
    const [topSelling] = await conn.query(
      `
      SELECT
        bi.saree_id,
        s.name,
        SUM(bi.quantity) AS total_qty,
        SUM(bi.quantity * bi.price) AS sales_amount
      FROM bill_items bi
      JOIN bills b ON b.bill_id = bi.bill_id
      JOIN sarees s ON s.id = bi.saree_id
      WHERE b.shop_id IN (?)
        AND b.created_at >= (NOW() - INTERVAL 30 DAY)
      GROUP BY bi.saree_id, s.name
      ORDER BY total_qty DESC, sales_amount DESC
      LIMIT 10
      `,
      [inShop]
    );

    // ---- low stock list (<= 5)
    const LOW_STOCK_THRESHOLD = 5; // adjust as you like
    const [lowStock] = await conn.query(
      `
      SELECT id, shop_id, name, price, stock_quantity
      FROM sarees
      WHERE shop_id IN (?)
        AND stock_quantity <= ?
      ORDER BY stock_quantity ASC, name ASC
      LIMIT 50
      `,
      [inShop, LOW_STOCK_THRESHOLD]
    );

    // ---- low stock count
    const [lowCountRows] = await conn.query(
      `
      SELECT COUNT(*) AS cnt
      FROM sarees
      WHERE shop_id IN (?)
        AND stock_quantity <= ?
      `,
      [inShop, LOW_STOCK_THRESHOLD]
    );
    const lowStockCount = Number(lowCountRows?.[0]?.cnt || 0);

    res.json({
      summary: {
        today: kToday,
        month: kMonth,
        year:  kYear,
        lowStockCount
      },
      recentCustomers,
      recentBills,
      topSelling,
      lowStock
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: e.message || "Failed to load owner dashboard" });
  } finally {
    conn.release();
  }
});

/**
 * Optional: full list endpoints if you want “View All” pages
 * - /owner/bills?limit=50&offset=0
 * - /owner/customers?limit=50&offset=0
 * - /owner/low-stock?threshold=5
 * - /owner/top-selling?days=30
 */

ownerDashboardRouter.get("/bills", requireAuth(["Owner"]), async (req, res) => {
  const userId = req.user.id;
  const { limit = 50, offset = 0, shop_id } = req.query;
  const conn = await db.getConnection();
  try {
    let shopIds = [];
    if (shop_id) {
      shopIds = [Number(shop_id)];
    } else {
      const [shops] = await conn.query("SELECT shop_id FROM shops WHERE owner_id = ?", [userId]);
      shopIds = shops.map(s => s.shop_id);
    }
    if (shopIds.length === 0) return res.json([]);

    const [rows] = await conn.query(
      `
      SELECT
        b.bill_id, b.shop_id, b.created_at, b.total_amount, b.status,
        u.name AS cashier_name,
        COALESCE(c.name, 'Walk-in') AS customer_name
      FROM bills b
      JOIN users u ON u.id = b.user_id
      LEFT JOIN customers c ON c.customer_id = b.customer_id
      WHERE b.shop_id IN (?)
      ORDER BY b.created_at DESC
      LIMIT ? OFFSET ?
      `,
      [[shopIds], Number(limit), Number(offset)]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: e.message });
  } finally {
    conn.release();
  }
});

ownerDashboardRouter.get("/customers", requireAuth(["Owner"]), async (req, res) => {
  const userId = req.user.id;
  const { limit = 50, offset = 0, shop_id } = req.query;
  const conn = await db.getConnection();
  try {
    let shopIds = [];
    if (shop_id) {
      shopIds = [Number(shop_id)];
    } else {
      const [shops] = await conn.query("SELECT shop_id FROM shops WHERE owner_id = ?", [userId]);
      shopIds = shops.map(s => s.shop_id);
    }
    if (shopIds.length === 0) return res.json([]);

    const [rows] = await conn.query(
      `
      SELECT c.customer_id, c.name, c.phone, c.email, c.created_at, c.shop_id
      FROM customers c
      WHERE c.shop_id IN (?)
      ORDER BY c.created_at DESC
      LIMIT ? OFFSET ?
      `,
      [[shopIds], Number(limit), Number(offset)]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: e.message });
  } finally {
    conn.release();
  }
});

ownerDashboardRouter.get("/low-stock", requireAuth(["Owner"]), async (req, res) => {
  const userId = req.user.id;
  const { threshold = 5, shop_id } = req.query;
  const conn = await db.getConnection();
  try {
    let shopIds = [];
    if (shop_id) {
      shopIds = [Number(shop_id)];
    } else {
      const [shops] = await conn.query("SELECT shop_id FROM shops WHERE owner_id = ?", [userId]);
      shopIds = shops.map(s => s.shop_id);
    }
    if (shopIds.length === 0) return res.json([]);

    const [rows] = await conn.query(
      `
      SELECT id, shop_id, name, price, stock_quantity
      FROM sarees
      WHERE shop_id IN (?)
        AND stock_quantity <= ?
      ORDER BY stock_quantity ASC, name ASC
      `,
      [[shopIds], Number(threshold)]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: e.message });
  } finally {
    conn.release();
  }
});

ownerDashboardRouter.get("/top-selling", requireAuth(["Owner"]), async (req, res) => {
  const userId = req.user.id;
  const { days = 30, shop_id } = req.query;
  const conn = await db.getConnection();
  try {
    let shopIds = [];
    if (shop_id) {
      shopIds = [Number(shop_id)];
    } else {
      const [shops] = await conn.query("SELECT shop_id FROM shops WHERE owner_id = ?", [userId]);
      shopIds = shops.map(s => s.shop_id);
    }
    if (shopIds.length === 0) return res.json([]);

    const [rows] = await conn.query(
      `
      SELECT
        bi.saree_id,
        s.name,
        SUM(bi.quantity) AS total_qty,
        SUM(bi.quantity * bi.price) AS sales_amount
      FROM bill_items bi
      JOIN bills b ON b.bill_id = bi.bill_id
      JOIN sarees s ON s.id = bi.saree_id
      WHERE b.shop_id IN (?)
        AND b.created_at >= (NOW() - INTERVAL ? DAY)
      GROUP BY bi.saree_id, s.name
      ORDER BY total_qty DESC, sales_amount DESC
      LIMIT 100
      `,
      [[shopIds], Number(days)]
    );

    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: e.message });
  } finally {
    conn.release();
  }
});

export default ownerDashboardRouter;
