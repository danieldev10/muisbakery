import assert from "node:assert/strict";
import { test } from "node:test";

import type { PosSession, SalesInventoryItem } from "../src/lib/operations/types";
import {
  buildOfflineSalePayload,
  buildPosDisplayPreview,
  calculateSessionTotals,
  createLocalPosSession,
  createUuid,
  formatMoney,
  formatQuantity,
  productAvailable,
  roundCount,
  updateSessionProductQuantity,
} from "../src/app/(app)/sales/pos/_lib/pos-terminal-helpers";

test("createUuid uses the browser's native UUID implementation when available", () => {
  const expected = "60d68e66-5498-4d98-9d1b-e9d060325f9a";
  const cryptoApi = {
    randomUUID: () => expected,
    getRandomValues: <T extends ArrayBufferView | null>(array: T) => array,
  };

  assert.equal(createUuid(cryptoApi), expected);
});

test("createUuid generates a version 4 UUID when randomUUID is unavailable", () => {
  const cryptoApi = {
    getRandomValues: <T extends ArrayBufferView | null>(array: T) => {
      const bytes = array as Uint8Array;
      bytes.forEach((_, index) => {
        bytes[index] = index;
      });
      return array;
    },
  };

  assert.equal(createUuid(cryptoApi), "00010203-0405-4607-8809-0a0b0c0d0e0f");
});

test("createUuid fails clearly when secure random values are unavailable", () => {
  assert.throws(
    () => createUuid(null),
    /cannot generate the secure identifier required for POS sales/,
  );
});

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

test("createLocalPosSession builds an offline-ready active POS session", () => {
  const created = createLocalPosSession({
    id: "offline-session-1",
    terminalId: "terminal-1",
    terminalDisplayToken: "display-token",
    createdAt: "2026-07-13T09:00:00.000Z",
  });

  assert.equal(created.id, "offline-session-1");
  assert.equal(created.status, "ACTIVE");
  assert.equal(created.terminal?.id, "terminal-1");
  assert.equal(created.terminal?.offlineEnabled, true);
  assert.equal(created.paymentMethod, "CASH");
  assert.equal(created.items.length, 0);
});

test("buildPosDisplayPreview sends only the local cart fields needed by the display", () => {
  const localSession = updateSessionProductQuantity(
    createLocalPosSession({
      id: "offline-session-1",
      terminalId: "terminal-1",
      terminalDisplayToken: "display-token",
      createdAt: "2026-07-13T09:00:00.000Z",
    }),
    inventoryItem(),
    2,
  );

  assert.deepEqual(buildPosDisplayPreview(localSession), {
    session: {
      id: "offline-session-1",
      status: "ACTIVE",
      customerType: "INDIVIDUAL",
      customerName: null,
      paymentMethod: "CASH",
      discount: "0.00",
      amountPaid: "6000.00",
      createdAt: "2026-07-13T09:00:00.000Z",
      updatedAt: localSession.updatedAt,
      completedAt: null,
      items: [
        {
          productId: "product-1",
          quantity: "2",
          unitPrice: "3000",
        },
      ],
    },
  });
  assert.deepEqual(buildPosDisplayPreview(null), { session: null });
});

test("buildOfflineSalePayload converts a local session to a sync-safe sale", () => {
  const localSession = updateSessionProductQuantity(
    createLocalPosSession({
      id: "offline-session-1",
      terminalId: "terminal-1",
      terminalDisplayToken: "display-token",
      createdAt: "2026-07-13T09:00:00.000Z",
    }),
    inventoryItem(),
    2,
  );
  const payload = buildOfflineSalePayload({
    session: localSession,
    terminalId: "terminal-1",
    clientRequestId: "offline:terminal-1:request-1",
    soldAt: "2026-07-13T09:05:00.000Z",
  });

  assert.equal(payload.terminalId, "terminal-1");
  assert.equal(payload.clientRequestId, "offline:terminal-1:request-1");
  assert.equal(payload.paymentMethod, "CASH");
  assert.equal(payload.soldAt, "2026-07-13T09:05:00.000Z");
  assert.deepEqual(payload.items, [
    {
      productId: "product-1",
      quantity: "2",
      unitPrice: "3000",
    },
  ]);
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
