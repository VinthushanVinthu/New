// src/routes/purchaseOrders.js
import { Router } from "express";
import { db } from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";
import { addStockMovement } from "./_stockHelpers.js";
import { sendEmail } from "../utils/mailer.js";
import { buildPurchaseOrderEmailContent } from "../utils/emailTemplates.js";

const router = Router();
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** Create a PO in DRAFT */
router.post("/po", requireAuth(["Owner","Manager"]), async (req, res) => {
  const { shop_id, supplier_id, notes } = req.body;
  if (!shop_id || !supplier_id) return res.status(400).json({ message: "shop_id and supplier_id required" });
  const [r] = await db.query(
    `INSERT INTO purchase_orders (shop_id, supplier_id, status, notes) VALUES (?, ?, 'DRAFT', ?)`,
    [shop_id, supplier_id, notes || null]
  );
  res.json({ po_id: r.insertId });
});

/** Add/replace PO items (works for DRAFT only) */
router.post("/po/:po_id/items", requireAuth(["Owner","Manager"]), async (req, res) => {
  const { po_id } = req.params;
  const { items, notes, supplier_id } = req.body; // [{saree_id, qty_ordered, unit_cost}]
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: "items[] required" });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // ensure PO is DRAFT
    const [[po]] = await conn.query(`SELECT status FROM purchase_orders WHERE po_id = ?`, [po_id]);
    if (!po) throw new Error("PO not found");
    if (po.status !== 'DRAFT') throw new Error("Only DRAFT POs can be edited");

    // optional metadata updates (notes, supplier)
    const updates = [];
    const updateVals = [];
    if (supplier_id !== undefined) {
      const sid = Number(supplier_id);
      if (!Number.isFinite(sid) || sid <= 0) throw new Error("supplier_id must be positive");
      updates.push("supplier_id = ?");
      updateVals.push(sid);
    }
    if (notes !== undefined) {
      updates.push("notes = ?");
      updateVals.push(notes || null);
    }
    if (updates.length) {
      updateVals.push(po_id);
      await conn.query(`UPDATE purchase_orders SET ${updates.join(", ")} WHERE po_id = ?`, updateVals);
    }

    // clear existing items
    await conn.query(`DELETE FROM purchase_order_items WHERE po_id = ?`, [po_id]);

    // insert items
    const insertSql = `
      INSERT INTO purchase_order_items (po_id, saree_id, qty_ordered, qty_received, unit_cost)
      VALUES (?, ?, ?, 0, ?)
    `;
    for (const it of items) {
      if (!it.saree_id || !it.qty_ordered) throw new Error("saree_id and qty_ordered required for all items");
      await conn.query(insertSql, [po_id, it.saree_id, it.qty_ordered, Number(it.unit_cost || 0)]);
    }

    // recompute totals
    await conn.query(`
      UPDATE purchase_orders po
      JOIN (
        SELECT po_id, 
               COALESCE(SUM(qty_ordered * unit_cost), 0) AS sub_total
        FROM purchase_order_items
        WHERE po_id = ?
      ) x ON x.po_id = po.po_id
      SET po.sub_total = x.sub_total,
          po.total_amount = GREATEST(0, x.sub_total - po.discount + po.tax)
    `, [po_id]);

    await conn.commit();
    res.json({ ok: true });
  } catch (e) {
    await conn.rollback();
    res.status(400).json({ message: e.message || 'Failed to add items' });
  } finally {
    conn.release();
  }
});

