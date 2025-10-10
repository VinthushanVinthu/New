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

/** Helper: ensure target user is linked to the given shop and is not Owner */
async function assertTargetLinkedToShop(targetUserId, shopId) {
  const [u] = await db.query(
    `SELECT u.id, u.role
       FROM users u
       JOIN user_shops us ON us.user_id = u.id
      WHERE us.shop_id = ? AND u.id = ?
      LIMIT 1`,
    [shopId, targetUserId]
  );
  if (!u.length) return { ok: false, reason: "User not found in this shop" };
  if (u[0].role === "Owner") return { ok: false, reason: "Cannot view/modify Owner via staff API" };
  return { ok: true, currentRole: u[0].role };
}

/* =========================
 *  EXISTING LIST/CREATE/UPDATE/DELETE
 * ========================= */

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

    const linkCheck = await assertTargetLinkedToShop(targetId, shop_id);
    if (!linkCheck.ok) return res.status(404).json({ message: linkCheck.reason });
    const currentRole = linkCheck.currentRole;

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

    const [u] = await db.query("SELECT id, role FROM users WHERE id = ?", [targetId]);
    if (!u.length) return res.status(404).json({ message: "User not found" });
    if (u[0].role === "Owner") return res.status(403).json({ message: "Cannot delete Owner via staff API" });
    if (req.user.role === "Manager" && u[0].role !== "Cashier") {
      return res.status(403).json({ message: "Managers can delete Cashiers only" });
    }

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

/* =========================
 *  NEW: VIEW / METRICS / HISTORIES
 * ========================= */

/**
 * GET /api/staff/:id/summary?shop_id=#
 * Returns totals for bills/payments made by this staff in this shop.
 */
