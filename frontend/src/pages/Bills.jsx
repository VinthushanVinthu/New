// src/pages/Bills.jsx
import React, { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import "../styles/bills.css";

/* ================ Helpers ================ */
function moneyRaw(n) {
  const num = Number(n);
  return Number.isFinite(num) ? num.toFixed(2) : "0.00";
}
function money(n) {
  const num = Number(n);
  return Number.isFinite(num) ? `₹ ${num.toFixed(2)}` : "₹ 0.00";
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

/* ====== Print: date, HTML builder, and iframe-based printer (no popups) ====== */
const fmtDateTimeForPrint = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ` +
  `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

/** Build a standalone HTML page for printing (same layout you used in Create Bill) */
function buildInvoiceHtml({
  billId,
  shop,
  customer,
  rows,
  subtotal,
  discount,
  taxPercent,
  taxAmount,
  total,
  paymentMethod,
  paymentRef,
  amountPaid,
  changeDue,
  // optional extras for view page
  createdAt,
  cashierName,
}) {
  const nowStr = fmtDateTimeForPrint();
  const createdLine = createdAt ? `<div class="muted">Created: ${formatDateTime(createdAt)}</div>` : "";
  const cashierLine = cashierName ? `<div class="muted">Cashier: ${cashierName}</div>` : "";

  const lineRows = (rows || [])
    .filter((r) => r.item && Number(r.qty) > 0)
    .map(
      (r) => `
      <tr>
        <td>${r.item.name || `#${r.item.id || "-"}`}</td>
        <td style="text-align:right;">${moneyRaw(Number(r.item.price))}</td>
        <td style="text-align:right;">${Number(r.qty)}</td>
        <td style="text-align:right;">${moneyRaw(Number(r.item.price) * Number(r.qty))}</td>
      </tr>
    `
    )
    .join("");

  return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Bill #${billId}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    :root{
      --border:#e5e7eb; --text:#111827; --muted:#6b7280; --ink:#111827;
    }
    body{ font-family: system-ui,-apple-system,Segoe UI,Roboto,Inter,Arial; color:var(--text); margin:0; padding:20px; }
    .wrap{ max-width:800px; margin:0 auto; }
    .head{ display:flex; justify-content:space-between; align-items:flex-start; gap:16px; margin-bottom:16px; }
    h1{ font-size:20px; margin:0 0 4px; }
    .muted{ color:var(--muted); font-size:12px; }
    .card{ border:1px solid var(--border); border-radius:10px; padding:14px; margin-bottom:14px; }
    table{ width:100%; border-collapse:collapse; }
    th,td{ padding:10px; border-bottom:1px solid var(--border); font-size:14px; }
    th{ text-align:left; background:#fafafa; }
    .right{ text-align:right; }
    .totals{ margin-top:10px; display:grid; gap:6px; justify-items:end; font-size:14px; }
    .totals div{ display:flex; gap:12px; }
    .big{ font-weight:700; font-size:16px; }
    .footer{ margin-top:18px; text-align:center; font-size:12px; color:var(--muted); }
    @media print {
      @page { margin: 12mm; }
      body { padding:0; }
      .card { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="head">
      <div>
        <h1>${shop?.name || "Shop"}</h1>
        <div class="muted">
          ${shop?.address || ""}${shop?.address ? "<br/>" : ""}
          ${shop?.city || ""} ${shop?.state || ""} ${shop?.zip || ""}<br/>
          ${shop?.phone ? "Phone: " + shop.phone : ""}
        </div>
      </div>
      <div class="right">
        <div><b>Bill #</b> ${billId}</div>
        <div class="muted">Printed: ${nowStr}</div>
        ${createdLine}
        ${cashierLine}
      </div>
    </div>

    <div class="card">
      <b>Customer</b><br/>
      ${customer?.name || "-"}<br/>
      ${customer?.phone || ""}${customer?.phone && customer?.email ? " · " : ""}${customer?.email || ""}
    </div>

    <div class="card">
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th class="right">Price</th>
            <th class="right">Qty</th>
            <th class="right">Line Total</th>
          </tr>
        </thead>
        <tbody>
          ${lineRows || `<tr><td colspan="4" class="muted">No items</td></tr>`}
        </tbody>
      </table>

      <div class="totals">
        <div><span>Subtotal:</span><span class="right">₹ ${moneyRaw(subtotal)}</span></div>
        <div><span>Discount:</span><span class="right">₹ ${moneyRaw(discount)}</span></div>
        <div><span>Tax (${taxPercent}%):</span><span class="right">₹ ${moneyRaw(taxAmount)}</span></div>
        <div class="big"><span>Total:</span><span class="right">₹ ${moneyRaw(total)}</span></div>
      </div>
    </div>

    <div class="card">
      <b>Payment</b>
      <div class="muted" style="margin-top:6px;">
        ${paymentMethod ? `Method: ${paymentMethod}${paymentRef ? ` · Ref: ${paymentRef}` : ""}<br/>` : ""}
        Paid: ₹ ${moneyRaw(amountPaid)}${paymentMethod === "Cash" ? ` · Change: ₹ ${moneyRaw(changeDue || 0)}` : ""}
      </div>
    </div>

    <div class="footer">Thank you for your purchase!</div>
  </div>
</body>
</html>
`;
}

/** Print via hidden iframe (avoids popup blockers) */
function printHtmlViaIframe(html) {
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.src = url;

  const cleanup = () => {
    setTimeout(() => {
      URL.revokeObjectURL(url);
      if (iframe && iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
      }
    }, 1000);
  };

  iframe.onload = () => {
    try {
      const w = iframe.contentWindow;
      if (w) {
        w.focus();
        setTimeout(() => {
          w.print();
          cleanup();
        }, 100);
      } else {
        cleanup();
      }
    } catch {
      cleanup();
    }
  };

  document.body.appendChild(iframe);
}

/* ========== Editor (items + discount only) ========== */
function BillEditor({
  mode, // "view" | "edit"
  shop,
  inventory, // [{id,name,price,stock_quantity}]
  initialItems, // [{saree_id, quantity, price?}]
  initialDiscount = 0,
  taxPercent = 0,
  busy = false,
  meta = null, // { billNo, cashier, createdAt, status, customer }
  payments = [], // read-only list
  onCancel, // edit only
  onSave,   // edit only, payload: { items, discount }
}) {
  const readOnly = mode === "view";

  // rows state
  const [rows, setRows] = useState(() => {
    if (Array.isArray(initialItems) && initialItems.length) {
      return initialItems.map((it, idx) => {
        const base = inventory.find(s => Number(s.id) === Number(it.saree_id)) || {};
        const itemWithHistoricalPrice = {
          ...base,
          id: it.saree_id,
          price: Number(it.price ?? base.price ?? 0),
        };
        return {
          id: Date.now() + idx,
          item: itemWithHistoricalPrice || null,
          qty: Number(it.quantity) || 0,
          error: "",
        };
      });
    }
    return [{ id: Date.now(), item: null, qty: 0, error: "" }];
  });
  const [discount, setDiscount] = useState(Number(initialDiscount) || 0);

  const selectedIds = useMemo(
    () => rows.map(r => (r.item ? Number(r.item.id) : null)).filter(v => v != null),
    [rows]
  );
  const subtotal = useMemo(
    () => rows.reduce((s, r) => s + (r.item ? Number(r.item.price) * Number(r.qty || 0) : 0), 0),
    [rows]
  );
  const cappedDiscount = useMemo(() => {
    const d = Number(discount) || 0;
    return d > subtotal ? subtotal : d;
  }, [discount, subtotal]);
  const taxable = Math.max(0, subtotal - cappedDiscount);
  const tax     = taxable * (Number(taxPercent) / 100);
  const total   = taxable + tax;

  const hasIssues = rows.some(
    (r) =>
      !r.item ||
      Number(r.qty) <= 0 ||
      Number(r.qty) > Number(r.item?.stock_quantity || Infinity) ||
      Boolean(r.error)
  );

  function handleSelect(rowId, sareeId) {
    if (readOnly) return;
    setRows(prev =>
      prev.map(r =>
        r.id === rowId
          ? {
              ...r,
              item: inventory.find(s => String(s.id) === String(sareeId)) || null,
              qty: 0,
              error: "",
            }
          : r
      )
    );
  }
  function handleQty(rowId, qty) {
    if (readOnly) return;
    const n = Number(qty);
    setRows(prev => prev.map(r => {
      if (r.id !== rowId) return r;
      if (!r.item) return { ...r, qty: n, error: "" };
      const maxQty = Number(r.item.stock_quantity ?? Infinity);
      if (Number.isFinite(maxQty) && n > maxQty) return { ...r, qty: maxQty, error: `Max available: ${maxQty}` };
      if (n < 0) return { ...r, qty: 0, error: "" };
      return { ...r, qty: n, error: "" };
    }));
  }
  function addRow() {
    if (readOnly) return;
    setRows(prev => [...prev, { id: Date.now(), item: null, qty: 0, error: "" }]);
  }
  function removeRow(rowId) {
    if (readOnly) return;
    setRows(prev => prev.filter(r => r.id !== rowId));
  }

  function submit() {
    if (readOnly) return;
    if (!rows.length || hasIssues || subtotal <= 0) {
      alert("Fix item issues before saving.");
      return;
    }
    const items = rows.map(r => ({ saree_id: r.item.id, quantity: Number(r.qty) }));
    const payload = { items, discount: Number(cappedDiscount) };
    onSave?.(payload);
  }

  const paidSum = useMemo(() => (payments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0), [payments]);
  const dueNow  = Number(total) - paidSum;

  return (
    <div className="bills-editor">
      {/* Meta header */}
      <div className="bills-meta">
        <div className="bills-meta__row">
          <div><span className="bills-label muted">Shop</span> <strong>{shop?.name || "-"}</strong></div>
          {meta?.billNo && <div><span className="bills-label muted">Bill #</span> <strong>#{meta.billNo}</strong></div>}
          {meta?.status && <div><span className="bills-label muted">Status</span> <span className={`bills-pill bills-pill--${(meta.status || "").toLowerCase()}`}>{meta.status}</span></div>}
        </div>
        <div className="bills-meta__row">
          {meta?.createdAt && <div><span className="bills-label muted">Date</span> {formatDateTime(meta.createdAt)}</div>}
          {meta?.cashier && <div><span className="bills-label muted">Cashier</span> {meta.cashier}</div>}
          {meta?.customer && (
            <div>
              <span className="bills-label muted">Customer</span> {meta.customer?.name || "-"} ({meta.customer?.phone || "-"})
            </div>
          )}
        </div>
      </div>

      {/* Items */}
      <table className="bills-table">
        <thead>
          <tr>
            <th>Item</th>
            <th style={{ width: "12ch" }}>Qty</th>
            <th style={{ width: "14ch" }}>Price</th>
            <th style={{ width: "14ch" }}>Line</th>
            {!readOnly && <th style={{ width: "10ch" }}>Remove</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id}>
              <td>
                {readOnly ? (
                  <div>{r.item?.name || `#${r.item?.id || "-"}`}</div>
                ) : (
                  <select
                    value={r.item?.id || ""}
                    onChange={(e) => handleSelect(r.id, e.target.value)}
                    className="bills-input"
                  >
                    <option value="">-- Select Item --</option>
                    {inventory
                      .filter(s => !selectedIds.includes(Number(s.id)) || s.id === r.item?.id)
                      .map(s => (
                        <option key={s.id} value={s.id}>
                          {s.name} (₹{Number(s.price).toFixed(2)}, Stock: {s.stock_quantity})
                        </option>
                      ))}
                  </select>
                )}
              </td>
              <td>
                {readOnly ? (
                  <div>{r.qty}</div>
                ) : (
                  <>
                    <input
                      className="bills-input"
                      type="number"
                      min="0"
                      value={r.qty}
                      onChange={(e) => handleQty(r.id, e.target.value)}
                    />
                    {r.error && <div className="bills-error">{r.error}</div>}
                  </>
                )}
              </td>
              <td>{r.item ? money(r.item.price) : "-"}</td>
              <td>{r.item ? money(Number(r.item.price) * Number(r.qty || 0)) : "-"}</td>
              {!readOnly && (
                <td>
                  <button
                    className="bills-btn bills-btn--sm bills-btn--danger"
                    onClick={() => removeRow(r.id)}
                    disabled={rows.length === 1}
                  >
                    ×
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {!readOnly && (
        <button className="bills-btn" onClick={addRow} style={{ marginTop: 8 }}>+ Add Row</button>
      )}

      {/* Bill summary */}
      <div className="bills-summary" style={{ marginTop: 12 }}>
        <div>Subtotal: <strong>{money(subtotal)}</strong></div>
        <div className="bills-form-row">
          <label>Discount</label>
          {readOnly ? (
            <div style={{ padding: "6px 0" }}>{money(discount)}</div>
          ) : (
            <>
              <input
                className="bills-input"
                type="number"
                min="0"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
              />
              {Number(discount) > subtotal && (
                <span className="bills-error" style={{ marginLeft: 8 }}>
                  (capped at {money(subtotal)})
                </span>
              )}
            </>
          )}
        </div>
        <div>Tax ({taxPercent}%): {money(tax)}</div>
        <div><strong>Total: {money(total)}</strong></div>
      </div>

      {/* Payments history (read-only list) */}
      <div className="bills-card-lite" style={{ marginTop: 16 }}>
        <h4>Payments</h4>
        {(payments || []).length === 0 ? (
          <div className="bills-muted">No payments recorded.</div>
        ) : (
          <table className="bills-mini-table" style={{ marginTop: 8 }}>
            <thead>
              <tr>
                <th style={{width:"12ch"}}>ID</th>
                <th style={{width:"12ch"}}>Method</th>
                <th>Reference</th>
                <th style={{width:"14ch"}}>Amount</th>
                <th style={{width:"22ch"}}>Date</th>
              </tr>
            </thead>
            <tbody>
              {payments.map(p => (
                <tr key={p.payment_id}>
                  <td>#{p.payment_id}</td>
                  <td>{p.method}</td>
                  <td>{p.reference || "-"}</td>
                  <td><strong>{money(p.amount)}</strong></td>
                  <td>{formatDateTime(p.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Totals */}
        <div className="bills-totals" style={{ marginTop: 8 }}>
          <div><span>Paid</span><strong>{money(paidSum)}</strong></div>
          <div><span>Due</span><strong>{money(dueNow)}</strong></div>
        </div>
      </div>

      {!readOnly && (
        <div className="bills-modal-actions" style={{ marginTop: 12 }}>
          <button className="bills-btn bills-btn--outline" onClick={onCancel} disabled={busy}>Cancel</button>
          <button className="bills-btn" onClick={submit} disabled={busy || hasIssues || subtotal <= 0}>
            {busy ? "Saving…" : "Save Changes"}
          </button>
        </div>
      )}
    </div>
  );
}

/* ============== Add Payment (matches POST /:bill_id/payments) ============== */
function AddPayment({ billId, onAdded }) {
  const [method, setMethod] = useState("Cash");
  const [reference, setReference] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const amt = Number(amount);
    if (!amt || amt <= 0) return alert("Enter a valid amount > 0");
    try {
      setBusy(true);
      await api.post(`/billing/${billId}/payments`, {
        amount: amt,
        method,
        reference: reference || null
      });
      setAmount("");
      setReference("");
      setMethod("Cash");
      onAdded?.();
    } catch (e) {
      alert(e?.response?.data?.message || "Add payment failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bills-card-lite" style={{ marginTop: 16 }}>
      <h4>Add Payment</h4>
      <div className="bills-form-grid" style={{ marginTop: 8 }}>
        <div className="bills-form-row">
          <label>Method</label>
          <select className="bills-input" value={method} onChange={(e)=>setMethod(e.target.value)}>
            <option value="Cash">Cash</option>
            <option value="Card">Card</option>
            <option value="UPI">UPI</option>
          </select>
        </div>
        <div className="bills-form-row">
          <label>Reference</label>
          <input className="bills-input" type="text" value={reference} onChange={(e)=>setReference(e.target.value)} />
        </div>
        <div className="bills-form-row">
          <label>Amount</label>
          <input className="bills-input" type="number" min="0" step="0.01" value={amount} onChange={(e)=>setAmount(e.target.value)} />
        </div>
        <div className="bills-modal-actions">
          <button className="bills-btn" onClick={submit} disabled={busy}>{busy ? "Adding…" : "Add Payment"}</button>
        </div>
      </div>
    </div>
  );
}

/* ============== Detail Page (inline, now with PRINT) ============== */
function BillDetailPage({
  billId,
  shop,
  inventory,
  taxPercentDefault,
  onBack,
}) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState("view"); // "view" | "edit"
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      setLoading(true);
      const { data } = await api.get(`/billing/${billId}`);
      setDetail(data);
    } catch (e) {
      alert(e?.response?.data?.message || "Failed to load bill details.");
      onBack?.(); // bounce back if not found/forbidden
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [billId]);

  async function saveEdit(payload) {
    if (!detail?.bill) return;
    try {
      setSaving(true);
      // items + discount only (backend supports /full)
      await api.put(`/billing/${detail.bill.bill_id}/full`, {
        items: payload.items,
        discount: payload.discount,
      });
      await load();
      setMode("view");
    } catch (e) {
      alert(e?.response?.data?.message || "Full update failed.");
    } finally {
      setSaving(false);
    }
  }

  /** Build a print payload from loaded detail and call iframe printer */
  function printThisBill() {
    if (!detail?.bill) return;

    const bill = detail.bill;
    const items = Array.isArray(detail.items) ? detail.items : [];

    // Build rows compatible with builder
    const rows = items.map((it) => {
      const inv = inventory.find(s => Number(s.id) === Number(it.saree_id)) || {};
      const name = it.name || it.item_name || it.saree_name || inv.name || `#${it.saree_id}`;
      const price = Number(it.price ?? inv.price ?? 0);
      return {
        item: { id: it.saree_id, name, price },
        qty: Number(it.quantity) || 0,
      };
    });

    // Totals (recompute to be safe)
    const subtotal = rows.reduce((s, r) => s + Number(r.item.price) * Number(r.qty), 0);
    const discount = Number(bill.discount || 0);
    const taxPercent = Number(bill.tax_percentage ?? taxPercentDefault) || 0;
    const taxable = Math.max(0, subtotal - Math.min(discount, subtotal));
    const taxAmount = taxable * (taxPercent / 100);
    const total = taxable + taxAmount;

    // Payments summary
    const payments = Array.isArray(detail.payments) ? detail.payments : [];
    const paidSum = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const uniqueMethods = [...new Set(payments.map(p => p.method).filter(Boolean))];
    const paymentMethod = uniqueMethods.length > 1 ? "Mixed" : (uniqueMethods[0] || "");
    const paymentRef = payments.length === 1 ? (payments[0].reference || "") : "";
    const amountPaid = paidSum;
    const changeDue = 0;

    const customer = {
      name: bill.customer_name || "",
      phone: bill.customer_phone || "",
      email: bill.customer_email || "",
    };

    const html = buildInvoiceHtml({
      billId: bill.bill_id,
      shop,
      customer,
      rows,
      subtotal,
      discount,
      taxPercent,
      taxAmount,
      total,
      paymentMethod,
      paymentRef,
      amountPaid,
      changeDue,
      createdAt: bill.created_at,
      cashierName: bill.cashier_name,
    });

    printHtmlViaIframe(html);
  }

  if (loading) {
    return (
      <div className="card">
        <div className="bills-header">
          <h2>Bill</h2>
          <div className="bills-actions">
            <button className="bills-btn bills-btn--outline" onClick={onBack}>← Back</button>
          </div>
        </div>
        <div className="bills-loading">Loading…</div>
      </div>
    );
  }

  if (!detail?.bill) {
    return (
      <div className="card">
        <div className="bills-header">
          <h2>Bill</h2>
          <div className="bills-actions">
            <button className="bills-btn bills-btn--outline" onClick={onBack}>← Back</button>
          </div>
        </div>
        <div className="bills-error">Bill not found.</div>
      </div>
    );
  }

  const bill = detail.bill;
  const taxPercent = Number(bill.tax_percentage ?? taxPercentDefault) || 0;

  return (
    <div className="card">
      <div className="bills-header">
        <h2>{mode === "edit" ? `Edit Bill #${bill.bill_id}` : `Bill #${bill.bill_id}`}</h2>
        <div className="bills-actions">
          <button className="bills-btn bills-btn--outline" onClick={onBack}>← Back</button>
          {mode === "view" && (
            <button className="bills-btn" onClick={printThisBill}>Print</button>
          )}
          {mode === "view" ? (
            <button className="bills-btn" onClick={()=>setMode("edit")}>Edit</button>
          ) : (
            <button className="bills-btn bills-btn--outline" onClick={()=>setMode("view")} disabled={saving}>Cancel Edit</button>
          )}
        </div>
      </div>

      <BillEditor
        mode={mode}
        shop={shop}
        inventory={inventory}
        initialItems={(detail.items || []).map(it => ({ saree_id: it.saree_id, quantity: it.quantity, price: it.price, name: it.saree_name || it.name }))}
        initialDiscount={bill.discount || 0}
        taxPercent={taxPercent}
        busy={saving}
        meta={{
          billNo: bill.bill_id,
          cashier: bill.cashier_name,
          createdAt: bill.created_at,
          status: bill.status,
          customer: { name: bill.customer_name, phone: bill.customer_phone },
        }}
        payments={detail.payments || []}
        onCancel={()=>setMode("view")}
        onSave={saveEdit}
      />

      {/* Add Payment section (works with POST /:id/payments) */}
      <AddPayment billId={bill.bill_id} onAdded={load} />
    </div>
  );
}

/* ============== Main Bills page (table + inline detail) ============== */
export default function Bills() {
  const { user } = useAuth();

  const [shop, setShop] = useState(null);
  const [taxPercent, setTaxPercent] = useState(0);
  const [inventory, setInventory] = useState([]);

  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  // "list" or "detail"
  const [page, setPage] = useState("list");
  const [currentBillId, setCurrentBillId] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const shopRes = await api.get("/shop/my");
        const s = shopRes.data?.[0] || null;
        setShop(s);
        setTaxPercent(Number(s?.tax_percentage) || 0);

        if (s?.shop_id) {
          const { data } = await api.get("/inventory/sarees", { params: { shop_id: s.shop_id } });
          setInventory(Array.isArray(data) ? data : []);
          await fetchBills(s.shop_id);
        }
      } catch (e) {
        alert(e?.response?.data?.message || "Failed to load shop/inventory.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function fetchBills(shop_id) {
    try {
      setLoading(true);
      const { data } = await api.get(`/billing/shop/${shop_id}`);
      setBills(Array.isArray(data?.bills) ? data.bills : []);
    } catch (e) {
      alert(e?.response?.data?.message || "Failed to load bills.");
    } finally {
      setLoading(false);
    }
  }

  function openDetail(row) {
    setCurrentBillId(row.bill_id);
    setPage("detail");
  }
  function backToList() {
    setPage("list");
    setCurrentBillId(null);
    if (shop?.shop_id) fetchBills(shop.shop_id);
  }

  async function deleteBill(row) {
    if (!window.confirm(`Delete bill #${row.bill_id}? This will restore stock.`)) return;
    try {
      await api.delete(`/billing/${row.bill_id}`);
      setBills(prev => prev.filter(b => b.bill_id !== row.bill_id));
      if (page === "detail" && currentBillId === row.bill_id) {
        backToList();
      }
    } catch (e) {
      alert(e?.response?.data?.message || "Delete failed.");
    }
  }

  const filtered = useMemo(() => {
    const s = (q || "").toLowerCase();
    if (!s) return bills;
    return bills.filter((b) =>
      String(b.bill_id).includes(s) ||
      (b.status || "").toLowerCase().includes(s) ||
      (b.cashier_name || "").toLowerCase().includes(s)
    );
  }, [q, bills]);

  if (page === "detail" && currentBillId) {
    return (
      <div className="bills-page">
        <BillDetailPage
          billId={currentBillId}
          shop={shop}
          inventory={inventory}
          taxPercentDefault={taxPercent}
          onBack={backToList}
        />
      </div>
    );
  }

  // List page
  return (
    <div className="bills-page">
      <div className="card">
        <div className="bills-header">
          <h2>Bills</h2>
          <div className="bills-actions">
            <input
              className="bills-input bills-input--search"
              type="text"
              placeholder="Search bill # / status / cashier"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            {!loading && shop?.shop_id && (
              <button className="bills-btn" onClick={() => fetchBills(shop.shop_id)}>
                Refresh
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="bills-loading">Loading…</div>
        ) : !shop?.shop_id ? (
          <div className="bills-error">No shop found for current user.</div>
        ) : (
          <div className="bills-table-wrap">
            <table className="bills-table">
              <thead>
                <tr>
                  <th style={{ width: "12ch" }}>Bill #</th>
                  <th style={{ width: "20ch" }}>Date</th>
                  <th>Cashier</th>
                  <th style={{ width: "14ch" }}>Subtotal</th>
                  <th style={{ width: "12ch" }}>Discount</th>
                  <th style={{ width: "12ch" }}>Tax</th>
                  <th style={{ width: "14ch" }}>Total</th>
                  <th style={{ width: "12ch" }}>Status</th>
                  <th style={{ width: "28ch" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={9} className="bills-empty">No bills found.</td></tr>
                ) : (
                  filtered.map((row) => (
                    <tr key={row.bill_id}>
                      <td>#{row.bill_id}</td>
                      <td>{formatDateTime(row.created_at)}</td>
                      <td>{row.cashier_name || "-"}</td>
                      <td>{money(row.subtotal)}</td>
                      <td>{money(row.discount)}</td>
                      <td>{money(row.tax)}</td>
                      <td><strong>{money(row.total_amount)}</strong></td>
                      <td>
                        <span className={`bills-pill bills-pill--${(row.status || "").toLowerCase()}`}>
                          {row.status}
                        </span>
                      </td>
                      <td className="bills-row-actions">
                        <button className="bills-btn bills-btn--sm" onClick={() => openDetail(row)}>
                          Open
                        </button>
                        <button
                          className="bills-btn bills-btn--sm bills-btn--danger"
                          onClick={() => deleteBill(row)}
                        >
                          Delete
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
    </div>
  );
}
