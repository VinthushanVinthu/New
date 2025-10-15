// src/routes/suppliers.js
import { Router } from "express";
import { db } from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// Create supplier
router.post("/suppliers", requireAuth(["Owner","Manager"]), async (req, res) => {
  const {
    shop_id, name, phone, email, address_line, city, state, postal_code, country
  } = req.body;
  if (!shop_id || !name) return res.status(400).json({ message: "shop_id and name required" });
  const [r] = await db.query(
    `INSERT INTO suppliers (shop_id, name, phone, email, address_line, city, state, postal_code, country)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [shop_id, name, phone || null, email || null, address_line || null, city || null, state || null, postal_code || null, country || null]
  );
  res.json({ supplier_id: r.insertId });
});

// Update supplier
router.put("/suppliers/:id", requireAuth(["Owner","Manager"]), async (req, res) => {
  const { id } = req.params;
  const fields = ["name","phone","email","address_line","city","state","postal_code","country"];
  const updates = [];
  const vals = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) { updates.push(`${f} = ?`); vals.push(req.body[f]); }
  }
  if (!updates.length) return res.status(400).json({ message: "No fields" });
  vals.push(id);
  await db.query(`UPDATE suppliers SET ${updates.join(", ")} WHERE supplier_id = ?`, vals);
  res.json({ ok: true });
});

// Delete supplier (only Owner)
router.delete("/suppliers/:id", requireAuth(["Owner"]), async (req, res) => {
  const { id } = req.params;
  await db.query("DELETE FROM suppliers WHERE supplier_id = ?", [id]);
  res.json({ ok: true });
});

// List suppliers (by shop + optional q)
router.get("/suppliers", requireAuth(), async (req, res) => {
  const { shop_id, q } = req.query;
  if (!shop_id) return res.status(400).json({ message: "shop_id required" });
  let sql = "SELECT * FROM suppliers WHERE shop_id = ?";
  const vals = [shop_id];
  if (q) {
    sql += " AND (name LIKE ? OR city LIKE ? OR state LIKE ? OR phone LIKE ?)";
    vals.push(`%${q}%`,`%${q}%`,`%${q}%`,`%${q}%`);
  }
  const [rows] = await db.query(sql, vals);
  res.json(rows);
});

export default router;
