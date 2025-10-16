import { Router } from "express";
import { db } from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// Create / Update / Delete saree (Owner only)
router.post("/sarees", requireAuth(["Owner" ,"Manager"]), async (req, res) => {
  const { name, item_code, type, color, design, price, discount, shop_id } = req.body;
  if (!shop_id || !name || !item_code) {
    return res.status(400).json({ message: "shop_id, name, and item_code required" });
  }
  const code = String(item_code).trim();
  if (!code) return res.status(400).json({ message: "item_code required" });

  try {
    const [r] = await db.query(
      "INSERT INTO sarees (shop_id, name, item_code, type, color, design, price, discount, stock_quantity) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)",
      [shop_id, name, code, type || null, color || null, design || null, price || 0, discount || 0]
    );
    res.json({ id: r.insertId });
  } catch (e) {
    if (e?.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "Item code already exists for this shop." });
    }
    console.error(e);
    return res.status(500).json({ message: "Failed to create saree." });
  }
});

router.put("/sarees/:id", requireAuth(["Owner", "Manager"]), async (req, res) => {
  const { id } = req.params;
  if (req.body.item_code !== undefined) {
    const code = String(req.body.item_code).trim();
    if (!code) return res.status(400).json({ message: "item_code required" });
    req.body.item_code = code;
  }
  const fields = ["name","item_code","type","color","design","price","discount","stock_quantity"];
  const updates = [];
  const vals = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) { updates.push(`${f} = ?`); vals.push(req.body[f]); }
  }
  if (!updates.length) return res.status(400).json({ message: "No fields" });
  vals.push(id);
  try {
    await db.query(`UPDATE sarees SET ${updates.join(", ")} WHERE id = ?`, vals);
  } catch (e) {
    if (e?.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "Item code already exists for this shop." });
    }
    console.error(e);
    return res.status(500).json({ message: "Failed to update saree." });
  }
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
  if (q) {
    sql += " AND (name LIKE ? OR type LIKE ? OR color LIKE ? OR item_code LIKE ?)";
    vals.push(`%${q}%`,`%${q}%`,`%${q}%`,`%${q}%`);
  }
  const [rows] = await db.query(sql, vals);
  res.json(rows);
});

export default router;
