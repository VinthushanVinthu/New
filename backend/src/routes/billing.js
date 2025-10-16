// routes/billing.js
import { Router } from "express";
import { db } from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const APPROVAL_REQUIRED_MESSAGE = "Manager approval required before editing this bill.";

async function assertCanManageShop(conn, user, shopId) {
  if (!Number.isFinite(Number(shopId))) {
    throw new Error("Invalid shop_id");
  }
  const id = Number(shopId);
  if (user.role === "Owner") {
    const [[shop]] = await conn.query("SELECT owner_id FROM shops WHERE shop_id = ?", [id]);
    if (!shop) throw new Error("Shop not found");
    if (shop.owner_id !== user.id) throw new Error("Forbidden");
  } else if (user.role === "Manager") {
    const [rows] = await conn.query(
      "SELECT 1 FROM user_shops WHERE user_id = ? AND shop_id = ? LIMIT 1",
      [user.id, id]
    );
    if (!rows.length) throw new Error("Forbidden");
  }
  return id;
}

async function findLatestEditRequest(conn, billId, userId) {
  const [rows] = await conn.query(
    `SELECT request_id, status, manager_note, requested_at, responded_at, used_at, request_reason
       FROM bill_edit_requests
      WHERE bill_id = ? AND requested_by = ?
      ORDER BY request_id DESC
      LIMIT 1`,
    [billId, userId]
  );
  return rows[0] || null;
}

