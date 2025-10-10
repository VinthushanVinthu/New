import React, { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api.js";
import "../styles/customers.css";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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
  const [err, setErr] = useState("");

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
        setErr("");
        const shopRes = await api.get("/shop/my");
        const s = shopRes.data?.[0] || null;
        setShop(s);

        if (s?.shop_id) {
          await fetchCustomers(s.shop_id);
        }
      } catch (e) {
        const m = e?.response?.data?.message || "Failed to load shop.";
        setErr(m);
        alert(m);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function fetchCustomers(shop_id) {
    try {
      setLoading(true);
      setErr("");
      const { data } = await api.get("/customers", { params: { shop_id } });
      setCustomers(Array.isArray(data) ? data : []);
    } catch (e) {
      const m = e?.response?.data?.message || "Failed to load customers.";
      setErr(m);
      alert(m);
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
        await api.put(`/customers/${editing.customer_id}`, {
          name: form.name || null,
          phone: form.phone,
          email: form.email || null,
        });
      } else {
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

  // -------- PDF EXPORT (filtered) --------
  function exportPdf() {
    const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });

    const title = "Customers";
    const sub = [
      shop?.shop_name || shop?.name ? `Shop: ${shop.shop_name || shop.name}` : "",
      shop?.shop_id ? `Shop ID: ${shop.shop_id}` : "",
      `Generated: ${new Date().toLocaleString()}`
    ].filter(Boolean).join("   •   ");

    doc.setFontSize(16);
    doc.text(title, 40, 40);
    doc.setFontSize(10);
    doc.text(sub, 40, 58);

    const head = [["#", "Customer ID", "Name", "Phone", "Email", "Created"]];
    const body = (filtered || []).map((row, idx) => ([
      String(idx + 1),
      `#${row.customer_id}`,
      row.name || "-",
      row.phone || "-",
      row.email || "-",
      formatDateTime(row.created_at)
    ]));

    autoTable(doc, {
      head,
      body,
      startY: 72,
      styles: { fontSize: 10, cellPadding: 6, overflow: "linebreak" },
      headStyles: { fontStyle: "bold" },
      columnStyles: {
        0: { cellWidth: 24 },   // #
        1: { cellWidth: 90 },   // Customer ID
        2: { cellWidth: 140 },  // Name
        3: { cellWidth: 110 },  // Phone
        4: { cellWidth: 150 },  // Email
        5: { cellWidth: 120 },  // Created
      },
      didDrawPage: () => {
        const page = doc.internal.pageSize;
        const w = page.width || page.getWidth();
        const h = page.height || page.getHeight();
        doc.setFontSize(9);
        doc.text(`Page ${doc.getNumberOfPages()}`, w - 60, h - 20);
      }
    });

    const fileName = `customers_${shop?.shop_id || "shop"}_${new Date().toISOString().slice(0,10)}.pdf`;
    doc.save(fileName);
  }
  // --------------------------------------

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
              onKeyDown={(e) => { if (e.key === "Enter" && shop?.shop_id) fetchCustomers(shop.shop_id); }}
            />
            {shop?.shop_id && (
              <>
                <button className="btn-outline" onClick={() => fetchCustomers(shop.shop_id)}>↻ Refresh</button>
                <button
                  className="btn-outline"
                  onClick={exportPdf}
                  disabled={loading || (filtered?.length ?? 0) === 0}
                  title="Download table as PDF"
                >
                  Download PDF
                </button>
              </>
            )}
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
                  {/* Running number instead of showing Customer ID */}
                  <th style={{ width: "8ch" }}>#</th>
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
                  filtered.map((row, idx) => (
                    <tr key={row.customer_id}>
                      <td>{idx + 1}</td>
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
        {err && <div className="error-msg" style={{ marginTop: 10 }}>{err}</div>}
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
