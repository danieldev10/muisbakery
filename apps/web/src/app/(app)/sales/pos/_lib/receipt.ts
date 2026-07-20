import type { PosSession } from "@/lib/operations/types";
import { formatProductName } from "@/lib/product-label";

import {
  formatMoney,
  formatQuantity,
  paymentLabels,
} from "./pos-terminal-helpers";

const ESC = 0x1b;
const GS = 0x1d;
const ESC_POS_COLUMNS = 48;

export type ReceiptBusinessDetails = {
  name: string;
  address: string | null;
  phone: string | null;
  returnPolicy: string;
};

export type ReceiptPrintBridgeConfig = {
  url: string | null;
  token: string | null;
};

export type ReceiptSettings = {
  business: ReceiptBusinessDetails;
  bridge: ReceiptPrintBridgeConfig;
  cashierName: string;
};

export type ReceiptDocument = {
  filename: string;
  html: string;
  text: string;
  escPosData: Uint8Array;
};

function receiptDate(value: string | null | undefined) {
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value ? new Date(value) : new Date());
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function receiptCustomer(session: PosSession) {
  if (session.customerType === "RETAILER") {
    return session.retailer?.name ?? session.customerName ?? "Retailer";
  }

  return session.customerName ?? "Individual";
}

function receiptReference(session: PosSession, saleNumber?: number | null) {
  const resolvedSaleNumber =
    session.completedSale?.saleNumber ?? saleNumber ?? null;

  if (resolvedSaleNumber) {
    return `#${resolvedSaleNumber}`;
  }

  return `OFF-${session.id.slice(-8).toUpperCase()}`;
}

function amountSettlement(session: PosSession) {
  const balanceDue = Number(session.balanceDue);
  const amountPaid = Number(session.amountPaid);
  const total = Number(session.totalAmount);

  if (balanceDue > 0) {
    return { label: "Balance due", value: session.balanceDue };
  }

  return {
    label: "Change",
    value: Math.max(0, amountPaid - total).toFixed(2),
  };
}

function ascii(value: string) {
  return value
    .replaceAll("₦", "N")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E\n]/g, "?");
}

function textBytes(value: string) {
  return Uint8Array.from([...ascii(value)].map((character) => character.charCodeAt(0)));
}

function concatBytes(parts: Uint8Array[]) {
  const size = parts.reduce((total, part) => total + part.length, 0);
  const output = new Uint8Array(size);
  let offset = 0;

  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }

  return output;
}

function command(...bytes: number[]) {
  return Uint8Array.from(bytes);
}

function wrapText(value: string, width = ESC_POS_COLUMNS) {
  const words = ascii(value).trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    if (word.length > width) {
      if (line) {
        lines.push(line);
        line = "";
      }
      for (let index = 0; index < word.length; index += width) {
        lines.push(word.slice(index, index + width));
      }
      continue;
    }

    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length <= width) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }

  if (line) {
    lines.push(line);
  }

  return lines.length > 0 ? lines : [""];
}

function center(value: string, width = ESC_POS_COLUMNS) {
  const normalized = ascii(value).slice(0, width);
  const left = Math.max(0, Math.floor((width - normalized.length) / 2));
  return `${" ".repeat(left)}${normalized}`;
}

function valueLine(label: string, value: string, width = ESC_POS_COLUMNS) {
  const left = ascii(label);
  const right = ascii(value);

  if (right.length >= width) {
    return right.slice(-width);
  }

  const clippedLeft = left.slice(0, Math.max(0, width - right.length - 1));
  const gap = Math.max(1, width - clippedLeft.length - right.length);
  return `${clippedLeft}${" ".repeat(gap)}${right}`;
}

