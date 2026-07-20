import assert from "node:assert/strict";
import { test } from "node:test";

import type { PosSession } from "../src/lib/operations/types";
import {
  buildReceiptDocument,
  type ReceiptSettings,
} from "../src/app/(app)/sales/pos/_lib/receipt";

const settings: ReceiptSettings = {
  business: {
    name: "Muis Bakery",
    address: "12 Bakery Road, Kaduna",
    phone: "0800 123 4567",
    returnPolicy: "Please retain this receipt for returns.",
  },
  bridge: { url: null, token: null },
  cashierName: "Amina Cashier",
};

function completedSession(): PosSession {
  return {
    id: "session-receipt-1",
    displayToken: "display-token",
    terminal: null,
    status: "COMPLETED",
    customerType: "RETAILER",
    retailer: {
      id: "retailer-1",
      name: "Corner Shop",
      contactPerson: null,
      phone: null,
      email: null,
      address: null,
      notes: null,
      isActive: true,
      creditLimit: "0.00",
      outstandingBalance: "0.00",
      availableCredit: "0.00",
      requiresOrderApproval: false,
      orderApprovals: [],
      orderApprovalRequests: [],
      createdAt: "2026-07-20T09:00:00.000Z",
      updatedAt: "2026-07-20T09:00:00.000Z",
      createdBy: null,
    },
    retailerApprovalId: null,
    customerName: null,
    paymentMethod: "CASH",
    discount: "200.00",
    amountPaid: "7000.00",
    balanceDue: "0.00",
    subtotal: "7200.00",
    totalAmount: "7000.00",
    notes: null,
    createdAt: "2026-07-20T09:00:00.000Z",
    updatedAt: "2026-07-20T09:05:00.000Z",
    completedAt: "2026-07-20T09:05:00.000Z",
    completedSale: {
      id: "sale-57",
      saleNumber: 57,
      totalAmount: "7000.00",
      amountPaid: "7000.00",
      balanceDue: "0.00",
      soldAt: "2026-07-20T09:05:00.000Z",
    },
    items: [
      {
        id: "item-1",
        quantity: "4",
        unitPrice: "1800.00",
        lineTotal: "7200.00",
        product: {
          id: "product-1",
          name: "Banana <Bread>",
          size: "700g",
          unit: { id: "unit-1", name: "Loaf", abbreviation: "loaf" },
          unitPrice: "1800.00",
        },
      },
    ],
  };
}

test("receipt includes business, cashier, customer, item and settlement details", () => {
  const receipt = buildReceiptDocument({
    session: completedSession(),
    settings,
    terminalName: "Front Counter POS",
  });

  assert.match(receipt.text, /Muis Bakery/);
  assert.match(receipt.text, /12 Bakery Road, Kaduna/);
  assert.match(receipt.text, /Receipt: #57/);
  assert.match(receipt.text, /Cashier: Amina Cashier/);
  assert.match(receipt.text, /Customer: Corner Shop/);
  assert.match(receipt.text, /Banana <Bread> - 700g/);
  assert.match(receipt.text, /Amount paid: ₦7,000.00/);
  assert.match(receipt.text, /Change: ₦0.00/);
});

test("thermal HTML is 80 mm, high contrast and escapes product names", () => {
  const receipt = buildReceiptDocument({
    session: completedSession(),
    settings,
    terminalName: "Front Counter POS",
  });

  assert.match(receipt.html, /@page \{ size: 80mm auto; margin: 0; \}/);
  assert.match(receipt.html, /font-weight: 600/);
  assert.match(receipt.html, /Banana &lt;Bread&gt; - 700g/);
  assert.match(receipt.html, /Qty x unit price/);
  assert.doesNotMatch(receipt.html, /border-bottom: 1px dashed/);
});

test("ESC\/POS receipt uses 48-column content and ends with a cut command", () => {
  const receipt = buildReceiptDocument({
    session: completedSession(),
    settings,
    terminalName: "Front Counter POS",
  });
  const printerText = Buffer.from(receipt.escPosData).toString("ascii");
  const tail = Array.from(receipt.escPosData.slice(-4));

  assert.match(printerText, /SALES RECEIPT/);
  assert.match(printerText, /Cashier\s+Amina Cashier/);
  assert.match(printerText, /Banana <Bread> - 700g/);
  assert.match(printerText, /TOTAL\s+N7,000.00/);
  assert.deepEqual(tail, [0x1d, 0x56, 0x42, 0x03]);
});
