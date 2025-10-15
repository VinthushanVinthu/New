// src/pages/PurchaseOrders.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import '../styles/Inventory.css';

export default function PurchaseOrders() {
  const [shop, setShop] = useState(null);
  const [suppliers, setSuppliers] = useState([]);
  const [sarees, setSarees] = useState([]);
  const [pos, setPos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');

  // create/edit PO modal
  const [showForm, setShowForm] = useState(false);
  const [formSaving, setFormSaving] = useState(false);
  const [poId, setPoId] = useState(null);
  const [poSupplierId, setPoSupplierId] = useState('');
  const [poNotes, setPoNotes] = useState('');
  const [poItems, setPoItems] = useState([]); // [{saree_id, qty_ordered, unit_cost, tmpId}]

  // receive modal
  const [showReceive, setShowReceive] = useState(false);
  const [receivingPo, setReceivingPo] = useState(null);
  const [receiveMap, setReceiveMap] = useState({}); // po_item_id -> qty to receive now

  async function loadBase() {
    try {
      setLoading(true); setErr('');
      const shops = await api.get('/shop/my');
      const s = shops.data?.[0]; setShop(s || null);
      if (s?.shop_id) {
        const [supRes, sareeRes, poRes] = await Promise.all([
          api.get('/inventory/suppliers', { params: { shop_id: s.shop_id } }),
          api.get('/inventory/sarees', { params: { shop_id: s.shop_id } }),
          api.get('/inventory/po', { params: { shop_id: s.shop_id } })
        ]);
        setSuppliers(supRes.data || []);
        setSarees(sareeRes.data || []);
        setPos(poRes.data || []);
      } else {
        setSuppliers([]); setSarees([]); setPos([]);
      }
    } catch (e) {
      setErr(e?.response?.data?.message || 'Failed to load purchase orders.');
    } finally {
      setLoading(false);
    }
  }

  async function reloadPOList() {
    if (!shop?.shop_id) return;
    const { data } = await api.get('/inventory/po', { params: { shop_id: shop.shop_id, q: q || undefined } });
    setPos(Array.isArray(data) ? data : []);
  }

  useEffect(() => { loadBase(); /* eslint-disable-next-line */ }, []);

  // filtering
  const filtered = useMemo(() => {
    const s = (q || '').toLowerCase();
    if (!s) return pos;
    return pos.filter(p =>
      [p.supplier_name, p.status, p.notes].filter(Boolean).some(v => String(v).toLowerCase().includes(s))
    );
  }, [pos, q]);

  // ---- Create/Edit flow (DRAFT) ----
  function startCreate() {
    setPoId(null);
    setPoSupplierId('');
    setPoNotes('');
    setPoItems([]);
    setShowForm(true);
  }

  function addItemRow() {
    setPoItems(prev => [...prev, { tmpId: crypto.randomUUID(), saree_id: '', qty_ordered: 1, unit_cost: 0 }]);
  }
  function updateItemRow(tmpId, patch) {
    setPoItems(prev => prev.map(x => x.tmpId === tmpId ? { ...x, ...patch } : x));
  }
  function removeItemRow(tmpId) {
    setPoItems(prev => prev.filter(x => x.tmpId !== tmpId));
  }

  async function saveDraftAndItems() {
    if (!shop?.shop_id) return;
    if (!poSupplierId) { alert('Select supplier'); return; }
    if (poItems.length === 0) { alert('Add at least one item'); return; }

    setFormSaving(true);
    try {
      // 1) create PO if new
      let createdId = poId;
      if (!createdId) {
        const res = await api.post('/inventory/po', {
          shop_id: shop.shop_id,
          supplier_id: Number(poSupplierId),
          notes: poNotes || null
        });
        createdId = res.data.po_id;
        setPoId(createdId);
      } else {
        // update notes/supplier if needed (simple path: we ignore for brevity or add a PUT if you prefer)
      }

      // 2) add/replace items
      const payloadItems = poItems.map(it => ({
        saree_id: Number(it.saree_id),
        qty_ordered: Number(it.qty_ordered || 0),
        unit_cost: Number(it.unit_cost || 0)
      }));
      await api.post(`/inventory/po/${createdId}/items`, { items: payloadItems });

      // 3) refresh list & close
      await reloadPOList();
      setShowForm(false);
    } catch (e) {
      alert(e?.response?.data?.message || 'Failed to save PO');
    } finally {
      setFormSaving(false);
    }
  }

  async function submitPO() {
    try {
      setFormSaving(true);
      await api.post(`/inventory/po/${poId}/submit`);
      await reloadPOList();
      setShowForm(false);
    } catch (e) {
      alert(e?.response?.data?.message || 'Failed to submit PO');
    } finally {
      setFormSaving(false);
    }
  }

  // ---- Receive flow ----
  async function openReceive(po) {
    try {
      const { data } = await api.get(`/inventory/po/${po.po_id}`);
      setReceivingPo(data);
      const map = {};
      (data.items || []).forEach(it => { map[it.po_item_id] = 0; });
      setReceiveMap(map);
      setShowReceive(true);
    } catch (e) {
      alert(e?.response?.data?.message || 'Failed to load PO details');
    }
  }

  async function doReceive() {
    try {
      const items = Object.entries(receiveMap)
        .map(([po_item_id, qty]) => ({ po_item_id: Number(po_item_id), qty: Number(qty || 0) }))
        .filter(x => x.qty > 0);
      if (items.length === 0) { alert('Enter at least one qty to receive'); return; }
      await api.post(`/inventory/po/${receivingPo.po.po_id}/receive`, { items });
      await reloadPOList();
      setShowReceive(false);
    } catch (e) {
      alert(e?.response?.data?.message || 'Failed to receive');
    }
  }

  return (
    <div className="inventory-page">
      <div className="card">
        <div className="section-header">
          <h3>Purchase Orders</h3>
          <div className="section-actions" style={{ gap: 8, display: 'flex', alignItems: 'center' }}>
            <input className="form-input" placeholder="Search supplier/status/notes…"
              value={q} onChange={e => setQ(e.target.value)} style={{ width: 280 }}/>
            <button className="btn-outline" onClick={reloadPOList}>↻ Refresh</button>
            <button className="btn btn--primary" onClick={startCreate}>+ New PO</button>
          </div>
        </div>

        {err && <div className="error-msg" style={{ marginBottom: 12 }}>{err}</div>}

        {loading ? (
          <div className="loading">Loading…</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>#</th><th>Supplier</th><th>Status</th><th>Ordered</th><th>Received</th><th>Total</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
              {(filtered || []).length === 0 ? (
                <tr><td colSpan={7} className="empty">No POs.</td></tr>
              ) : filtered.map(p => (
                <tr key={p.po_id}>
                  <td>PO-{p.po_id}</td>
                  <td>{p.supplier_name}</td>
                  <td>{p.status}</td>
                  <td>{p.ordered_at ? new Date(p.ordered_at).toLocaleString() : '-'}</td>
                  <td>{p.received_at ? new Date(p.received_at).toLocaleString() : '-'}</td>
                  <td>{Number(p.total_amount).toFixed(2)}</td>
                  <td>
                    <div className="row-actions" style={{ display:'flex', gap:8 }}>
                      {p.status === 'DRAFT' && (
                        <button className="btn-ghost" onClick={async () => {
                          // Re-open for edit: load items & supplier
                          try {
                            const { data } = await api.get(`/inventory/po/${p.po_id}`);
                            setPoId(p.po_id);
                            setPoSupplierId(p.supplier_id || '');
                            setPoNotes(p.notes || '');
                            setPoItems((data.items || []).map(it => ({
                              tmpId: crypto.randomUUID(),
                              saree_id: it.saree_id,
                              qty_ordered: it.qty_ordered,
                              unit_cost: it.unit_cost
                            })));
                            setShowForm(true);
                          } catch (e) {
                            alert(e?.response?.data?.message || 'Failed to open PO');
                          }
                        }}>Edit</button>
                      )}
                      {p.status !== 'CANCELLED' && p.status !== 'RECEIVED' && (
                        <button className="btn-ghost" onClick={() => openReceive(p)}>Receive</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Create/Edit PO */}
      {showForm && (
        <div className="modal-backdrop" onClick={() => !formSaving && setShowForm(false)}>
          <div className="modal-body card" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="modal-header">
              <h3>{poId ? `✏️ Edit PO #${poId}` : '➕ New Purchase Order'}</h3>
              <button className="btn-close" onClick={() => setShowForm(false)} disabled={formSaving}>×</button>
            </div>
            <div className="modal-content">
              <div className="form-grid">
                <div className="form-row">
                  <label>Supplier <span className="req">*</span></label>
                  <select className="form-input" value={poSupplierId} onChange={e => setPoSupplierId(e.target.value)} required>
                    <option value="">Select supplier…</option>
                    {(suppliers || []).map(s => (
                      <option key={s.supplier_id} value={s.supplier_id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-row">
                  <label>Notes</label>
                  <input className="form-input" value={poNotes} onChange={e => setPoNotes(e.target.value)} placeholder="Optional"/>
                </div>

                <div className="form-row">
                  <label>Items</label>
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Saree</th><th>Qty</th><th>Unit Cost</th><th>Line Total</th><th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                      {poItems.length === 0 ? (
                        <tr><td colSpan={5} className="empty">No items. Add one.</td></tr>
                      ) : poItems.map(row => {
                        const sel = sarees.find(s => s.id === Number(row.saree_id));
                        const line = Number(row.qty_ordered || 0) * Number(row.unit_cost || 0);
                        return (
                          <tr key={row.tmpId}>
                            <td>
                              <select className="form-input" value={row.saree_id}
                                onChange={e => updateItemRow(row.tmpId, { saree_id: e.target.value })}>
                                <option value="">Select saree…</option>
                                {(sarees || []).map(s => (
                                  <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                              </select>
                            </td>
                            <td>
                              <input className="form-input" type="number" min="1" step="1"
                                value={row.qty_ordered}
                                onChange={e => updateItemRow(row.tmpId, { qty_ordered: e.target.value })}/>
                            </td>
                            <td>
                              <input className="form-input" type="number" min="0" step="0.01"
                                value={row.unit_cost}
                                onChange={e => updateItemRow(row.tmpId, { unit_cost: e.target.value })}/>
                            </td>
                            <td>{Number(line).toFixed(2)}</td>
                            <td><button className="btn-danger-ghost" onClick={() => removeItemRow(row.tmpId)}>Remove</button></td>
                          </tr>
                        );
                      })}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <button className="btn-ghost" onClick={addItemRow}>+ Add Item</button>
                  </div>
                </div>

                <div className="modal-actions">
                  <button className="btn-outline" onClick={() => setShowForm(false)} disabled={formSaving}>Cancel</button>
                  <button className="btn" onClick={saveDraftAndItems} disabled={formSaving}>{formSaving ? 'Saving…' : 'Save Items'}</button>
                  {poId && (
                    <button className="btn btn--primary" onClick={submitPO} disabled={formSaving}>Submit PO</button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Receive */}
      {showReceive && receivingPo && (
        <div className="modal-backdrop" onClick={() => setShowReceive(false)}>
          <div className="modal-body card" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="modal-header">
              <h3>Receive Items — PO #{receivingPo.po.po_id}</h3>
              <button className="btn-close" onClick={() => setShowReceive(false)}>×</button>
            </div>
            <div className="modal-content">
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Saree</th><th>Ordered</th><th>Received</th><th>Remaining</th><th>Receive Now</th>
                    </tr>
                  </thead>
                  <tbody>
                  {(receivingPo.items || []).map(it => {
                    const remaining = it.qty_ordered - it.qty_received;
                    return (
                      <tr key={it.po_item_id} className={remaining <= 0 ? 'low-qty' : ''}>
                        <td>{it.saree_name || it.saree_id}</td>
                        <td>{it.qty_ordered}</td>
                        <td>{it.qty_received}</td>
                        <td>{remaining}</td>
                        <td>
                          <input className="form-input" type="number" min="0" max={remaining} step="1"
                            value={receiveMap[it.po_item_id] ?? 0}
                            onChange={e => setReceiveMap(prev => ({ ...prev, [it.po_item_id]: e.target.value }))}/>
                        </td>
                      </tr>
                    );
                  })}
                  </tbody>
                </table>
              </div>
              <div className="modal-actions">
                <button className="btn-outline" onClick={() => setShowReceive(false)}>Cancel</button>
                <button className="btn btn--primary" onClick={doReceive}>Receive</button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
