// src/pages/staf.jsx
import React, { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api.js";
import { getUser } from "../lib/api.js";
import "../styles/staff.css";

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

export default function StaffPage() {
  const me = getUser(); // { id, name, email, role }
  const [shop, setShop] = useState(null);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const [q, setQ] = useState("");

  // create/edit modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null); // row or null
  const [form, setForm] = useState({
    name: "",
    email: "",
    role: "Cashier",
    password: "",
  });

  const [deletingId, setDeletingId] = useState(null);

  // Load shop then staff
  useEffect(() => {
    (async () => {
      try {
        const shopRes = await api.get("/shop/my");
        const s = shopRes.data?.[0] || null;
        setShop(s);
        if (s?.shop_id) await fetchStaff(s.shop_id);
      } catch (e) {
        alert(e?.response?.data?.message || "Failed to load shop.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function fetchStaff(shop_id) {
    try {
      setLoading(true);
      const { data } = await api.get("/staff", { params: { shop_id } });
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      alert(e?.response?.data?.message || "Failed to load staff.");
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditing(null);
    setForm({
      name: "",
      email: "",
      role: me?.role === "Owner" ? "Manager" : "Cashier",
      password: "",
    });
    setIsModalOpen(true);
  }

  function openEdit(row) {
    setEditing(row);
    setForm({
      name: row.name || "",
      email: row.email || "",
      role: row.role, // role editing depends on my role below
      password: "",   // optional reset
    });
    setIsModalOpen(true);
  }

  function closeModal() {
    if (!saving) {
      setIsModalOpen(false);
      setEditing(null);
      setForm({ name: "", email: "", role: "Cashier", password: "" });
    }
  }

  async function save(e) {
    e.preventDefault();
    if (!shop?.shop_id) return;

    try {
      setSaving(true);

      // Manager can only manage Cashier
      const roleAllowed =
        me?.role === "Owner"
          ? ["Manager", "Cashier"]
          : ["Cashier"];
      if (!roleAllowed.includes(form.role)) {
        alert("You are not allowed to set this role.");
        setSaving(false);
        return;
      }

      if (editing) {
        // UPDATE
        const body = {
          shop_id: shop.shop_id,
          name: form.name || null,
          email: form.email || null,
        };
        // role changes:
        if (me?.role === "Owner") body.role = form.role; // Manager can’t set role to Manager
        // password reset (optional)
        if (form.password?.length) body.password = form.password;

        await api.put(`/staff/${editing.id}`, body);
      } else {
        // CREATE
        if (!form.password?.length) {
          alert("Password is required for new user.");
          setSaving(false);
          return;
        }
        await api.post("/staff", {
          shop_id: shop.shop_id,
          name: form.name,
          email: form.email,
          role: form.role,
          password: form.password,
        });
      }

      await fetchStaff(shop.shop_id);
      closeModal();
    } catch (e) {
      alert(e?.response?.data?.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(row) {
    if (!shop?.shop_id) return;
    if (!window.confirm(`Delete ${row.name || row.email}?`)) return;
    try {
      setDeletingId(row.id);
      await api.delete(`/staff/${row.id}`, { params: { shop_id: shop.shop_id } });
      setRows((prev) => prev.filter((x) => x.id !== row.id));
    } catch (e) {
      alert(e?.response?.data?.message || "Delete failed.");
    } finally {
      setDeletingId(null);
    }
  }

  const filtered = useMemo(() => {
    const s = (q || "").toLowerCase();
    if (!s) return rows;
    return rows.filter((r) =>
      (r.name || "").toLowerCase().includes(s) ||
      (r.email || "").toLowerCase().includes(s) ||
      (r.role || "").toLowerCase().includes(s)
    );
  }, [q, rows]);

  const canCreateRoleOptions =
    me?.role === "Owner"
      ? ["Manager", "Cashier"]
      : ["Cashier"];

  return (
    <div className="staff-page">
      <div className="card">
        <div className="page-header">
          <h2>Staff</h2>
          <div className="actions">
            <input
              className="input search"
              type="text"
              placeholder="Search name / email / role"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <button className="btn" onClick={openCreate}>+ Add Staff</button>
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
                  <th style={{ width: "16ch" }}>User ID</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th style={{ width: "14ch" }}>Role</th>
                  <th style={{ width: "20ch" }}>Created</th>
                  <th style={{ width: "18ch" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={6} className="empty">No staff.</td></tr>
                ) : filtered.map((row) => (
                  <tr key={row.id}>
                    <td>#{row.id}</td>
                    <td>{row.name || "-"}</td>
                    <td>{row.email || "-"}</td>
                    <td>
                      <span className={`role-pill role-${row.role?.toLowerCase()}`}>{row.role}</span>
                    </td>
                    <td>{formatDateTime(row.created_at)}</td>
                    <td className="row-actions">
                      <button className="btn-sm" onClick={() => openEdit(row)}>Edit</button>
                      <button
                        className="btn-sm danger"
                        onClick={() => remove(row)}
                        disabled={deletingId === row.id}
                        title="Delete user from this shop"
                      >
                        {deletingId === row.id ? "Deleting…" : "Delete"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={isModalOpen}
        onClose={closeModal}
        title={editing ? "Edit Staff" : "Add Staff"}
      >
        <form onSubmit={save} className="form-grid">
          <div className="form-row">
            <label>Name</label>
            <input
              className="input"
              type="text"
              placeholder="Full name"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
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

          <div className="form-row">
            <label>Role</label>
            <select
              className="input"
              value={form.role}
              onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}
              disabled={!(me?.role === "Owner") && !!editing} // Manager cannot change role; Owner can
            >
              {canCreateRoleOptions.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          <div className="form-row">
            <label>{editing ? "Reset Password (optional)" : "Password"}</label>
            <input
              className="input"
              type="password"
              placeholder={editing ? "Leave blank to keep same" : "Set an initial password"}
              value={form.password}
              onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
            />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-outline" onClick={closeModal} disabled={saving}>Cancel</button>
            <button type="submit" className="btn" disabled={saving}>
              {saving ? "Saving…" : (editing ? "Update" : "Create")}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

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
