// src/pages/staf.jsx
import React, { useEffect, useMemo, useState } from "react";
import { api, getUser } from "../lib/api.js";
import "../styles/staff.css";
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
          <button className="btn-close" onClick={onClose} aria-label="Close">
            ×
          </button>
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

  // view drawer/panel
  const [viewer, setViewer] = useState({
    open: false,
    staff: null, // row
    tab: "overview", // overview | bills | payments
  });

  // per-viewer data
  const [summary, setSummary] = useState(null);
  const [sumLoading, setSumLoading] = useState(false);

  const [billState, setBillState] = useState({
    loading: false,
    q: "",
    status: "",
    page: 1,
    pageSize: 10,
    total: 0,
    rows: [],
  });

  const [payState, setPayState] = useState({
    loading: false,
    q: "",
    page: 1,
    pageSize: 10,
    total: 0,
    rows: [],
  });

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
      password: "", // optional reset
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
      const roleAllowed = me?.role === "Owner" ? ["Manager", "Cashier"] : ["Cashier"];
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
        if (me?.role === "Owner") body.role = form.role;
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
    return rows.filter(
      (r) =>
        (r.name || "").toLowerCase().includes(s) ||
        (r.email || "").toLowerCase().includes(s) ||
        (r.role || "").toLowerCase().includes(s)
    );
  }, [q, rows]);

  const canCreateRoleOptions = me?.role === "Owner" ? ["Manager", "Cashier"] : ["Cashier"];

  // -------- PDF EXPORT ----------
  function exportPdf() {
    const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });

    const title = "Staff Report";
    const sub = [
      shop?.shop_name ? `Shop: ${shop.shop_name}` : "",
      shop?.shop_id ? `Shop ID: ${shop.shop_id}` : "",
      `Generated: ${new Date().toLocaleString()}`,
    ]
      .filter(Boolean)
      .join("   •   ");

    doc.setFontSize(16);
    doc.text(title, 40, 40);
    doc.setFontSize(10);
    doc.text(sub, 40, 58);

    const head = [["#", "Name", "Email", "Role", "Created"]];
    const body = filtered.map((r, idx) => [
      `${idx + 1}`,
      r.name || "-",
      r.email || "-",
      r.role || "-",
      formatDateTime(r.created_at),
    ]);

    autoTable(doc, {
      head,
      body,
      startY: 72,
      styles: { fontSize: 10, cellPadding: 6, overflow: "linebreak" },
      headStyles: { fontStyle: "bold" },
      columnStyles: {
        0: { cellWidth: 50 },
        1: { cellWidth: 150 },
        2: { cellWidth: 200 },
        3: { cellWidth: 80 },
        4: { cellWidth: 100 },
      },
      didDrawPage: () => {
        const pageSize = doc.internal.pageSize;
        const pageHeight = pageSize.height ? pageSize.height : pageSize.getHeight();
        const pageWidth = pageSize.width ? pageSize.width : pageSize.getWidth();
        doc.setFontSize(9);
        doc.text(`Page ${doc.getNumberOfPages()}`, pageWidth - 60, pageHeight - 20);
      },
    });

    const fileName = `staff_${shop?.shop_id || "shop"}_${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(fileName);
  }
  // ------------------------------

  // ===== VIEWER (Overview/Bills/Payments) =====
  function openViewer(row) {
    setViewer({ open: true, staff: row, tab: "overview" });
    setSummary(null);
    if (shop?.shop_id) {
      loadSummary(row.id, shop.shop_id);
      // prime the lists
      loadBills(row.id, shop.shop_id, { page: 1 });
      loadPayments(row.id, shop.shop_id, { page: 1 });
    }
  }
  function closeViewer() {
    setViewer({ open: false, staff: null, tab: "overview" });
    setSummary(null);
    setBillState((s) => ({ ...s, rows: [], total: 0, page: 1 }));
    setPayState((s) => ({ ...s, rows: [], total: 0, page: 1 }));
  }

  async function loadSummary(staffId, shopId) {
    try {
      setSumLoading(true);
      const { data } = await api.get(`/staff/${staffId}/summary`, { params: { shop_id: shopId } });
      setSummary(data);
    } catch (e) {
      alert(e?.response?.data?.message || "Failed to load summary.");
    } finally {
      setSumLoading(false);
    }
  }

  async function loadBills(
    staffId,
    shopId,
    { page, pageSize, q, status } = {}
  ) {
    try {
      setBillState((s) => ({ ...s, loading: true }));
      const params = {
        shop_id: shopId,
        page: page ?? billState.page,
        page_size: pageSize ?? billState.pageSize,
      };
      if (q !== undefined) params.q = q;
      if (status !== undefined) params.status = status;
      const { data } = await api.get(`/staff/${staffId}/bills`, { params });
      setBillState((s) => ({
        ...s,
        loading: false,
        page: data.page,
        pageSize: data.page_size,
        total: data.total,
        rows: data.rows || [],
        ...(q !== undefined ? { q } : {}),
        ...(status !== undefined ? { status } : {}),
      }));
    } catch (e) {
      setBillState((s) => ({ ...s, loading: false }));
      alert(e?.response?.data?.message || "Failed to load bills.");
    }
  }

  async function loadPayments(
    staffId,
    shopId,
    { page, pageSize, q } = {}
  ) {
    try {
      setPayState((s) => ({ ...s, loading: true }));
      const params = {
        shop_id: shopId,
        page: page ?? payState.page,
        page_size: pageSize ?? payState.pageSize,
      };
      if (q !== undefined) params.q = q;
      const { data } = await api.get(`/staff/${staffId}/payments`, { params });
      setPayState((s) => ({
        ...s,
        loading: false,
        page: data.page,
        pageSize: data.page_size,
        total: data.total,
        rows: data.rows || [],
        ...(q !== undefined ? { q } : {}),
      }));
    } catch (e) {
      setPayState((s) => ({ ...s, loading: false }));
      alert(e?.response?.data?.message || "Failed to load payments.");
    }
  }

  // ===== RENDER =====
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
            <button className="btn" onClick={openCreate}>
              + Add Staff
            </button>
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

        {loading ? (
          <div className="loading">Loading…</div>
        ) : !shop?.shop_id ? (
          <div className="error-msg">No shop found for current user.</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: "8ch" }}>#</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th style={{ width: "14ch" }}>Role</th>
                  <th style={{ width: "20ch" }}>Created</th>
                  <th style={{ width: "26ch" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="empty">
                      No staff.
                    </td>
                  </tr>
                ) : (
                  filtered.map((row, idx) => (
                    <tr key={row.id}>
                      <td>{idx + 1}</td>
                      <td>{row.name || "-"}</td>
                      <td>{row.email || "-"}</td>
                      <td>
                        <span className={`role-pill role-${row.role?.toLowerCase()}`}>
                          {row.role}
                        </span>
                      </td>
                      <td>{formatDateTime(row.created_at)}</td>
                      <td className="row-actions">
                        <button className="btn-sm" onClick={() => openViewer(row)} title="View details">
                          View
                        </button>
                        <button className="btn-sm" onClick={() => openEdit(row)}>
                          Edit
                        </button>
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
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      <Modal open={isModalOpen} onClose={closeModal} title={editing ? "Edit Staff" : "Add Staff"}>
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
              {canCreateRoleOptions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
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
            <button type="button" className="btn-outline" onClick={closeModal} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn" disabled={saving}>
              {saving ? "Saving…" : editing ? "Update" : "Create"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Viewer Drawer/Panel */}
      {viewer.open && (
        <div className="drawer-backdrop" onClick={closeViewer}>
          <div className="drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <div className="drawer-title">
                  {viewer.staff?.name || viewer.staff?.email || "Staff"}
                </div>
                <div className="drawer-subtitle">
                  <span className={`role-pill role-${(viewer.staff?.role || "").toLowerCase()}`}>
                    {viewer.staff?.role}
                  </span>
                  <span className="dot">•</span>
                  <span>Joined: {formatDateTime(viewer.staff?.created_at)}</span>
                </div>
              </div>
              <button className="btn-close" onClick={closeViewer} aria-label="Close">
                ×
              </button>
            </div>

            <div className="tabs">
              <button
                className={`tab ${viewer.tab === "overview" ? "active" : ""}`}
                onClick={() => setViewer((v) => ({ ...v, tab: "overview" }))}
              >
                Overview
              </button>
              <button
                className={`tab ${viewer.tab === "bills" ? "active" : ""}`}
                onClick={() => setViewer((v) => ({ ...v, tab: "bills" }))}
              >
                Bills
              </button>
              <button
                className={`tab ${viewer.tab === "payments" ? "active" : ""}`}
                onClick={() => setViewer((v) => ({ ...v, tab: "payments" }))}
              >
                Payments
              </button>
            </div>

            <div className="drawer-body">
              {viewer.tab === "overview" && (
                <div>
                  {sumLoading ? (
                    <div className="loading">Loading summary…</div>
                  ) : !summary ? (
                    <div className="empty">No activity.</div>
                  ) : (
                    <>
                      <div className="grid-3">
                        <StatCard label="Total Bills" value={summary.total_bills} />
                        <StatCard
                          label="Total Sales (₹)"
                          value={fmtMoney(summary.total_amount_sum)}
                        />
                        <StatCard label="Paid (₹)" value={fmtMoney(summary.paid_sum)} />
                        <StatCard label="Outstanding (₹)" value={fmtMoney(summary.outstanding_sum)} />
                        <StatCard label="Subtotal (₹)" value={fmtMoney(summary.subtotal_sum)} />
                        <StatCard label="Discount (₹)" value={fmtMoney(summary.discount_sum)} />
                        <StatCard label="Tax (₹)" value={fmtMoney(summary.tax_sum)} />
                        <StatCard label="First Bill" value={formatDateTime(summary.first_bill_at)} />
                        <StatCard label="Last Bill" value={formatDateTime(summary.last_bill_at)} />
                      </div>
                    </>
                  )}
                </div>
              )}

              {viewer.tab === "bills" && (
                <div>
                  <div className="toolbar">
                    <input
                      className="input"
                      placeholder="Search bill # / customer name / phone / email"
                      value={billState.q}
                      onChange={(e) => setBillState((s) => ({ ...s, q: e.target.value }))}
                    />
                    <select
                      className="input"
                      value={billState.status}
                      onChange={(e) => setBillState((s) => ({ ...s, status: e.target.value }))}
                    >
                      <option value="">All Status</option>
                      <option value="PAID">PAID</option>
                      <option value="PARTIAL">PARTIAL</option>
                      <option value="UNPAID">UNPAID</option>
                    </select>
                    <button
                      className="btn"
                      onClick={() =>
                        loadBills(viewer.staff.id, shop.shop_id, {
                          page: 1,
                          q: billState.q,
                          status: billState.status,
                        })
                      }
                    >
                      Search
                    </button>
                  </div>

                  {billState.loading ? (
                    <div className="loading">Loading bills…</div>
                  ) : (
                    <div className="table-wrap">
                      <table className="table">
                        <thead>
                          <tr>
                            <th style={{ width: "10ch" }}>Bill #</th>
                            <th>Customer</th>
                            <th style={{ width: "16ch" }}>Date</th>
                            <th style={{ width: "12ch" }}>Total (₹)</th>
                            <th style={{ width: "12ch" }}>Paid (₹)</th>
                            <th style={{ width: "12ch" }}>Balance (₹)</th>
                            <th style={{ width: "10ch" }}>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {billState.rows.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="empty">
                                No bills.
                              </td>
                            </tr>
                          ) : (
                            billState.rows.map((b) => {
                              const paid = Number(b.paid_amount || 0);
                              const bal = round2(b.total_amount - paid);
                              return (
                                <tr key={b.bill_id}>
                                  <td>#{b.bill_id}</td>
                                  <td>
                                    {b.customer_name || "-"}
                                    {b.customer_phone ? (
                                      <div className="sub">{b.customer_phone}</div>
                                    ) : null}
                                  </td>
                                  <td>{formatDateTime(b.created_at)}</td>
                                  <td>{fmtMoney(b.total_amount)}</td>
                                  <td>{fmtMoney(paid)}</td>
                                  <td>{fmtMoney(bal)}</td>
                                  <td>
                                    <span className={`status-pill status-${b.status?.toLowerCase()}`}>
                                      {b.status}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <Pager
                    page={billState.page}
                    pageSize={billState.pageSize}
                    total={billState.total}
                    onPageChange={(p) =>
                      loadBills(viewer.staff.id, shop.shop_id, {
                        page: p,
                        q: billState.q,
                        status: billState.status,
                      })
                    }
                  />
                </div>
              )}

              {viewer.tab === "payments" && (
                <div>
                  <div className="toolbar">
                    <input
                      className="input"
                      placeholder="Search reference / method / bill #"
                      value={payState.q}
                      onChange={(e) => setPayState((s) => ({ ...s, q: e.target.value }))}
                    />
                    <button
                      className="btn"
                      onClick={() =>
                        loadPayments(viewer.staff.id, shop.shop_id, {
                          page: 1,
                          q: payState.q,
                        })
                      }
                    >
                      Search
                    </button>
                  </div>

                  {payState.loading ? (
                    <div className="loading">Loading payments…</div>
                  ) : (
                    <div className="table-wrap">
                      <table className="table">
                        <thead>
                          <tr>
                            <th style={{ width: "10ch" }}>Pay #</th>
                            <th style={{ width: "10ch" }}>Bill #</th>
                            <th style={{ width: "12ch" }}>Method</th>
                            <th>Reference</th>
                            <th style={{ width: "14ch" }}>Amount (₹)</th>
                            <th style={{ width: "16ch" }}>Date</th>
                            <th style={{ width: "10ch" }}>Bill Sts</th>
                          </tr>
                        </thead>
                        <tbody>
                          {payState.rows.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="empty">
                                No payments.
                              </td>
                            </tr>
                          ) : (
                            payState.rows.map((p) => (
                              <tr key={p.payment_id}>
                                <td>#{p.payment_id}</td>
                                <td>#{p.bill_id}</td>
                                <td>{p.method}</td>
                                <td>{p.reference || "-"}</td>
                                <td>{fmtMoney(p.amount)}</td>
                                <td>{formatDateTime(p.created_at)}</td>
                                <td>
                                  <span className={`status-pill status-${(p.bill_status || "").toLowerCase()}`}>
                                    {p.bill_status}
                                  </span>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <Pager
                    page={payState.page}
                    pageSize={payState.pageSize}
                    total={payState.total}
                    onPageChange={(p) =>
                      loadPayments(viewer.staff.id, shop.shop_id, {
                        page: p,
                        q: payState.q,
                      })
                    }
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{String(value ?? "-")}</div>
    </div>
  );
}

function Pager({ page, pageSize, total, onPageChange }) {
  const totalPages = Math.max(1, Math.ceil((total || 0) / (pageSize || 10)));
  const canPrev = page > 1;
  const canNext = page < totalPages;
  if (totalPages <= 1) return null;

  return (
    <div className="pager">
      <button className="btn-outline" disabled={!canPrev} onClick={() => canPrev && onPageChange(page - 1)}>
        ← Prev
      </button>
      <span className="pager-info">
        Page {page} / {totalPages} &nbsp;•&nbsp; {total} items
      </span>
      <button className="btn-outline" disabled={!canNext} onClick={() => canNext && onPageChange(page + 1)}>
        Next →
      </button>
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
function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}
function fmtMoney(n) {
  const v = Number.isFinite(Number(n)) ? Number(n).toFixed(2) : "0.00";
  return v;
}
