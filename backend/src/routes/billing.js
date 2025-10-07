// routes/billing.js
import { Router } from "express";
import { db } from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/* ---------- CREATE ---------- */
router.post(
  "/create",
  requireAuth(["Owner", "Manager", "Cashier"]),
  async (req, res) => {
    const {
      shop_id,
      customer_id,
      customer,
      items,
      discount = 0,
      payment_method = "Cash",
      payment_reference = null,
      amount_paid = 0,
    } = req.body;

    if (!shop_id || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "shop_id and items are required" });
    }

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      let resolvedCustomerId = customer_id || null;
      if (!resolvedCustomerId && customer?.phone) {
        const [found] = await conn.query(
          "SELECT customer_id FROM customers WHERE shop_id = ? AND phone = ? LIMIT 1",
          [shop_id, customer.phone]
        );
        if (found.length) resolvedCustomerId = found[0].customer_id;
        else {
          const [ins] = await conn.query(
            "INSERT INTO customers (shop_id, name, phone, email) VALUES (?, ?, ?, ?)",
            [shop_id, customer.name || null, customer.phone, customer.email || null]
          );
          resolvedCustomerId = ins.insertId;
        }
      }
      if (!resolvedCustomerId) {
        throw new Error("Customer is required. Provide customer_id or customer {phone,...}.");
      }

      const [[shopRow]] = await conn.query(
        "SELECT tax_percentage FROM shops WHERE shop_id = ?",
        [shop_id]
      );
      if (!shopRow) throw new Error("Invalid shop");
      const taxPercent = Number(shopRow.tax_percentage) || 0;

      let subtotal = 0;
      for (const it of items) {
        const [[s]] = await conn.query(
          "SELECT price, stock_quantity FROM sarees WHERE id = ? AND shop_id = ? FOR UPDATE",
          [it.saree_id, shop_id]
        );
        if (!s) throw new Error("Invalid saree");
        if (Number(s.stock_quantity) < Number(it.quantity)) throw new Error("Insufficient stock");
        subtotal += Number(s.price) * Number(it.quantity);
      }

      const cappedDiscount = Math.min(round2(discount), subtotal);
      const taxable = subtotal - cappedDiscount;
      const tax = round2(taxable * (taxPercent / 100));
      const total_amount = round2(taxable + tax);

      const paid = round2(Number(amount_paid) || 0);
      if (!["Cash", "Card", "UPI"].includes(payment_method)) throw new Error("Invalid payment_method");
      let status = "UNPAID";
      if (paid >= total_amount) status = "PAID";
      else if (paid > 0) status = "PARTIAL";

      const [bill] = await conn.query(
        `INSERT INTO bills
           (shop_id, customer_id, user_id, subtotal, discount, tax, total_amount, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [shop_id, resolvedCustomerId, req.user.id, round2(subtotal), round2(cappedDiscount), tax, total_amount, status]
      );
      const billId = bill.insertId;

      for (const it of items) {
        const [[s]] = await conn.query(
          "SELECT price FROM sarees WHERE id = ? AND shop_id = ?",
          [it.saree_id, shop_id]
        );
        await conn.query(
          "INSERT INTO bill_items (bill_id, saree_id, quantity, price) VALUES (?, ?, ?, ?)",
          [billId, it.saree_id, it.quantity, Number(s.price)]
        );
        await conn.query(
          "UPDATE sarees SET stock_quantity = stock_quantity - ? WHERE id = ? AND shop_id = ?",
          [it.quantity, it.saree_id, shop_id]
        );
      }

      if (paid > 0) {
        await conn.query(
          "INSERT INTO payments (bill_id, method, reference, amount) VALUES (?, ?, ?, ?)",
          [billId, payment_method, payment_reference || null, paid]
        );
      }

      await conn.commit();
      res.json({
        bill_id: billId,
        customer_id: resolvedCustomerId,
        subtotal: round2(subtotal),
        discount: round2(cappedDiscount),
        tax,
        total_amount,
        paid,
        status,
      });
    } catch (e) {
      await conn.rollback();
      res.status(400).json({ message: e.message });
    } finally {
      conn.release();
    }
  }
);

/* ---------- DETAIL (now includes customer info) ---------- */
router.get(
  "/:id",
  requireAuth(["Owner", "Manager", "Cashier"]),
  async (req, res) => {
    const billId = req.params.id;
    const conn = await db.getConnection();
    try {
      const [bills] = await conn.query(
        `SELECT b.*, s.tax_percentage, u.name AS cashier_name,
                c.name AS customer_name, c.phone AS customer_phone, c.email AS customer_email
           FROM bills b
      LEFT JOIN shops s ON s.shop_id = b.shop_id
      LEFT JOIN users u ON u.id = b.user_id
      LEFT JOIN customers c ON c.customer_id = b.customer_id
          WHERE b.bill_id = ?`,
        [billId]
      );
      if (!bills.length) return res.status(404).json({ message: "Bill not found" });
      const bill = bills[0];
      if (req.user.role === "Cashier" && bill.user_id !== req.user.id) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const [items] = await conn.query(
        `SELECT bi.bill_item_id, bi.saree_id, bi.quantity, bi.price,
                (bi.quantity * bi.price) AS line_total,
                sa.name AS saree_name
           FROM bill_items bi
           JOIN sarees sa ON sa.id = bi.saree_id
          WHERE bi.bill_id = ?`,
        [billId]
      );

      const [payments] = await conn.query(
        `SELECT payment_id, method, reference, amount, created_at
           FROM payments
          WHERE bill_id = ?
          ORDER BY created_at ASC, payment_id ASC`,
        [billId]
      );

      const paid = (payments || []).reduce((sum, p) => sum + Number(p.amount), 0);
      res.json({
        bill,
        items,
        payments,
        paid: round2(paid),
        due: round2(Number(bill.total_amount) - paid),
      });
    } catch (e) {
      res.status(400).json({ message: e.message });
    } finally {
      conn.release();
    }
  }
);

/* ---------- LISTS ---------- */
router.get(
  "/shop/:shop_id",
  requireAuth(["Owner", "Manager", "Cashier"]),
  async (req, res) => {
    const { shop_id } = req.params;
    const isCashier = req.user.role === "Cashier";

    const conn = await db.getConnection();
    try {
      let rows;
      if (isCashier) {
        // Cashier sees only their own bills for this shop
        [rows] = await conn.query(
          `SELECT b.bill_id, b.customer_id, b.user_id, b.subtotal, b.discount, b.tax, b.total_amount, b.status, b.created_at,
                  u.name AS cashier_name
             FROM bills b
        LEFT JOIN users u ON b.user_id = u.id
            WHERE b.shop_id = ? AND b.user_id = ?
            ORDER BY b.created_at DESC`,
          [shop_id, req.user.id]
        );
      } else {
        // Owner/Manager see all bills for this shop
        [rows] = await conn.query(
          `SELECT b.bill_id, b.customer_id, b.user_id, b.subtotal, b.discount, b.tax, b.total_amount, b.status, b.created_at,
                  u.name AS cashier_name
             FROM bills b
        LEFT JOIN users u ON b.user_id = u.id
            WHERE b.shop_id = ?
            ORDER BY b.created_at DESC`,
          [shop_id]
        );
      }
      res.json({ bills: rows });
    } catch (e) {
      res.status(400).json({ message: e.message });
    } finally {
      conn.release();
    }
  }
);

router.get(
  "/mine",
  requireAuth(["Cashier"]),
  async (req, res) => {
    const { shop_id } = req.query;
    if (!shop_id) return res.status(400).json({ message: "shop_id is required" });
    const [rows] = await db.query(
      `SELECT b.bill_id, b.customer_id, b.user_id, b.subtotal, b.discount, b.tax, b.total_amount, b.status, b.created_at
         FROM bills b
        WHERE b.shop_id = ? AND b.user_id = ?
        ORDER BY b.created_at DESC`,
      [shop_id, req.user.id]
    );
    res.json({ bills: rows });
  }
);

/* ---------- UPDATE (discount-only) ---------- */
router.put(
  "/:bill_id",
  requireAuth(["Owner", "Manager", "Cashier"]),
  async (req, res) => {
    const { bill_id } = req.params;
    const { discount } = req.body;

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const [[bill]] = await conn.query("SELECT * FROM bills WHERE bill_id = ? FOR UPDATE", [bill_id]);
      if (!bill) throw new Error("Bill not found");
      if (req.user.role === "Cashier" && bill.user_id !== req.user.id) throw new Error("Forbidden");

      const [items] = await conn.query("SELECT quantity, price FROM bill_items WHERE bill_id = ?", [bill_id]);
      const subtotal = items.reduce((s, it) => s + Number(it.price) * Number(it.quantity), 0);

      const [[shop]] = await conn.query("SELECT tax_percentage FROM shops WHERE shop_id = ?", [bill.shop_id]);
      const taxPercent = Number(shop?.tax_percentage || 0);

      const cappedDiscount = Math.min(round2(Number(discount) || 0), subtotal);
      const taxable = subtotal - cappedDiscount;
      const tax = round2(taxable * (taxPercent / 100));
      const total_amount = round2(taxable + tax);

      const [payments] = await conn.query("SELECT amount FROM payments WHERE bill_id = ?", [bill_id]);
      const paid = payments.reduce((sum, p) => sum + Number(p.amount), 0);
      let status = "UNPAID";
      if (paid >= total_amount) status = "PAID";
      else if (paid > 0) status = "PARTIAL";

      await conn.query(
        "UPDATE bills SET subtotal = ?, discount = ?, tax = ?, total_amount = ?, status = ? WHERE bill_id = ?",
        [round2(subtotal), round2(cappedDiscount), tax, total_amount, status, bill_id]
      );

      await conn.commit();
      res.json({ bill_id, subtotal: round2(subtotal), discount: round2(cappedDiscount), tax, total_amount, paid: round2(paid), status });
    } catch (e) {
      await conn.rollback();
      res.status(400).json({ message: e.message });
    } finally {
      conn.release();
    }
  }
);

/* ---------- FULL UPDATE (items + discount) ---------- */
router.put(
  "/:bill_id/full",
  requireAuth(["Owner", "Manager", "Cashier"]),
  async (req, res) => {
    const { bill_id } = req.params;
    const { items, discount = 0 } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "items are required" });
    }

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const [[bill]] = await conn.query("SELECT * FROM bills WHERE bill_id = ? FOR UPDATE", [bill_id]);
      if (!bill) throw new Error("Bill not found");
      if (req.user.role === "Cashier" && bill.user_id !== req.user.id) throw new Error("Forbidden");

      const [oldItems] = await conn.query("SELECT saree_id, quantity FROM bill_items WHERE bill_id = ?", [bill_id]);
      const oldQty = new Map(oldItems.map(i => [Number(i.saree_id), Number(i.quantity)]));

      const newQty = new Map();
      for (const it of items) {
        const sid = Number(it.saree_id);
        const q = Number(it.quantity);
        if (!Number.isFinite(sid) || !Number.isFinite(q) || q < 0) throw new Error("Invalid items payload");
        newQty.set(sid, (newQty.get(sid) || 0) + q);
      }

      const affected = new Set([...oldQty.keys(), ...newQty.keys()]);
      for (const sid of affected) {
        const [[s]] = await conn.query(
          "SELECT id, price, stock_quantity FROM sarees WHERE id = ? AND shop_id = ? FOR UPDATE",
          [sid, bill.shop_id]
        );
        if (!s) throw new Error("Invalid saree in update");
        const prev = oldQty.get(sid) || 0;
        const next = newQty.get(sid) || 0;
        const delta = next - prev;
        if (delta > 0 && Number(s.stock_quantity) < delta) {
          throw new Error(`Insufficient stock for item ${sid}`);
        }
      }

      await conn.query("DELETE FROM bill_items WHERE bill_id = ?", [bill_id]);

      let subtotal = 0;
      for (const [sid, qty] of newQty.entries()) {
        if (qty === 0) continue;
        const [[s]] = await conn.query("SELECT price FROM sarees WHERE id = ? AND shop_id = ?", [sid, bill.shop_id]);
        const price = Number(s.price);
        subtotal += price * qty;
        await conn.query(
          "INSERT INTO bill_items (bill_id, saree_id, quantity, price) VALUES (?, ?, ?, ?)",
          [bill_id, sid, qty, price]
        );
      }

      for (const sid of affected) {
        const prev = oldQty.get(sid) || 0;
        const next = newQty.get(sid) || 0;
        const delta = next - prev;
        if (delta === 0) continue;
        if (delta > 0) {
          await conn.query(
            "UPDATE sarees SET stock_quantity = stock_quantity - ? WHERE id = ? AND shop_id = ?",
            [delta, sid, bill.shop_id]
          );
        } else {
          await conn.query(
            "UPDATE sarees SET stock_quantity = stock_quantity + ? WHERE id = ? AND shop_id = ?",
            [Math.abs(delta), sid, bill.shop_id]
          );
        }
      }

      const [[shop]] = await conn.query("SELECT tax_percentage FROM shops WHERE shop_id = ?", [bill.shop_id]);
      const taxPercent = Number(shop?.tax_percentage || 0);
      const cappedDiscount = Math.min(round2(Number(discount) || 0), subtotal);
      const taxable = subtotal - cappedDiscount;
      const tax = round2(taxable * (taxPercent / 100));
      const total_amount = round2(taxable + tax);

      const [payments] = await conn.query("SELECT amount FROM payments WHERE bill_id = ?", [bill_id]);
      const paid = payments.reduce((sum, p) => sum + Number(p.amount), 0);
      let status = "UNPAID";
      if (paid >= total_amount) status = "PAID";
      else if (paid > 0) status = "PARTIAL";

      await conn.query(
        "UPDATE bills SET subtotal = ?, discount = ?, tax = ?, total_amount = ?, status = ? WHERE bill_id = ?",
        [round2(subtotal), round2(cappedDiscount), tax, total_amount, status, bill_id]
      );

      await conn.commit();
      res.json({ bill_id, subtotal: round2(subtotal), discount: round2(cappedDiscount), tax, total_amount, paid: round2(paid), status });
    } catch (e) {
      await conn.rollback();
      res.status(400).json({ message: e.message });
    } finally {
      conn.release();
    }
  }
);

/* ---------- ADD PAYMENT (amount + method + reference) ---------- */
router.post(
  "/:bill_id/payments",
  requireAuth(["Owner", "Manager", "Cashier"]),
  async (req, res) => {
    const { bill_id } = req.params;
    const { amount, method = "Cash", reference = null } = req.body;

    const amt = round2(Number(amount) || 0);
    if (amt <= 0) return res.status(400).json({ message: "amount must be > 0" });
    if (!["Cash", "Card", "UPI"].includes(method)) {
      return res.status(400).json({ message: "Invalid payment method" });
    }

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const [[bill]] = await conn.query("SELECT * FROM bills WHERE bill_id = ? FOR UPDATE", [bill_id]);
      if (!bill) throw new Error("Bill not found");
      if (req.user.role === "Cashier" && bill.user_id !== req.user.id) throw new Error("Forbidden");

      await conn.query(
        "INSERT INTO payments (bill_id, method, reference, amount) VALUES (?, ?, ?, ?)",
        [bill_id, method, reference || null, amt]
      );

      const [payments] = await conn.query("SELECT amount FROM payments WHERE bill_id = ?", [bill_id]);
      const paid = payments.reduce((sum, p) => sum + Number(p.amount), 0);

      let status = "UNPAID";
      if (paid >= Number(bill.total_amount)) status = "PAID";
      else if (paid > 0) status = "PARTIAL";

      await conn.query("UPDATE bills SET status = ? WHERE bill_id = ?", [status, bill_id]);

      await conn.commit();
      res.json({ ok: true, bill_id, paid: round2(paid), status });
    } catch (e) {
      await conn.rollback();
      res.status(400).json({ message: e.message });
    } finally {
      conn.release();
    }
  }
);

/* ---------- DELETE ---------- */
router.delete(
  "/:bill_id",
  requireAuth(["Owner", "Manager", "Cashier"]),
  async (req, res) => {
    const { bill_id } = req.params;

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const [[bill]] = await conn.query("SELECT * FROM bills WHERE bill_id = ? FOR UPDATE", [bill_id]);
      if (!bill) throw new Error("Bill not found");
      if (req.user.role === "Cashier") {
        if (bill.user_id !== req.user.id) throw new Error("Forbidden");
        if (bill.status !== "UNPAID") throw new Error("Cashier can delete only UNPAID bills");
      }

      const [items] = await conn.query("SELECT saree_id, quantity FROM bill_items WHERE bill_id = ?", [bill_id]);
      for (const it of items) {
        await conn.query(
          "UPDATE sarees SET stock_quantity = stock_quantity + ? WHERE id = ? AND shop_id = ?",
          [it.quantity, it.saree_id, bill.shop_id]
        );
      }

      await conn.query("DELETE FROM payments WHERE bill_id = ?", [bill_id]);
      await conn.query("DELETE FROM bill_items WHERE bill_id = ?", [bill_id]);
      await conn.query("DELETE FROM bills WHERE bill_id = ?", [bill_id]);

      await conn.commit();
      res.json({ ok: true });
    } catch (e) {
      await conn.rollback();
      res.status(400).json({ message: e.message });
    } finally {
      conn.release();
    }
  }
);

export default router;
