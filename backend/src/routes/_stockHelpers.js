// src/routes/_stockHelpers.js
export async function addStockMovement(conn, {
  shop_id,
  saree_id,
  source_type,   // 'PURCHASE' | 'SALE' | 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT' | 'RETURN_IN' | 'RETURN_OUT'
  source_id,     // po_id / bill_id / adjustment id
  quantity_change, // +in / -out
  unit_value = null,
  note = null
}) {
  const sql = `
    INSERT INTO stock_movements (shop_id, saree_id, source_type, source_id, quantity_change, unit_value, note)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;
  const vals = [shop_id, saree_id, source_type, source_id || null, quantity_change, unit_value, note];
  await conn.query(sql, vals);
  // The AFTER INSERT trigger will update sarees.stock_quantity accordingly.
}
