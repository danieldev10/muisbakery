import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  PosOfflineQueuedSale,
  PosOfflineSalePayload,
  PosOfflineSnapshot,
  Retailer,
} from "../src/lib/operations/types";
import {
  deriveOfflineRetailers,
  offlineSaleBalanceDue,
  validateOfflineRetailerCreditSale,
} from "../src/app/(app)/sales/pos/_lib/offline-retailer-credit";

const now = "2026-07-14T12:00:00.000Z";

function retailer(overrides: Partial<Retailer> = {}): Retailer {
  return {
    id: "retailer-1",
    name: "Amina Stores",
    contactPerson: "Amina",
    phone: null,
    email: null,
    address: null,
    creditLimit: "20000.00",
    outstandingBalance: "0.00",
    availableCredit: "20000.00",
    requiresOrderApproval: false,
    orderApprovals: [
      {
        id: "approval-1",
        approvedAmount: "10000.00",
        status: "APPROVED",
        terminal: { id: "terminal-1", name: "Front counter" },
        reason: "Approved repeat order",
        expiresAt: "2026-07-15T12:00:00.000Z",
        usedAt: null,
        createdAt: now,
        reviewedAt: now,
        requestedBy: null,
        approvedBy: null,
      },
    ],
    orderApprovalRequests: [],
    notes: null,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    createdBy: null,
    ...overrides,
  };
}

function snapshot(
  retailerOverrides: Partial<Retailer> = {},
): PosOfflineSnapshot {
  return {
    terminal: {
      id: "terminal-1",
      name: "Front counter",
      displayToken: "display-token",
      pairable: false,
      pairingCodeExpiresAt: null,
      pairedAt: now,
      pairedBy: null,
      deviceSecretIssuedAt: now,
      isActive: true,
      offlineEnabled: true,
      lastSeenAt: now,
      lastSyncedAt: now,
      createdAt: now,
      updatedAt: now,
      currentSession: null,
      stockAllocations: [],
      retailerCreditAllocations: [
        {
          id: "credit-allocation-1",
          allocatedAmount: "20000.00",
          usedAmount: "0.00",
          remainingAmount: "20000.00",
          isActive: true,
          retailer: {
            id: "retailer-1",
            name: "Amina Stores",
            contactPerson: "Amina",
          },
          createdAt: now,
          updatedAt: now,
        },
      ],
    },
    products: [],
    retailerCreditAllocations: [
      {
        id: "credit-allocation-1",
        allocatedAmount: "20000.00",
        usedAmount: "0.00",
        remainingAmount: "20000.00",
        isActive: true,
        retailer: {
          id: "retailer-1",
          name: "Amina Stores",
          contactPerson: "Amina",
        },
        createdAt: now,
        updatedAt: now,
      },
    ],
    retailers: [retailer(retailerOverrides)],
    serverTime: now,
    snapshotVersion: "snapshot-1",
  };
}

function sale(
  overrides: Partial<PosOfflineSalePayload> = {},
): PosOfflineSalePayload {
  return {
    terminalId: "terminal-1",
    clientRequestId: "offline:terminal-1:request-1",
    customerType: "RETAILER",
    priceType: "RETAILER",
    retailerId: "retailer-1",
    paymentMethod: "CREDIT",
    soldAt: now,
    discount: "0.00",
    amountPaid: "0.00",
    items: [{ productId: "product-1", quantity: "2", unitPrice: "2500" }],
    ...overrides,
  };
}

function queued(
  payload: PosOfflineSalePayload,
  status: PosOfflineQueuedSale["status"] = "PENDING",
): PosOfflineQueuedSale {
  return {
    clientRequestId: payload.clientRequestId,
    terminalId: payload.terminalId,
    status,
    payload,
    createdAt: now,
    updatedAt: now,
    errorMessage: null,
    syncedSale: null,
  };
}

test("offline retailer credit calculates the sale balance due", () => {
  assert.equal(offlineSaleBalanceDue(sale()), 5000);
  assert.equal(
    offlineSaleBalanceDue(sale({ discount: "500", amountPaid: "1000" })),
    3500,
  );
});

test("the first offline credit sale is allowed without order approval", () => {
  const reservation = validateOfflineRetailerCreditSale({
    snapshot: snapshot(),
    payload: sale(),
    queuedSales: [],
  });

  assert.deepEqual(reservation, {
    terminalId: "terminal-1",
    retailerId: "retailer-1",
    allocationId: "credit-allocation-1",
    amount: 5000,
    approvalId: null,
  });
});

test("locally queued credit becomes outstanding immediately", () => {
  const firstSale = queued(sale());
  const [derived] = deriveOfflineRetailers(snapshot(), [firstSale]);

  assert.equal(derived?.outstandingBalance, "5000.00");
  assert.equal(derived?.availableCredit, "15000.00");
  assert.equal(derived?.requiresOrderApproval, true);

  assert.throws(
    () =>
      validateOfflineRetailerCreditSale({
        snapshot: snapshot(),
        payload: sale({ clientRequestId: "offline:terminal-1:request-2" }),
        queuedSales: [firstSale],
      }),
    /Admin approval is required/i,
  );
});

test("a terminal-specific approval permits one subsequent offline credit sale", () => {
  const firstSale = queued(sale());
  const secondPayload = sale({
    clientRequestId: "offline:terminal-1:request-2",
    retailerApprovalId: "approval-1",
  });
  const reservation = validateOfflineRetailerCreditSale({
    snapshot: snapshot(),
    payload: secondPayload,
    queuedSales: [firstSale],
    now: new Date(now),
  });

  assert.equal(reservation?.approvalId, "approval-1");

  assert.throws(
    () =>
      validateOfflineRetailerCreditSale({
        snapshot: snapshot(),
        payload: sale({
          clientRequestId: "offline:terminal-1:request-3",
          retailerApprovalId: "approval-1",
        }),
        queuedSales: [firstSale, queued(secondPayload)],
        now: new Date(now),
      }),
    /already reserved/i,
  );
});

test("offline credit allocation is independent of order approval", () => {
  assert.throws(
    () =>
      validateOfflineRetailerCreditSale({
        snapshot: snapshot(),
        payload: sale({
          items: [
            { productId: "product-1", quantity: "9", unitPrice: "2500" },
          ],
        }),
        queuedSales: [],
      }),
    /offline retailer credit remains/i,
  );
});

test("cash and transfer retailer sales bypass offline credit controls", () => {
  const withoutCreditAllocation = {
    ...snapshot(),
    retailerCreditAllocations: [],
  };

  assert.equal(
    validateOfflineRetailerCreditSale({
      snapshot: withoutCreditAllocation,
      payload: sale({ paymentMethod: "CASH", amountPaid: "5000.00" }),
      queuedSales: [],
    }),
    null,
  );
  assert.equal(
    validateOfflineRetailerCreditSale({
      snapshot: withoutCreditAllocation,
      payload: sale({ paymentMethod: "TRANSFER", amountPaid: "5000.00" }),
      queuedSales: [],
    }),
    null,
  );
});
