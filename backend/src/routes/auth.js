import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "../config/db.js";

const router = Router();

// Register
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, role, shop_code } = req.body; // role: Owner | Manager | Cashier
    if (!name || !email || !password || !role) return res.status(400).json({ message: "Missing fields" });
    const [exists] = await db.query("SELECT id FROM users WHERE email = ?", [email]);
    if (exists.length) return res.status(400).json({ message: "Email already registered" });

    const hash = await bcrypt.hash(password, 10);
    const [result] = await db.query(
      "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)",
      [name, email, hash, role]
    );
    const userId = result.insertId;

    // If Manager/Cashier, must join by shop_code
    if (role !== "Owner") {
      if (!shop_code) return res.status(400).json({ message: "shop_code required" });
      const [shops] = await db.query("SELECT shop_id FROM shops WHERE secret_code = ?", [shop_code]);
      if (!shops.length) return res.status(400).json({ message: "Invalid shop_code" });
      await db.query("INSERT INTO user_shops (user_id, shop_id) VALUES (?, ?)", [userId, shops[0].shop_id]);
    }

    const token = jwt.sign({ id: userId, role }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, user: { id: userId, name, email, role } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Server error" });
  }
});

// Login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const [rows] = await db.query("SELECT * FROM users WHERE email = ?", [email]);
    if (!rows.length) return res.status(400).json({ message: "Invalid credentials" });
    const user = rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(400).json({ message: "Invalid credentials" });
    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (e) {
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