/** Submit PO (DRAFT -> ORDERED) */
router.post("/po/:po_id/submit", requireAuth(["Owner","Manager"]), async (req, res) => {
  const { po_id } = req.params;
  const conn = await db.getConnection();
  let emailJob = null;
  try {
    await conn.beginTransaction();

    const [[po]] = await conn.query(
      `SELECT * FROM purchase_orders WHERE po_id = ? FOR UPDATE`,
      [po_id]
    );
    if (!po) throw new Error("PO not found");
    if (po.status !== 'DRAFT') throw new Error("Only DRAFT POs can be submitted");

    const [[supplier]] = await conn.query(
      `SELECT name, email, phone FROM suppliers WHERE supplier_id = ?`,
      [po.supplier_id]
    );
    if (!supplier) throw new Error("Supplier not found");

    const [[shopRow]] = await conn.query(
      `SELECT shop_name FROM shops WHERE shop_id = ?`,
      [po.shop_id]
    );
    const shopName = shopRow?.shop_name || `Shop ${po.shop_id}`;

    const [items] = await conn.query(
      `SELECT poi.*, s.shop_id, s.name AS saree_name
       FROM purchase_order_items poi
       JOIN sarees s ON s.id = poi.saree_id
       WHERE poi.po_id = ?`,
      [po_id]
    );

    if (!items.length) {
      throw new Error("Cannot submit PO without items");
    }
    const hasInvalidQty = items.some((it) => {
      const ordered = Number(it.qty_ordered);
      return !Number.isFinite(ordered) || ordered <= 0;
    });
    if (hasInvalidQty) {
      throw new Error("All items must have a positive qty_ordered before submitting");
    }

    const lineItems = [];
    let computedSubtotal = 0;
    for (const it of items) {
      const ordered = Number(it.qty_ordered);
      const unitCost = Number(it.unit_cost) || 0;
      const lineTotal = unitCost * ordered;
      computedSubtotal += lineTotal;
      lineItems.push({
        saree_id: it.saree_id,
        name: it.saree_name || `Item ${it.saree_id}`,
        quantity: ordered,
        unit_price: round2(unitCost),
        line_total: round2(lineTotal),
      });
    }

    const subtotal = round2(computedSubtotal);
    const discount = round2(Number(po.discount) || 0);
    const tax = round2(Number(po.tax) || 0);
    const total = round2(Math.max(0, computedSubtotal - discount + tax));
    const now = new Date();

    await conn.query(
      `UPDATE purchase_orders 
         SET status='ORDERED',
             ordered_at = COALESCE(ordered_at, ?),
             received_at = NULL
       WHERE po_id = ?`,
      [now, po_id]
    );

    const supplierEmail = supplier.email ? String(supplier.email).trim() : "";
    if (supplierEmail) {
      const poNumber = `PO-${String(po_id).padStart(5, "0")}`;
      const contactEmail =
        (process.env.PO_CONTACT_EMAIL ||
          process.env.SMTP_FROM ||
          process.env.SMTP_USER ||
          "")
          .toString()
          .trim() || null;

      const { subject, text, html } = buildPurchaseOrderEmailContent({
        shopName,
        supplierName: supplier.name || "Supplier",
        poNumber,
        createdAt: now,
        items: lineItems,
        subtotal,
        discount,
        tax,
        total,
        notes: po.notes ? String(po.notes).trim() : "",
        contactEmail,
      });

      emailJob = () =>
        sendEmail({
          to: supplierEmail,
          subject,
          text,
          html,
        });
    }

    await conn.commit();
    res.json({ ok: true });

    if (emailJob) {
      emailJob().catch((err) => {
        console.error(`Failed to send purchase order email for PO ${po_id}:`, err?.message || err);
      });
    }
  } catch (e) {
    await conn.rollback();
    res.status(400).json({ message: e.message || "Failed to submit PO" });
  } finally {
    conn.release();
  }
});

