import { Router } from "express";
import { db } from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.get("/sales/daily", requireAuth(["Owner","Manager"]), async (req, res) => {
  const { shop_id } = req.query;
  const [rows] = await db.query(`
    SELECT DATE(created_at) as date, SUM(total_amount) as total
    FROM bills
    WHERE (? IS NULL OR shop_id = ?)
    GROUP BY DATE(created_at)
    ORDER BY DATE(created_at) DESC
    LIMIT 30
  `, [shop_id || null, shop_id || null]);
  res.json(rows);
});

router.get("/top-sellers", requireAuth(["Owner","Manager"]), async (req, res) => {
  const { shop_id } = req.query;
  const [rows] = await db.query(`
    SELECT s.name, SUM(bi.quantity) as qty
    FROM bill_items bi
    JOIN sarees s ON s.id = bi.saree_id
    JOIN bills b ON b.bill_id = bi.bill_id
    WHERE (? IS NULL OR b.shop_id = ?)
    GROUP BY s.name
    ORDER BY qty DESC
    LIMIT 10
  `, [shop_id || null, shop_id || null]);
  res.json(rows);
});

export default router;