async function ensureCashierEditApproval(conn, billId, userId) {
  const [rows] = await conn.query(
    `SELECT request_id
       FROM bill_edit_requests
      WHERE bill_id = ? AND requested_by = ?
        AND status = 'APPROVED'
        AND used_at IS NULL
      ORDER BY responded_at DESC, request_id DESC
      LIMIT 1`,
    [billId, userId]
  );
  const row = rows[0];
  if (!row) {
    const err = new Error(APPROVAL_REQUIRED_MESSAGE);
    err.code = "APPROVAL_REQUIRED";
    throw err;
  }
  return row.request_id;
}
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
      const custName = customer?.name?.trim() || null;
      const custPhone = customer?.phone?.trim() || null;
      const custEmail = customer?.email?.trim() || null;
      const hasCustomerPayload = !!(custName || custPhone || custEmail);

      if (!resolvedCustomerId && custPhone) {
        const [found] = await conn.query(
          "SELECT customer_id FROM customers WHERE shop_id = ? AND phone = ? LIMIT 1",
          [shop_id, custPhone]
        );
        if (found.length) resolvedCustomerId = found[0].customer_id;
        else if (hasCustomerPayload) {
          const [ins] = await conn.query(
            "INSERT INTO customers (shop_id, name, phone, email) VALUES (?, ?, ?, ?)",
            [shop_id, custName, custPhone, custEmail]
          );
          resolvedCustomerId = ins.insertId;
        }
      } else if (!resolvedCustomerId && hasCustomerPayload) {
        const [ins] = await conn.query(
          "INSERT INTO customers (shop_id, name, phone, email) VALUES (?, ?, ?, ?)",
          [shop_id, custName, custPhone, custEmail]
        );
        resolvedCustomerId = ins.insertId;
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
          "SELECT price, discount, stock_quantity FROM sarees WHERE id = ? AND shop_id = ? FOR UPDATE",
          [it.saree_id, shop_id]
        );
        if (!s) throw new Error("Invalid saree");
        if (Number(s.stock_quantity) < Number(it.quantity)) throw new Error("Insufficient stock");
        const unitPrice = Math.max(0, Number(s.price) - Number(s.discount || 0));
        subtotal += unitPrice * Number(it.quantity);
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

      const now = new Date();
      const billPeriod = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
      await conn.query(
        `INSERT INTO bill_sequences (shop_id, bill_period, last_sequence)
         VALUES (?, ?, 0)
         ON DUPLICATE KEY UPDATE last_sequence = last_sequence`,
        [shop_id, billPeriod]
      );
      const [[seqRow]] = await conn.query(
        `SELECT last_sequence
           FROM bill_sequences
          WHERE shop_id = ? AND bill_period = ?
          FOR UPDATE`,
        [shop_id, billPeriod]
      );
      let currentSeq = Number(seqRow?.last_sequence || 0);
      const [[maxRow]] = await conn.query(
        `SELECT COALESCE(MAX(bill_sequence), 0) AS maxSeq
           FROM bills
          WHERE shop_id = ? AND bill_period = ?`,
        [shop_id, billPeriod]
      );
      const historicalMax = Number(maxRow?.maxSeq || 0);
      if (historicalMax > currentSeq) {
        currentSeq = historicalMax;
      }
      const nextSeq = currentSeq + 1;
      await conn.query(
        `UPDATE bill_sequences
            SET last_sequence = ?
          WHERE shop_id = ? AND bill_period = ?`,
        [nextSeq, shop_id, billPeriod]
      );
      const billNumber = `${shop_id}-${billPeriod}-${String(nextSeq).padStart(4, "0")}`;

      const [bill] = await conn.query(
        `INSERT INTO bills
           (shop_id, customer_id, user_id, bill_period, bill_sequence, bill_number,
            subtotal, discount, tax, total_amount, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          shop_id,
          resolvedCustomerId,
          req.user.id,
          billPeriod,
          nextSeq,
          billNumber,
          round2(subtotal),
          round2(cappedDiscount),
          tax,
          total_amount,
          status
        ]
      );
      const billId = bill.insertId;

      for (const it of items) {
        const [[s]] = await conn.query(
          "SELECT price, discount FROM sarees WHERE id = ? AND shop_id = ?",
          [it.saree_id, shop_id]
        );
        const unitPrice = Math.max(0, Number(s?.price || 0) - Number(s?.discount || 0));
        await conn.query(
          "INSERT INTO bill_items (bill_id, saree_id, quantity, price) VALUES (?, ?, ?, ?)",
          [billId, it.saree_id, it.quantity, unitPrice]
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
        bill_number: billNumber,
        bill_period: billPeriod,
        bill_sequence: nextSeq,
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

/* ---------- EDIT APPROVAL REQUESTS (list for managers) ---------- */
router.get(
  "/edit-requests",
  requireAuth(["Owner", "Manager"]),
  async (req, res) => {
    const { shop_id, status = "PENDING" } = req.query;
    const conn = await db.getConnection();
    try {
      const shopId = await assertCanManageShop(conn, req.user, shop_id);
      const normalizedStatus = (status || "PENDING").toString().toUpperCase();
      const allowedStatuses = new Set(["PENDING", "APPROVED", "REJECTED", "USED", "ALL"]);
      if (!allowedStatuses.has(normalizedStatus)) {
        throw new Error("Invalid status filter");
      }

      const statusClause = normalizedStatus === "ALL" ? "" : "AND r.status = ?";
      const params = normalizedStatus === "ALL" ? [shopId] : [shopId, normalizedStatus];

      const [rows] = await conn.query(
        `SELECT
            r.request_id,
            r.bill_id,
            r.status,
            r.requested_at,
            r.responded_at,
            r.manager_note,
            r.approved_by,
            r.used_at,
            COALESCE(b.bill_number, CONCAT(b.shop_id, '-', b.bill_period, '-', LPAD(b.bill_sequence, 4, '0'))) AS bill_number,
            b.bill_period,
            b.bill_sequence,
            b.subtotal,
            b.discount,
            b.tax,
            b.total_amount,
            b.status AS bill_status,
            u.name AS cashier_name,
            mgr.name AS manager_name,
            c.name AS customer_name,
            r.request_reason
         FROM bill_edit_requests r
         JOIN bills b ON b.bill_id = r.bill_id
         JOIN users u ON u.id = r.requested_by
    LEFT JOIN users mgr ON mgr.id = r.approved_by
    LEFT JOIN customers c ON c.customer_id = b.customer_id
        WHERE r.shop_id = ?
          ${statusClause}
        ORDER BY r.requested_at DESC`,
        params
      );

      res.json(rows);
    } catch (e) {
      if (e.message === "Forbidden") {
        res.status(403).json({ message: e.message });
      } else {
        res.status(400).json({ message: e.message });
      }
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
      if (!bill.bill_number && bill.bill_period && bill.bill_sequence != null) {
        bill.bill_number = `${bill.shop_id}-${bill.bill_period}-${String(bill.bill_sequence).padStart(4, "0")}`;
      }
      if (req.user.role === "Cashier" && bill.user_id !== req.user.id) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const [items] = await conn.query(
        `SELECT bi.bill_item_id, bi.saree_id, bi.quantity, bi.price,
                (bi.quantity * bi.price) AS line_total,
                sa.name AS saree_name,
                sa.discount AS saree_discount
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

      let editPermission = { canEdit: true, latestRequest: null };
      if (req.user.role === "Cashier") {
        const latest = await findLatestEditRequest(conn, billId, req.user.id);
        const latestRequest = latest
          ? {
              requestId: latest.request_id,
              status: latest.status,
              managerNote: latest.manager_note,
              requestedAt: latest.requested_at,
              respondedAt: latest.responded_at,
              usedAt: latest.used_at,
              reason: latest.request_reason,
            }
          : null;
        const canEdit =
          !!latestRequest &&
          latestRequest.status === "APPROVED" &&
          !latestRequest.usedAt;
        editPermission = { canEdit, latestRequest };
      }

      res.json({
        bill,
        items,
        payments,
        paid: round2(paid),
        due: round2(Number(bill.total_amount) - paid),
        edit_permission: editPermission,
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
    const { range, start, end } = req.query;
    const isCashier = req.user.role === "Cashier";

    function buildDateFilter() {
      if (start || end) {
        const startDate = start ? new Date(start) : null;
        const endDate = end ? new Date(end) : null;
        if ((startDate && Number.isNaN(startDate.getTime())) || (endDate && Number.isNaN(endDate.getTime()))) {
          throw new Error("Invalid date filter");
        }
        return {
          start: startDate ? startDate.toISOString().slice(0, 19).replace("T", " ") : null,
          end: endDate ? endDate.toISOString().slice(0, 19).replace("T", " ") : null
        };
      }

      const now = new Date();
      switch ((range || "").toLowerCase()) {
        case "today": {
          const startDate = new Date(now);
          startDate.setHours(0, 0, 0, 0);
          const endDate = new Date(startDate);
          endDate.setDate(endDate.getDate() + 1);
          return {
            start: startDate.toISOString().slice(0, 19).replace("T", " "),
            end: endDate.toISOString().slice(0, 19).replace("T", " ")
          };
        }
        case "month": {
          const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
          return {
            start: startDate.toISOString().slice(0, 19).replace("T", " "),
            end: endDate.toISOString().slice(0, 19).replace("T", " ")
          };
        }
        case "year": {
          const startDate = new Date(now.getFullYear(), 0, 1);
          const endDate = new Date(now.getFullYear() + 1, 0, 1);
          return {
            start: startDate.toISOString().slice(0, 19).replace("T", " "),
            end: endDate.toISOString().slice(0, 19).replace("T", " ")
          };
        }
        default:
          return { start: null, end: null };
      }
    }

    const conn = await db.getConnection();
    try {
      const { start: startBound, end: endBound } = buildDateFilter();
      const dateClause = startBound || endBound ? " AND b.created_at BETWEEN ? AND ?" : "";
      const dateParams = startBound || endBound ? [startBound || "1970-01-01 00:00:00", endBound || "2999-12-31 23:59:59"] : [];

      let rows;
      if (isCashier) {
        // Cashier sees only their own bills for this shop
        [rows] = await conn.query(
          `SELECT b.bill_id, b.bill_number, b.bill_period, b.bill_sequence,
                  b.customer_id, b.user_id, b.subtotal, b.discount, b.tax, b.total_amount, b.status, b.created_at,
                  u.name AS cashier_name
             FROM bills b
        LEFT JOIN users u ON b.user_id = u.id
            WHERE b.shop_id = ? AND b.user_id = ?${dateClause}
            ORDER BY b.created_at DESC`,
          [shop_id, req.user.id, ...dateParams]
        );
      } else {
        // Owner/Manager see all bills for this shop
        [rows] = await conn.query(
          `SELECT b.bill_id, b.bill_number, b.bill_period, b.bill_sequence,
                  b.customer_id, b.user_id, b.subtotal, b.discount, b.tax, b.total_amount, b.status, b.created_at,
                  u.name AS cashier_name
             FROM bills b
        LEFT JOIN users u ON b.user_id = u.id
            WHERE b.shop_id = ?${dateClause}
            ORDER BY b.created_at DESC`,
          [shop_id, ...dateParams]
        );
      }
      const summary = rows.reduce(
        (acc, row) => {
          acc.count += 1;
          acc.subtotal += Number(row.subtotal || 0);
          acc.discount += Number(row.discount || 0);
          acc.tax += Number(row.tax || 0);
          acc.total += Number(row.total_amount || 0);
          return acc;
        },
        { count: 0, subtotal: 0, discount: 0, tax: 0, total: 0 }
      );
      res.json({ bills: rows, summary, range: range || null, start: startBound, end: endBound });
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
    const { shop_id, range, start, end } = req.query;
    if (!shop_id) return res.status(400).json({ message: "shop_id is required" });

    const now = new Date();
    let startBound = null;
    let endBound = null;
    if (start || end) {
      const startDate = start ? new Date(start) : null;
      const endDate = end ? new Date(end) : null;
      if ((startDate && Number.isNaN(startDate.getTime())) || (endDate && Number.isNaN(endDate.getTime()))) {
        return res.status(400).json({ message: "Invalid date filter" });
      }
      startBound = startDate ? startDate.toISOString().slice(0, 19).replace("T", " ") : null;
      endBound = endDate ? endDate.toISOString().slice(0, 19).replace("T", " ") : null;
    } else {
      switch ((range || "").toLowerCase()) {
        case "today": {
          const startDate = new Date(now);
          startDate.setHours(0, 0, 0, 0);
          const endDate = new Date(startDate);
          endDate.setDate(endDate.getDate() + 1);
          startBound = startDate.toISOString().slice(0, 19).replace("T", " ");
          endBound = endDate.toISOString().slice(0, 19).replace("T", " ");
          break;
        }
        case "month": {
          const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
          startBound = startDate.toISOString().slice(0, 19).replace("T", " ");
          endBound = endDate.toISOString().slice(0, 19).replace("T", " ");
          break;
        }
        case "year": {
          const startDate = new Date(now.getFullYear(), 0, 1);
          const endDate = new Date(now.getFullYear() + 1, 0, 1);
          startBound = startDate.toISOString().slice(0, 19).replace("T", " ");
          endBound = endDate.toISOString().slice(0, 19).replace("T", " ");
          break;
        }
        default:
          break;
      }
    }

    const dateClause = startBound || endBound ? " AND b.created_at BETWEEN ? AND ?" : "";
    const dateParams = startBound || endBound ? [startBound || "1970-01-01 00:00:00", endBound || "2999-12-31 23:59:59"] : [];

    const [rows] = await db.query(
      `SELECT b.bill_id, b.bill_number, b.bill_period, b.bill_sequence,
              b.customer_id, b.user_id, b.subtotal, b.discount, b.tax, b.total_amount, b.status, b.created_at
         FROM bills b
        WHERE b.shop_id = ? AND b.user_id = ?${dateClause}
        ORDER BY b.created_at DESC`,
     [shop_id, req.user.id, ...dateParams]
    );

    const summary = rows.reduce(
      (acc, row) => {
        acc.count += 1;
        acc.subtotal += Number(row.subtotal || 0);
        acc.discount += Number(row.discount || 0);
        acc.tax += Number(row.tax || 0);
        acc.total += Number(row.total_amount || 0);
        return acc;
      },
      { count: 0, subtotal: 0, discount: 0, tax: 0, total: 0 }
    );
    res.json({ bills: rows, summary, range: range || null, start: startBound, end: endBound });
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
      let approvalRequestId = null;
      if (req.user.role === "Cashier") {
        if (bill.user_id !== req.user.id) throw new Error("Forbidden");
        approvalRequestId = await ensureCashierEditApproval(conn, bill.bill_id, req.user.id);
      }

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

      if (approvalRequestId) {
        await conn.query(
          "UPDATE bill_edit_requests SET status = 'USED', used_at = NOW() WHERE request_id = ? AND status = 'APPROVED'",
          [approvalRequestId]
        );
      }

      await conn.commit();
      res.json({ bill_id, subtotal: round2(subtotal), discount: round2(cappedDiscount), tax, total_amount, paid: round2(paid), status });
    } catch (e) {
      await conn.rollback();
      if (e.code === "APPROVAL_REQUIRED") {
        res.status(403).json({ message: e.message, reason: "APPROVAL_REQUIRED" });
      } else {
        res.status(400).json({ message: e.message });
      }
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
      let approvalRequestId = null;
      if (req.user.role === "Cashier") {
        if (bill.user_id !== req.user.id) throw new Error("Forbidden");
        approvalRequestId = await ensureCashierEditApproval(conn, bill.bill_id, req.user.id);
      }

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
        const [[s]] = await conn.query("SELECT price, discount FROM sarees WHERE id = ? AND shop_id = ?", [sid, bill.shop_id]);
        const unitPrice = Math.max(0, Number(s?.price || 0) - Number(s?.discount || 0));
        subtotal += unitPrice * qty;
        await conn.query(
          "INSERT INTO bill_items (bill_id, saree_id, quantity, price) VALUES (?, ?, ?, ?)",
          [bill_id, sid, qty, unitPrice]
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

      if (approvalRequestId) {
        await conn.query(
          "UPDATE bill_edit_requests SET status = 'USED', used_at = NOW() WHERE request_id = ? AND status = 'APPROVED'",
          [approvalRequestId]
        );
      }

      await conn.commit();
      res.json({ bill_id, subtotal: round2(subtotal), discount: round2(cappedDiscount), tax, total_amount, paid: round2(paid), status });
    } catch (e) {
      await conn.rollback();
      if (e.code === "APPROVAL_REQUIRED") {
        res.status(403).json({ message: e.message, reason: "APPROVAL_REQUIRED" });
      } else {
        res.status(400).json({ message: e.message });
      }
    } finally {
      conn.release();
    }
  }
);

/* ---------- EDIT APPROVAL REQUESTS ---------- */
router.post(
  "/:bill_id/edit-requests",
  requireAuth(["Cashier"]),
  async (req, res) => {
    const { bill_id } = req.params;
    const reasonRaw = (req.body?.reason ?? "").toString().trim();
    if (!reasonRaw) {
      return res.status(400).json({ message: "reason is required" });
    }
    const reason = reasonRaw.slice(0, 255);
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const [[bill]] = await conn.query(
        "SELECT bill_id, shop_id, user_id FROM bills WHERE bill_id = ? FOR UPDATE",
        [bill_id]
      );
      if (!bill) throw new Error("Bill not found");
      if (bill.user_id !== req.user.id) throw new Error("Forbidden");

      const [existingRows] = await conn.query(
        `SELECT request_id, status
           FROM bill_edit_requests
          WHERE bill_id = ? AND requested_by = ?
            AND status IN ('PENDING','APPROVED')
          ORDER BY request_id DESC
          LIMIT 1`,
        [bill_id, req.user.id]
      );
      const existing = existingRows[0] || null;
      if (existing) {
        throw Object.assign(new Error(`Existing ${existing.status.toLowerCase()} request already covers this bill.`), {
          code: "REQUEST_EXISTS",
          status: existing.status,
        });
      }

      await conn.query(
        "INSERT INTO bill_edit_requests (bill_id, shop_id, requested_by, request_reason) VALUES (?, ?, ?, ?)",
        [bill.bill_id, bill.shop_id, req.user.id, reason]
      );

      await conn.commit();
      res.status(201).json({ message: "Approval request submitted" });
    } catch (e) {
      await conn.rollback();
      if (e.message === "Forbidden") {
        res.status(403).json({ message: e.message });
      } else if (e.code === "REQUEST_EXISTS") {
        res.status(409).json({ message: e.message, status: e.status });
      } else {
        res.status(400).json({ message: e.message });
      }
    } finally {
      conn.release();
    }
  }
);

function resolveEditRequest(newStatus) {
  return async (req, res) => {
    const { request_id } = req.params;
    const { note } = req.body || {};
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const [[request]] = await conn.query(
        `SELECT r.*, s.owner_id
           FROM bill_edit_requests r
           JOIN shops s ON s.shop_id = r.shop_id
          WHERE r.request_id = ? FOR UPDATE`,
        [request_id]
      );
      if (!request) throw new Error("Request not found");
      if (request.status !== "PENDING") throw new Error("Request already processed");

      await assertCanManageShop(conn, req.user, request.shop_id);

      await conn.query(
        `UPDATE bill_edit_requests
            SET status = ?, manager_note = ?, approved_by = ?, responded_at = NOW()
          WHERE request_id = ?`,
        [
          newStatus,
          note ? String(note).slice(0, 255) : null,
          req.user.id,
          request_id
        ]
      );

      await conn.commit();
      res.json({ request_id: Number(request_id), status: newStatus });
    } catch (e) {
      await conn.rollback();
      if (e.message === "Forbidden") {
        res.status(403).json({ message: e.message });
      } else {
        res.status(400).json({ message: e.message });
      }
    } finally {
      conn.release();
    }
  };
}

router.post(
  "/edit-requests/:request_id/approve",
  requireAuth(["Owner", "Manager"]),
  resolveEditRequest("APPROVED")
);

router.post(
  "/edit-requests/:request_id/reject",
  requireAuth(["Owner", "Manager"]),
  resolveEditRequest("REJECTED")
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
