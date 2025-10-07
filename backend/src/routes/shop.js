// server/routes/shop.js
import { Router } from "express";
import { db } from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function isOwnerOfShop(userId, shopId) {
  const [rows] = await db.query(
    "SELECT 1 FROM shops WHERE shop_id = ? AND owner_id = ? LIMIT 1",
    [shopId, userId]
  );
  return rows.length > 0;
}

// Owner creates a shop
router.post("/create", requireAuth(["Owner"]), async (req, res) => {
  try {
    const {
      shop_name,
      address_line,
      city,
      state,
      postal_code,
      country,
      tax_percentage,
    } = req.body;

    if (!shop_name) {
      return res.status(400).json({ message: "shop_name is required" });
    }

    const code = generateCode();

    const [result] = await db.query(
      `INSERT INTO shops 
        (shop_name, owner_id, secret_code, address_line, city, state, postal_code, country, tax_percentage) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        shop_name,
        req.user.id,
        code,
        address_line || null,
        city || null,
        state || null,
        postal_code || null,
        country || null,
        tax_percentage ?? 0.0,
      ]
    );

    // Link the owner to the shop (if you use user_shops)
    await db.query(
      "INSERT INTO user_shops (user_id, shop_id) VALUES (?, ?)",
      [req.user.id, result.insertId]
    );

    const [row] = await db.query("SELECT * FROM shops WHERE shop_id = ?", [
      result.insertId,
    ]);

    res.json(row[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Server error" });
  }
});

// List shops for current user
router.get("/my", requireAuth(), async (req, res) => {
  try {
    const [rows] = await db.query(
      `
      SELECT s.*
      FROM shops s
      JOIN user_shops us ON us.shop_id = s.shop_id
      WHERE us.user_id = ?
      ORDER BY s.created_at DESC
    `,
      [req.user.id]
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Server error" });
  }
});

// Manager convenience: fetch their one shop
router.get("/my-shop", requireAuth(["Manager"]), async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT s.*
       FROM shops s 
       JOIN user_shops us ON us.shop_id = s.shop_id 
       WHERE us.user_id = ? 
       LIMIT 1`,
      [req.user.id]
    );
    if (rows.length === 0)
      return res.status(404).json({ message: "Shop not found" });
    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Server error" });
  }
});

// Owner convenience: fetch their first/primary shop
router.get("/owner/current", requireAuth(["Owner"]), async (req, res) => {
  try {
    // prefer the newest
    const [rows] = await db.query(
      `SELECT s.*
       FROM shops s
       WHERE s.owner_id = ?
       ORDER BY s.created_at DESC
       LIMIT 1`,
      [req.user.id]
    );
    if (rows.length === 0)
      return res.status(404).json({ message: "Shop not found" });
    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Server error" });
  }
});

// Owner updates their own shop
router.patch("/:id", requireAuth(["Owner"]), async (req, res) => {
  try {
    const { id } = req.params;
    const allowed = [
      "shop_name",
      "address_line",
      "city",
      "state",
      "postal_code",
      "country",
      "tax_percentage",
    ];

    // ensure ownership
    const owns = await isOwnerOfShop(req.user.id, id);
    if (!owns) return res.status(403).json({ message: "Forbidden" });

    // build dynamic SET clause
    const updates = [];
    const values = [];
    for (const k of allowed) {
      if (k in req.body) {
        updates.push(`${k} = ?`);
        // null-safe numeric for tax
        if (k === "tax_percentage") {
          values.push(
            req.body[k] === null || req.body[k] === "" ? 0 : Number(req.body[k])
          );
        } else {
          values.push(req.body[k] || null);
        }
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: "No fields to update" });
    }

    values.push(id);
    await db.query(`UPDATE shops SET ${updates.join(", ")} WHERE shop_id = ?`, values);

    const [rows] = await db.query(`SELECT * FROM shops WHERE shop_id = ?`, [id]);
    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
