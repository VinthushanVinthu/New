// src/pages/PurchaseOrders.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import '../styles/procurement.css';

const makeTmpId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `tmp-${Math.random().toString(16).slice(2)}`;

const createEmptyItem = () => ({
  tmpId: makeTmpId(),
  saree_id: '',
  qty_ordered: '1',
  unit_cost: '0',
});

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatCurrency = (value) => `₹ ${toNumber(value).toFixed(2)}`;

const defaultSummary = () => ({
  count: 0,
  subtotal: 0,
  discount: 0,
  tax: 0,
  total: 0,
});

const errorMessage = (err, fallback) =>
  err?.response?.data?.message || err?.message || fallback;

export default function PurchaseOrders() {
  const [shop, setShop] = useState(null);
  const [suppliers, setSuppliers] = useState([]);
  const [sarees, setSarees] = useState([]);
  const [poList, setPoList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [filterDate, setFilterDate] = useState('');

  const yearOptions = useMemo(() => {
    const unique = new Set();
    poList.forEach((po) => {
      const timestamp = po?.ordered_at || po?.created_at;
      if (!timestamp) return;
      const dt = new Date(timestamp);
      if (!Number.isNaN(dt.getTime())) {
        unique.add(String(dt.getFullYear()));
      }
    });
    return Array.from(unique).sort((a, b) => Number(b) - Number(a));
  }, [poList]);

  const hasDateFilters = Boolean(filterYear || filterMonth || filterDate);

  const clearFilters = () => {
    setFilterYear('');
    setFilterMonth('');
    setFilterDate('');
  };

  const [mode, setMode] = useState('list'); // 'list' | 'form'
  const [formLoading, setFormLoading] = useState(false);
  const [formSaving, setFormSaving] = useState(false);

  const [poId, setPoId] = useState(null);
  const [poStatus, setPoStatus] = useState('DRAFT');
  const [poSupplierId, setPoSupplierId] = useState('');
  const [poNotes, setPoNotes] = useState('');
  const [poItems, setPoItems] = useState([createEmptyItem()]);

  const [showReceive, setShowReceive] = useState(false);
  const [receivingPo, setReceivingPo] = useState(null);
  const [receiveMap, setReceiveMap] = useState({});
  const [receiveSaving, setReceiveSaving] = useState(false);

  useEffect(() => {
    loadBase();
  }, []);

  async function loadBase() {
    try {
      setLoading(true);
      setErr('');

      const shopsRes = await api.get('/shop/my');
      const shopRow = Array.isArray(shopsRes.data) ? shopsRes.data[0] : null;
      setShop(shopRow || null);

      if (!shopRow?.shop_id) {
        setSuppliers([]);
        setSarees([]);
        setPoList([]);
        return;
      }

      const [supRes, sareeRes, poRes] = await Promise.all([
        api.get('/inventory/suppliers', { params: { shop_id: shopRow.shop_id } }),
        api.get('/inventory/sarees', { params: { shop_id: shopRow.shop_id } }),
        api.get('/inventory/po', { params: { shop_id: shopRow.shop_id } }),
      ]);

      setSuppliers(Array.isArray(supRes.data) ? supRes.data : []);
      setSarees(Array.isArray(sareeRes.data) ? sareeRes.data : []);

      const poData = poRes.data;
      const rows = Array.isArray(poData?.purchase_orders)
        ? poData.purchase_orders
        : Array.isArray(poData)
        ? poData
        : [];
      setPoList(rows);
    } catch (e) {
      setErr(errorMessage(e, 'Failed to load purchase orders.'));
    } finally {
      setLoading(false);
    }
  }

  async function reloadPOList(params = {}) {
    if (!shop?.shop_id) return null;
    try {
      const { data } = await api.get('/inventory/po', {
        params: { shop_id: shop.shop_id, q: q || undefined, ...params },
      });
      const rows = Array.isArray(data?.purchase_orders)
        ? data.purchase_orders
        : Array.isArray(data)
        ? data
        : [];
      setPoList(rows);
      return data;
    } catch (e) {
      const message = errorMessage(e, 'Failed to refresh purchase orders.');
      setErr(message);
      throw e;
    }
  }

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return poList.filter((po) => {
      let yearStr = '';
      let monthStr = '';
      let dateStr = '';
      const timestamp = po?.ordered_at || po?.created_at;
      if (timestamp) {
        const created = new Date(timestamp);
        if (!Number.isNaN(created.getTime())) {
          const year = created.getFullYear();
          const month = String(created.getMonth() + 1).padStart(2, '0');
          const day = String(created.getDate()).padStart(2, '0');
          yearStr = String(year);
          monthStr = `${yearStr}-${month}`;
          dateStr = `${monthStr}-${day}`;
        }
      }

      if (filterYear && yearStr !== filterYear) return false;
      if (filterMonth && monthStr !== filterMonth) return false;
      if (filterDate && dateStr !== filterDate) return false;

      if (!term) return true;

      return [po.supplier_name, po.status, po.notes]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [poList, q, filterYear, filterMonth, filterDate]);

  const listSummary = useMemo(() => {
    return filtered.reduce((acc, row) => {
      acc.count += 1;
      acc.subtotal += toNumber(row.sub_total);
      acc.discount += toNumber(row.discount);
      acc.tax += toNumber(row.tax);
      acc.total += toNumber(row.total_amount);
      return acc;
    }, defaultSummary());
  }, [filtered]);

  const validItems = useMemo(
    () =>
      poItems.filter(
        (row) => row.saree_id && toNumber(row.qty_ordered) > 0,
      ),
    [poItems],
  );

  const totalUnits = useMemo(
    () => validItems.reduce((sum, row) => sum + toNumber(row.qty_ordered), 0),
    [validItems],
  );

  const poSubtotal = useMemo(
    () =>
      validItems.reduce(
        (sum, row) =>
          sum + toNumber(row.qty_ordered) * toNumber(row.unit_cost),
        0,
      ),
    [validItems],
  );

  const canPersist = Boolean(poSupplierId && validItems.length > 0);

  function resetForm() {
    setPoId(null);
    setPoStatus('DRAFT');
    setPoSupplierId('');
    setPoNotes('');
    setPoItems([createEmptyItem()]);
  }

  function startCreate() {
    resetForm();
    setMode('form');
  }

  function addItemRow() {
    setPoItems((prev) => [...prev, createEmptyItem()]);
  }

  function updateItemRow(tmpId, patch) {
    setPoItems((prev) =>
      prev.map((row) => (row.tmpId === tmpId ? { ...row, ...patch } : row)),
    );
  }

  function removeItemRow(tmpId) {
    setPoItems((prev) => {
      const next = prev.filter((row) => row.tmpId !== tmpId);
      return next.length ? next : [createEmptyItem()];
    });
  }

  async function persistDraft() {
    if (!shop?.shop_id) throw new Error('Shop not selected.');
    if (!poSupplierId) throw new Error('Select a supplier.');
    if (validItems.length === 0) throw new Error('Add at least one item.');

    let currentId = poId;
    if (!currentId) {
      const createRes = await api.post('/inventory/po', {
        shop_id: shop.shop_id,
        supplier_id: Number(poSupplierId),
        notes: poNotes?.trim() ? poNotes.trim() : null,
      });
      currentId = createRes.data?.po_id;
      if (!currentId) throw new Error('Failed to create purchase order.');
      setPoId(currentId);
    }

    await api.post(`/inventory/po/${currentId}/items`, {
      items: validItems.map((it) => ({
        saree_id: Number(it.saree_id),
        qty_ordered: toNumber(it.qty_ordered),
        unit_cost: toNumber(it.unit_cost),
      })),
      supplier_id: Number(poSupplierId),
      notes: poNotes?.trim() ? poNotes.trim() : null,
    });

    setPoStatus('DRAFT');
    return currentId;
  }

  async function handleSaveDraft() {
    if (formSaving) return;
    setFormSaving(true);
    try {
      await persistDraft();
      await reloadPOList();
      resetForm();
      setMode('list');
    } catch (e) {
      alert(errorMessage(e, 'Failed to save purchase order.'));
    } finally {
      setFormSaving(false);
    }
  }

  async function handleSubmit() {
    if (formSaving) return;
    setFormSaving(true);
    try {
      const id = await persistDraft();
      await api.post(`/inventory/po/${id}/submit`);
      await reloadPOList();
      resetForm();
      setMode('list');
    } catch (e) {
      alert(errorMessage(e, 'Failed to submit purchase order.'));
    } finally {
      setFormSaving(false);
    }
  }

  async function openEdit(po) {
    setFormLoading(true);
    setMode('form');
    try {
      const { data } = await api.get(`/inventory/po/${po.po_id}`);
      const current = data?.po || {};
      setPoId(current.po_id);
      setPoStatus(current.status || 'DRAFT');
      setPoSupplierId(current.supplier_id ? String(current.supplier_id) : '');
      setPoNotes(current.notes || '');

      const items = Array.isArray(data?.items) && data.items.length
        ? data.items.map((it) => ({
            tmpId: makeTmpId(),
            saree_id: it.saree_id ? String(it.saree_id) : '',
            qty_ordered: String(toNumber(it.qty_ordered) || 0),
            unit_cost: String(toNumber(it.unit_cost) || 0),
          }))
        : [createEmptyItem()];
      setPoItems(items);
    } catch (e) {
      alert(errorMessage(e, 'Failed to open purchase order.'));
      setMode('list');
    } finally {
      setFormLoading(false);
    }
  }

  function cancelForm() {
    if (formSaving) return;
    resetForm();
    setMode('list');
  }

  async function openReceive(po) {
    try {
      const { data } = await api.get(`/inventory/po/${po.po_id}`);
      const map = {};
      (data?.items || []).forEach((item) => {
        map[item.po_item_id] = 0;
      });
      setReceivingPo(data);
      setReceiveMap(map);
      setShowReceive(true);
    } catch (e) {
      alert(errorMessage(e, 'Failed to load purchase order details.'));
    }
  }

  const receiveItemsById = useMemo(() => {
    const lookup = new Map();
    (receivingPo?.items || []).forEach((item) => {
      lookup.set(item.po_item_id, item);
    });
    return lookup;
  }, [receivingPo]);

  async function handleReceive() {
    if (!receivingPo?.po?.po_id) return;

    const payload = Object.entries(receiveMap)
      .map(([key, value]) => {
        const item = receiveItemsById.get(Number(key));
        if (!item) return null;

        const remaining =
          toNumber(item.qty_ordered) - toNumber(item.qty_received);
        if (remaining <= 0) return null;

        const qty = Math.min(
          remaining,
          Math.max(0, Math.floor(toNumber(value))),
        );
        if (!qty) return null;

        return { po_item_id: Number(key), qty };
      })
      .filter(Boolean);

    if (!payload.length) {
      alert('Enter at least one quantity to receive.');
      return;
    }

    setReceiveSaving(true);
    try {
      await api.post(`/inventory/po/${receivingPo.po.po_id}/receive`, {
        items: payload,
      });
      await reloadPOList();
      setShowReceive(false);
      setReceivingPo(null);
      setReceiveMap({});
    } catch (e) {
      alert(errorMessage(e, 'Failed to receive purchase order.'));
    } finally {
      setReceiveSaving(false);
    }
  }

  function closeReceiveModal() {
    if (receiveSaving) return;
    setShowReceive(false);
    setReceivingPo(null);
    setReceiveMap({});
  }

  const formView = (
    <div className="po-form-shell">
      {formLoading ? (
        <div className="card po-form-loading">Loading purchase order...</div>
      ) : (
        <>
          <div className="card po-form-header">
            <div>
              <h3>
                {poId ? `Edit Purchase Order #${poId}` : 'New Purchase Order'}
              </h3>
              <p className="po-form-subtitle">
                Select a supplier and add sarees to build the purchase.
              </p>
            </div>
            <span className={`po-status-chip status-${poStatus.toLowerCase()}`}>
              {poStatus}
            </span>
          </div>

          <div className="po-form-grid">
            <div className="card po-form-section">
              <h4>Supplier</h4>
              <div className="form-row">
                <label>
                  Supplier <span className="req">*</span>
                </label>
                <select
                  className="form-input"
                  value={poSupplierId}
                  onChange={(e) => setPoSupplierId(e.target.value)}
                  disabled={formSaving}
                  required
                >
                  <option value="">Select supplier...</option>
                  {(suppliers || []).map((s) => (
                    <option key={s.supplier_id} value={String(s.supplier_id)}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-row">
                <label>Notes</label>
                <textarea
                  className="form-input"
                  rows={3}
                  placeholder="Optional notes for supplier"
                  value={poNotes}
                  onChange={(e) => setPoNotes(e.target.value)}
                  disabled={formSaving}
                />
              </div>
            </div>

            <div className="card po-form-section">
              <h4>Summary</h4>
              <div className="po-summary-row">
                <span>Reference</span>
                <span>{poId ? `PO-${poId}` : 'Draft'}</span>
              </div>
              <div className="po-summary-row">
                <span>Items</span>
                <span>{validItems.length}</span>
              </div>
              <div className="po-summary-row">
                <span>Total Units</span>
                <span>{totalUnits}</span>
              </div>
              <div className="po-summary-row po-summary-total">
                <span>Estimated Total</span>
                <span>{formatCurrency(poSubtotal)}</span>
              </div>
            </div>
          </div>

          <div className="card po-form-section">
            <div className="po-items-header">
              <h4>Line Items</h4>
              <button
                type="button"
                className="btn-ghost add-item-btn"
                onClick={addItemRow}
                disabled={formSaving}
              >
                + Add Saree
              </button>
            </div>
            <div className="table-wrap po-items-table">
              <table className="table">
                <thead>
                  <tr>
                    <th>Saree</th>
                    <th>Qty</th>
                    <th>Unit Cost</th>
                    <th>Line Total</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {poItems.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="empty">
                        No items yet. Add a saree.
                      </td>
                    </tr>
                  ) : (
                    poItems.map((row) => {
                      const lineTotal =
                        toNumber(row.qty_ordered) * toNumber(row.unit_cost);
                      return (
                        <tr key={row.tmpId}>
                          <td>
                            <select
                              className="form-input"
                              value={row.saree_id}
                              onChange={(e) =>
                                updateItemRow(row.tmpId, {
                                  saree_id: e.target.value,
                                })
                              }
                              disabled={formSaving}
                            >
                              <option value="">Select saree...</option>
                              {(sarees || []).map((s) => (
                                <option key={s.id} value={String(s.id)}>
                                  {s.item_code
                                    ? `${s.item_code} - ${s.name}`
                                    : s.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <input
                              className="form-input"
                              type="number"
                              min="1"
                              step="1"
                              value={row.qty_ordered}
                              onChange={(e) =>
                                updateItemRow(row.tmpId, {
                                  qty_ordered: e.target.value,
                                })
                              }
                              disabled={formSaving}
                            />
                          </td>
                          <td>
                            <input
                              className="form-input"
                              type="number"
                              min="0"
                              step="0.01"
                              value={row.unit_cost}
                              onChange={(e) =>
                                updateItemRow(row.tmpId, {
                                  unit_cost: e.target.value,
                                })
                              }
                              disabled={formSaving}
                            />
                          </td>
                          <td>{formatCurrency(lineTotal)}</td>
                          <td>
                            <button
                              className="btn-danger-ghost"
                              type="button"
                              onClick={() => removeItemRow(row.tmpId)}
                              disabled={formSaving}
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="po-form-actions">
            <button
              type="button"
              className="btn-outline"
              onClick={cancelForm}
              disabled={formSaving}
            >
              Cancel
            </button>
            <div className="action-spacer" />
            <button
              type="button"
              className="btn-outline"
              onClick={handleSaveDraft}
              disabled={formSaving || !canPersist}
            >
              Save Draft
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={handleSubmit}
              disabled={formSaving || !canPersist}
            >
              Submit Order
            </button>
          </div>
        </>
      )}
    </div>
  );

  const listView = (
    <div className="card">
      <div className="section-header">
        <h3>Purchase Orders</h3>
        <div className="section-actions">
          <input
            className="form-input"
            placeholder="Search supplier, status, or notes..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="po-filters">
            <select
              className="form-input po-filter-control"
              value={filterYear}
              onChange={(e) => {
                const value = e.target.value;
                setFilterYear(value);
                if (value) {
                  setFilterMonth('');
                  setFilterDate('');
                }
              }}
              aria-label="Filter purchase orders by year"
            >
              <option value="">All years</option>
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
            <input
              className="form-input po-filter-control"
              type="month"
              value={filterMonth}
              onChange={(e) => {
                const value = e.target.value;
                setFilterMonth(value);
                if (value) {
                  setFilterYear('');
                  setFilterDate('');
                }
              }}
              aria-label="Filter purchase orders by month"
            />
            <input
              className="form-input po-filter-control"
              type="date"
              value={filterDate}
              onChange={(e) => {
                const value = e.target.value;
                setFilterDate(value);
                if (value) {
                  setFilterYear('');
                  setFilterMonth('');
                }
              }}
              aria-label="Filter purchase orders by date"
            />
            <button
              className="btn po-filter-clear"
              type="button"
              onClick={clearFilters}
              disabled={!hasDateFilters}
            >
              Clear filters
            </button>
          </div>
          <button
            className="btn-outline"
            type="button"
            onClick={() => reloadPOList()}
          >
            Refresh
          </button>
          <button
            className="btn btn--primary"
            type="button"
            onClick={startCreate}
          >
            + New Purchase
          </button>
        </div>
      </div>

      {err && <div className="error-msg" style={{ marginBottom: 12 }}>{err}</div>}

      <div className="po-summary-strip">
        <div>
          <strong>Total:</strong> {listSummary.count}
        </div>
        <div>
          <strong>Subtotal:</strong> {formatCurrency(listSummary.subtotal)}
        </div>
        <div>
          <strong>Discount:</strong> {formatCurrency(listSummary.discount)}
        </div>
        <div>
          <strong>Tax:</strong> {formatCurrency(listSummary.tax)}
        </div>
        <div>
          <strong>Amount:</strong> {formatCurrency(listSummary.total)}
        </div>
      </div>

      {loading ? (
        <div className="loading">Loading...</div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Supplier</th>
                <th>Status</th>
                <th>Ordered</th>
                <th>Received</th>
                <th>Total</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="empty">
                    No purchase orders.
                  </td>
                </tr>
              ) : (
                filtered.map((po) => (
                  <tr key={po.po_id}>
                    <td>{po.bill_number || `PO-${po.po_id}`}</td>
                    <td>{po.supplier_name || '-'}</td>
                    <td>{po.status}</td>
                    <td>
                      {po.ordered_at
                        ? new Date(po.ordered_at).toLocaleString()
                        : '-'}
                    </td>
                    <td>
                      {po.received_at
                        ? new Date(po.received_at).toLocaleString()
                        : '-'}
                    </td>
                    <td>{formatCurrency(po.total_amount)}</td>
                    <td>
                      <div className="row-actions">
                        {po.status === 'DRAFT' && (
                          <button
                            className="btn-ghost"
                            type="button"
                            onClick={() => openEdit(po)}
                          >
                            Edit
                          </button>
                        )}
                        {po.status !== 'CANCELLED' && po.status !== 'RECEIVED' && (
                          <button
                            className="btn-ghost"
                            type="button"
                            onClick={() => openReceive(po)}
                          >
                            Receive
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  return (
    <div className={mode === 'form' ? 'po-form-page' : 'inventory-page'}>
      {mode === 'form' ? formView : listView}

      {showReceive && receivingPo && (
        <div className="modal-backdrop" onClick={closeReceiveModal}>
          <div
            className="modal-body card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="modal-header">
              <h3>Receive Items - PO #{receivingPo.po.po_id}</h3>
              <button className="btn-close" onClick={closeReceiveModal} disabled={receiveSaving}>
                ×
              </button>
            </div>
            <div className="modal-content">
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Saree</th>
                      <th>Ordered</th>
                      <th>Received</th>
                      <th>Remaining</th>
                      <th>Receive Now</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(receivingPo.items || []).map((item) => {
                      const ordered = toNumber(item.qty_ordered);
                      const received = toNumber(item.qty_received);
                      const remaining = Math.max(0, ordered - received);
                      return (
                        <tr
                          key={item.po_item_id}
                          className={remaining <= 0 ? 'low-qty' : ''}
                        >
                          <td>{item.saree_name || item.saree_id}</td>
                          <td>{ordered}</td>
                          <td>{received}</td>
                          <td>{remaining}</td>
                          <td>
                            <input
                              className="form-input"
                              type="number"
                              min="0"
                              max={remaining}
                              step="1"
                              value={receiveMap[item.po_item_id] ?? 0}
                              onChange={(e) =>
                                setReceiveMap((prev) => ({
                                  ...prev,
                                  [item.po_item_id]: e.target.value,
                                }))
                              }
                              disabled={receiveSaving}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="modal-actions">
                <button
                  className="btn-outline"
                  onClick={closeReceiveModal}
                  disabled={receiveSaving}
                >
                  Cancel
                </button>
                <button
                  className="btn btn--primary"
                  onClick={handleReceive}
                  disabled={receiveSaving}
                >
                  Receive
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
