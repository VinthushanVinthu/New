// src/pages/Suppliers.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import '../styles/procurement.css';

export default function Suppliers() {
  const [shop, setShop] = useState(null);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    name: '', phone: '', email: '', address_line: '', city: '', state: '', postal_code: '', country: ''
  });
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter(s =>
      [s.name, s.phone, s.email, s.city, s.state]
        .filter(Boolean).some(v => String(v).toLowerCase().includes(q))
    );
  }, [suppliers, search]);

  async function load() {
    try {
      setLoading(true); setErr('');
      const shops = await api.get('/shop/my');
      const s = shops.data?.[0];
      setShop(s || null);
      if (s?.shop_id) {
        const { data } = await api.get('/inventory/suppliers', { params: { shop_id: s.shop_id } });
        setSuppliers(Array.isArray(data) ? data : []);
      } else {
        setSuppliers([]);
      }
    } catch (e) {
      setErr(e?.response?.data?.message || 'Failed to load suppliers.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

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
    setForm({ name: '', phone: '', email: '', address_line: '', city: '', state: '', postal_code: '', country: '' });
    setShowForm(true);
  }
  function openEdit(sup) {
    setEditingId(sup.supplier_id);
    setForm({
      name: sup.name || '', phone: sup.phone || '', email: sup.email || '',
      address_line: sup.address_line || '', city: sup.city || '', state: sup.state || '',
      postal_code: sup.postal_code || '', country: sup.country || ''
    });
    setShowForm(true);
  }

  async function submitForm(e) {
    e.preventDefault();
    if (!shop?.shop_id) return;
    try {
      setSaving(true);
      if (editingId) {
        await api.put(`/inventory/suppliers/${editingId}`, form);
      } else {
        await api.post('/inventory/suppliers', { ...form, shop_id: shop.shop_id });
      }
      setShowForm(false);
      setEditingId(null);
      await load();
    } catch (e) {
      alert(e?.response?.data?.message || 'Failed to save supplier.');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!confirmDeleteId) return;
    try {
      setDeleting(true);
      await api.delete(`/inventory/suppliers/${confirmDeleteId}`);
      setConfirmDeleteId(null);
      setSuppliers(prev => prev.filter(x => x.supplier_id !== confirmDeleteId));
    } catch (e) {
      alert(e?.response?.data?.message || 'Failed to delete supplier.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="inventory-page">
      <div className="card">
        <div className="section-header">
          <h3>Suppliers</h3>
          <div className="section-actions" style={{ gap: 8, display: 'flex', alignItems: 'center' }}>
            <input
              className="form-input"
              placeholder="Search supplier, city, phone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search suppliers"
              style={{ width: 240 }}
            />
            <button className="btn-outline" onClick={load}>↻ Refresh</button>
            <button className="btn btn--primary" onClick={openCreate}>+ Add Supplier</button>
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
                  <th>Name</th><th>Phone</th><th>Email</th><th>City</th><th>State</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
              {(filtered || []).length === 0 ? (
                <tr><td colSpan={6} className="empty">No suppliers.</td></tr>
              ) : filtered.map(s => (
                <tr key={s.supplier_id}>
                  <td>{s.name}</td>
                  <td>{s.phone || '-'}</td>
                  <td>{s.email || '-'}</td>
                  <td>{s.city || '-'}</td>
                  <td>{s.state || '-'}</td>
                  <td>
                    <div className="row-actions" style={{ display: 'flex', gap: 8 }}>
                      <button className="btn-ghost" onClick={() => openEdit(s)}>Edit</button>
                      <button className="btn-danger-ghost" onClick={() => setConfirmDeleteId(s.supplier_id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <div className="modal-backdrop" onClick={() => !saving && setShowForm(false)}>
          <div className="modal-body card" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="modal-header">
              <h3>{editingId ? '✏️ Edit Supplier' : '➕ Add Supplier'}</h3>
              <button className="btn-close" onClick={() => setShowForm(false)} disabled={saving}>×</button>
            </div>
            <div className="modal-content">
              <form onSubmit={submitForm} className="form-grid">
                <div className="form-row">
                  <label>Name <span className="req">*</span></label>
                  <input className="form-input" required value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}/>
                </div>
                <div className="form-row two-col">
                  <div>
                    <label>Phone</label>
                    <input className="form-input" value={form.phone}
                      onChange={e => setForm({ ...form, phone: e.target.value })}/>
                  </div>
                  <div>
                    <label>Email</label>
                    <input className="form-input" type="email" value={form.email}
                      onChange={e => setForm({ ...form, email: e.target.value })}/>
                  </div>
                </div>
                <div className="form-row">
                  <label>Address</label>
                  <input className="form-input" value={form.address_line}
                    onChange={e => setForm({ ...form, address_line: e.target.value })}/>
                </div>
                <div className="form-row two-col">
                  <div>
                    <label>City</label>
                    <input className="form-input" value={form.city}
                      onChange={e => setForm({ ...form, city: e.target.value })}/>
                  </div>
                  <div>
                    <label>State</label>
                    <input className="form-input" value={form.state}
                      onChange={e => setForm({ ...form, state: e.target.value })}/>
                  </div>
                </div>
                <div className="form-row two-col">
                  <div>
                    <label>Postal Code</label>
                    <input className="form-input" value={form.postal_code}
                      onChange={e => setForm({ ...form, postal_code: e.target.value })}/>
                  </div>
                  <div>
                    <label>Country</label>
                    <input className="form-input" value={form.country}
                      onChange={e => setForm({ ...form, country: e.target.value })}/>
                  </div>
                </div>

                <div className="modal-actions">
                  <button type="button" className="btn-outline" onClick={() => setShowForm(false)} disabled={saving}>Cancel</button>
                  <button className="btn" type="submit" disabled={saving}>{saving ? 'Saving…' : (editingId ? 'Update' : 'Save')}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteId && (
        <div className="modal-backdrop" onClick={() => !deleting && setConfirmDeleteId(null)}>
          <div className="modal-body card" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="modal-header">
              <h3>Delete Supplier</h3>
              <button className="btn-close" onClick={() => setConfirmDeleteId(null)} disabled={deleting}>×</button>
            </div>
            <div className="modal-content">
              <p>Are you sure you want to delete this supplier?</p>
              <div className="modal-actions">
                <button className="btn-outline" onClick={() => setConfirmDeleteId(null)} disabled={deleting}>Cancel</button>
                <button className="btn btn--danger" onClick={confirmDelete} disabled={deleting}>{deleting ? 'Deleting…' : 'Delete'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
