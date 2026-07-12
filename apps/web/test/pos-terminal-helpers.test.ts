import assert from "node:assert/strict";
import { test } from "node:test";

import type { PosSession, SalesInventoryItem } from "../src/lib/operations/types";
import {
  calculateSessionTotals,
  formatMoney,
  formatQuantity,
  productAvailable,
  roundCount,
  updateSessionProductQuantity,
} from "../src/app/(app)/sales/pos/_lib/pos-terminal-helpers";

const product = {
  id: "product-1",
  name: "Full Loaf Bread",
  size: "",
  unit: { id: "unit-1", name: "Loaf", abbreviation: "loaf" },
  unitPrice: "3000",
};

function session(overrides: Partial<PosSession> = {}): PosSession {
  return {
    id: "session-1",
    displayToken: "display-token",
    terminal: null,
    status: "ACTIVE",
    customerType: "INDIVIDUAL",
    retailer: null,
    retailerApprovalId: null,
    customerName: null,
    paymentMethod: "CASH",
    discount: "0",
    amountPaid: "0.00",
    balanceDue: "0.00",
    subtotal: "0.00",
    totalAmount: "0.00",
    notes: null,
    createdAt: "2026-07-10T10:00:00.000Z",
    updatedAt: "2026-07-10T10:00:00.000Z",
    completedAt: null,
    completedSale: null,
    items: [],
    ...overrides,
  };
}

function inventoryItem(overrides: Partial<SalesInventoryItem> = {}): SalesInventoryItem {
  return {
    product,
    totalRemaining: "5",
    batches: [],
    ...overrides,
  };
}

test("POS display helpers format money, quantities, and available stock", () => {
  assert.equal(formatMoney("1234.5"), "₦1,234.50");
  assert.equal(formatQuantity("2.75", "loaf"), "2.75 loaf");
  assert.equal(productAvailable(inventoryItem({ totalRemaining: "5.9" })), 5);
  assert.equal(roundCount(3.9), 3);
  assert.equal(roundCount(-2), 0);
});

test("calculateSessionTotals keeps non-credit cash payments following the current total", () => {
  const result = calculateSessionTotals(
    session({
      discount: "500",
      amountPaid: "6000.00",
      subtotal: "6000.00",
      totalAmount: "6000.00",
      items: [
        {
          id: "item-1",
          quantity: "2",
          unitPrice: "3000",
          lineTotal: "6000.00",
          product,
        },
      ],
    }),
  );

  assert.equal(result.subtotal, "6000.00");
  assert.equal(result.totalAmount, "5500.00");
  assert.equal(result.amountPaid, "5500.00");
  assert.equal(result.balanceDue, "0.00");
});

test("calculateSessionTotals preserves explicit credit balances", () => {
  const result = calculateSessionTotals(
    session({
      paymentMethod: "CREDIT",
      amountPaid: "1000.00",
      items: [
        {
          id: "item-1",
          quantity: "2",
          unitPrice: "3000",
          lineTotal: "6000.00",
          product,
        },
      ],
    }),
  );

  assert.equal(result.totalAmount, "6000.00");
  assert.equal(result.amountPaid, "1000.00");
  assert.equal(result.balanceDue, "5000.00");
});

test("updateSessionProductQuantity rounds product quantities and removes zero quantities", () => {
  const item = inventoryItem();
  const withProduct = updateSessionProductQuantity(session(), item, 2.8);

  assert.equal(withProduct.items.length, 1);
  assert.equal(withProduct.items[0]?.quantity, "2");
  assert.equal(withProduct.items[0]?.lineTotal, "6000.00");
  assert.equal(withProduct.totalAmount, "6000.00");

  const withoutProduct = updateSessionProductQuantity(withProduct, item, 0);

  assert.equal(withoutProduct.items.length, 0);
  assert.equal(withoutProduct.totalAmount, "0.00");
});
