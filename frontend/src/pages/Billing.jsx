import React, { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api.js";
import "../styles/billing.css";

const MONEY = (n) => Number.isFinite(n) ? n.toFixed(2) : "0.00";

export default function Billing() {
  const [shop, setShop] = useState(null);
  const [sarees, setSarees] = useState([]);
  const [rows, setRows] = useState([{ id: Date.now(), item: null, qty: 0, error: "" }]);

  const [discount, setDiscount] = useState(0);
  const [taxPercent, setTaxPercent] = useState(0);

  // Payment
  const [paymentMethod, setPaymentMethod] = useState("Cash"); // Cash | Card | UPI
  const [paymentRef, setPaymentRef] = useState("");           // txn id / last 4 / UPI ref
  const [amountTendered, setAmountTendered] = useState("");   // cash only

  // Result
  const [billId, setBillId] = useState(null);
  const [invoiceItems, setInvoiceItems] = useState([]);       // snapshot for invoice
  const [isCreating, setIsCreating] = useState(false);

  // Fetch shop and inventory
  useEffect(() => {
    (async () => {
      try {
        const shopRes = await api.get("/shop/my");
        const shopData = shopRes.data?.[0];
        setShop(shopData || null);
        setTaxPercent(Number(shopData?.tax_percentage) || 0);

        if (shopData?.shop_id) {
          const { data } = await api.get("/inventory/sarees", {
            params: { shop_id: shopData.shop_id },
          });
          setSarees(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        alert(err?.response?.data?.message || "Failed to load shop/inventory.");
      }
    })();
  }, []);

  function handleSelect(rowId, sareeId) {
    setRows((prev) =>
      prev.map((r) =>
        r.id === rowId
          ? {
              ...r,
              item:
                sarees.find((s) => String(s.id) === String(sareeId)) || null,
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

        // FIX: use stock_quantity instead of qty
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

  // ---- Totals ----
  const selectedIds = useMemo(
    () => rows.map((r) => r.item?.id).filter(Boolean),
    [rows]
  );

  const subtotal = useMemo(
    () =>
      rows.reduce(
        (s, r) => s + (r.item ? Number(r.item.price) * Number(r.qty || 0) : 0),
        0
      ),
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

  // ---- Validation helpers ----
  const hasRowIssues = rows.some(
    (r) =>
      !r.item ||
      Number(r.qty) <= 0 ||
      // FIX: use stock_quantity instead of qty
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
    // Card/UPI – reference is optional but recommended
    return "";
  }, [paymentMethod, amountTendered, total]);

  const disableCreate =
    !shop?.shop_id ||
    rows.length === 0 ||
    subtotal <= 0 ||
    hasRowIssues ||
    Boolean(paymentInvalid);

  async function createBill() {
    if (disableCreate) {
      alert(paymentInvalid || "Please fix errors before creating the bill.");
      return;
    }

    const items = rows.map((r) => ({
      saree_id: r.item.id,
      quantity: Number(r.qty),
    }));

    const payload = {
      shop_id: shop.shop_id,
      items,
      discount: Number(cappedDiscount),
      tax: Number(calculatedTax),
      // --- Payment data ---
      payment_method: paymentMethod,         // "Cash" | "Card" | "UPI"
      payment_reference: paymentRef || null, // txn id / last 4 / upi ref
      amount_paid:
        paymentMethod === "Cash" ? Number(amountTendered) : Number(total), // assume full paid for Card/UPI
    };

    try {
      setIsCreating(true);
      const { data } = await api.post("/billing/create", payload);

      // Snapshot the invoice items before resetting the form
      const snapshot = rows
        .filter((r) => r.item && Number(r.qty) > 0)
        .map((r) => ({
          id: r.id,
          name: r.item.name,
          price: Number(r.item.price),
          qty: Number(r.qty),
          lineTotal: Number(r.item.price) * Number(r.qty),
        }));

      setInvoiceItems(snapshot);
      setBillId(data.bill_id);

      alert(`Bill #${data.bill_id} created successfully!`);

      // Reset form (but keep tax % from shop)
      setRows([{ id: Date.now(), item: null, qty: 0, error: "" }]);
      setDiscount(0);
      setPaymentMethod("Cash");
      setPaymentRef("");
      setAmountTendered("");
    } catch (err) {
      alert(err?.response?.data?.message || "Failed to create bill.");
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className="billing-page">
      <div className="card billing-card">
        <h2>Create Bill</h2>

        {/* Items Table */}
        <table className="billing-table">
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
                    className="select-item"
                  >
                    <option value="">-- Select Item --</option>
                    {sarees
                      .filter(
                        (s) =>
                          !selectedIds.includes(s.id) || s.id === r.item?.id
                      )
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {/* FIX: show stock_quantity */}
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
                    className="qty-input"
                  />
                  {r.error && <div className="error-msg">{r.error}</div>}
                </td>
                <td>{r.item ? `₹ ${MONEY(Number(r.item.price))}` : "-"}</td>
                <td>
                  {r.item
                    ? `₹ ${MONEY(Number(r.item.price) * Number(r.qty || 0))}`
                    : "-"}
                </td>
                <td>
                  <button
                    className="btn-remove"
                    onClick={() => removeRow(r.id)}
                    disabled={rows.length === 1}
                    title={
                      rows.length === 1
                        ? "At least one row required"
                        : "Remove row"
                    }
                  >
                    X
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <button className="btn-add" onClick={addRow}>
          + Add More
        </button>

        {/* Summary */}
        <div className="billing-summary">
          <div>
            Subtotal: <b>₹ {MONEY(subtotal)}</b>
          </div>
          <div>
            Discount: ₹{" "}
            <input
              type="number"
              min="0"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              className="discount-input"
            />
            {Number(discount) > subtotal && (
              <span className="error-inline">
                {" "}
                (capped at ₹ {MONEY(subtotal)})
              </span>
            )}
          </div>
          <div>Tax ({taxPercent}%): ₹ {MONEY(calculatedTax)}</div>
          <div>
            <b>Total: ₹ {MONEY(total)}</b>
          </div>
        </div>

        {/* Payment Section */}
        <div className="payment-section card-lite">
          <h3 className="section-title">Payment</h3>

          <div className="payment-row">
            <label className="payment-label">Method</label>
            <select
              className="payment-select"
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
              <div className="payment-row">
                <label className="payment-label">Amount Tendered</label>
                <input
                  type="number"
                  className="payment-input"
                  placeholder="Enter cash received"
                  value={amountTendered}
                  onChange={(e) => setAmountTendered(e.target.value)}
                  min="0"
                />
              </div>
              <div className="payment-row">
                <label className="payment-label">Change Due</label>
                <div className="payment-readonly">₹ {MONEY(cashChange)}</div>
              </div>
            </>
          )}

          {paymentMethod !== "Cash" && (
            <div className="payment-row">
              <label className="payment-label">
                {paymentMethod === "Card" ? "Card Ref / Last 4" : "UPI Ref"}
              </label>
              <input
                type="text"
                className="payment-input"
                placeholder={
                  paymentMethod === "Card"
                    ? "e.g., **** 1234 or Auth Code"
                    : "e.g., UPI Txn ID"
                }
                value={paymentRef}
                onChange={(e) => setPaymentRef(e.target.value)}
              />
            </div>
          )}

          {paymentInvalid && (
            <div className="error-msg" style={{ marginTop: 8 }}>
              {paymentInvalid}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="billing-actions">
          <button
            className="btn-create"
            onClick={createBill}
            disabled={disableCreate || isCreating}
            title={disableCreate ? "Fix errors before creating bill" : "Create Bill"}
          >
            {isCreating ? "Creating..." : "Create Bill"}
          </button>
        </div>
      </div>

      {/* Invoice Preview (after success) */}
      {billId && (
        <div className="card invoice-card">
          <h3>Invoice #{billId}</h3>
          <table className="billing-table">
            <thead>
              <tr>
                <th>Item</th>
                <th style={{ width: 110 }}>Qty</th>
                <th style={{ width: 120 }}>Price</th>
                <th style={{ width: 140 }}>Line Total</th>
              </tr>
            </thead>
            <tbody>
              {invoiceItems.map((it) => (
                <tr key={it.id}>
                  <td>{it.name}</td>
                  <td>{it.qty}</td>
                  <td>₹ {MONEY(it.price)}</td>
                  <td>₹ {MONEY(it.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="billing-summary" style={{ textAlign: "right" }}>
            <div>Subtotal: ₹ {MONEY(subtotal)}</div>
            <div>Discount: ₹ {MONEY(cappedDiscount)}</div>
            <div>Tax ({taxPercent}%): ₹ {MONEY(calculatedTax)}</div>
            <div>
              <b>Total: ₹ {MONEY(total)}</b>
            </div>
            <div className="payment-summary">
              <span>
                Payment Method: <b>{paymentMethod}</b>
              </span>
              {paymentMethod !== "Cash" && paymentRef ? (
                <span style={{ marginLeft: 12 }}>
                  Ref: <b>{paymentRef}</b>
                </span>
              ) : null}
              {paymentMethod === "Cash" && (
                <>
                  <span style={{ marginLeft: 12 }}>
                    Tendered: <b>₹ {MONEY(Number(amountTendered) || total)}</b>
                  </span>
                  <span style={{ marginLeft: 12 }}>
                    Change: <b>₹ {MONEY(cashChange)}</b>
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