router.get("/:id/summary", requireAuth(["Owner", "Manager"]), async (req, res) => {
  try {
    const targetId = Number(req.params.id);
    const shop_id = Number(req.query.shop_id);
    if (!targetId || !shop_id) return res.status(400).json({ message: "shop_id and id required" });

    const ok = await userHasShopAccess(req.user.id, req.user.role, shop_id);
    if (!ok) return res.status(403).json({ message: "No access to this shop" });

    const linkCheck = await assertTargetLinkedToShop(targetId, shop_id);
    if (!linkCheck.ok) return res.status(404).json({ message: linkCheck.reason });

    const [[billAgg]] = await db.query(
      `SELECT
         COUNT(*) AS total_bills,
         COALESCE(SUM(subtotal), 0) AS subtotal_sum,
         COALESCE(SUM(discount), 0) AS discount_sum,
         COALESCE(SUM(tax), 0) AS tax_sum,
         COALESCE(SUM(total_amount), 0) AS total_amount_sum,
         MIN(created_at) AS first_bill_at,
         MAX(created_at) AS last_bill_at
       FROM bills
      WHERE shop_id = ? AND user_id = ?`,
      [shop_id, targetId]
    );

    const [[paidAgg]] = await db.query(
      `SELECT COALESCE(SUM(p.amount), 0) AS paid_sum
         FROM payments p
         JOIN bills b ON b.bill_id = p.bill_id
        WHERE b.shop_id = ? AND b.user_id = ?`,
      [shop_id, targetId]
    );

    const paid_sum = Number(paidAgg?.paid_sum || 0);
    const total_amount_sum = Number(billAgg?.total_amount_sum || 0);
    const outstanding_sum = Number((total_amount_sum - paid_sum).toFixed(2));

    res.json({
      total_bills: Number(billAgg?.total_bills || 0),
      subtotal_sum: Number(billAgg?.subtotal_sum || 0),
      discount_sum: Number(billAgg?.discount_sum || 0),
      tax_sum: Number(billAgg?.tax_sum || 0),
      total_amount_sum,
      paid_sum,
      outstanding_sum,
      first_bill_at: billAgg?.first_bill_at,
      last_bill_at: billAgg?.last_bill_at,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET /api/staff/:id/bills?shop_id=#&page=1&page_size=10&status=&q=
 * Lists bills done by this staff in this shop with paid amount per bill
 */
router.get("/:id/bills", requireAuth(["Owner", "Manager"]), async (req, res) => {
  try {
    const targetId = Number(req.params.id);
    const shop_id = Number(req.query.shop_id);
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.page_size) || 10));
    const status = (req.query.status || "").toUpperCase();
    const q = (req.query.q || "").trim();

    if (!targetId || !shop_id) return res.status(400).json({ message: "shop_id and id required" });

    const ok = await userHasShopAccess(req.user.id, req.user.role, shop_id);
    if (!ok) return res.status(403).json({ message: "No access to this shop" });

    const linkCheck = await assertTargetLinkedToShop(targetId, shop_id);
    if (!linkCheck.ok) return res.status(404).json({ message: linkCheck.reason });

    const offset = (page - 1) * pageSize;

    const filters = ["b.shop_id = ?", "b.user_id = ?"];
    const params = [shop_id, targetId];

    if (["PAID", "PARTIAL", "UNPAID"].includes(status)) {
      filters.push("b.status = ?");
      params.push(status);
    }
    if (q) {
      filters.push("(c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ? OR b.bill_id = ?)");
      params.push(`%${q}%`, `%${q}%`, `%${q}%`, Number.isNaN(Number(q)) ? 0 : Number(q));
    }

    const where = `WHERE ${filters.join(" AND ")}`;

    const [[countRow]] = await db.query(
      `SELECT COUNT(*) AS cnt
         FROM bills b
         LEFT JOIN customers c ON c.customer_id = b.customer_id
        ${where}`,
      params
    );
    const total = Number(countRow.cnt || 0);

    const [rows] = await db.query(
      `SELECT
          b.bill_id, b.status, b.subtotal, b.discount, b.tax, b.total_amount,
          b.created_at, b.customer_id,
          c.name AS customer_name, c.phone AS customer_phone,
          (SELECT COALESCE(SUM(amount),0) FROM payments p WHERE p.bill_id = b.bill_id) AS paid_amount
        FROM bills b
        LEFT JOIN customers c ON c.customer_id = b.customer_id
        ${where}
        ORDER BY b.created_at DESC
        LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    res.json({
      page,
      page_size: pageSize,
      total,
      rows: rows.map(r => ({
        ...r,
        subtotal: Number(r.subtotal),
        discount: Number(r.discount),
        tax: Number(r.tax),
        total_amount: Number(r.total_amount),
        paid_amount: Number(r.paid_amount || 0)
      })),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET /api/staff/:id/payments?shop_id=#&page=1&page_size=10&q=
 * Lists payments recorded by this staff's bills (joined via bills)
 */
router.get("/:id/payments", requireAuth(["Owner", "Manager"]), async (req, res) => {
  try {
    const targetId = Number(req.params.id);
    const shop_id = Number(req.query.shop_id);
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.page_size) || 10));
    const q = (req.query.q || "").trim();

    if (!targetId || !shop_id) return res.status(400).json({ message: "shop_id and id required" });

    const ok = await userHasShopAccess(req.user.id, req.user.role, shop_id);
    if (!ok) return res.status(403).json({ message: "No access to this shop" });

    const linkCheck = await assertTargetLinkedToShop(targetId, shop_id);
    if (!linkCheck.ok) return res.status(404).json({ message: linkCheck.reason });

    const offset = (page - 1) * pageSize;

    const filters = ["b.shop_id = ?", "b.user_id = ?"];
    const params = [shop_id, targetId];

    if (q) {
      filters.push("(p.reference LIKE ? OR p.method LIKE ? OR b.bill_id = ?)");
      params.push(`%${q}%`, `%${q}%`, Number.isNaN(Number(q)) ? 0 : Number(q));
    }

    const where = `WHERE ${filters.join(" AND ")}`;

    const [[countRow]] = await db.query(
      `SELECT COUNT(*) AS cnt
         FROM payments p
         JOIN bills b ON b.bill_id = p.bill_id
        ${where}`,
      params
    );
    const total = Number(countRow.cnt || 0);

    const [rows] = await db.query(
      `SELECT
          p.payment_id, p.bill_id, p.method, p.reference, p.amount, p.created_at,
          b.status AS bill_status, b.total_amount,
          (SELECT COALESCE(SUM(amount),0) FROM payments p2 WHERE p2.bill_id = b.bill_id) AS bill_paid
        FROM payments p
        JOIN bills b ON b.bill_id = p.bill_id
        ${where}
        ORDER BY p.created_at DESC
        LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    res.json({
      page,
      page_size: pageSize,
      total,
      rows: rows.map(r => ({
        payment_id: r.payment_id,
        bill_id: r.bill_id,
        method: r.method,
        reference: r.reference,
        amount: Number(r.amount),
        created_at: r.created_at,
        bill_status: r.bill_status,
        bill_total: Number(r.total_amount),
        bill_paid: Number(r.bill_paid),
      })),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
