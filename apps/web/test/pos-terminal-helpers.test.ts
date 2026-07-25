import assert from "node:assert/strict";
import { test } from "node:test";

import type { SalesInventoryItem } from "../src/lib/operations/types";
import {
  configuredProductDiscountAmount,
  createOptimisticPosSession,
  formatMoney,
  formatQuantity,
  productAvailable,
  productPriceForType,
  roundCount,
  withOptimisticProductQuantity,
} from "../src/app/(app)/sales/pos/_lib/pos-terminal-helpers";

const product = {
  id: "product-1",
  name: "Full Loaf Bread",
  size: "",
  unit: { id: "unit-1", name: "Loaf", abbreviation: "loaf" },
  unitPrice: "3000",
  retailerPrice: "2700",
  discountPercent: "10",
};

function inventoryItem(
  overrides: Partial<SalesInventoryItem> = {},
): SalesInventoryItem {
  return {
    product,
    totalRemaining: "5",
    batches: [],
    ...overrides,
  };
}

test("POS helpers format money, quantities, and whole-unit stock", () => {
  assert.equal(formatMoney("1234.5"), "₦1,234.50");
  assert.equal(formatQuantity("2", "loaf"), "2 loaf");
  assert.equal(productAvailable(inventoryItem({ totalRemaining: "5.9" })), 5);
  assert.equal(roundCount(3.9), 3);
  assert.equal(roundCount(-2), 0);
});

test("POS price types use retailer and percentage-discount prices", () => {
  assert.equal(productPriceForType(product, "WALK_IN"), "3000");
  assert.equal(productPriceForType(product, "RETAILER"), "2700");
  assert.equal(productPriceForType(product, "DISCOUNTED"), "2700.00");
});

test("POS quantity changes render optimistically with server-equivalent totals", () => {
  const session = {
    id: "session-1",
    displayToken: "display-token",
    terminal: null,
    status: "ACTIVE" as const,
    customerType: "INDIVIDUAL" as const,
    priceType: "DISCOUNTED" as const,
    retailer: null,
    retailerApprovalId: null,
    customerName: null,
    paymentMethod: "CASH" as const,
    discount: "0",
    amountPaid: "0",
    balanceDue: "0",
    subtotal: "0",
    totalAmount: "0",
    notes: null,
    createdAt: "2026-07-25T08:00:00.000Z",
    updatedAt: "2026-07-25T08:00:00.000Z",
    completedAt: null,
    completedSale: null,
    items: [],
  };

  const updated = withOptimisticProductQuantity(
    session,
    inventoryItem(),
    2,
  );

  assert.equal(updated.items[0]?.quantity, "2");
  assert.equal(updated.items[0]?.unitPrice, "2700.00");
  assert.equal(updated.subtotal, "5400.00");
  assert.equal(updated.totalAmount, "5400.00");
  assert.equal(updated.amountPaid, "5400.00");
  assert.equal(updated.balanceDue, "0.00");
  assert.equal(configuredProductDiscountAmount(updated), 600);
});

test("the first product renders before the server session is available", () => {
  const session = createOptimisticPosSession(
    {
      id: "counter-1",
      name: "Front counter",
      displayToken: "display-token",
      currentSessionId: null,
      occupiedByCurrentUser: false,
      occupiedByName: null,
    },
    inventoryItem(),
    1,
  );

  assert.equal(session.id, "pending-session");
  assert.equal(session.terminal?.id, "counter-1");
  assert.equal(session.items[0]?.quantity, "1");
  assert.equal(session.totalAmount, "3000.00");
});
