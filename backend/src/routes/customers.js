// routes/customers.js
import { Router } from "express";
import { db } from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

/**
 * List customers by shop (optional q search)
 * GET /customers?shop_id=1&q=anu
 */
router.get("/customers", requireAuth(["Owner", "Manager", "Cashier"]), async (req, res) => {
  const { shop_id, q } = req.query;
  if (!shop_id) return res.status(400).json({ message: "shop_id is required" });

  let sql = `
    SELECT customer_id, shop_id, name, phone, email, created_at
      FROM customers
     WHERE shop_id = ?
  `;
  const vals = [shop_id];

  if (q) {
    sql += " AND (name LIKE ? OR phone LIKE ? OR email LIKE ?)";
    const like = `%${q}%`;
    vals.push(like, like, like);
  }

  sql += " ORDER BY created_at DESC";

  const [rows] = await db.query(sql, vals);
  res.json(rows);
});

/**
 * Exact phone lookup inside a shop
 * GET /customers/by-phone?shop_id=1&phone=0771234567
 */
router.get("/customers/by-phone", requireAuth(["Owner", "Manager", "Cashier"]), async (req, res) => {
  const { shop_id, phone } = req.query;
  if (!shop_id || !phone) {
    return res.status(400).json({ message: "shop_id and phone are required" });
  }
  try {
    const [rows] = await db.query(
      "SELECT customer_id, shop_id, name, phone, email, created_at FROM customers WHERE shop_id = ? AND phone = ? LIMIT 1",
      [shop_id, phone]
    );
    if (!rows.length) return res.json(null);
    res.json(rows[0]);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

/**
 * Fuzzy search (limited 20)
 * GET /customers/search?shop_id=1&q=ali
 */
router.get("/customers/search", requireAuth(["Owner", "Manager", "Cashier"]), async (req, res) => {
  const { shop_id, q = "" } = req.query;
  if (!shop_id) return res.status(400).json({ message: "shop_id is required" });

  const like = `%${q}%`;
  try {
    const [rows] = await db.query(
      `SELECT customer_id, shop_id, name, phone, email, created_at
         FROM customers
        WHERE shop_id = ?
          AND (name LIKE ? OR phone LIKE ? OR email LIKE ?)
        ORDER BY created_at DESC
        LIMIT 20`,
      [shop_id, like, like, like]
    );
    res.json(rows);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

/**
 * Create customer
 * POST /customers
 * body: { shop_id, name, phone, email }
 */
router.post("/customers", requireAuth(["Owner", "Manager", "Cashier"]), async (req, res) => {
  const { shop_id, name, phone, email } = req.body;
  if (!shop_id || !phone) {
    return res.status(400).json({ message: "shop_id and phone are required" });
  }

  try {
    // prevent duplicates by (shop_id, phone)
    const [exists] = await db.query(
      "SELECT customer_id FROM customers WHERE shop_id = ? AND phone = ? LIMIT 1",
      [shop_id, phone]
    );
    if (exists.length) {
      return res
        .status(409)
        .json({ message: "Customer with this phone already exists", customer_id: exists[0].customer_id });
    }

    const [ins] = await db.query(
      "INSERT INTO customers (shop_id, name, phone, email) VALUES (?, ?, ?, ?)",
      [shop_id, name || null, phone, email || null]
    );
    const [created] = await db.query(
      "SELECT customer_id, shop_id, name, phone, email, created_at FROM customers WHERE customer_id = ?",
      [ins.insertId]
    );
    res.status(201).json(created[0]);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

/**
 * Update customer
 * PUT /customers/:id
 * body: { name, phone, email }
 */
router.put("/customers/:id", requireAuth(["Owner", "Manager","Cashier"]), async (req, res) => {
  const { id } = req.params;

  // Build dynamic SET like your inventory.js
  const fields = ["name", "phone", "email"];
  const updates = [];
  const vals = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) {
      updates.push(`${f} = ?`);
      vals.push(req.body[f] || null);
    }
  }
  if (!updates.length) return res.status(400).json({ message: "No fields" });

  vals.push(id);

  try {
    await db.query(`UPDATE customers SET ${updates.join(", ")} WHERE customer_id = ?`, vals);
    res.json({ ok: true });
  } catch (e) {
    // handle unique (shop_id, phone) collisions if you added a unique index
    res.status(400).json({ message: e.message });
  }
});

/**
 * Delete customer
 * DELETE /customers/:id
 */
router.delete("/customers/:id", requireAuth(["Owner", "Manager"]), async (req, res) => {
  const { id } = req.params;
  await db.query("DELETE FROM customers WHERE customer_id = ?", [id]);
  res.json({ ok: true });
});

export default router;
