import { Router } from "express";
import { db } from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
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
      tax_percentage 
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
        tax_percentage || 0.00
      ]
    );

    // Link the owner to the shop
    await db.query(
      "INSERT INTO user_shops (user_id, shop_id) VALUES (?, ?)",
      [req.user.id, result.insertId]
    );

    res.json({
      shop_id: result.insertId,
      shop_name,
      secret_code: code,
      address_line,
      city,
      state,
      postal_code,
      country,
      tax_percentage
    });

  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Server error" });
  }
});


// List shops for current user (with all columns)
router.get("/my", requireAuth(), async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT s.*
      FROM shops s
      JOIN user_shops us ON us.shop_id = s.shop_id
      WHERE us.user_id = ?
      ORDER BY s.created_at DESC
    `, [req.user.id]);

    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Server error" });
  }
});


// GET /shop/my-shop
router.get('/my-shop', requireAuth(['Manager']), async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT s.* 
       FROM shops s 
       JOIN user_shops us ON us.shop_id = s.shop_id 
       WHERE us.user_id = ? 
       LIMIT 1`,
      [req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ message: 'Shop not found' });
    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Server error' });
  }
});


export default router;