/** Receive items (partial allowed). Creates stock movements. */
router.post("/po/:po_id/receive", requireAuth(["Owner","Manager"]), async (req, res) => {
  const { po_id } = req.params;
  const { items } = req.body; // [{po_item_id, qty}] to receive now

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: "items[] required" });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // load PO
    const [[po]] = await conn.query(`SELECT * FROM purchase_orders WHERE po_id = ?`, [po_id]);
    if (!po) throw new Error("PO not found");
    if (!['ORDERED','RECEIVED'].includes(po.status)) throw new Error("PO must be ORDERED or RECEIVED to receive items");

    // update each item receive qty
    for (const it of items) {
      const { po_item_id, qty } = it;
      if (!po_item_id || !Number.isFinite(Number(qty)) || Number(qty) <= 0) {
        throw new Error("po_item_id and positive qty required");
      }

      const [[row]] = await conn.query(
        `SELECT poi.*, s.shop_id FROM purchase_order_items poi
         JOIN purchase_orders p ON p.po_id = poi.po_id
         JOIN sarees s ON s.id = poi.saree_id
         WHERE poi.po_item_id = ? AND poi.po_id = ?`,
        [po_item_id, po_id]
      );
      if (!row) throw new Error(`PO item ${po_item_id} not found for this PO`);
      const remaining = row.qty_ordered - row.qty_received;
      const receiveNow = Math.min(remaining, Number(qty));
      if (receiveNow <= 0) continue;

      // apply qty_received
      await conn.query(
        `UPDATE purchase_order_items SET qty_received = qty_received + ? WHERE po_item_id = ?`,
        [receiveNow, po_item_id]
      );

      // stock movement (PURCHASE, +qty)
      await addStockMovement(conn, {
        shop_id: row.shop_id,
        saree_id: row.saree_id,
        source_type: 'PURCHASE',
        source_id: Number(po_id),
        quantity_change: receiveNow,
        unit_value: row.unit_cost,
        note: 'PO Receive'
      });
    }

    // check if fully received
    const [[agg]] = await conn.query(
      `SELECT 
         SUM(qty_ordered) AS ordered_sum,
         SUM(qty_received) AS received_sum
       FROM purchase_order_items WHERE po_id = ?`,
      [po_id]
    );

    const fullyReceived = Number(agg.received_sum || 0) >= Number(agg.ordered_sum || 0);

    // update PO status/timestamps
    if (fullyReceived) {
      await conn.query(
        `UPDATE purchase_orders SET status='RECEIVED', received_at = COALESCE(received_at, ?) WHERE po_id = ?`,
        [new Date(), po_id]
      );
    } else {
      // ensure at least ORDERED
      await conn.query(
        `UPDATE purchase_orders SET status='ORDERED' WHERE po_id = ? AND status='DRAFT'`,
        [po_id]
      );
    }

    await conn.commit();
    res.json({ ok: true, fullyReceived });
  } catch (e) {
    await conn.rollback();
    res.status(400).json({ message: e.message || "Failed to receive PO" });
  } finally {
    conn.release();
  }
});

/** Get PO + items */
router.get("/po/:po_id", requireAuth(), async (req, res) => {
  const { po_id } = req.params;
  const [[po]] = await db.query(`SELECT * FROM purchase_orders WHERE po_id = ?`, [po_id]);
  if (!po) return res.status(404).json({ message: "PO not found" });
  const [items] = await db.query(
    `SELECT poi.*, s.name AS saree_name
     FROM purchase_order_items poi
     LEFT JOIN sarees s ON s.id = poi.saree_id
     WHERE poi.po_id = ?`,
    [po_id]
  );
  res.json({ po, items });
});

/** List POs (by shop, optional supplier, status, q) */
router.get("/po", requireAuth(), async (req, res) => {
  const { shop_id, supplier_id, status, q, range, start, end } = req.query;
  if (!shop_id) return res.status(400).json({ message: "shop_id required" });

  let sql = `
    SELECT po.*, sup.name AS supplier_name
    FROM purchase_orders po
    JOIN suppliers sup ON sup.supplier_id = po.supplier_id
    WHERE po.shop_id = ?
  `;
  const vals = [shop_id];

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

  if (supplier_id) { sql += " AND po.supplier_id = ?"; vals.push(supplier_id); }
  if (status) { sql += " AND po.status = ?"; vals.push(status); }
  if (q) {
    sql += " AND (sup.name LIKE ? OR po.notes LIKE ?)";
    vals.push(`%${q}%`, `%${q}%`);
  }
  if (startBound || endBound) {
    sql += " AND po.created_at BETWEEN ? AND ?";
    vals.push(startBound || "1970-01-01 00:00:00", endBound || "2999-12-31 23:59:59");
  }
  sql += " ORDER BY po.created_at DESC, po.po_id DESC";

  const [rows] = await db.query(sql, vals);

  const summary = rows.reduce(
    (acc, row) => {
      acc.count += 1;
      acc.subtotal += Number(row.sub_total || 0);
      acc.discount += Number(row.discount || 0);
      acc.tax += Number(row.tax || 0);
      acc.total += Number(row.total_amount || 0);
      return acc;
    },
    { count: 0, subtotal: 0, discount: 0, tax: 0, total: 0 }
  );

  res.json({ purchase_orders: rows, summary, range: range || null, start: startBound, end: endBound });
});

export default router;
