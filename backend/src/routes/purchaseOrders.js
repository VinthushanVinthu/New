// src/routes/purchaseOrders.js
import { Router } from "express";
import { db } from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";
import { addStockMovement } from "./_stockHelpers.js";

const router = Router();

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
  const { items } = req.body; // [{saree_id, qty_ordered, unit_cost}]
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
  const now = new Date();
  await db.query(
    `UPDATE purchase_orders SET status='ORDERED', ordered_at = ? WHERE po_id = ? AND status='DRAFT'`,
    [now, po_id]
  );
  res.json({ ok: true });
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
  const { shop_id, supplier_id, status, q } = req.query;
  if (!shop_id) return res.status(400).json({ message: "shop_id required" });

  let sql = `
    SELECT po.*, sup.name AS supplier_name
    FROM purchase_orders po
    JOIN suppliers sup ON sup.supplier_id = po.supplier_id
    WHERE po.shop_id = ?
  `;
  const vals = [shop_id];

  if (supplier_id) { sql += " AND po.supplier_id = ?"; vals.push(supplier_id); }
  if (status) { sql += " AND po.status = ?"; vals.push(status); }
  if (q) {
    sql += " AND (sup.name LIKE ? OR po.notes LIKE ?)";
    vals.push(`%${q}%`, `%${q}%`);
  }
  sql += " ORDER BY po.created_at DESC, po.po_id DESC";

  const [rows] = await db.query(sql, vals);
  res.json(rows);
});

export default router;
