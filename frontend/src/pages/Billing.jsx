import React, { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api.js";
import "../styles/billing.css"; // unchanged path; classes inside are all namespaced

const MONEY = (n) => (Number.isFinite(n) ? n.toFixed(2) : "0.00");

// Simple date-time for the invoice header
const fmtDateTime = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ` +
  `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

// Build a standalone HTML page for printing
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
}) {
  const dateStr = fmtDateTime();

  // Table rows (only lines with an item and qty>0)
  const lineRows = rows
    .filter((r) => r.item && Number(r.qty) > 0)
    .map(
      (r) => `
      <tr>
        <td>${r.item.name}</td>
        <td style="text-align:right;">${MONEY(Number(r.item.price))}</td>
        <td style="text-align:right;">${Number(r.qty)}</td>
        <td style="text-align:right;">${MONEY(Number(r.item.price) * Number(r.qty))}</td>
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
        <div class="muted">${dateStr}</div>
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
        <div><span>Subtotal:</span><span class="right">₹ ${MONEY(subtotal)}</span></div>
        <div><span>Discount:</span><span class="right">₹ ${MONEY(discount)}</span></div>
        <div><span>Tax (${taxPercent}%):</span><span class="right">₹ ${MONEY(taxAmount)}</span></div>
        <div class="big"><span>Total:</span><span class="right">₹ ${MONEY(total)}</span></div>
      </div>
    </div>

    <div class="card">
      <b>Payment</b>
      <div class="muted" style="margin-top:6px;">
        Method: ${paymentMethod}${paymentRef ? ` · Ref: ${paymentRef}` : ""}<br/>
        Paid: ₹ ${MONEY(amountPaid)}${paymentMethod === "Cash" ? ` · Change: ₹ ${MONEY(changeDue)}` : ""}
      </div>
    </div>

    <div class="footer">Thank you for your purchase!</div>
  </div>

  <script>
    // No auto-close here; iframe printing handles the close.
  </script>
</body>
</html>
`;
}

/* ========= NEW: Robust print via hidden iframe (no popups) ========= */
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
        // Ensure render, then print
        w.focus();
        // Slight delay helps some browsers render fonts/layout before print
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

/* ===== Optional fallback: open a new tab if you really want it =====
function openPrintWindowInNewTab(html) {
  // Must be called directly from a user click to avoid blockers.
  const win = window.open("", "_blank", "noopener,noreferrer,width=900,height=650");
  if (!win) {
    alert("Popup blocked. Your browser prevented opening a new tab.");
    return false;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  return true;
}
*/

export default function Billing() {
  const [shop, setShop] = useState(null);

  // Inventory / rows
  const [sarees, setSarees] = useState([]);
  const [rows, setRows] = useState([{ id: Date.now(), item: null, qty: 0, error: "" }]);

  // Totals
  const [discount, setDiscount] = useState(0);
  const [taxPercent, setTaxPercent] = useState(0);

  // Payment
  const [paymentMethod, setPaymentMethod] = useState("Cash"); // Cash | Card | UPI
  const [paymentRef, setPaymentRef] = useState("");
  const [amountTendered, setAmountTendered] = useState("");

  // Customer
  const [customer, setCustomer] = useState(null); // selected customer row
  const [phoneQuery, setPhoneQuery] = useState(""); // search by phone
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [newCust, setNewCust] = useState({ name: "", phone: "", email: "" });
  const [customerBusy, setCustomerBusy] = useState(false);

  // Result / UI
  const [isCreating, setIsCreating] = useState(false);

  // ---------- data loaders ----------
  const loadShopAndInventory = async () => {
    const shopRes = await api.get("/shop/my");
    const shopData = shopRes.data?.[0];
    setShop(shopData || null);
    setTaxPercent(Number(shopData?.tax_percentage) || 0);

    if (shopData?.shop_id) {
      const { data } = await api.get("/inventory/sarees", {
        params: { shop_id: shopData.shop_id },
      });
      setSarees(Array.isArray(data) ? data : []);
    } else {
      setSarees([]);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        await loadShopAndInventory();
      } catch (err) {
        alert(err?.response?.data?.message || "Failed to load shop/inventory.");
      }
    })();
  }, []);

  // ---------------- Customer helpers ----------------
  async function findCustomerByPhone() {
    if (!shop?.shop_id || !phoneQuery) {
      alert("Enter phone to search.");
      return;
    }
    setCustomerBusy(true);
    try {
      const { data } = await api.get("/customers/by-phone", {
        params: { shop_id: shop.shop_id, phone: phoneQuery },
      });
      if (data) {
        setCustomer(data);
        setCreatingCustomer(false);
        setNewCust({ name: "", phone: "", email: "" });
      } else {
        // not found → open create form prefilled with phone
        setCustomer(null);
        setCreatingCustomer(true);
        setNewCust((p) => ({ ...p, phone: phoneQuery }));
      }
    } catch (e) {
      alert(e?.response?.data?.message || "Failed to search customer.");
    } finally {
      setCustomerBusy(false);
    }
  }

  async function createCustomer() {
    if (!shop?.shop_id) return;
    if (!newCust.phone) {
      alert("Phone is required to create a customer.");
      return;
    }
    setCustomerBusy(true);
    try {
      const { data } = await api.post("/customers", {
        shop_id: shop.shop_id,
        name: newCust.name || null,
        phone: newCust.phone,
        email: newCust.email || null,
      });
      setCustomer(data);
      setCreatingCustomer(false);
      setNewCust({ name: "", phone: "", email: "" });
      setPhoneQuery(""); // clear search
    } catch (e) {
      // If duplicate we could auto pick returned id if your API returns it (409)
      const m = e?.response?.data?.message;
      if (e?.response?.status === 409 && e?.response?.data?.customer_id) {
        setCustomer({
          customer_id: e.response.data.customer_id,
          name: newCust.name || "",
          phone: newCust.phone || "",
          email: newCust.email || "",
        });
        setCreatingCustomer(false);
      } else {
        alert(m || "Failed to create customer.");
      }
    } finally {
      setCustomerBusy(false);
    }
  }

  function clearCustomer() {
    setCustomer(null);
    setPhoneQuery("");
    setCreatingCustomer(false);
    setNewCust({ name: "", phone: "", email: "" });
  }

  // ---------------- Items table ----------------
  function handleSelect(rowId, sareeId) {
    setRows((prev) =>
      prev.map((r) =>
        r.id === rowId
          ? {
              ...r,
              item: sarees.find((s) => String(s.id) === String(sareeId)) || null,
              qty: 0,
              error: "",
            }
          : r
      )
    );
  }

  function handleQty(rowId, qty) {
    const newQty = Number(qty);
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        if (!r.item) return { ...r, qty: newQty, error: "" };

        // respect stock_quantity (0 allowed)
        const maxQty = Number(r.item.stock_quantity) || 0;
        if (newQty > maxQty) {
          return { ...r, qty: maxQty, error: `Max available quantity: ${maxQty}` };
        }
        if (newQty < 0) {
          return { ...r, qty: 0, error: "" };
        }
        return { ...r, qty: newQty, error: "" };
      })
    );
  }

  function addRow() {
    setRows((prev) => [...prev, { id: Date.now(), item: null, qty: 0, error: "" }]);
  }

  function removeRow(rowId) {
    setRows((prev) => prev.filter((r) => r.id !== rowId));
  }

  // ---------------- Totals ----------------
  const selectedIds = useMemo(
    () => rows.map((r) => (r.item ? Number(r.item.id) : null)).filter((v) => v != null),
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
  const calculatedTax = taxable * (Number(taxPercent) / 100);
  const total = taxable + calculatedTax;

  const cashChange = useMemo(() => {
    if (paymentMethod !== "Cash") return 0;
    const tendered = Number(amountTendered) || 0;
    return Math.max(0, tendered - total);
  }, [paymentMethod, amountTendered, total]);

  // ---------------- Validation ----------------
  const hasRowIssues = rows.some(
    (r) =>
      !r.item ||
      Number(r.qty) <= 0 ||
      Number(r.qty) > Number(r.item?.stock_quantity || 0) ||
      Boolean(r.error)
  );

  const paymentInvalid = useMemo(() => {
    if (paymentMethod === "Cash") {
      const tendered = Number(amountTendered);
      if (!Number.isFinite(tendered) || tendered <= 0) return "Enter amount tendered.";
      if (tendered + 1e-9 < total) return "Cash tendered is less than total.";
      return "";
    }
    return "";
  }, [paymentMethod, amountTendered, total]);

  const disableCreate =
    !shop?.shop_id ||
    !customer?.customer_id || // must have a customer chosen/created first
    rows.length === 0 ||
    subtotal <= 0 ||
    hasRowIssues ||
    Boolean(paymentInvalid);

  // ---------- reset helper ----------
  const resetToNewBill = () => {
    // Clear everything to a brand-new bill
    setRows([{ id: Date.now(), item: null, qty: 0, error: "" }]);
    setDiscount(0);
    setPaymentMethod("Cash");
    setPaymentRef("");
    setAmountTendered("");
    setCustomer(null);
    setPhoneQuery("");
    setCreatingCustomer(false);
    setNewCust({ name: "", phone: "", email: "" });
  };

  // === NEW: Print Preview using current on-screen data (iframe, no popup) ===
  function printPreview() {
    const hasLines = rows.some((r) => r.item && Number(r.qty) > 0);
    if (!hasLines) {
      alert("Add at least one item with quantity before printing.");
      return;
    }
    const billId = "(DRAFT)";
    const html = buildInvoiceHtml({
      billId,
      shop,
      customer,
      rows,
      subtotal,
      discount: Number(cappedDiscount),
      taxPercent: Number(taxPercent),
      taxAmount: calculatedTax,
      total,
      paymentMethod,
      paymentRef,
      amountPaid: paymentMethod === "Cash" ? Number(amountTendered || 0) : Number(total || 0),
      changeDue: cashChange,
    });
    printHtmlViaIframe(html);
  }

  // ---------------- Create Bill ----------------
  async function createBill() {
    if (disableCreate) {
      alert(
        (paymentInvalid && paymentInvalid) ||
          (!customer?.customer_id && "Please select or create a customer first.") ||
          "Please fix errors before creating the bill."
      );
      return;
    }

    const items = rows.map((r) => ({
      saree_id: r.item.id,
      quantity: Number(r.qty),
    }));

    const payload = {
      shop_id: shop.shop_id,
      customer_id: customer.customer_id,
      items,
      discount: Number(cappedDiscount),
      payment_method: paymentMethod,
      payment_reference: paymentRef || null,
      amount_paid: paymentMethod === "Cash" ? Number(amountTendered) : Number(total),
    };

    try {
      setIsCreating(true);
      const { data } = await api.post("/billing/create", payload);

      const billId = data?.bill_id ?? "—";

      // Build & print via iframe (no popups)
      const html = buildInvoiceHtml({
        billId,
        shop,
        customer,
        rows,
        subtotal,
        discount: Number(cappedDiscount),
        taxPercent: Number(taxPercent),
        taxAmount: calculatedTax,
        total,
        paymentMethod,
        paymentRef,
        amountPaid: payload.amount_paid,
        changeDue: cashChange,
      });
      printHtmlViaIframe(html);

      // Refresh inventory and reset
      await loadShopAndInventory();
      resetToNewBill();
    } catch (err) {
      alert(err?.response?.data?.message || "Failed to create bill.");
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className="bl-billing-page">
      <div className="bl-card bl-billing-card">
        <h2 className="bl-title">Create Bill</h2>

        {/* ---------------- Customer Section ---------------- */}
        <div className="bl-card-lite bl-customer-block">
          <h3 className="bl-section-title">Customer</h3>

          {!customer && !creatingCustomer && (
            <div className="bl-customer-search">
              <label className="bl-label">Search by Phone</label>
              <div className="bl-row">
                <input
                  type="text"
                  className="bl-input"
                  placeholder="Enter phone number"
                  value={phoneQuery}
                  onChange={(e) => setPhoneQuery(e.target.value)}
                />
                <button className="bl-btn" onClick={findCustomerByPhone} disabled={customerBusy}>
                  {customerBusy ? "Searching..." : "Find"}
                </button>
              </div>
              <div className="bl-hint">If not found, you'll be prompted to create a new customer.</div>
            </div>
          )}

          {!customer && creatingCustomer && (
            <div className="bl-customer-create">
              <div className="bl-grid-2">
                <div className="bl-field">
                  <label className="bl-label">Name</label>
                  <input
                    type="text"
                    className="bl-input"
                    value={newCust.name}
                    onChange={(e) => setNewCust({ ...newCust, name: e.target.value })}
                    placeholder="Customer name"
                  />
                </div>
                <div className="bl-field">
                  <label className="bl-label">Phone *</label>
                  <input
                    type="text"
                    className="bl-input"
                    value={newCust.phone}
                    onChange={(e) => setNewCust({ ...newCust, phone: e.target.value })}
                    placeholder="Phone number"
                  />
                </div>
                <div className="bl-field">
                  <label className="bl-label">Email</label>
                  <input
                    type="email"
                    className="bl-input"
                    value={newCust.email}
                    onChange={(e) => setNewCust({ ...newCust, email: e.target.value })}
                    placeholder="Email (optional)"
                  />
                </div>
              </div>
              <div className="bl-row bl-actions-inline">
                <button className="bl-btn" onClick={createCustomer} disabled={customerBusy}>
                  {customerBusy ? "Creating..." : "Create & Use"}
                </button>
                <button className="bl-btn-outline" onClick={clearCustomer}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {customer && (
            <div className="bl-customer-picked">
              <div className="bl-picked-grid">
                <div className="bl-picked-col">
                  <div className="bl-picked-title">Selected Customer</div>
                  <div className="bl-picked-line">
                    <span>Name:</span> {customer.name || "-"}
                  </div>
                  <div className="bl-picked-line">
                    <span>Phone:</span> {customer.phone || "-"}
                  </div>
                  <div className="bl-picked-line">
                    <span>Email:</span> {customer.email || "-"}
                  </div>
                </div>
                <div className="bl-picked-actions">
                  <button className="bl-btn-outline" onClick={clearCustomer}>
                    Change Customer
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ---------------- Items Table ---------------- */}
        <table className="bl-table">
          <thead>
            <tr>
              <th>Item</th>
              <th style={{ width: 110 }}>Qty</th>
              <th style={{ width: 120 }}>Price</th>
              <th style={{ width: 140 }}>Line Total</th>
              <th style={{ width: 90 }}>Remove</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <select
                    value={r.item?.id || ""}
                    onChange={(e) => handleSelect(r.id, e.target.value)}
                    className="bl-select"
                  >
                    <option value="">-- Select Item --</option>
                    {sarees
                      .filter((s) => !selectedIds.includes(Number(s.id)) || s.id === r.item?.id)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} (₹{MONEY(Number(s.price))}, Stock: {s.stock_quantity})
                        </option>
                      ))}
                  </select>
                </td>
                <td>
                  <input
                    type="number"
                    min="0"
                    value={r.qty}
                    onChange={(e) => handleQty(r.id, e.target.value)}
                    className="bl-qty"
                  />
                  {r.error && <div className="bl-error">{r.error}</div>}
                </td>
                <td>{r.item ? `₹ ${MONEY(Number(r.item.price))}` : "-"}</td>
                <td>{r.item ? `₹ ${MONEY(Number(r.item.price) * Number(r.qty || 0))}` : "-"}</td>
                <td>
                  <button
                    className="bl-btn-remove"
                    onClick={() => removeRow(r.id)}
                    disabled={rows.length === 1}
                    title={rows.length === 1 ? "At least one row required" : "Remove row"}
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <button className="bl-btn-add" onClick={addRow}>
          + Add More
        </button>

        {/* ---------------- Summary ---------------- */}
        <div className="bl-summary">
          <div>
            Subtotal: <b>₹ {MONEY(subtotal)}</b>
          </div>
          <div className="bl-summary-row">
            <span>Discount:</span>
            <input
              type="number"
              min="0"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              className="bl-discount"
            />
            {Number(discount) > subtotal && (
              <span className="bl-error-inline"> (capped at ₹ {MONEY(subtotal)})</span>
            )}
          </div>
          <div>Tax ({taxPercent}%): ₹ {MONEY(calculatedTax)}</div>
          <div>
            <b>Total: ₹ {MONEY(total)}</b>
          </div>
        </div>

        {/* ---------------- Payment ---------------- */}
        <div className="bl-card-lite bl-payment">
          <h3 className="bl-section-title">Payment</h3>

          <div className="bl-pay-row">
            <label className="bl-pay-label">Method</label>
            <select
              className="bl-select bl-pay-select"
              value={paymentMethod}
              onChange={(e) => {
                setPaymentMethod(e.target.value);
                setPaymentRef("");
                setAmountTendered("");
              }}
            >
              <option value="Cash">Cash</option>
              <option value="Card">Card</option>
              <option value="UPI">UPI</option>
            </select>
          </div>

          {paymentMethod === "Cash" && (
            <>
              <div className="bl-pay-row">
                <label className="bl-pay-label">Amount Tendered</label>
                <input
                  type="number"
                  className="bl-input bl-pay-input"
                  placeholder="Enter cash received"
                  value={amountTendered}
                  onChange={(e) => setAmountTendered(e.target.value)}
                  min="0"
                />
              </div>
              <div className="bl-pay-row">
                <label className="bl-pay-label">Change Due</label>
                <div className="bl-readonly">₹ {MONEY(cashChange)}</div>
              </div>
            </>
          )}

          {paymentMethod !== "Cash" && (
            <div className="bl-pay-row">
              <label className="bl-pay-label">
                {paymentMethod === "Card" ? "Card Ref / Last 4" : "UPI Ref"}
              </label>
              <input
                type="text"
                className="bl-input bl-pay-input"
                placeholder={
                  paymentMethod === "Card" ? "e.g., **** 1234 or Auth Code" : "e.g., UPI Txn ID"
                }
                value={paymentRef}
                onChange={(e) => setPaymentRef(e.target.value)}
              />
            </div>
          )}

          {paymentInvalid && <div className="bl-error" style={{ marginTop: 8 }}>{paymentInvalid}</div>}
        </div>

        {/* ---------------- Actions ---------------- */}
        <div className="bl-actions">
          <button
            className="bl-btn-outline"
            onClick={printPreview}
            title="Print a preview of this invoice"
            disabled={rows.every((r) => !r.item || Number(r.qty) <= 0)}
            style={{ marginRight: 8 }}
          >
            Print Preview
          </button>

          <button
            className="bl-btn-create"
            onClick={createBill}
            disabled={disableCreate || isCreating}
            title={
              disableCreate
                ? !customer?.customer_id
                  ? "Pick or create a customer first"
                  : "Fix errors before creating bill"
                : "Create Bill"
            }
          >
            {isCreating ? "Creating..." : "Create Bill"}
          </button>
        </div>
      </div>
    </div>
  );
}
