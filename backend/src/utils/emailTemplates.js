const currencyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatCurrency(value) {
  return currencyFormatter.format(Number(value) || 0);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return char;
    }
  });
}

export function buildBillEmailContent({
  shopName,
  billNumber,
  billDisplayNumber,
  createdAt,
  customerName,
  items,
  subtotal,
  discount,
  tax,
  total,
  paid,
  paymentMethod,
  balance,
}) {
  const friendlyDate = createdAt.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const subject = `Your invoice ${billDisplayNumber || billNumber} from ${shopName}`;

  const textLines = [
    `Hello ${customerName || "Customer"},`,
    "",
    `Thanks for shopping with ${shopName}. Here are the details of your bill generated on ${friendlyDate}.`,
    "",
    "Items:",
    ...items.map(
      (item) =>
        ` - ${item.name} x ${item.quantity} @ ${formatCurrency(item.unit_price)} = ${formatCurrency(
          item.line_total
        )}`
    ),
    "",
    `Subtotal: ${formatCurrency(subtotal)}`,
    `Discount: ${formatCurrency(discount)}`,
    `Tax: ${formatCurrency(tax)}`,
    `Total: ${formatCurrency(total)}`,
    `Paid (${paymentMethod}): ${formatCurrency(paid)}`,
    `Balance: ${formatCurrency(balance)}`,
    "",
    "Please reach out if you have any questions.",
    "",
    `${shopName}`,
  ];

  const text = textLines.join("\n");

  const rowsHtml = items
    .map(
      (item) => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${escapeHtml(item.name)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center;">${item.quantity}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${formatCurrency(
            item.unit_price
          )}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">${formatCurrency(
            item.line_total
          )}</td>
        </tr>`
    )
    .join("");

  const summaryHtml = `
    <tr>
      <td style="padding:6px 12px;text-align:right;" colspan="3">Subtotal:</td>
      <td style="padding:6px 12px;text-align:right;">${formatCurrency(subtotal)}</td>
    </tr>
    <tr>
      <td style="padding:6px 12px;text-align:right;" colspan="3">Discount:</td>
      <td style="padding:6px 12px;text-align:right;color:#dc2626;">-${formatCurrency(discount)}</td>
    </tr>
    <tr>
      <td style="padding:6px 12px;text-align:right;" colspan="3">Tax:</td>
      <td style="padding:6px 12px;text-align:right;">${formatCurrency(tax)}</td>
    </tr>
    <tr>
      <td style="padding:6px 12px;text-align:right;font-weight:600;font-size:15px;" colspan="3">Total:</td>
      <td style="padding:6px 12px;text-align:right;font-weight:600;font-size:15px;">${formatCurrency(total)}</td>
    </tr>
    <tr>
      <td style="padding:6px 12px;text-align:right;" colspan="3">Paid (${escapeHtml(
        paymentMethod
      )}):</td>
      <td style="padding:6px 12px;text-align:right;">${formatCurrency(paid)}</td>
    </tr>
    <tr>
      <td style="padding:6px 12px;text-align:right;" colspan="3">Balance:</td>
      <td style="padding:6px 12px;text-align:right;font-weight:600;">${formatCurrency(balance)}</td>
    </tr>
  `;

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;background:#f9fafb;padding:24px;">
      <div style="background:#111827;color:#f9fafb;padding:20px 24px;border-radius:14px 14px 0 0;">
        <h1 style="margin:0;font-size:20px;">${escapeHtml(shopName)} - Tax Invoice</h1>
        <p style="margin:4px 0 0;font-size:13px;opacity:0.85;">Bill&nbsp;#${escapeHtml(
          billDisplayNumber || billNumber
        )}</p>
        <p style="margin:4px 0 0;font-size:12px;opacity:0.7;">Generated on ${escapeHtml(friendlyDate)}</p>
      </div>
      <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:0 0 14px 14px;padding:24px;">
        <p style="margin:0 0 12px;font-size:14px;">Hi ${escapeHtml(customerName || "Customer")},</p>
        <p style="margin:0 0 18px;font-size:14px;line-height:1.6;">Thank you for shopping with ${escapeHtml(
          shopName
        )}. Please find your purchase summary below.</p>
        <table style="width:100%;border-collapse:collapse;margin-bottom:16px;font-size:13px;color:#1f2937;">
          <thead>
            <tr style="background:#f3f4f6;text-transform:uppercase;font-size:12px;letter-spacing:0.03em;">
              <th style="padding:10px 12px;text-align:left;border-bottom:1px solid #d1d5db;">Item</th>
              <th style="padding:10px 12px;text-align:center;border-bottom:1px solid #d1d5db;">Qty</th>
              <th style="padding:10px 12px;text-align:right;border-bottom:1px solid #d1d5db;">Unit price</th>
              <th style="padding:10px 12px;text-align:right;border-bottom:1px solid #d1d5db;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
          <tfoot>
            ${summaryHtml}
          </tfoot>
        </table>
        <p style="margin:0;font-size:13px;color:#4b5563;">Payment method: ${escapeHtml(
          paymentMethod
        )}. Paid amount: ${formatCurrency(paid)}. Balance due: ${formatCurrency(balance)}.</p>
        <p style="margin:12px 0 0;font-size:13px;color:#6b7280;">If you have any questions about this bill, please contact ${escapeHtml(
          shopName
        )}.</p>
      </div>
    </div>
  `;

  return { subject, text, html };
}

