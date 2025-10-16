// src/pages/Inventory.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import '../styles/Inventory.css';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function Inventory() {
  const [shopId, setShopId] = useState('');
  const [shop, setShop] = useState(null);              // <-- track shop details (name/id)
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [search, setSearch] = useState('');

  // Create/Edit modal state
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    code: '',
    name: '',
    type: '',
    color: '',
    design: '',
    price: '',
    discount: ''
  });
  const [currentStock, setCurrentStock] = useState(0);

  // Delete confirm state
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(i =>
      [i.item_code, i.name, i.type, i.color, i.design]
        .filter(Boolean)
        .some(v => String(v).toLowerCase().includes(q))
    );
  }, [items, search]);

  async function load() {
    try {
      setLoading(true);
      setErr('');
      const shops = await api.get('/shop/my');
      const s = shops.data?.[0];
      const sid = s?.shop_id;
      setShop(s || null);
      if (sid) {
        setShopId(sid);
        const { data } = await api.get('/inventory/sarees', { params: { shop_id: sid, q: search || undefined } });
        setItems(Array.isArray(data) ? data : []);
      } else {
        setItems([]);
      }
    } catch (e) {
      setErr(e?.response?.data?.message || 'Failed to load inventory.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  // Lock page scroll while any modal is open
  const showAnyModal = showForm || !!confirmDeleteId;
  useEffect(() => {
    if (showAnyModal) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [showAnyModal]);

  function openCreate() {
    setEditingId(null);
    setForm({ code: '', name: '', type: '', color: '', design: '', price: '', discount: '' });
    setCurrentStock(0);
    setShowForm(true);
  }

  function openEdit(item) {
    setEditingId(item.id);
    setForm({
      code: item.item_code || '',
      name: item.name || '',
      type: item.type || '',
      color: item.color || '',
      design: item.design || '',
      price: item.price != null ? String(item.price) : '',
      discount: item.discount != null ? String(item.discount) : ''
    });
    setCurrentStock(item.stock_quantity != null ? Number(item.stock_quantity) : 0);
    setShowForm(true);
  }

  async function submitForm(e) {
    e.preventDefault();
    if (!shopId) return;
    try {
      setSaving(true);
      const payload = {
        name: form.name,
        item_code: (form.code || '').trim(),
        type: form.type || '',
        color: form.color || '',
        design: form.design || '',
        price: Number(form.price || 0),
        discount: Number(form.discount || 0)
      };
      if (editingId) {
        await api.put(`/inventory/sarees/${editingId}`, payload);
      } else {
        await api.post('/inventory/sarees', { ...payload, shop_id: shopId });
      }
      setShowForm(false);
      setEditingId(null);
      await load();
    } catch (e) {
      alert(e?.response?.data?.message || 'Failed to save item.');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!confirmDeleteId) return;
    try {
      setDeleting(true);
      await api.delete(`/inventory/sarees/${confirmDeleteId}`);
      setConfirmDeleteId(null);
      setItems(prev => prev.filter(i => i.id !== confirmDeleteId)); // optimistic
    } catch (e) {
      alert(e?.response?.data?.message || 'Failed to delete item.');
    } finally {
      setDeleting(false);
    }
  }

  // ---------- PDF EXPORT ----------
  function exportPdf() {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });

    const title = 'Inventory — Sarees';
    const sub = [
      shop?.shop_name ? `Shop: ${shop.shop_name}` : '',
      shop?.shop_id ? `Shop ID: ${shop.shop_id}` : '',
      `Generated: ${new Date().toLocaleString()}`
    ].filter(Boolean).join(' | ');

    doc.setFontSize(16);
    doc.text(title, 40, 40);
    doc.setFontSize(10);
    doc.text(sub, 40, 58);

    const head = [['Code', 'Name', 'Type', 'Color', 'Design', 'Price', 'Discount', 'Qty']];
    const body = (filtered || []).map(i => ([
      i.item_code || '-',
      i.name || '-',
      i.type || '-',
      i.color || '-',
      i.design || '-',
      formatPrice(i.price),
      formatPrice(i.discount),
      String(i.stock_quantity ?? '-'),
    ]));

    autoTable(doc, {
      head,
      body,
      startY: 72,
      styles: { fontSize: 10, cellPadding: 6, overflow: 'linebreak' },
      headStyles: { fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 90 },  // Code
        1: { cellWidth: 160 }, // Name
        2: { cellWidth: 90 },  // Type
        3: { cellWidth: 70 },  // Color
        4: { cellWidth: 120 }, // Design
        5: { cellWidth: 60 },  // Price
        6: { cellWidth: 60 },  // Discount
        7: { cellWidth: 50 },  // Qty
      },
      didDrawPage: () => {
        const pageSize = doc.internal.pageSize;
        const pageHeight = pageSize.height || pageSize.getHeight();
        const pageWidth = pageSize.width || pageSize.getWidth();
        doc.setFontSize(9);
        doc.text(`Page ${doc.getNumberOfPages()}`, pageWidth - 60, pageHeight - 20);
      }
    });

    const fileName = `inventory_${shop?.shop_id || 'shop'}_${new Date().toISOString().slice(0,10)}.pdf`;
    doc.save(fileName);
  }
  // -------------------------------

  return (
    <div className="inventory-page">
      {/* Inventory Card */}
      <div className="card">
        <div className="section-header">
          <h3>Inventory</h3>
          <div className="section-actions" style={{ gap: 8, display: 'flex', alignItems: 'center' }}>
            <input
              className="form-input"
              placeholder="Search name, type, color…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') load(); }}
              style={{ width: 240 }}
              aria-label="Search inventory"
            />
            <button className="btn-outline" onClick={load} aria-label="Refresh">↻ Refresh</button>
            <button className="btn btn--primary" onClick={openCreate}>+ Add Saree</button>
            <button
              className="btn-outline"
              onClick={exportPdf}
              disabled={loading || (filtered?.length ?? 0) === 0}
              title="Download table as PDF"
            >
              Download PDF
            </button>
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
                  <th style={{ width: '12ch' }}>Code</th>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Color</th>
                  <th>Design</th>
                  <th style={{ width: '12ch' }}>Price</th>
                  <th style={{ width: '12ch' }}>Discount</th>
                  <th style={{ width: '10ch' }}>Qty</th>
                  <th style={{ width: '12ch' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {(filtered || []).length === 0 ? (
                  <tr>
                    <td colSpan={9} className="empty">No items found.</td>
                  </tr>
                ) : (
                  filtered.map(i => (
                    <tr key={i.id}>
                      <td className="mono">{i.item_code || '-'}</td>
                      <td>{i.name}</td>
                      <td>{i.type || '-'}</td>
                      <td>{i.color || '-'}</td>
                      <td>{i.design || '-'}</td>
                      <td>{formatPrice(i.price)}</td>
                      <td>{formatPrice(i.discount)}</td>
                      <td>{i.stock_quantity}</td>
                      <td>
                        <div className="row-actions" style={{ display: 'flex', gap: 8 }}>
                          <button
                            className="btn-ghost"
                            onClick={() => openEdit(i)}
                            aria-label={`Edit ${i.name}`}
                          >
                            Edit
                          </button>
                          <button
                            className="btn-danger-ghost"
                            onClick={() => setConfirmDeleteId(i.id)}
                            aria-label={`Delete ${i.name}`}
                          >
                            Delete
                          </button>
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

      {/* Modal: Add/Edit Form */}
      {showForm && (
        <div className="modal-backdrop" onClick={() => !saving && setShowForm(false)}>
          <div
            className="modal-body card"
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={editingId ? 'Edit Saree' : 'Add New Saree'}
          >
            <div className="modal-header">
              <h3>{editingId ? '✏️ Edit Saree' : '➕ Add New Saree'}</h3>
              <button
                className="btn-close"
                onClick={() => setShowForm(false)}
                disabled={saving}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="modal-content">
              <form onSubmit={submitForm} className="form-grid">
                <div className="form-row">
                  <label>Saree Name <span className="req">*</span></label>
                  <input
                    className="form-input"
                    placeholder="Enter saree name"
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    required
                  />
                </div>

                <div className="form-row">
                  <label>Saree Code <span className="req">*</span></label>
                  <input
                    className="form-input"
                    placeholder="Unique code (e.g. SKU123)"
                    value={form.code}
                    onChange={e => setForm({ ...form, code: e.target.value })}
                    required
                  />
                  <p className="form-note">Codes must be unique per shop to avoid confusion when names match.</p>
                </div>

                <div className="form-row">
                  <label>Type <span className="req">*</span></label>
                  <input
                    className="form-input"
                    placeholder="Cotton, Silk, etc."
                    value={form.type}
                    onChange={e => setForm({ ...form, type: e.target.value })}
                    required
                  />
                </div>

                <div className="form-row">
                  <label>Color <span className="req">*</span></label>
                  <input
                    className="form-input"
                    placeholder="Red, Blue, etc."
                    value={form.color}
                    onChange={e => setForm({ ...form, color: e.target.value })}
                    required
                  />
                </div>

                <div className="form-row">
                  <label>Design</label>
                  <input
                    className="form-input"
                    placeholder="Printed, Embroidery, etc."
                    value={form.design}
                    onChange={e => setForm({ ...form, design: e.target.value })}
                  />
                </div>

                <div className="form-row two-col">
                  <div>
                    <label>Price (₹) <span className="req">*</span></label>
                    <input
                      className="form-input"
                      placeholder="Enter price"
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.price}
                      onChange={e => setForm({ ...form, price: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label>Discount (₹)</label>
                    <input
                      className="form-input"
                      placeholder="Enter discount"
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.discount}
                      onChange={e => setForm({ ...form, discount: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <label>Current Stock</label>
                  <div className="form-static">
                    {Number.isFinite(currentStock) ? currentStock : 0}
                  </div>
                  <p className="form-note">Quantity updates when purchase orders are received.</p>
                </div>

                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn-outline"
                    onClick={() => setShowForm(false)}
                    disabled={saving}
                  >
                    Cancel
                  </button>
                  <button className="btn" type="submit" disabled={saving}>
                    {saving ? 'Saving…' : (editingId ? 'Update' : 'Save')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Delete confirmation */}
      {confirmDeleteId && (
        <div className="modal-backdrop" onClick={() => !deleting && setConfirmDeleteId(null)}>
          <div
            className="modal-body card"
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Confirm delete"
          >
            <div className="modal-header">
              <h3>Delete Item</h3>
              <button
                className="btn-close"
                onClick={() => setConfirmDeleteId(null)}
                disabled={deleting}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="modal-content">
              <p>Are you sure you want to delete this saree? This action cannot be undone.</p>
              <div className="modal-actions">
                <button
                  className="btn-outline"
                  onClick={() => setConfirmDeleteId(null)}
                  disabled={deleting}
                >
                  Cancel
                </button>
                <button
                  className="btn btn--danger"
                  onClick={confirmDelete}
                  disabled={deleting}
                >
                  {deleting ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

function formatPrice(v) {
  if (v == null || v === '') return '-';
  const num = Number(v);
  if (Number.isNaN(num)) return String(v);
  return num.toFixed(2);
}