function buildEscPosReceipt({
  session,
  settings,
  terminalName,
  reference,
  soldAt,
}: {
  session: PosSession;
  settings: ReceiptSettings;
  terminalName: string | null | undefined;
  reference: string;
  soldAt: string | null;
}) {
  const parts: Uint8Array[] = [];
  const line = "-".repeat(ESC_POS_COLUMNS);
  const settlement = amountSettlement(session);
  const write = (value: string) => parts.push(textBytes(`${value}\n`));

  parts.push(command(ESC, 0x40));
  parts.push(command(ESC, 0x61, 0x01));
  parts.push(command(ESC, 0x45, 0x01));
  parts.push(command(GS, 0x21, 0x11));
  write(settings.business.name);
  parts.push(command(GS, 0x21, 0x00));

  if (settings.business.address) {
    for (const addressLine of wrapText(settings.business.address)) {
      write(center(addressLine));
    }
  }
  if (settings.business.phone) {
    write(center(`Tel: ${settings.business.phone}`));
  }

  write("");
  write(center("SALES RECEIPT"));
  parts.push(command(ESC, 0x45, 0x00));
  write(line);
  parts.push(command(ESC, 0x61, 0x00));
  write(valueLine("Receipt", reference));
  write(valueLine("Date", receiptDate(soldAt)));
  write(valueLine("Terminal", terminalName ?? "POS terminal"));
  write(valueLine("Cashier", settings.cashierName));
  write(valueLine("Customer", receiptCustomer(session)));
  write(valueLine("Payment", paymentLabels[session.paymentMethod]));
  write(line);

  for (const item of session.items) {
    parts.push(command(ESC, 0x45, 0x01));
    for (const nameLine of wrapText(formatProductName(item.product))) {
      write(nameLine);
    }
    parts.push(command(ESC, 0x45, 0x00));
    const quantityPrice = `${formatQuantity(
      item.quantity,
      item.product.unit.abbreviation,
    )} x ${formatMoney(item.unitPrice)}`;
    write(valueLine(quantityPrice, formatMoney(item.lineTotal)));
  }

  write(line);
  write(valueLine("Subtotal", formatMoney(session.subtotal)));
  write(valueLine("Discount", formatMoney(session.discount)));
  parts.push(command(ESC, 0x45, 0x01));
  write(valueLine("TOTAL", formatMoney(session.totalAmount)));
  parts.push(command(ESC, 0x45, 0x00));
  write(valueLine("Amount paid", formatMoney(session.amountPaid)));
  write(valueLine(settlement.label, formatMoney(settlement.value)));
  write(line);
  parts.push(command(ESC, 0x61, 0x01));
  for (const policyLine of wrapText(settings.business.returnPolicy)) {
    write(center(policyLine));
  }
  write("");
  parts.push(command(ESC, 0x45, 0x01));
  write(center("Thank you for your purchase"));
  parts.push(command(ESC, 0x45, 0x00));
  write("\n\n");
  parts.push(command(GS, 0x56, 0x42, 0x03));

  return concatBytes(parts);
}