export function buildPurchaseOrderEmailContent({
  shopName,
  supplierName,
  poNumber,
  createdAt,
  items,
  subtotal,
  discount,
  tax,
  total,
  notes,
  contactEmail,
}) {
  const friendlyDate = createdAt.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const subject = `Purchase order ${poNumber} from ${shopName}`;

  const textLines = [
    `Hello ${supplierName || "Supplier"},`,
    "",
    `${shopName} has placed Purchase Order ${poNumber} on ${friendlyDate}.`,
    "",
    "Items:",
    ...items.map(
      (item) =>
        ` - ${item.name} x ${item.quantity} @ ${formatCurrency(item.unit_price)} = ${formatCurrency(
          item.line_total
        )}`
    ),
    "",
    `Subtotal: ${formatCurrency(subtotal)}`,
    `Discount: ${formatCurrency(discount)}`,
    `Tax: ${formatCurrency(tax)}`,
    `Total: ${formatCurrency(total)}`,
    notes ? `Notes: ${notes}` : "",
    "",
    `Please reply to ${contactEmail || "the store"} with any questions.`,
  ].filter(Boolean);

  const text = textLines.join("\n");

  const rowsHtml = items
    .map(
      (item) => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${escapeHtml(item.name)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center;">${item.quantity}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${formatCurrency(
            item.unit_price
          )}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">${formatCurrency(
            item.line_total
          )}</td>
        </tr>`
    )
    .join("");

  const summaryHtml = `
    <tr>
      <td style="padding:6px 12px;text-align:right;" colspan="3">Subtotal:</td>
      <td style="padding:6px 12px;text-align:right;">${formatCurrency(subtotal)}</td>
    </tr>
    <tr>
      <td style="padding:6px 12px;text-align:right;" colspan="3">Discount:</td>
      <td style="padding:6px 12px;text-align:right;color:#dc2626;">-${formatCurrency(discount)}</td>
    </tr>
    <tr>
      <td style="padding:6px 12px;text-align:right;" colspan="3">Tax:</td>
      <td style="padding:6px 12px;text-align:right;">${formatCurrency(tax)}</td>
    </tr>
    <tr>
      <td style="padding:6px 12px;text-align:right;font-weight:600;font-size:15px;" colspan="3">Total:</td>
      <td style="padding:6px 12px;text-align:right;font-weight:600;font-size:15px;">${formatCurrency(total)}</td>
    </tr>
  `;

  const notesHtml = notes
    ? `<p style="margin:12px 0 0;font-size:13px;color:#4b5563;"><strong>Notes:</strong> ${escapeHtml(notes)}</p>`
    : "";

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;background:#f9fafb;padding:24px;">
      <div style="background:#1f2937;color:#f9fafb;padding:20px 24px;border-radius:14px 14px 0 0;">
        <h1 style="margin:0;font-size:20px;">${escapeHtml(shopName)} - Purchase Order</h1>
        <p style="margin:4px 0 0;font-size:13px;opacity:0.85;">PO&nbsp;#${escapeHtml(poNumber)}</p>
        <p style="margin:4px 0 0;font-size:12px;opacity:0.7;">Issued on ${escapeHtml(friendlyDate)}</p>
      </div>
      <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:0 0 14px 14px;padding:24px;">
        <p style="margin:0 0 12px;font-size:14px;">Hi ${escapeHtml(supplierName || "Supplier")},</p>
        <p style="margin:0 0 18px;font-size:14px;line-height:1.6;">${escapeHtml(
          shopName
        )} has placed the following order. Kindly confirm availability and expected delivery timelines.</p>
        <table style="width:100%;border-collapse:collapse;margin-bottom:16px;font-size:13px;color:#1f2937;">
          <thead>
            <tr style="background:#f3f4f6;text-transform:uppercase;font-size:12px;letter-spacing:0.03em;">
              <th style="padding:10px 12px;text-align:left;border-bottom:1px solid #d1d5db;">Item</th>
              <th style="padding:10px 12px;text-align:center;border-bottom:1px solid #d1d5db;">Qty</th>
              <th style="padding:10px 12px;text-align:right;border-bottom:1px solid #d1d5db;">Unit cost</th>
              <th style="padding:10px 12px;text-align:right;border-bottom:1px solid #d1d5db;">Line total</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
          <tfoot>
            ${summaryHtml}
          </tfoot>
        </table>
        ${notesHtml}
        <p style="margin:12px 0 0;font-size:13px;color:#6b7280;">Please reply to ${escapeHtml(
          contactEmail || "this email"
        )} with any questions or clarifications.</p>
      </div>
    </div>
  `;

  return { subject, text, html };
}
