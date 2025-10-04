import { Router } from "express";
import { db } from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// Create / Update / Delete saree (Owner only)
router.post("/sarees", requireAuth(["Owner" ,"Manager"]), async (req, res) => {
  const { name, type, color, design, price, stock_quantity, shop_id } = req.body;
  if (!shop_id || !name) return res.status(400).json({ message: "shop_id and name required" });
  const [r] = await db.query(
    "INSERT INTO sarees (shop_id, name, type, color, design, price, stock_quantity) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [shop_id, name, type || null, color || null, design || null, price || 0, stock_quantity || 0]
  );
  res.json({ id: r.insertId });
});

router.put("/sarees/:id", requireAuth(["Owner", "Manager"]), async (req, res) => {
  const { id } = req.params;
  const fields = ["name","type","color","design","price","stock_quantity"];
  const updates = [];
  const vals = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) { updates.push(`${f} = ?`); vals.push(req.body[f]); }
  }
  if (!updates.length) return res.status(400).json({ message: "No fields" });
  vals.push(id);
  await db.query(`UPDATE sarees SET ${updates.join(", ")} WHERE id = ?`, vals);
  res.json({ ok: true });
});

router.delete("/sarees/:id", requireAuth(["Owner"]), async (req, res) => {
  const { id } = req.params;
  await db.query("DELETE FROM sarees WHERE id = ?", [id]);
  res.json({ ok: true });
});

router.get("/sarees", requireAuth(), async (req, res) => {
  const { shop_id, q } = req.query;
  let sql = "SELECT * FROM sarees WHERE 1=1";
  const vals = [];
  if (shop_id) { sql += " AND shop_id = ?"; vals.push(shop_id); }
  if (q) { sql += " AND (name LIKE ? OR type LIKE ? OR color LIKE ?)"; vals.push(`%${q}%`,`%${q}%`,`%${q}%`); }
  const [rows] = await db.query(sql, vals);
  res.json(rows);
});

export default router;
