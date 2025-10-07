// src/pages/Inventory.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import '../styles/Inventory.css'; // keep your path/name

export default function Inventory() {
  const [shopId, setShopId] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [search, setSearch] = useState('');

  // Create/Edit modal state
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    name: '',
    type: '',
    color: '',
    design: '',
    price: '',
    stock_quantity: ''
  });

  // Delete confirm state
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(i =>
      [i.name, i.type, i.color, i.design]
        .filter(Boolean)
        .some(v => String(v).toLowerCase().includes(q))
    );
  }, [items, search]);

  async function load() {
    try {
      setLoading(true);
      setErr('');
      const shops = await api.get('/shop/my');
      const sid = shops.data[0]?.shop_id;
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
    setForm({ name: '', type: '', color: '', design: '', price: '', stock_quantity: '' });
    setShowForm(true);
  }

  function openEdit(item) {
    setEditingId(item.id);
    setForm({
      name: item.name || '',
      type: item.type || '',
      color: item.color || '',
      design: item.design || '',
      price: item.price != null ? String(item.price) : '',
      stock_quantity: item.stock_quantity != null ? String(item.stock_quantity) : ''
    });
    setShowForm(true);
  }

  async function submitForm(e) {
    e.preventDefault();
    if (!shopId) return;
    try {
      setSaving(true);
      const payload = {
        ...form,
        price: Number(form.price || 0),
        stock_quantity: Number(form.stock_quantity || 0)
      };
      if (editingId) {
        // UPDATE
        await api.put(`/inventory/sarees/${editingId}`, payload);
      } else {
        // CREATE
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
      // Optimistic removal to feel snappier
      setItems(prev => prev.filter(i => i.id !== confirmDeleteId));
    } catch (e) {
      alert(e?.response?.data?.message || 'Failed to delete item.');
    } finally {
      setDeleting(false);
    }
  }

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
                  <th>Name</th>
                  <th>Type</th>
                  <th>Color</th>
                  <th>Design</th>
                  <th style={{ width: '12ch' }}>Price</th>
                  <th style={{ width: '10ch' }}>Qty</th>
                  <th style={{ width: '12ch' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {(filtered || []).length === 0 ? (
                  <tr>
                    <td colSpan={7} className="empty">No items found.</td>
                  </tr>
                ) : (
                  filtered.map(i => (
                    <tr key={i.id}>
                      <td>{i.name}</td>
                      <td>{i.type || '-'}</td>
                      <td>{i.color || '-'}</td>
                      <td>{i.design || '-'}</td>
                      <td>{Number(i.price).toFixed(2)}</td>
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
                    <label>Quantity <span className="req">*</span></label>
                    <input
                      className="form-input"
                      placeholder="Enter quantity"
                      type="number"
                      min="0"
                      step="1"
                      value={form.stock_quantity}
                      onChange={e => setForm({ ...form, stock_quantity: e.target.value })}
                      required
                    />
                  </div>
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