// Receipts contain customer-facing purchase details only. Sync, allocation,
// and queue state remain cashier-facing operational data.
export function buildReceiptDocument({
  session,
  settings,
  terminalName,
  saleNumber,
}: {
  session: PosSession;
  settings: ReceiptSettings;
  terminalName: string | null | undefined;
  saleNumber?: number | null;
}): ReceiptDocument {
  const reference = receiptReference(session, saleNumber);
  const soldAt = session.completedSale?.soldAt ?? session.completedAt;
  const settlement = amountSettlement(session);
  const itemLines = session.items.flatMap((item) => [
    formatProductName(item.product),
    `${formatQuantity(item.quantity, item.product.unit.abbreviation)} x ${formatMoney(
      item.unitPrice,
    )}  ${formatMoney(item.lineTotal)}`,
  ]);
  const lines = [
    settings.business.name,
    ...(settings.business.address ? [settings.business.address] : []),
    ...(settings.business.phone ? [`Tel: ${settings.business.phone}`] : []),
    "SALES RECEIPT",
    `Receipt: ${reference}`,
    `Date: ${receiptDate(soldAt)}`,
    `Terminal: ${terminalName ?? "POS terminal"}`,
    `Cashier: ${settings.cashierName}`,
    `Customer: ${receiptCustomer(session)}`,
    `Payment: ${paymentLabels[session.paymentMethod]}`,
    "",
    ...itemLines,
    "",
    `Subtotal: ${formatMoney(session.subtotal)}`,
    `Discount: ${formatMoney(session.discount)}`,
    `Total: ${formatMoney(session.totalAmount)}`,
    `Amount paid: ${formatMoney(session.amountPaid)}`,
    `${settlement.label}: ${formatMoney(settlement.value)}`,
    "",
    settings.business.returnPolicy,
    "Thank you for your purchase",
  ];
  const text = lines.join("\n");
  const htmlRows = session.items
    .map(
      (item) => `
        <tr class="item-name-row">
          <td colspan="2">${escapeHtml(formatProductName(item.product))}</td>
        </tr>
        <tr class="item-values-row">
          <td>${escapeHtml(
            `${formatQuantity(item.quantity, item.product.unit.abbreviation)} x ${formatMoney(
              item.unitPrice,
            )}`,
          )}</td>
          <td class="amount">${escapeHtml(formatMoney(item.lineTotal))}</td>
        </tr>`,
    )
    .join("");
  const businessAddress = settings.business.address
    ? `<p>${escapeHtml(settings.business.address)}</p>`
    : "";
  const businessPhone = settings.business.phone
    ? `<p>Tel: ${escapeHtml(settings.business.phone)}</p>`
    : "";
  const separator = `<div class="rule" aria-hidden="true">${"-".repeat(
    ESC_POS_COLUMNS,
  )}</div>`;
  const html = `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${escapeHtml(settings.business.name)} Receipt ${escapeHtml(reference)}</title>
        <style>
          @page { size: 80mm auto; margin: 0; }
          * { box-sizing: border-box; }
          html, body {
            width: 80mm;
            margin: 0;
            padding: 0;
            background: #fff;
            color: #000;
          }
          body {
            font-family: Arial, Helvetica, sans-serif;
            font-size: 10.5pt;
            font-weight: 600;
            line-height: 1.25;
            -webkit-font-smoothing: none;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .receipt {
            width: 72mm;
            margin: 0 auto;
            padding: 2.5mm 0.5mm 5mm;
          }
          .receipt-header { text-align: center; }
          h1 { font-size: 17pt; font-weight: 800; line-height: 1.05; margin: 0 0 1mm; }
          h2 { font-size: 11pt; font-weight: 800; margin: 2mm 0 0; text-transform: uppercase; }
          p { margin: 0.7mm 0; }
          .business-contact { font-size: 9pt; font-weight: 700; }
          .rule {
            width: 100%;
            height: 3.2mm;
            overflow: hidden;
            font-family: "Courier New", Courier, monospace;
            font-size: 9pt;
            font-weight: 800;
            line-height: 3.2mm;
            white-space: nowrap;
          }
          .meta { margin: 0.5mm 0; }
          .meta-row, .total-row {
            display: flex;
            justify-content: space-between;
            gap: 2mm;
          }
          .meta-row span:last-child, .total-row span:last-child {
            text-align: right;
          }
          table {
            border-collapse: collapse;
            table-layout: fixed;
            width: 100%;
            margin: 0;
          }
          th {
            padding: 0.8mm 0;
            text-align: left;
            text-transform: uppercase;
            font-size: 8.5pt;
            font-weight: 800;
          }
          th:last-child, .amount {
            width: 24mm;
            padding-left: 1.5mm;
            text-align: right;
            white-space: nowrap;
          }
          td { vertical-align: top; }
          .item-name-row td {
            overflow-wrap: anywhere;
            padding: 1.4mm 0 0.3mm;
            font-weight: 800;
          }
          .item-values-row td {
            padding: 0 0 1.4mm;
            font-size: 9.5pt;
            font-variant-numeric: tabular-nums;
          }
          .totals { font-variant-numeric: tabular-nums; }
          .total-row { margin: 0.7mm 0; }
          .grand-total { font-size: 13pt; font-weight: 800; }
          .receipt-footer {
            margin-top: 1mm;
            text-align: center;
            font-size: 9pt;
          }
          .thanks { margin-top: 2mm; font-size: 10pt; font-weight: 800; }
          tr, .totals, .receipt-footer { break-inside: avoid; }
          @media screen {
            body { min-height: 100vh; }
            .receipt { box-shadow: 0 0 0 1px #ddd; }
          }
          @media print {
            html, body { min-height: 0; }
            .receipt { box-shadow: none; }
          }
        </style>
      </head>
      <body>
        <main class="receipt">
          <header class="receipt-header">
            <h1>${escapeHtml(settings.business.name)}</h1>
            <div class="business-contact">${businessAddress}${businessPhone}</div>
            <h2>Sales receipt</h2>
          </header>
          ${separator}
          <section class="meta">
            <p class="meta-row"><span>Receipt</span><span>${escapeHtml(reference)}</span></p>
            <p class="meta-row"><span>Date</span><span>${escapeHtml(receiptDate(soldAt))}</span></p>
            <p class="meta-row"><span>Terminal</span><span>${escapeHtml(
              terminalName ?? "POS terminal",
            )}</span></p>
            <p class="meta-row"><span>Cashier</span><span>${escapeHtml(
              settings.cashierName,
            )}</span></p>
            <p class="meta-row"><span>Customer</span><span>${escapeHtml(
              receiptCustomer(session),
            )}</span></p>
            <p class="meta-row"><span>Payment</span><span>${escapeHtml(
              paymentLabels[session.paymentMethod],
            )}</span></p>
          </section>
          ${separator}
          <table>
            <thead>
              <tr>
                <th>Qty x unit price</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>${htmlRows}</tbody>
          </table>
          ${separator}
          <section class="totals">
            <p class="total-row"><span>Subtotal</span><span>${escapeHtml(
              formatMoney(session.subtotal),
            )}</span></p>
            <p class="total-row"><span>Discount</span><span>${escapeHtml(
              formatMoney(session.discount),
            )}</span></p>
            <p class="total-row grand-total"><span>Total</span><span>${escapeHtml(
              formatMoney(session.totalAmount),
            )}</span></p>
            <p class="total-row"><span>Amount paid</span><span>${escapeHtml(
              formatMoney(session.amountPaid),
            )}</span></p>
            <p class="total-row"><span>${escapeHtml(
              settlement.label,
            )}</span><span>${escapeHtml(formatMoney(settlement.value))}</span></p>
          </section>
          ${separator}
          <footer class="receipt-footer">
            <p>${escapeHtml(settings.business.returnPolicy)}</p>
            <p class="thanks">Thank you for your purchase</p>
          </footer>
        </main>
      </body>
    </html>`;

  return {
    filename: `muis-bakery-receipt-${reference
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase()}`,
    html,
    text,
    escPosData: buildEscPosReceipt({
      session,
      settings,
      terminalName,
      reference,
      soldAt,
    }),
  };
}
