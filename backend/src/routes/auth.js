import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "../config/db.js";

const router = Router();

// Register
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, role, shop_code } = req.body; // role: Owner | Manager | Cashier
    if (!name || !email || !password || !role)
      return res.status(400).json({ message: "Missing fields" });

    // Check if email already exists
    const [exists] = await db.query("SELECT id FROM users WHERE email = ?", [email]);
    if (exists.length)
      return res.status(400).json({ message: "Email already registered" });

    // Hash password
    const hash = await bcrypt.hash(password, 10);
    const [result] = await db.query(
      "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)",
      [name, email, hash, role]
    );
    const userId = result.insertId;

    let status = "new"; // Default status if not in user_shops

    // If Manager/Cashier, link to shop
    if (role !== "Owner") {
      if (!shop_code)
        return res.status(400).json({ message: "shop_code required" });

      const [shops] = await db.query("SELECT shop_id FROM shops WHERE secret_code = ?", [shop_code]);
      if (!shops.length)
        return res.status(400).json({ message: "Invalid shop_code" });

      await db.query("INSERT INTO user_shops (user_id, shop_id) VALUES (?, ?)", [
        userId,
        shops[0].shop_id,
      ]);

      status = "joined"; // User is linked to a shop
    }

    // Double-check if user exists in user_shops (for clarity)
    const [checkUserShop] = await db.query("SELECT * FROM user_shops WHERE user_id = ?", [userId]);
    if (checkUserShop.length === 0) status = "new";

    // Create token
    const token = jwt.sign({ id: userId, role }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    res.json({
      token,
      user: { id: userId, name, email, role, status },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Server error" });
  }
});


// Login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password)
      return res.status(400).json({ message: "Email and password are required" });

    // Find user
    const [rows] = await db.query("SELECT * FROM users WHERE email = ?", [email]);
    if (!rows.length)
      return res.status(400).json({ message: "Invalid credentials" });

    const user = rows[0];

    // Compare password
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok)
      return res.status(400).json({ message: "Invalid credentials" });

    // Default status
    let status = "new";

    // Check if user is linked to a shop
    const [check] = await db.query("SELECT * FROM user_shops WHERE user_id = ?", [user.id]);
    if (check.length > 0) status = "joined";

    // Generate token
    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    // Respond
    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status
      }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Server error" });
  }
});


router.get('/me', async (req, res) => {
  try {
    // assume you have middleware that sets req.userId from JWT,
    // or parse token here.
    const userId = req.userId;
    const [rows] = await db.query('SELECT * FROM users WHERE id = ?', [userId]);
    if (!rows.length) return res.status(404).json({ message: 'Not found' });

    const user = rows[0];
    let status = 'new';
    const [check] = await db.query('SELECT 1 FROM user_shops WHERE user_id = ?', [user.id]);
    if (check.length > 0) status = 'joined';

    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status
    });
  } catch (e) {
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
