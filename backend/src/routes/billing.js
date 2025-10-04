import { Router } from "express";
import { db } from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// Create bill (Cashier/Manager/Owner)
router.post(
  "/create",
  requireAuth(["Owner", "Manager", "Cashier"]),
  async (req, res) => {
    // Helper function
    const round2 = (n) =>
      Math.round((Number(n) + Number.EPSILON) * 100) / 100;

    const {
      shop_id,
      customer_id,
      items,
      discount = 0,
      payment_method = "Cash",
      payment_reference = null,
      amount_paid = 0,
    } = req.body;

    if (!shop_id || !Array.isArray(items) || items.length === 0)
      return res
        .status(400)
        .json({ message: "shop_id and items are required" });

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      // Get tax percentage
      const [shopRows] = await conn.query(
        "SELECT tax_percentage FROM shops WHERE shop_id = ?",
        [shop_id]
      );
      if (!shopRows.length) throw new Error("Invalid shop");
      const taxPercent = Number(shopRows[0].tax_percentage) || 0;

      // Compute subtotal
      let subtotal = 0;
      for (const it of items) {
        const [rows] = await conn.query(
          "SELECT price, stock_quantity FROM sarees WHERE id = ? AND shop_id = ? FOR UPDATE",
          [it.saree_id, shop_id]
        );
        if (!rows.length) throw new Error("Invalid saree");
        if (rows[0].stock_quantity < it.quantity)
          throw new Error("Insufficient stock");
        subtotal += rows[0].price * it.quantity;
      }

      const cappedDiscount = Math.min(round2(discount), subtotal);
      const taxable = subtotal - cappedDiscount;
      const tax = round2(taxable * (taxPercent / 100));
      const total_amount = round2(taxable + tax);

      // Validate payment
      let status = "UNPAID";
      let paid = round2(amount_paid);
      if (payment_method === "Cash" || payment_method === "Card" || payment_method === "UPI") {
        if (paid >= total_amount) status = "PAID";
        else if (paid > 0) status = "PARTIAL";
        else status = "UNPAID";
      } else {
        throw new Error("Invalid payment_method");
      }

      // Insert bill
      const [bill] = await conn.query(
        `INSERT INTO bills
        (shop_id, customer_id, user_id, subtotal, discount, tax, total_amount, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          shop_id,
          customer_id || null,
          req.user.id,
          round2(subtotal),
          round2(cappedDiscount),
          tax,
          total_amount,
          status,
        ]
      );

      const billId = bill.insertId;

      // Insert items and update stock
      for (const it of items) {
        const [s] = await conn.query(
          "SELECT price FROM sarees WHERE id = ? AND shop_id = ?",
          [it.saree_id, shop_id]
        );
        const price = s[0].price;
        await conn.query(
          "INSERT INTO bill_items (bill_id, saree_id, quantity, price) VALUES (?, ?, ?, ?)",
          [billId, it.saree_id, it.quantity, price]
        );
        await conn.query(
          "UPDATE sarees SET stock_quantity = stock_quantity - ? WHERE id = ?",
          [it.quantity, it.saree_id]
        );
      }

      // Insert payment
      if (paid > 0) {
        await conn.query(
          "INSERT INTO payments (bill_id, method, reference, amount) VALUES (?, ?, ?, ?)",
          [billId, payment_method, payment_reference || null, paid]
        );
      }

      await conn.commit();
      res.json({
        bill_id: billId,
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


/**
 * GET /billing/:id
 * Returns bill, items, payments
 */
router.get(
  "/:id",
  requireAuth(["Owner", "Manager", "Cashier"]),
  async (req, res) => {
    const billId = req.params.id;
    const conn = await db.getConnection();
    try {
      // Bill
      const [bills] = await conn.query(
        `SELECT b.*, s.tax_percentage
           FROM bills b
           JOIN shops s ON s.shop_id = b.shop_id
          WHERE b.bill_id = ?`,
        [billId]
      );
      if (!bills.length) return res.status(404).json({ message: "Bill not found" });

      // Items
      const [items] = await conn.query(
        `SELECT bi.bill_item_id, bi.saree_id, bi.quantity, bi.price, bi.line_total,
                sa.name AS saree_name
           FROM bill_items bi
           JOIN sarees sa ON sa.id = bi.saree_id
          WHERE bi.bill_id = ?`,
        [billId]
      );

      // Payments
      const [payments] = await conn.query(
        `SELECT payment_id, method, reference, amount, created_at
           FROM payments
          WHERE bill_id = ?
          ORDER BY created_at ASC, payment_id ASC`,
        [billId]
      );

      // Sum paid
      const paid = items.length >= 0
        ? (payments || []).reduce((sum, p) => sum + Number(p.amount), 0)
        : 0;

      return res.json({
        bill: bills[0],
        items,
        payments,
        paid: round2(paid),
        due: round2(Number(bills[0].total_amount) - paid)
      });
    } catch (e) {
      return res.status(400).json({ message: e.message });
    } finally {
      conn.release();
    }
  }
);



// Get bill with items
router.get("/:bill_id", requireAuth(), async (req, res) => {
  const { bill_id } = req.params;
  const [[bill]] = await db.query("SELECT * FROM bills WHERE bill_id = ?", [bill_id]);
  if (!bill) return res.status(404).json({ message: "Not found" });
  const [items] = await db.query("SELECT * FROM bill_items WHERE bill_id = ?", [bill_id]);
  res.json({ bill, items });
});



// Get all bills by shop_id (Cashier/Manager/Owner)
router.get("/shop/:shop_id", requireAuth(["Owner", "Manager", "Cashier"]), async (req, res) => {
  const { shop_id } = req.params;
  if (!shop_id) return res.status(400).json({ message: "shop_id is required" });

  const conn = await db.getConnection();
  try {
    // Fetch all bills for the shop
    const [bills] = await conn.query(
      `SELECT b.id AS bill_id, b.customer_id, b.user_id, b.subtotal, b.discount, b.tax, b.total_amount, b.created_at,
              u.name AS cashier_name
       FROM bills b
       LEFT JOIN users u ON b.user_id = u.id
       WHERE b.shop_id = ?
       ORDER BY b.created_at DESC`,
      [shop_id]
    );

    // Optionally, fetch items for each bill
    for (const bill of bills) {
      const [items] = await conn.query(
        `SELECT bi.saree_id, s.name AS saree_name, bi.quantity, bi.price
         FROM bill_items bi
         JOIN sarees s ON bi.saree_id = s.id
         WHERE bi.bill_id = ?`,
        [bill.bill_id]
      );
      bill.items = items;
    }

    res.json({ bills });
  } catch (e) {
    res.status(400).json({ message: e.message });
  } finally {
    conn.release();
  }
});


export default router;
