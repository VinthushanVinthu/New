// routes/staff.js
import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

/**
 * Helper: verify the requester has access to a given shop.
 * - Owners: must be shops.owner_user_id = req.user.id OR in user_shops
 * - Managers/Cashiers: must be listed in user_shops
 */
async function userHasShopAccess(userId, role, shopId) {
  // owner via shops table
  const [own] = await db.query(
    "SELECT shop_id FROM shops WHERE shop_id = ? AND owner_id = ?",
    [shopId, userId]
  );
  if (own.length) return true;

  // via user_shops
  const [link] = await db.query(
    "SELECT 1 FROM user_shops WHERE shop_id = ? AND user_id = ?",
    [shopId, userId]
  );
  return !!link.length;
}

/**
 * GET /api/staff?shop_id=#
 * Owner: returns Managers + Cashiers in that shop
 * Manager: returns Cashiers in that shop
 */
router.get("/", requireAuth(["Owner", "Manager"]), async (req, res) => {
  try {
    const shop_id = Number(req.query.shop_id);
    if (!shop_id) return res.status(400).json({ message: "shop_id required" });

    const ok = await userHasShopAccess(req.user.id, req.user.role, shop_id);
    if (!ok) return res.status(403).json({ message: "No access to this shop" });

    const allowedRoles = req.user.role === "Owner" ? ["Manager", "Cashier"] : ["Cashier"];

    const [rows] = await db.query(
      `
      SELECT u.id, u.name, u.email, u.role, u.created_at
      FROM user_shops us
      JOIN users u ON u.id = us.user_id
      WHERE us.shop_id = ?
        AND u.role IN (?, ?)
      ORDER BY u.created_at DESC
      `,
      req.user.role === "Owner" ? [shop_id, "Manager", "Cashier"] : [shop_id, "Cashier", "Cashier"]
    );

    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * POST /api/staff
 * Body: { shop_id, name, email, password, role }  // role: Manager|Cashier
 * Owner can create Manager or Cashier
 * Manager can create Cashier only
 */
router.post("/", requireAuth(["Owner", "Manager"]), async (req, res) => {
  try {
    const { shop_id, name, email, password, role } = req.body;
    if (!shop_id || !name || !email || !password || !role) {
      return res.status(400).json({ message: "Missing fields" });
    }

    const ok = await userHasShopAccess(req.user.id, req.user.role, shop_id);
    if (!ok) return res.status(403).json({ message: "No access to this shop" });

    if (!["Manager", "Cashier"].includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }
    if (req.user.role === "Manager" && role !== "Cashier") {
      return res.status(403).json({ message: "Managers can create Cashiers only" });
    }

    const [exists] = await db.query("SELECT id FROM users WHERE email = ?", [email]);
    if (exists.length) return res.status(409).json({ message: "Email already in use" });

    const hash = await bcrypt.hash(password, 10);
    const [ins] = await db.query(
      "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)",
      [name, email, hash, role]
    );
    const newUserId = ins.insertId;

    // link to shop
    await db.query("INSERT INTO user_shops (user_id, shop_id) VALUES (?, ?)", [newUserId, shop_id]);

    res.json({ id: newUserId, name, email, role });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * PUT /api/staff/:id
 * Body: { shop_id, name?, email?, role?, password? }
 * - Owner can change name/email/role (to Manager|Cashier) and reset password
 * - Manager can change name/email and reset password for Cashiers only (cannot promote/demote to Manager)
 */
router.put("/:id", requireAuth(["Owner", "Manager"]), async (req, res) => {
  try {
    const targetId = Number(req.params.id);
    const { shop_id, name, email, role, password } = req.body;
    if (!targetId || !shop_id) return res.status(400).json({ message: "shop_id and id required" });

    const ok = await userHasShopAccess(req.user.id, req.user.role, shop_id);
    if (!ok) return res.status(403).json({ message: "No access to this shop" });

    // target user must be part of the shop
    const [linked] = await db.query(
      `
      SELECT u.id, u.role as current_role FROM user_shops us
      JOIN users u ON u.id = us.user_id
      WHERE us.shop_id = ? AND us.user_id = ?
      `,
      [shop_id, targetId]
    );
    if (!linked.length) return res.status(404).json({ message: "User not found in this shop" });

    const currentRole = linked[0].current_role;
    if (currentRole === "Owner") {
      return res.status(403).json({ message: "Cannot modify Owner via staff API" });
    }
    if (req.user.role === "Manager" && currentRole !== "Cashier") {
      return res.status(403).json({ message: "Managers can modify Cashiers only" });
    }

    // Build fields
    const updates = [];
    const params = [];

    if (name !== undefined) {
      updates.push("name = ?");
      params.push(name || null);
    }
    if (email !== undefined) {
      // unique check
      const [e2] = await db.query("SELECT id FROM users WHERE email = ? AND id <> ?", [email, targetId]);
      if (e2.length) return res.status(409).json({ message: "Email already in use" });
      updates.push("email = ?");
      params.push(email || null);
    }
    if (password !== undefined) {
      const hash = await bcrypt.hash(password || "", 10);
      updates.push("password_hash = ?");
      params.push(hash);
    }
    if (role !== undefined) {
      if (!["Manager", "Cashier"].includes(role)) return res.status(400).json({ message: "Invalid role" });
      if (req.user.role === "Manager" && role !== "Cashier") {
        return res.status(403).json({ message: "Managers cannot set role to Manager" });
      }
      updates.push("role = ?");
      params.push(role);
    }

    if (!updates.length) return res.json({ message: "Nothing to update" });

    params.push(targetId);

    await db.query(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`, params);

    res.json({ message: "Updated" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * DELETE /api/staff/:id?shop_id=#
 * Remove user from shop. If they aren't linked to any other shop afterwards, delete the user.
 * Safeguards:
 * - Cannot delete Owners here
 * - Manager can delete Cashiers only
 */
router.delete("/:id", requireAuth(["Owner", "Manager"]), async (req, res) => {
  try {
    const targetId = Number(req.params.id);
    const shop_id = Number(req.query.shop_id);
    if (!targetId || !shop_id) return res.status(400).json({ message: "shop_id and id required" });

    const ok = await userHasShopAccess(req.user.id, req.user.role, shop_id);
    if (!ok) return res.status(403).json({ message: "No access to this shop" });

    // Check target
    const [u] = await db.query("SELECT id, role FROM users WHERE id = ?", [targetId]);
    if (!u.length) return res.status(404).json({ message: "User not found" });
    if (u[0].role === "Owner") return res.status(403).json({ message: "Cannot delete Owner via staff API" });
    if (req.user.role === "Manager" && u[0].role !== "Cashier") {
      return res.status(403).json({ message: "Managers can delete Cashiers only" });
    }

    // Verify linked
    const [linked] = await db.query(
      "SELECT 1 FROM user_shops WHERE user_id = ? AND shop_id = ?",
      [targetId, shop_id]
    );
    if (!linked.length) return res.status(404).json({ message: "User not linked to this shop" });

    // Remove link
    await db.query("DELETE FROM user_shops WHERE user_id = ? AND shop_id = ?", [targetId, shop_id]);

    // If no more links, delete user
    const [rest] = await db.query("SELECT COUNT(*) AS c FROM user_shops WHERE user_id = ?", [targetId]);
    if (!rest[0].c) {
      await db.query("DELETE FROM users WHERE id = ?", [targetId]);
    }

    res.json({ message: "Deleted" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
