import React, { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api.js";
import "../styles/customers.css"; // <- styles below

function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-body card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="btn-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal-content">{children}</div>
      </div>
    </div>
  );
}

export default function Customers() {
  const [shop, setShop] = useState(null);

  // Data
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Search/filter (client-side)
  const [q, setQ] = useState("");

  // Create/Edit modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "" });
  const [editing, setEditing] = useState(null); // customer row or null

  // Delete state
  const [deletingId, setDeletingId] = useState(null);

  // Load shop then customers
  useEffect(() => {
    (async () => {
      try {
        const shopRes = await api.get("/shop/my");
        const s = shopRes.data?.[0] || null;
        setShop(s);

        if (s?.shop_id) {
          await fetchCustomers(s.shop_id);
        }
      } catch (e) {
        alert(e?.response?.data?.message || "Failed to load shop.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function fetchCustomers(shop_id) {
    try {
      setLoading(true);
      // Expect backend route: GET /api/customers?shop_id=#
      const { data } = await api.get("/customers", { params: { shop_id } });
      setCustomers(Array.isArray(data) ? data : []);
    } catch (e) {
      alert(e?.response?.data?.message || "Failed to load customers.");
    } finally {
      setLoading(false);
    }
  }

  // Open Create modal
  function openCreate() {
    setEditing(null);
    setForm({ name: "", phone: "", email: "" });
    setIsModalOpen(true);
  }

  // Open Edit modal
  function openEdit(row) {
    setEditing(row);
    setForm({ name: row.name || "", phone: row.phone || "", email: row.email || "" });
    setIsModalOpen(true);
  }

  function closeModal() {
    if (!saving) {
      setIsModalOpen(false);
      setEditing(null);
      setForm({ name: "", phone: "", email: "" });
    }
  }

  async function saveCustomer(e) {
    e.preventDefault();
    if (!shop?.shop_id) return;

    if (!form.phone?.trim()) {
      alert("Phone is required.");
      return;
    }

    try {
      setSaving(true);
      if (editing) {
        // UPDATE
        // PUT /api/customers/:customer_id  body: { name, phone, email }
        await api.put(`/customers/${editing.customer_id}`, {
          name: form.name || null,
          phone: form.phone,
          email: form.email || null,
        });
      } else {
        // CREATE
        // POST /api/customers  body: { shop_id, name, phone, email }
        await api.post("/customers", {
          shop_id: shop.shop_id,
          name: form.name || null,
          phone: form.phone,
          email: form.email || null,
        });
      }

      await fetchCustomers(shop.shop_id);
      closeModal();
    } catch (e) {
      const msg = e?.response?.data?.message || "Save failed.";
      // If your create API returns 409 on duplicate phone, display it
      alert(msg);
    } finally {
      setSaving(false);
    }
  }

  async function deleteCustomer(row) {
    if (!shop?.shop_id) return;
    if (!window.confirm(`Delete customer "${row.name || row.phone}"?`)) return;

    try {
      setDeletingId(row.customer_id);
      // DELETE /api/customers/:customer_id  (optionally pass shop_id as query)
      await api.delete(`/customers/${row.customer_id}`, { params: { shop_id: shop.shop_id } });
      setCustomers((prev) => prev.filter((c) => c.customer_id !== row.customer_id));
    } catch (e) {
      alert(e?.response?.data?.message || "Delete failed.");
    } finally {
      setDeletingId(null);
    }
  }

  const filtered = useMemo(() => {
    const s = (q || "").toLowerCase();
    if (!s) return customers;
    return customers.filter((c) => {
      return (
        (c.name || "").toLowerCase().includes(s) ||
        (c.phone || "").toLowerCase().includes(s) ||
        (c.email || "").toLowerCase().includes(s)
      );
    });
  }, [q, customers]);

  return (
    <div className="customers-page">
      <div className="card">
        <div className="page-header">
          <h2>Customers</h2>
          <div className="actions">
            <input
              className="input search"
              type="text"
              placeholder="Search name / phone / email"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <button className="btn" onClick={openCreate}>+ Add Customer</button>
          </div>
        </div>

        {loading ? (
          <div className="loading">Loading…</div>
        ) : !shop?.shop_id ? (
          <div className="error-msg">No shop found for current user.</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: "18ch" }}>Customer ID</th>
                  <th>Name</th>
                  <th style={{ width: "18ch" }}>Phone</th>
                  <th>Email</th>
                  <th style={{ width: "20ch" }}>Created</th>
                  <th style={{ width: "18ch" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="empty">No customers.</td>
                  </tr>
                ) : (
                  filtered.map((row) => (
                    <tr key={row.customer_id}>
                      <td>#{row.customer_id}</td>
                      <td>{row.name || "-"}</td>
                      <td>{row.phone || "-"}</td>
                      <td>{row.email || "-"}</td>
                      <td>{formatDateTime(row.created_at)}</td>
                      <td className="row-actions">
                        <button className="btn-sm" onClick={() => openEdit(row)}>Edit</button>
                        <button
                          className="btn-sm danger"
                          onClick={() => deleteCustomer(row)}
                          disabled={deletingId === row.customer_id}
                          title="Delete customer"
                        >
                          {deletingId === row.customer_id ? "Deleting…" : "Delete"}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      <Modal
        open={isModalOpen}
        onClose={closeModal}
        title={editing ? "Edit Customer" : "Add Customer"}
      >
        <form onSubmit={saveCustomer} className="form-grid">
          <div className="form-row">
            <label>Name</label>
            <input
              className="input"
              type="text"
              placeholder="Customer name"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            />
          </div>

          <div className="form-row">
            <label>Phone <span className="req">*</span></label>
            <input
              className="input"
              type="text"
              placeholder="07xxxxxxxx"
              value={form.phone}
              onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
              required
            />
          </div>

          <div className="form-row">
            <label>Email</label>
            <input
              className="input"
              type="email"
              placeholder="name@example.com"
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
            />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-outline" onClick={closeModal} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn" disabled={saving}>
              {saving ? "Saving…" : (editing ? "Update" : "Create")}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// small helper
function formatDateTime(s) {
  if (!s) return "-";
  try {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleString();
  } catch {
    return s;
  }
}
