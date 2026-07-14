import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import {
  CustomerType,
  FinishedProductStockMovementType,
  PaymentMethod,
  PosOfflineSyncStatus,
  PosSessionStatus,
  PosTerminalStockMovementType,
  SalesReturnDisposition,
} from "@prisma/client";

import { SalesService } from "../src/sales/sales.service";
import { actor, createAuditMock } from "./helpers";

const product = {
  id: "product-1",
  name: "Full Loaf Bread",
  size: "",
  unitPrice: 3000,
  unit: { id: "unit-1", name: "Loaf", abbreviation: "loaf" },
};

function terminalRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "terminal-1",
    name: "Front counter",
    displayToken: "display-token",
    pairingCodeHash: null,
    pairingCodeExpiresAt: null,
    pairedAt: null,
    pairedBy: null,
    deviceSecretHash: null,
    deviceSecretIssuedAt: null,
    isActive: true,
    offlineEnabled: false,
    lastSeenAt: null,
    lastSyncedAt: null,
    createdAt: new Date("2026-07-12T08:00:00.000Z"),
    updatedAt: new Date("2026-07-12T09:00:00.000Z"),
    currentSession: null,
    stockAllocations: [],
    retailerCreditAllocations: [],
    ...overrides,
  };
}

function hashSecret(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function createSalesService(prisma: unknown, audit: unknown) {
  return new SalesService(prisma as never, audit as never, {} as never);
}

function createBusinessDayStateMock(status = "OPEN") {
  let state = {
    businessDate: new Date("2026-07-10T00:00:00.000Z"),
    activityVersion: 0,
    status,
    lastActivityAt: null as Date | null,
    closeCutoffAt: null,
    reopenedAt: null,
    reopenedById: null,
    reopenReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  return {
    upsert: async () => state,
    findUniqueOrThrow: async () => state,
    update: async ({ data }: { data: Record<string, unknown> }) => {
      const increment = (
        data.activityVersion as { increment?: number } | undefined
      )?.increment;
      state = {
        ...state,
        ...data,
        activityVersion: increment
          ? state.activityVersion + increment
          : state.activityVersion,
        status: String(data.status ?? state.status),
        lastActivityAt: (data.lastActivityAt as Date | undefined) ?? null,
      };
      return state;
    },
  };
}

test("SalesService.recordReturn rejects customer returns above the returnable quantity", async () => {
  const { audit, records } = createAuditMock();
  const tx = {
    $queryRaw: async () => [{ id: "sale-item-1" }],
    saleItem: {
      findUnique: async () => ({
        id: "sale-item-1",
        productId: product.id,
        product,
        quantity: 1,
        batchIssues: [],
        returns: [],
      }),
    },
  };
  const service = createSalesService(
    {
      $transaction: async (callback: (transaction: typeof tx) => unknown) =>
        callback(tx),
    },
    audit,
  );

  await assert.rejects(
    service.recordReturn(
      {
        saleItemId: "sale-item-1",
        disposition: SalesReturnDisposition.RETURN_TO_STOCK,
        quantity: "2",
      },
      actor,
    ),
    (error) =>
      error instanceof BadRequestException &&
      /return at most 1 loaf/i.test(error.message),
  );
  assert.equal(records.length, 0);
});

test("SalesService.recordReturn deducts damaged stock FIFO from sales batches", async () => {
  const now = new Date("2026-07-10T10:00:00.000Z");
  const batches = [
    {
      id: "batch-old",
      productId: product.id,
      batchNumber: 1,
      batchDate: new Date("2026-07-08T00:00:00.000Z"),
      quantityRemaining: 5,
      receivedAt: new Date("2026-07-08T07:00:00.000Z"),
    },
    {
      id: "batch-new",
      productId: product.id,
      batchNumber: 2,
      batchDate: new Date("2026-07-09T00:00:00.000Z"),
      quantityRemaining: 4,
      receivedAt: new Date("2026-07-09T07:00:00.000Z"),
    },
  ];
  const batchUpdates: Array<{ id: string; quantityRemaining: unknown }> = [];
  const stockMovements: Record<string, unknown>[] = [];
  const returns: Record<string, unknown>[] = [];
  const { audit, records } = createAuditMock();
  const tx = {
    businessDayState: createBusinessDayStateMock(),
    product: {
      findUnique: async () => product,
    },
    posTerminalStockAllocation: {
      findMany: async () => [],
    },
    $queryRaw: async () => batches.map((batch) => ({ id: batch.id })),
    salesProductBatch: {
      findMany: async () => batches,
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { quantityRemaining: unknown };
      }) => {
        batchUpdates.push({
          id: where.id,
          quantityRemaining: data.quantityRemaining,
        });
      },
    },
    salesProductStockMovement: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        stockMovements.push(data);
      },
    },
    salesProductReturn: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const batch = batches.find((entry) => entry.id === data.batchId);

        assert.ok(batch);
        returns.push(data);
        return {
          id: `return-${batch.id}`,
          disposition: data.disposition,
          quantity: data.quantity,
          reason: data.reason,
          recordedAt: data.recordedAt,
          createdAt: now,
          product,
          batch,
          saleItem: null,
          createdBy: {
            id: actor.id,
            name: actor.name,
            email: actor.email,
          },
        };
      },
    },
  };
  const service = createSalesService(
    {
      $transaction: async (callback: (transaction: typeof tx) => unknown) =>
        callback(tx),
    },
    audit,
  );

  const result = await service.recordReturn(
    {
      productId: product.id,
      disposition: SalesReturnDisposition.DAMAGED,
      quantity: "7",
      reason: "Dropped tray",
      recordedAt: now.toISOString(),
    },
    actor,
  );

  assert.deepEqual(batchUpdates, [
    { id: "batch-old", quantityRemaining: 0 },
    { id: "batch-new", quantityRemaining: 2 },
  ]);
  assert.deepEqual(
    stockMovements.map((entry) => ({
      batchId: entry.batchId,
      type: entry.type,
      quantity: entry.quantity,
    })),
    [
      {
        batchId: "batch-old",
        type: FinishedProductStockMovementType.DAMAGED,
        quantity: 5,
      },
      {
        batchId: "batch-new",
        type: FinishedProductStockMovementType.DAMAGED,
        quantity: 2,
      },
    ],
  );
  assert.equal(returns.length, 2);
  assert.equal(records.length, 1);
  assert.equal(result.length, 2);
  assert.equal(result[0]?.quantity, "5");
  assert.equal(result[1]?.quantity, "2");
});

test("SalesService.recordReturn only damages stock still held centrally", async () => {
  let returnCreated = false;
  const batch = {
    id: "batch-1",
    productId: product.id,
    batchNumber: 1,
    batchDate: new Date("2026-07-14T00:00:00.000Z"),
    quantityRemaining: 10,
    receivedAt: new Date("2026-07-14T07:00:00.000Z"),
  };
  const tx = {
    product: {
      findUnique: async () => product,
    },
    posTerminalStockAllocation: {
      findMany: async () => [
        { allocatedQuantity: 8, soldQuantity: 0 },
      ],
    },
    $queryRaw: async () => [{ id: batch.id }],
    salesProductBatch: {
      findMany: async () => [batch],
    },
    salesProductReturn: {
      create: async () => {
        returnCreated = true;
      },
    },
  };
  const service = createSalesService(
    {
      $transaction: async (callback: (transaction: typeof tx) => unknown) =>
        callback(tx),
    },
    createAuditMock().audit,
  );

  await assert.rejects(
    service.recordReturn(
      {
        productId: product.id,
        disposition: SalesReturnDisposition.DAMAGED,
        quantity: "11",
        reason: "Dropped tray",
      },
      actor,
    ),
    (error) =>
      error instanceof BadRequestException &&
      /only 10 loaf.*central Sales stock/i.test(error.message),
  );
  assert.equal(returnCreated, false);
});

test("SalesService.createSale records credit balances and deducts Sales stock FIFO", async () => {
  const soldAt = new Date("2026-07-10T12:00:00.000Z");
  const createdAt = new Date("2026-07-10T12:00:01.000Z");
  const batches = [
    {
      id: "batch-old",
      productId: product.id,
      batchNumber: 1,
      batchDate: new Date("2026-07-08T00:00:00.000Z"),
      quantityRemaining: 3,
      receivedAt: new Date("2026-07-08T07:00:00.000Z"),
    },
    {
      id: "batch-new",
      productId: product.id,
      batchNumber: 2,
      batchDate: new Date("2026-07-09T00:00:00.000Z"),
      quantityRemaining: 5,
      receivedAt: new Date("2026-07-09T07:00:00.000Z"),
    },
  ];
  let saleCreateData: Record<string, unknown> | null = null;
  const batchUpdates: Array<{ id: string; quantityRemaining: unknown }> = [];
  const saleItemBatches: Record<string, unknown>[] = [];
  const stockMovements: Record<string, unknown>[] = [];
  const { audit, records } = createAuditMock();
  const tx = {
    businessDayState: createBusinessDayStateMock(),
    product: {
      findMany: async () => [product],
    },
    sale: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        saleCreateData = data;
        return {
          id: "sale-1",
          saleNumber: 42,
          ...data,
          createdAt,
        };
      },
      findUniqueOrThrow: async () => ({
        id: "sale-1",
        saleNumber: 42,
        paymentMethod: saleCreateData?.paymentMethod,
        customerName: saleCreateData?.customerName ?? null,
        soldAt,
        subtotal: saleCreateData?.subtotal,
        discount: saleCreateData?.discount,
        totalAmount: saleCreateData?.totalAmount,
        amountPaid: saleCreateData?.amountPaid,
        balanceDue: saleCreateData?.balanceDue,
        notes: saleCreateData?.notes ?? null,
        createdAt,
        createdBy: {
          id: actor.id,
          name: actor.name,
          email: actor.email,
        },
        items: [
          {
            id: "sale-item-1",
            quantity: 4,
            unitPrice: 3000,
            lineTotal: 12000,
            product,
            batchIssues: saleItemBatches.map((issue, index) => ({
              id: `issue-${index + 1}`,
              quantity: issue.quantity,
              batch: batches.find((batch) => batch.id === issue.batchId),
            })),
          },
        ],
      }),
    },
    $queryRaw: async () => batches.map((batch) => ({ id: batch.id })),
    posTerminalStockAllocation: {
      findMany: async () => [],
    },
    salesProductBatch: {
      findMany: async () => batches,
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { quantityRemaining: unknown };
      }) => {
        batchUpdates.push({
          id: where.id,
          quantityRemaining: data.quantityRemaining,
        });
      },
    },
    saleItem: {
      create: async () => ({ id: "sale-item-1" }),
    },
    saleItemBatch: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        saleItemBatches.push(data);
      },
    },
    salesProductStockMovement: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        stockMovements.push(data);
      },
    },
  };
  const service = createSalesService(
    {
      $transaction: async (callback: (transaction: typeof tx) => unknown) =>
        callback(tx),
    },
    audit,
  );

  const result = await service.createSale(
    {
      paymentMethod: PaymentMethod.CREDIT,
      customerName: "Amina Stores",
      soldAt: soldAt.toISOString(),
      items: [{ productId: product.id, quantity: "4", unitPrice: "3000" }],
    },
    actor,
  );

  assert.equal(saleCreateData?.subtotal, 12000);
  assert.equal(saleCreateData?.totalAmount, 12000);
  assert.equal(saleCreateData?.amountPaid, 0);
  assert.equal(saleCreateData?.balanceDue, 12000);
  assert.deepEqual(batchUpdates, [
    { id: "batch-old", quantityRemaining: 0 },
    { id: "batch-new", quantityRemaining: 4 },
  ]);
  assert.deepEqual(
    stockMovements.map((entry) => ({
      batchId: entry.batchId,
      type: entry.type,
      quantity: entry.quantity,
    })),
    [
      { batchId: "batch-old", type: FinishedProductStockMovementType.SALE, quantity: 3 },
      { batchId: "batch-new", type: FinishedProductStockMovementType.SALE, quantity: 1 },
    ],
  );
  assert.equal(records.length, 1);
  assert.equal(result.paymentMethod, PaymentMethod.CREDIT);
  assert.equal(result.amountPaid, "0");
  assert.equal(result.balanceDue, "12000");
});

test("SalesService.createSale consumes terminal custody without deducting central stock", async () => {
  const soldAt = new Date("2026-07-14T12:00:00.000Z");
  const createdAt = new Date("2026-07-14T12:00:01.000Z");
  const custodyBatch = {
    id: "custody-1",
    sourceBatchId: "batch-1",
    quantityRemaining: 6,
    allocatedAt: new Date("2026-07-14T08:00:00.000Z"),
  };
  const custodyUpdates: Array<Record<string, unknown>> = [];
  const terminalMovements: Array<Record<string, unknown>> = [];
  const saleItemBatches: Array<Record<string, unknown>> = [];
  const allocationUpdates: Array<Record<string, unknown>> = [];
  let centralBatchUpdated = false;
  let createdSaleData: Record<string, unknown> | null = null;
  const sourceBatch = {
    id: "batch-1",
    batchNumber: 1,
    batchDate: new Date("2026-07-14T00:00:00.000Z"),
  };
  const tx = {
    businessDayState: createBusinessDayStateMock(),
    product: {
      findMany: async () => [product],
    },
    posTerminal: {
      findUnique: async () => ({
        id: "terminal-1",
        name: "Front counter",
        isActive: true,
        offlineEnabled: true,
      }),
    },
    $queryRaw: async (query: unknown) => {
      const sql =
        (query as { strings?: readonly string[] }).strings?.join(" ") ?? "";

      if (sql.includes('FROM "PosTerminalStockAllocation"')) {
        return [{ id: "allocation-1" }];
      }

      if (sql.includes('FROM "PosTerminalStockBatch"')) {
        return [{ id: custodyBatch.id }];
      }

      return [];
    },
    posTerminalStockAllocation: {
      findUnique: async () => ({
        id: "allocation-1",
        terminalId: "terminal-1",
        productId: product.id,
        allocatedQuantity: 6,
        soldQuantity: 0,
      }),
      update: async ({ data }: { data: Record<string, unknown> }) => {
        allocationUpdates.push(data);
      },
    },
    posTerminalStockBatch: {
      findMany: async () => [custodyBatch],
      update: async ({ data }: { data: Record<string, unknown> }) => {
        custodyUpdates.push(data);
      },
    },
    salesProductBatch: {
      findMany: async () => [],
      update: async () => {
        centralBatchUpdated = true;
      },
    },
    salesProductStockMovement: {
      create: async () => {
        centralBatchUpdated = true;
      },
    },
    sale: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        createdSaleData = data;
        return { id: "sale-1", saleNumber: 50, ...data, createdAt };
      },
      findUniqueOrThrow: async () => ({
        id: "sale-1",
        saleNumber: 50,
        customerType: CustomerType.INDIVIDUAL,
        terminal: { id: "terminal-1", name: "Front counter" },
        retailer: null,
        retailerApproval: null,
        paymentMethod: PaymentMethod.CASH,
        customerName: null,
        soldAt,
        subtotal: createdSaleData?.subtotal,
        discount: createdSaleData?.discount,
        totalAmount: createdSaleData?.totalAmount,
        amountPaid: createdSaleData?.amountPaid,
        balanceDue: createdSaleData?.balanceDue,
        notes: null,
        createdAt,
        createdBy: {
          id: actor.id,
          name: actor.name,
          email: actor.email,
        },
        items: [
          {
            id: "sale-item-1",
            quantity: 4,
            unitPrice: 3000,
            lineTotal: 12000,
            product,
            batchIssues: saleItemBatches.map((entry, index) => ({
              id: `issue-${index + 1}`,
              quantity: entry.quantity,
              batch: sourceBatch,
              terminalBatch: {
                id: custodyBatch.id,
                terminalId: "terminal-1",
              },
            })),
          },
        ],
      }),
    },
    saleItem: {
      create: async () => ({ id: "sale-item-1" }),
    },
    saleItemBatch: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        saleItemBatches.push(data);
      },
    },
    posTerminalStockMovement: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        terminalMovements.push(data);
      },
    },
  };
  const { audit } = createAuditMock();
  const service = createSalesService(
    {
      $transaction: async (callback: (transaction: typeof tx) => unknown) =>
        callback(tx),
    },
    audit,
  );

  await service.createSale(
    {
      terminalId: "terminal-1",
      paymentMethod: PaymentMethod.CASH,
      soldAt: soldAt.toISOString(),
      items: [{ productId: product.id, quantity: "4", unitPrice: "3000" }],
    },
    actor,
  );

  assert.equal(centralBatchUpdated, false);
  assert.deepEqual(custodyUpdates, [{ quantityRemaining: 2 }]);
  assert.deepEqual(allocationUpdates, [{ soldQuantity: { increment: 4 } }]);
  assert.equal(saleItemBatches[0]?.batchId, sourceBatch.id);
  assert.equal(saleItemBatches[0]?.terminalBatchId, custodyBatch.id);
  assert.equal(terminalMovements[0]?.type, PosTerminalStockMovementType.SALE);
  assert.equal(terminalMovements[0]?.quantity, 4);
  assert.equal(terminalMovements[0]?.balanceAfter, 2);
});

test("SalesService.createSale cannot consume stock already moved to terminal custody", async () => {
  let saleCreated = false;
  const batch = {
    id: "batch-1",
    productId: product.id,
    batchNumber: 1,
    batchDate: new Date("2026-07-14T00:00:00.000Z"),
    quantityRemaining: 8,
    receivedAt: new Date("2026-07-14T07:00:00.000Z"),
  };
  const tx = {
    product: {
      findMany: async () => [product],
    },
    $queryRaw: async () => [{ id: batch.id }],
    posTerminalStockAllocation: {
      findMany: async () => [
        {
          terminalId: "offline-terminal",
          allocatedQuantity: 7,
          soldQuantity: 1,
        },
      ],
    },
    salesProductBatch: {
      findMany: async () => [batch],
    },
    sale: {
      create: async () => {
        saleCreated = true;
      },
    },
  };
  const service = createSalesService(
    {
      $transaction: async (callback: (transaction: typeof tx) => unknown) =>
        callback(tx),
    },
    createAuditMock().audit,
  );

  await assert.rejects(
    service.createSale(
      {
        paymentMethod: PaymentMethod.CASH,
        items: [{ productId: product.id, quantity: "9", unitPrice: "3000" }],
      },
      actor,
    ),
    (error) =>
      error instanceof BadRequestException &&
      /only 8 loaf.*central Sales stock/i.test(error.message),
  );
  assert.equal(saleCreated, false);
});

test("SalesService.createSale consumes an Admin approval for repeat retailer credit", async () => {
  const soldAt = new Date("2026-07-10T12:10:00.000Z");
  const createdAt = new Date("2026-07-10T12:10:01.000Z");
  const retailer = {
    id: "retailer-1",
    name: "Amina Stores",
    contactPerson: "Amina",
    phone: "08030000000",
    email: null,
    address: "Retail Road",
    creditLimit: "500000.00",
    notes: null,
    isActive: true,
    createdAt,
    updatedAt: createdAt,
    createdBy: {
      id: actor.id,
      name: actor.name,
      email: actor.email,
    },
  };
  const batches = [
    {
      id: "batch-1",
      productId: product.id,
      batchNumber: 1,
      batchDate: new Date("2026-07-09T00:00:00.000Z"),
      quantityRemaining: 10,
      receivedAt: new Date("2026-07-09T07:00:00.000Z"),
    },
  ];
  let saleCreateData: Record<string, unknown> | null = null;
  let approvalUpdateData: Record<string, unknown> | null = null;
  const { audit, records } = createAuditMock();
  const tx = {
    businessDayState: createBusinessDayStateMock(),
    product: {
      findMany: async () => [product],
    },
    retailer: {
      findUnique: async () => retailer,
    },
    sale: {
      aggregate: async () => ({
        _sum: { balanceDue: "100000.00" },
      }),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        saleCreateData = data;
        return {
          id: "sale-retailer-1",
          saleNumber: 43,
          ...data,
          createdAt,
        };
      },
      findUniqueOrThrow: async () => ({
        id: "sale-retailer-1",
        saleNumber: 43,
        customerType: saleCreateData?.customerType,
        retailer,
        retailerApprovalId: saleCreateData?.retailerApprovalId,
        retailerApproval: {
          id: "approval-1",
          approvedAmount: "10000.00",
          status: "USED",
          reason: "Manager approved",
          expiresAt: null,
          usedAt: new Date("2026-07-10T12:10:02.000Z"),
          createdAt,
          approvedBy: {
            id: actor.id,
            name: actor.name,
            email: actor.email,
          },
        },
        paymentMethod: saleCreateData?.paymentMethod,
        customerName: saleCreateData?.customerName,
        soldAt,
        subtotal: saleCreateData?.subtotal,
        discount: saleCreateData?.discount,
        totalAmount: saleCreateData?.totalAmount,
        amountPaid: saleCreateData?.amountPaid,
        balanceDue: saleCreateData?.balanceDue,
        notes: saleCreateData?.notes ?? null,
        createdAt,
        createdBy: {
          id: actor.id,
          name: actor.name,
          email: actor.email,
        },
        items: [
          {
            id: "sale-item-1",
            quantity: 2,
            unitPrice: 3000,
            lineTotal: 6000,
            product,
            batchIssues: [
              {
                id: "issue-1",
                quantity: 2,
                batch: batches[0],
              },
            ],
          },
        ],
      }),
    },
    $queryRaw: async () => batches.map((batch) => ({ id: batch.id })),
    posTerminalStockAllocation: {
      findMany: async () => [],
    },
    retailerOrderApproval: {
      findUnique: async () => ({
        id: "approval-1",
        retailerId: retailer.id,
        approvedAmount: "10000.00",
        status: "APPROVED",
        expiresAt: null,
        usedAt: null,
      }),
      update: async ({ data }: { data: Record<string, unknown> }) => {
        approvalUpdateData = data;
      },
    },
    salesProductBatch: {
      findMany: async () => batches,
      update: async () => undefined,
    },
    saleItem: {
      create: async () => ({ id: "sale-item-1" }),
    },
    saleItemBatch: {
      create: async () => undefined,
    },
    salesProductStockMovement: {
      create: async () => undefined,
    },
  };
  const service = createSalesService(
    {
      $transaction: async (callback: (transaction: typeof tx) => unknown) =>
        callback(tx),
    },
    audit,
  );

  const result = await service.createSale(
    {
      customerType: CustomerType.RETAILER,
      retailerId: retailer.id,
      retailerApprovalId: "approval-1",
      paymentMethod: PaymentMethod.CREDIT,
      soldAt: soldAt.toISOString(),
      items: [{ productId: product.id, quantity: "2", unitPrice: "3000" }],
    },
    actor,
  );

  assert.equal(saleCreateData?.customerType, CustomerType.RETAILER);
  assert.equal(saleCreateData?.retailerId, retailer.id);
  assert.equal(saleCreateData?.retailerApprovalId, "approval-1");
  assert.equal(saleCreateData?.customerName, retailer.name);
  assert.equal(saleCreateData?.paymentMethod, PaymentMethod.CREDIT);
  assert.equal(saleCreateData?.amountPaid, 0);
  assert.equal(saleCreateData?.balanceDue, 6000);
  assert.equal(result.customerType, CustomerType.RETAILER);
  assert.equal(result.retailer?.name, retailer.name);
  assert.equal(result.retailerApproval?.id, "approval-1");
  assert.equal(result.balanceDue, "6000");
  assert.equal(approvalUpdateData?.status, "USED");
  assert.ok(approvalUpdateData?.usedAt instanceof Date);
  assert.equal(records.length, 1);
});

test("SalesService.createSale blocks repeat retailer credit without Admin approval", async () => {
  let saleCreated = false;
  const service = createSalesService(
    {
      $transaction: async (callback: (transaction: unknown) => unknown) =>
        callback({
          product: {
            findMany: async () => [product],
          },
          $queryRaw: async () => [],
          retailer: {
            findUnique: async () => ({
              id: "retailer-1",
              name: "Amina Stores",
              isActive: true,
            }),
          },
          sale: {
            aggregate: async () => ({
              _sum: { balanceDue: "498000.00" },
            }),
            create: async () => {
              saleCreated = true;
            },
          },
        }),
    },
    createAuditMock().audit,
  );

  await assert.rejects(
    service.createSale(
      {
        customerType: CustomerType.RETAILER,
        retailerId: "retailer-1",
        paymentMethod: PaymentMethod.CREDIT,
        items: [{ productId: product.id, quantity: "1", unitPrice: "3000" }],
      },
      actor,
    ),
    /admin approval is required/i,
  );
  assert.equal(saleCreated, false);
});

test("SalesService.recordRetailerPayment settles oldest retailer balances first", async () => {
  const paidAt = new Date("2026-07-10T13:20:00.000Z");
  const createdAt = new Date("2026-07-10T13:20:01.000Z");
  const retailer = { id: "retailer-1", name: "Amina Stores" };
  const sales = [
    {
      id: "sale-old",
      saleNumber: 10,
      soldAt: new Date("2026-07-09T08:00:00.000Z"),
      totalAmount: 7000,
      amountPaid: 0,
      balanceDue: 7000,
    },
    {
      id: "sale-new",
      saleNumber: 11,
      soldAt: new Date("2026-07-10T08:00:00.000Z"),
      totalAmount: 6000,
      amountPaid: 1000,
      balanceDue: 5000,
    },
  ];
  const saleUpdates: Array<{
    id: string;
    amountPaid: unknown;
    balanceDue: unknown;
  }> = [];
  const allocations: Array<{ paymentId: string; saleId: string; amount: unknown }> =
    [];
  const { audit, records } = createAuditMock();
  const tx = {
    businessDayState: createBusinessDayStateMock(),
    $queryRaw: async () => sales.map((sale) => ({ id: sale.id })),
    retailer: {
      findUnique: async () => retailer,
    },
    sale: {
      findMany: async () => sales,
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { amountPaid: unknown; balanceDue: unknown };
      }) => {
        saleUpdates.push({
          id: where.id,
          amountPaid: data.amountPaid,
          balanceDue: data.balanceDue,
        });
      },
    },
    retailerPayment: {
      create: async () => ({
        id: "payment-1",
      }),
      findUniqueOrThrow: async () => ({
        id: "payment-1",
        amount: 9000,
        paymentMethod: PaymentMethod.TRANSFER,
        paidAt,
        reference: "TRF-123",
        notes: "Weekly settlement",
        createdAt,
        retailer: {
          ...retailer,
          creditLimit: 500000,
        },
        createdBy: {
          id: actor.id,
          name: actor.name,
          email: actor.email,
        },
        allocations: allocations.map((allocation, index) => {
          const sale = sales.find((entry) => entry.id === allocation.saleId);

          assert.ok(sale);

          return {
            id: `allocation-${index + 1}`,
            amount: allocation.amount,
            sale: {
              id: sale.id,
              saleNumber: sale.saleNumber,
              soldAt: sale.soldAt,
              totalAmount: sale.totalAmount,
              balanceDue: saleUpdates.find((entry) => entry.id === sale.id)
                ?.balanceDue,
            },
          };
        }),
      }),
    },
    retailerPaymentAllocation: {
      create: async ({ data }: { data: typeof allocations[number] }) => {
        allocations.push(data);
      },
    },
  };
  const service = createSalesService(
    {
      $transaction: async (callback: (transaction: typeof tx) => unknown) =>
        callback(tx),
    },
    audit,
  );

  const result = await service.recordRetailerPayment(
    retailer.id,
    {
      amount: "9000",
      paymentMethod: PaymentMethod.TRANSFER,
      paidAt: paidAt.toISOString(),
      reference: "TRF-123",
      notes: "Weekly settlement",
    },
    actor,
  );

  assert.deepEqual(
    saleUpdates.map((entry) => ({
      id: entry.id,
      amountPaid: String(entry.amountPaid),
      balanceDue: String(entry.balanceDue),
    })),
    [
      { id: "sale-old", amountPaid: "7000", balanceDue: "0" },
      { id: "sale-new", amountPaid: "3000", balanceDue: "3000" },
    ],
  );
  assert.deepEqual(
    allocations.map((entry) => ({
      saleId: entry.saleId,
      amount: String(entry.amount),
    })),
    [
      { saleId: "sale-old", amount: "7000" },
      { saleId: "sale-new", amount: "2000" },
    ],
  );
  assert.equal(result.amount, "9000");
  assert.deepEqual(
    result.allocations.map((allocation) => allocation.sale.saleNumber),
    [10, 11],
  );
  assert.equal(records.length, 1);
});

test("SalesService.recordRetailerPayment rejects payments above outstanding balance", async () => {
  let paymentCreated = false;
  const tx = {
    $queryRaw: async () => [{ id: "sale-1" }],
    retailer: {
      findUnique: async () => ({ id: "retailer-1", name: "Amina Stores" }),
    },
    sale: {
      findMany: async () => [
        {
          id: "sale-1",
          saleNumber: 10,
          amountPaid: 1000,
          balanceDue: 4000,
        },
      ],
    },
    retailerPayment: {
      create: async () => {
        paymentCreated = true;
      },
    },
  };
  const service = createSalesService(
    {
      $transaction: async (callback: (transaction: typeof tx) => unknown) =>
        callback(tx),
    },
    createAuditMock().audit,
  );

  await assert.rejects(
    service.recordRetailerPayment(
      "retailer-1",
      {
        amount: "5000",
        paymentMethod: PaymentMethod.CASH,
      },
      actor,
    ),
    /cannot exceed outstanding balance/i,
  );
  assert.equal(paymentCreated, false);
});

test("SalesService.checkoutPosSession rejects already-claimed sessions before creating a sale", async () => {
  let saleCreated = false;
  const { audit } = createAuditMock();
  const session = {
    id: "session-1",
    displayToken: "display-token",
    terminal: null,
    status: PosSessionStatus.ACTIVE,
    customerName: null,
    paymentMethod: PaymentMethod.CASH,
    discount: 0,
    amountPaid: null,
    notes: null,
    createdAt: new Date("2026-07-10T12:30:00.000Z"),
    updatedAt: new Date("2026-07-10T12:30:00.000Z"),
    completedAt: null,
    completedSale: null,
    createdById: actor.id,
    items: [
      {
        id: "pos-item-1",
        productId: product.id,
        quantity: 1,
        unitPrice: 3000,
        product,
      },
    ],
  };
  const tx = {
    posSession: {
      updateMany: async () => ({ count: 0 }),
    },
    sale: {
      create: async () => {
        saleCreated = true;
      },
    },
  };
  const service = createSalesService(
    {
      posSession: {
        findUnique: async () => session,
      },
      $transaction: async (callback: (transaction: typeof tx) => unknown) =>
        callback(tx),
    },
    audit,
  );

  await assert.rejects(
    service.checkoutPosSession(session.id, actor),
    (error) =>
      error instanceof BadRequestException &&
      /already been checked out or cancelled/i.test(error.message),
  );
  assert.equal(saleCreated, false);
});

test("SalesService.recordReturn locks the sale item before checking returnable quantity", async () => {
  const calls: string[] = [];
  const tx = {
    $queryRaw: async () => {
      calls.push("lock");
      return [{ id: "sale-item-1" }];
    },
    saleItem: {
      findUnique: async () => {
        calls.push("read-sale-item");
        return {
          id: "sale-item-1",
          productId: product.id,
          product,
          quantity: 1,
          batchIssues: [],
          returns: [],
        };
      },
    },
  };
  const service = createSalesService(
    {
      $transaction: async (callback: (transaction: typeof tx) => unknown) =>
        callback(tx),
    },
    createAuditMock().audit,
  );

  await assert.rejects(
    service.recordReturn(
      {
        saleItemId: "sale-item-1",
        disposition: SalesReturnDisposition.RETURN_TO_STOCK,
        quantity: "2",
      },
      actor,
    ),
    /return at most/i,
  );
  assert.deepEqual(calls, ["lock", "read-sale-item"]);
});

test("SalesService.recordReturn returns customer items to their original sale batches", async () => {
  const now = new Date("2026-07-10T13:00:00.000Z");
  const batches = [
    {
      id: "batch-old",
      productId: product.id,
      batchNumber: 1,
      batchDate: new Date("2026-07-08T00:00:00.000Z"),
      quantityRemaining: 0,
      receivedAt: new Date("2026-07-08T07:00:00.000Z"),
    },
    {
      id: "batch-new",
      productId: product.id,
      batchNumber: 2,
      batchDate: new Date("2026-07-09T00:00:00.000Z"),
      quantityRemaining: 4,
      receivedAt: new Date("2026-07-09T07:00:00.000Z"),
    },
  ];
  const batchUpdates: Array<{ id: string; quantityRemaining: unknown }> = [];
  const stockMovements: Record<string, unknown>[] = [];
  const returnWrites: Record<string, unknown>[] = [];
  const { audit, records } = createAuditMock();
  const tx = {
    businessDayState: createBusinessDayStateMock(),
    saleItem: {
      findUnique: async () => ({
        id: "sale-item-1",
        productId: product.id,
        product,
        quantity: 4,
        batchIssues: [
          {
            id: "issue-old",
            batchId: "batch-old",
            quantity: 2,
            createdAt: new Date("2026-07-10T12:00:00.000Z"),
            batch: batches[0],
          },
          {
            id: "issue-new",
            batchId: "batch-new",
            quantity: 2,
            createdAt: new Date("2026-07-10T12:01:00.000Z"),
            batch: batches[1],
          },
        ],
        returns: [{ batchId: "batch-old", quantity: 1 }],
      }),
    },
    $queryRaw: async () => [],
    salesProductBatch: {
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
        const batch = batches.find((entry) => entry.id === where.id);
        assert.ok(batch);
        return batch;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { quantityRemaining: unknown };
      }) => {
        batchUpdates.push({
          id: where.id,
          quantityRemaining: data.quantityRemaining,
        });
      },
    },
    salesProductStockMovement: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        stockMovements.push(data);
      },
    },
    salesProductReturn: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const batch = batches.find((entry) => entry.id === data.batchId);

        assert.ok(batch);
        returnWrites.push(data);
        return {
          id: `return-${batch.id}`,
          disposition: data.disposition,
          quantity: data.quantity,
          reason: data.reason,
          recordedAt: data.recordedAt,
          createdAt: now,
          product,
          batch,
          saleItem: {
            id: "sale-item-1",
            quantity: 4,
            sale: {
              id: "sale-1",
              saleNumber: 44,
              soldAt: new Date("2026-07-10T12:00:00.000Z"),
            },
            product,
          },
          createdBy: {
            id: actor.id,
            name: actor.name,
            email: actor.email,
          },
        };
      },
    },
  };
  const service = createSalesService(
    {
      $transaction: async (callback: (transaction: typeof tx) => unknown) =>
        callback(tx),
    },
    audit,
  );

  const result = await service.recordReturn(
    {
      saleItemId: "sale-item-1",
      disposition: SalesReturnDisposition.RETURN_TO_STOCK,
      quantity: "2",
      reason: "Customer returned fresh goods",
      recordedAt: now.toISOString(),
    },
    actor,
  );

  assert.deepEqual(batchUpdates, [
    { id: "batch-old", quantityRemaining: 1 },
    { id: "batch-new", quantityRemaining: 5 },
  ]);
  assert.deepEqual(
    stockMovements.map((entry) => ({
      batchId: entry.batchId,
      type: entry.type,
      quantity: entry.quantity,
    })),
    [
      { batchId: "batch-old", type: FinishedProductStockMovementType.RETURN, quantity: 1 },
      { batchId: "batch-new", type: FinishedProductStockMovementType.RETURN, quantity: 1 },
    ],
  );
  assert.deepEqual(
    returnWrites.map((entry) => ({
      batchId: entry.batchId,
      disposition: entry.disposition,
      quantity: entry.quantity,
    })),
    [
      {
        batchId: "batch-old",
        disposition: SalesReturnDisposition.RETURN_TO_STOCK,
        quantity: 1,
      },
      {
        batchId: "batch-new",
        disposition: SalesReturnDisposition.RETURN_TO_STOCK,
        quantity: 1,
      },
    ],
  );
  assert.equal(records.length, 1);
  assert.equal(result.length, 2);
  assert.equal(result[0]?.batch?.id, "batch-old");
  assert.equal(result[1]?.batch?.id, "batch-new");
});

test("SalesService.recordReturn restores the exact terminal custody batch", async () => {
  const now = new Date("2026-07-14T14:00:00.000Z");
  const sourceBatch = {
    id: "batch-1",
    batchNumber: 1,
    batchDate: new Date("2026-07-14T00:00:00.000Z"),
    quantityRemaining: 0,
  };
  const custodyBatch = {
    id: "custody-1",
    allocationId: "allocation-1",
    terminalId: "terminal-1",
    productId: product.id,
    quantityRemaining: 2,
  };
  const custodyUpdates: Array<Record<string, unknown>> = [];
  const allocationUpdates: Array<Record<string, unknown>> = [];
  const terminalMovements: Array<Record<string, unknown>> = [];
  const returnWrites: Array<Record<string, unknown>> = [];
  let centralBatchUpdated = false;
  const tx = {
    businessDayState: createBusinessDayStateMock(),
    saleItem: {
      findUnique: async () => ({
        id: "sale-item-1",
        productId: product.id,
        product,
        quantity: 4,
        batchIssues: [
          {
            id: "issue-1",
            batchId: sourceBatch.id,
            terminalBatchId: custodyBatch.id,
            quantity: 4,
            createdAt: new Date("2026-07-14T12:00:00.000Z"),
            batch: sourceBatch,
            terminalBatch: custodyBatch,
          },
        ],
        returns: [],
      }),
    },
    $queryRaw: async () => [],
    posTerminalStockBatch: {
      findUniqueOrThrow: async () => custodyBatch,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        custodyUpdates.push(data);
      },
    },
    posTerminalStockAllocation: {
      update: async ({ data }: { data: Record<string, unknown> }) => {
        allocationUpdates.push(data);
      },
    },
    posTerminalStockMovement: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        terminalMovements.push(data);
      },
    },
    salesProductBatch: {
      update: async () => {
        centralBatchUpdated = true;
      },
    },
    salesProductStockMovement: {
      create: async () => {
        centralBatchUpdated = true;
      },
    },
    salesProductReturn: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        returnWrites.push(data);
        return {
          id: "return-1",
          disposition: data.disposition,
          quantity: data.quantity,
          reason: data.reason,
          recordedAt: data.recordedAt,
          createdAt: now,
          product,
          batch: sourceBatch,
          terminalBatch: custodyBatch,
          saleItem: {
            id: "sale-item-1",
            quantity: 4,
            sale: {
              id: "sale-1",
              saleNumber: 51,
              soldAt: new Date("2026-07-14T12:00:00.000Z"),
            },
            product,
          },
          createdBy: {
            id: actor.id,
            name: actor.name,
            email: actor.email,
          },
        };
      },
    },
  };
  const service = createSalesService(
    {
      $transaction: async (callback: (transaction: typeof tx) => unknown) =>
        callback(tx),
    },
    createAuditMock().audit,
  );

  await service.recordReturn(
    {
      saleItemId: "sale-item-1",
      disposition: SalesReturnDisposition.RETURN_TO_STOCK,
      quantity: "2",
      reason: "Customer return",
      recordedAt: now.toISOString(),
    },
    actor,
  );

  assert.equal(centralBatchUpdated, false);
  assert.deepEqual(custodyUpdates, [{ quantityRemaining: 4 }]);
  assert.deepEqual(allocationUpdates, [{ soldQuantity: { decrement: 2 } }]);
  assert.equal(terminalMovements[0]?.type, PosTerminalStockMovementType.RETURN);
  assert.equal(terminalMovements[0]?.balanceAfter, 4);
  assert.equal(returnWrites[0]?.terminalBatchId, custodyBatch.id);
  assert.equal(returnWrites[0]?.batchId, sourceBatch.id);
});

test("SalesService.getPosDisplay hides expired display tokens", async () => {
  const service = createSalesService(
    {
      posSession: {
        findUnique: async () => ({
          id: "session-1",
          expiresAt: new Date(Date.now() - 1_000),
        }),
      },
    },
    createAuditMock().audit,
  );

  await assert.rejects(
    service.getPosDisplay("expired-token"),
    (error) =>
      error instanceof NotFoundException &&
      /display session not found/i.test(error.message),
  );
});

test("SalesService.createPosTerminal issues a pairing code for one hour", async () => {
  const { audit } = createAuditMock();
  let createdData: Record<string, unknown> | null = null;
  const service = createSalesService(
    {
      posTerminal: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          createdData = data;

          return terminalRecord({
            name: data.name,
            pairingCodeHash: data.pairingCodeHash,
            pairingCodeExpiresAt: data.pairingCodeExpiresAt,
          });
        },
      },
    },
    audit,
  );
  const before = Date.now();

  const terminal = await service.createPosTerminal(
    { name: "Front counter", pairingCode: "pair-code" },
    actor,
  );
  const after = Date.now();
  const expiresAt = createdData?.pairingCodeExpiresAt;

  assert.ok(expiresAt instanceof Date);
  assert.ok(expiresAt.getTime() >= before + 60 * 60 * 1000);
  assert.ok(expiresAt.getTime() <= after + 60 * 60 * 1000);
  assert.equal(terminal.pairable, true);
});

test("SalesService.pairPosTerminal consumes one pairing code exactly once", async () => {
  const { audit, records } = createAuditMock();
  const state = {
    id: "terminal-1",
    isActive: true,
    pairingCodeHash: hashSecret("pair-code"),
    pairingCodeExpiresAt: new Date(Date.now() + 60_000),
    pairedAt: null as Date | null,
    pairedById: null as string | null,
    deviceSecretHash: null as string | null,
    deviceSecretIssuedAt: null as Date | null,
    lastSeenAt: null as Date | null,
  };
  const updates: Record<string, unknown>[] = [];
  const service = createSalesService(
    {
      posTerminal: {
        findUnique: async () => ({ ...state }),
        updateMany: async ({
          where,
          data,
        }: {
          where: Record<string, unknown>;
          data: Record<string, unknown>;
        }) => {
          const expiresFilter = where.pairingCodeExpiresAt as { gt: Date };

          if (
            state.pairedAt ||
            state.deviceSecretHash ||
            state.pairingCodeHash !== where.pairingCodeHash ||
            state.pairingCodeExpiresAt.getTime() <= expiresFilter.gt.getTime()
          ) {
            return { count: 0 };
          }

          updates.push(data);
          Object.assign(state, data);
          return { count: 1 };
        },
        findUniqueOrThrow: async () =>
          terminalRecord({
            pairingCodeHash: state.pairingCodeHash,
            pairingCodeExpiresAt: state.pairingCodeExpiresAt,
            pairedAt: state.pairedAt,
            pairedBy: state.pairedAt ? actor : null,
            deviceSecretHash: state.deviceSecretHash,
            deviceSecretIssuedAt: state.deviceSecretIssuedAt,
            lastSeenAt: state.lastSeenAt,
          }),
      },
    },
    audit,
  );

  const attempts = await Promise.allSettled([
    service.pairPosTerminal(
      { terminalId: "terminal-1", pairingCode: "pair-code" },
      actor,
    ),
    service.pairPosTerminal(
      { terminalId: "terminal-1", pairingCode: "pair-code" },
      actor,
    ),
  ]);
  const fulfilled = attempts.filter(
    (attempt): attempt is PromiseFulfilledResult<
      Awaited<ReturnType<SalesService["pairPosTerminal"]>>
    > => attempt.status === "fulfilled",
  );
  const rejected = attempts.filter(
    (attempt): attempt is PromiseRejectedResult => attempt.status === "rejected",
  );
  const update = updates[0];

  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.ok(rejected[0]?.reason instanceof ConflictException);
  assert.equal(typeof fulfilled[0]?.value.deviceSecret, "string");
  assert.ok((fulfilled[0]?.value.deviceSecret.length ?? 0) > 20);
  assert.equal(update?.pairingCodeHash, null);
  assert.equal(update?.pairingCodeExpiresAt, null);
  assert.equal(fulfilled[0]?.value.pairable, false);
  assert.equal(update?.pairedById, actor.id);
  assert.equal(typeof update?.deviceSecretHash, "string");
  assert.notEqual(update?.deviceSecretHash, fulfilled[0]?.value.deviceSecret);
  assert.equal(records.length, 1);
});

test("SalesService.rePairPosTerminal revokes the old device and creates a one-hour code", async () => {
  const { audit, records } = createAuditMock();
  const previousPairedAt = new Date("2026-07-14T08:00:00.000Z");
  const previousSecretIssuedAt = new Date("2026-07-14T08:01:00.000Z");
  let updateData: Record<string, unknown> | null = null;
  const service = createSalesService(
    {
      posTerminal: {
        findUnique: async () => ({
          id: "terminal-1",
          name: "Front counter",
          isActive: true,
          pairedAt: previousPairedAt,
          deviceSecretIssuedAt: previousSecretIssuedAt,
        }),
        update: async ({ data }: { data: Record<string, unknown> }) => {
          updateData = data;

          return terminalRecord({
            pairingCodeHash: data.pairingCodeHash,
            pairingCodeExpiresAt: data.pairingCodeExpiresAt,
            pairedAt: data.pairedAt,
            pairedBy: null,
            deviceSecretHash: data.deviceSecretHash,
            deviceSecretIssuedAt: data.deviceSecretIssuedAt,
            lastSeenAt: data.lastSeenAt,
          });
        },
      },
    },
    audit,
  );
  const before = Date.now();

  const terminal = await service.rePairPosTerminal(
    "terminal-1",
    { pairingCode: "new-pair-code" },
    actor,
  );
  const after = Date.now();
  const expiresAt = updateData?.pairingCodeExpiresAt;

  assert.ok(expiresAt instanceof Date);
  assert.ok(expiresAt.getTime() >= before + 60 * 60 * 1000);
  assert.ok(expiresAt.getTime() <= after + 60 * 60 * 1000);
  assert.equal(updateData?.pairedAt, null);
  assert.equal(updateData?.deviceSecretHash, null);
  assert.equal(updateData?.deviceSecretIssuedAt, null);
  assert.equal(updateData?.lastSeenAt, null);
  assert.equal(terminal.pairable, true);
  assert.equal(records.length, 1);
  assert.equal(records[0]?.action, "ADMIN_POS_TERMINAL_REPAIR_STARTED");
});

test("SalesService.setPosTerminalStockAllocation prevents concurrent over-allocation", async () => {
  const now = new Date("2026-07-14T10:00:00.000Z");
  const allocations: Array<{
    id: string;
    terminalId: string;
    productId: string;
    allocatedQuantity: number;
    soldQuantity: number;
    createdAt: Date;
    updatedAt: Date;
  }> = [];
  const lockQueries: string[] = [];
  const centralBatch = {
    id: "batch-1",
    quantityRemaining: 10,
    unitCost: 1500,
    receivedAt: new Date("2026-07-14T08:00:00.000Z"),
    batchNumber: 1,
  };
  const custodyBatches: Array<{
    id: string;
    allocationId: string;
    terminalId: string;
    productId: string;
    sourceBatchId: string;
    quantityAllocated: number;
    quantityRemaining: number;
    unitCost: number;
    allocatedAt: Date;
    createdAt: Date;
    updatedAt: Date;
    createdById: string;
  }> = [];
  const { audit, records } = createAuditMock();
  const tx = {
    posTerminal: {
      findUnique: async ({ where }: { where: { id: string } }) => ({
        id: where.id,
        name: where.id,
      }),
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) =>
        terminalRecord({
          id: where.id,
          name: where.id,
          stockAllocations: allocations
            .filter((allocation) => allocation.terminalId === where.id)
            .map((allocation) => ({
              ...allocation,
              product,
              batches: custodyBatches
                .filter((batch) => batch.allocationId === allocation.id)
                .map((batch) => ({
                  ...batch,
                  sourceBatch: {
                    id: centralBatch.id,
                    batchNumber: centralBatch.batchNumber,
                    batchDate: new Date("2026-07-14T00:00:00.000Z"),
                    receivedAt: centralBatch.receivedAt,
                  },
                })),
            })),
        }),
    },
    product: {
      findUnique: async () => product,
    },
    $queryRaw: async (query: unknown) => {
      const sql =
        (query as { strings?: readonly string[] }).strings?.join(" ") ?? "";
      lockQueries.push(sql);

      if (sql.includes('FROM "SalesProductBatch"')) {
        return [{ id: centralBatch.id }];
      }

      if (sql.includes('FROM "PosTerminalStockBatch"')) {
        return custodyBatches.map((batch) => ({ id: batch.id }));
      }

      return [];
    },
    posTerminalStockAllocation: {
      findMany: async () =>
        allocations.map((allocation) => ({ ...allocation })),
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: {
          terminalId_productId: { terminalId: string; productId: string };
        };
        create: {
          terminalId: string;
          productId: string;
          allocatedQuantity: number;
        };
        update: { allocatedQuantity: number };
      }) => {
        const key = where.terminalId_productId;
        const existing = allocations.find(
          (allocation) =>
            allocation.terminalId === key.terminalId &&
            allocation.productId === key.productId,
        );

        if (existing) {
          existing.allocatedQuantity = update.allocatedQuantity;
          existing.updatedAt = now;
          return existing;
        }

        const allocation = {
          id: `allocation-${allocations.length + 1}`,
          ...create,
          soldQuantity: 0,
          createdAt: now,
          updatedAt: now,
        };
        allocations.push(allocation);
        return allocation;
      },
    },
    salesProductBatch: {
      findMany: async () => [centralBatch],
      update: async ({ data }: { data: { quantityRemaining: number } }) => {
        centralBatch.quantityRemaining = data.quantityRemaining;
      },
    },
    salesProductStockMovement: {
      create: async () => undefined,
    },
    posTerminalStockBatch: {
      findMany: async ({ where }: { where: { allocationId: string } }) =>
        custodyBatches.filter(
          (batch) => batch.allocationId === where.allocationId,
        ),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const custodyBatch = {
          id: `custody-${custodyBatches.length + 1}`,
          allocationId: String(data.allocationId),
          terminalId: String(data.terminalId),
          productId: String(data.productId),
          sourceBatchId: String(data.sourceBatchId),
          quantityAllocated: Number(data.quantityAllocated),
          quantityRemaining: Number(data.quantityRemaining),
          unitCost: Number(data.unitCost),
          allocatedAt: now,
          createdAt: now,
          updatedAt: now,
          createdById: String(data.createdById),
        };
        custodyBatches.push(custodyBatch);
        return custodyBatch;
      },
    },
    posTerminalStockMovement: {
      create: async () => undefined,
    },
  };
  let transactionQueue = Promise.resolve();
  const service = createSalesService(
    {
      $transaction: <T>(callback: (transaction: typeof tx) => Promise<T>) => {
        const result = transactionQueue.then(async () => {
          const allocationsBefore = allocations.map((entry) => ({ ...entry }));
          const custodyBefore = custodyBatches.map((entry) => ({ ...entry }));
          const centralBefore = centralBatch.quantityRemaining;

          try {
            return await callback(tx);
          } catch (error) {
            allocations.splice(0, allocations.length, ...allocationsBefore);
            custodyBatches.splice(0, custodyBatches.length, ...custodyBefore);
            centralBatch.quantityRemaining = centralBefore;
            throw error;
          }
        });
        transactionQueue = result.then(
          () => undefined,
          () => undefined,
        );
        return result;
      },
    },
    audit,
  );

  const attempts = await Promise.allSettled([
    service.setPosTerminalStockAllocation(
      "terminal-1",
      { productId: product.id, allocatedQuantity: "8" },
      actor,
    ),
    service.setPosTerminalStockAllocation(
      "terminal-2",
      { productId: product.id, allocatedQuantity: "8" },
      actor,
    ),
  ]);

  assert.equal(
    attempts.filter((attempt) => attempt.status === "fulfilled").length,
    1,
  );
  assert.equal(
    attempts.filter((attempt) => attempt.status === "rejected").length,
    1,
  );
  assert.equal(
    allocations.reduce(
      (sum, allocation) =>
        sum + allocation.allocatedQuantity - allocation.soldQuantity,
      0,
    ),
    8,
  );
  assert.ok(
    attempts.some(
      (attempt) =>
        attempt.status === "rejected" &&
        attempt.reason instanceof BadRequestException &&
        /only 2 loaf.*central Sales stock/i.test(attempt.reason.message),
    ),
  );
  assert.ok(
    lockQueries.some(
      (query) =>
        query.includes('FROM "Product"') && query.includes("FOR UPDATE"),
    ),
  );
  assert.equal(records.length, 1);
});

test("SalesService.setPosTerminalStockAllocation releases only unsold custody to its source batch", async () => {
  const now = new Date("2026-07-14T16:00:00.000Z");
  const allocation = {
    id: "allocation-1",
    terminalId: "terminal-1",
    productId: product.id,
    allocatedQuantity: 10,
    soldQuantity: 4,
    createdAt: now,
    updatedAt: now,
  };
  let savedAllocatedQuantity = allocation.allocatedQuantity;
  const sourceBatch = {
    id: "batch-1",
    quantityRemaining: 2,
    unitCost: 1500,
    receivedAt: new Date("2026-07-14T08:00:00.000Z"),
    batchNumber: 1,
    batchDate: new Date("2026-07-14T00:00:00.000Z"),
  };
  const custodyBatch = {
    id: "custody-1",
    allocationId: allocation.id,
    terminalId: allocation.terminalId,
    productId: allocation.productId,
    sourceBatchId: sourceBatch.id,
    quantityAllocated: 10,
    quantityRemaining: 6,
    unitCost: 1500,
    allocatedAt: new Date("2026-07-14T09:00:00.000Z"),
    createdAt: new Date("2026-07-14T09:00:00.000Z"),
    updatedAt: now,
    createdById: actor.id,
  };
  const centralMovements: Array<Record<string, unknown>> = [];
  const terminalMovements: Array<Record<string, unknown>> = [];
  const tx = {
    posTerminal: {
      findUnique: async () => ({ id: "terminal-1", name: "Front counter" }),
      findUniqueOrThrow: async () =>
        terminalRecord({
          stockAllocations: [
            {
              ...allocation,
              allocatedQuantity: savedAllocatedQuantity,
              product,
              batches: [
                {
                  ...custodyBatch,
                  sourceBatch,
                },
              ],
            },
          ],
        }),
    },
    product: {
      findUnique: async () => product,
    },
    $queryRaw: async (query: unknown) => {
      const sql =
        (query as { strings?: readonly string[] }).strings?.join(" ") ?? "";

      if (sql.includes('FROM "SalesProductBatch"')) {
        return [{ id: sourceBatch.id }];
      }

      if (sql.includes('FROM "PosTerminalStockBatch"')) {
        return [{ id: custodyBatch.id }];
      }

      return [];
    },
    posTerminalStockAllocation: {
      findMany: async () => [allocation],
      upsert: async ({ update }: { update: { allocatedQuantity: number } }) => {
        savedAllocatedQuantity = update.allocatedQuantity;
        return {
          ...allocation,
          allocatedQuantity: savedAllocatedQuantity,
        };
      },
    },
    salesProductBatch: {
      findMany: async () => [sourceBatch],
      update: async ({ data }: { data: { quantityRemaining: number } }) => {
        sourceBatch.quantityRemaining = data.quantityRemaining;
      },
    },
    posTerminalStockBatch: {
      findMany: async () => [custodyBatch],
      update: async ({ data }: { data: { quantityRemaining: number } }) => {
        custodyBatch.quantityRemaining = data.quantityRemaining;
      },
    },
    salesProductStockMovement: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        centralMovements.push(data);
      },
    },
    posTerminalStockMovement: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        terminalMovements.push(data);
      },
    },
  };
  const service = createSalesService(
    {
      $transaction: async (callback: (transaction: typeof tx) => unknown) =>
        callback(tx),
    },
    createAuditMock().audit,
  );

  await service.setPosTerminalStockAllocation(
    "terminal-1",
    { productId: product.id, allocatedQuantity: "7" },
    actor,
  );

  assert.equal(savedAllocatedQuantity, 7);
  assert.equal(allocation.soldQuantity, 4);
  assert.equal(custodyBatch.quantityRemaining, 3);
  assert.equal(sourceBatch.quantityRemaining, 5);
  assert.equal(terminalMovements[0]?.type, PosTerminalStockMovementType.RELEASE);
  assert.equal(terminalMovements[0]?.quantity, 3);
  assert.equal(
    centralMovements[0]?.type,
    FinishedProductStockMovementType.RELEASE_FROM_TERMINAL,
  );
});

test("SalesService.adjustPosTerminalStock records an audited custody adjustment", async () => {
  const now = new Date("2026-07-14T17:00:00.000Z");
  const allocation = {
    id: "allocation-1",
    terminalId: "terminal-1",
    productId: product.id,
    allocatedQuantity: 10,
    soldQuantity: 5,
    createdAt: now,
    updatedAt: now,
  };
  const sourceBatch = {
    id: "batch-1",
    batchNumber: 1,
    batchDate: new Date("2026-07-14T00:00:00.000Z"),
    receivedAt: new Date("2026-07-14T08:00:00.000Z"),
  };
  const custodyBatch = {
    id: "custody-1",
    allocationId: allocation.id,
    terminalId: allocation.terminalId,
    productId: allocation.productId,
    quantityAllocated: 10,
    quantityRemaining: 5,
    allocatedAt: new Date("2026-07-14T09:00:00.000Z"),
    createdAt: new Date("2026-07-14T09:00:00.000Z"),
    updatedAt: now,
    allocation,
    product,
    terminal: { id: "terminal-1", name: "Front counter" },
  };
  const movements: Array<Record<string, unknown>> = [];
  let savedAllocatedQuantity = allocation.allocatedQuantity;
  const { audit, records } = createAuditMock();
  const tx = {
    $queryRaw: async () => [],
    posTerminalStockBatch: {
      findFirst: async () => ({
        id: custodyBatch.id,
        productId: product.id,
        allocationId: allocation.id,
      }),
      findUniqueOrThrow: async () => custodyBatch,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        custodyBatch.quantityRemaining = Number(data.quantityRemaining);
      },
    },
    posTerminalStockAllocation: {
      update: async ({ data }: { data: { allocatedQuantity: number } }) => {
        savedAllocatedQuantity = data.allocatedQuantity;
      },
    },
    posTerminalStockMovement: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        movements.push(data);
      },
    },
    posTerminal: {
      findUniqueOrThrow: async () =>
        terminalRecord({
          stockAllocations: [
            {
              ...allocation,
              allocatedQuantity: savedAllocatedQuantity,
              product,
              batches: [
                {
                  ...custodyBatch,
                  sourceBatch,
                },
              ],
            },
          ],
        }),
    },
  };
  const service = createSalesService(
    {
      $transaction: async (callback: (transaction: typeof tx) => unknown) =>
        callback(tx),
    },
    audit,
  );

  await service.adjustPosTerminalStock(
    "terminal-1",
    {
      terminalBatchId: custodyBatch.id,
      countedQuantity: "3",
      reason: "Supervisor recount after breakage",
    },
    actor,
  );

  assert.equal(custodyBatch.quantityRemaining, 3);
  assert.equal(savedAllocatedQuantity, 8);
  assert.equal(movements[0]?.type, PosTerminalStockMovementType.ADJUST);
  assert.equal(movements[0]?.quantity, 2);
  assert.equal(movements[0]?.balanceAfter, 3);
  assert.equal(records[0]?.action, "ADMIN_POS_TERMINAL_STOCK_ADJUSTED");
});

test("SalesService.setPosTerminalStockAllocation cannot drop below sold stock", async () => {
  let upsertCalled = false;
  const existingAllocation = {
    id: "allocation-1",
    terminalId: "terminal-1",
    productId: product.id,
    allocatedQuantity: 10,
    soldQuantity: 4,
  };
  const tx = {
    posTerminal: {
      findUnique: async () => ({ id: "terminal-1", name: "Front counter" }),
    },
    product: {
      findUnique: async () => product,
    },
    $queryRaw: async () => [],
    posTerminalStockAllocation: {
      findMany: async () => [existingAllocation],
      upsert: async () => {
        upsertCalled = true;
      },
    },
  };
  const service = createSalesService(
    {
      $transaction: async (callback: (transaction: typeof tx) => unknown) =>
        callback(tx),
    },
    createAuditMock().audit,
  );

  await assert.rejects(
    service.setPosTerminalStockAllocation(
      "terminal-1",
      { productId: product.id, allocatedQuantity: "3" },
      actor,
    ),
    /cannot be below the 4 loaf already sold/i,
  );
  assert.equal(upsertCalled, false);
});

test("SalesService.getPosTerminal requires the paired device secret", async () => {
  const service = createSalesService(
    {
      posTerminal: {
        findUnique: async () => ({
          id: "terminal-1",
          displayToken: "display-token",
          isActive: true,
          deviceSecretHash: hashSecret("secret"),
        }),
        update: async () => terminalRecord(),
      },
    },
    createAuditMock().audit,
  );

  await assert.rejects(
    service.getPosTerminal("terminal-1", "wrong-secret"),
    (error) =>
      error instanceof BadRequestException &&
      /not paired to that POS terminal/i.test(error.message),
  );

  const result = await service.getPosTerminal("terminal-1", "secret");

  assert.equal(result.id, "terminal-1");
});

test("SalesService.createPosSession rejects unpaired device access to a terminal", async () => {
  let sessionCreated = false;
  const service = createSalesService(
    {
      posTerminal: {
        findUnique: async () => ({
          id: "terminal-1",
          displayToken: "display-token",
          isActive: true,
          deviceSecretHash: hashSecret("secret"),
        }),
      },
      posSession: {
        create: async () => {
          sessionCreated = true;
        },
      },
    },
    createAuditMock().audit,
  );

  await assert.rejects(
    service.createPosSession({ terminalId: "terminal-1" }, actor),
    (error) =>
      error instanceof BadRequestException &&
      /not paired to that POS terminal/i.test(error.message),
  );
  assert.equal(sessionCreated, false);
});

test("SalesService.updatePosTerminal can rotate the display token", async () => {
  const { audit, records } = createAuditMock();
  const updates: Array<{ data: Record<string, unknown> }> = [];
  const service = createSalesService(
    {
      posTerminal: {
        findUnique: async () => ({ id: "terminal-1" }),
        update: async ({ data }: { data: Record<string, unknown> }) => {
          updates.push({ data });

          return terminalRecord({
            name: "Front counter",
            displayToken: String(data.displayToken ?? "old-token"),
          });
        },
      },
    },
    audit,
  );

  const result = await service.updatePosTerminal(
    "terminal-1",
    { rotateDisplayToken: "true" },
    actor,
  );
  const rotatedToken = updates[0]?.data.displayToken;

  assert.equal(typeof rotatedToken, "string");
  assert.notEqual(rotatedToken, "old-token");
  assert.equal(result.displayToken, rotatedToken);
  assert.equal(records.length, 1);
  assert.deepEqual(
    (records[0] as { metadata: Record<string, unknown> }).metadata,
    {
      name: "Front counter",
      isActive: true,
      offlineEnabled: false,
      displayTokenRotated: true,
    },
  );
});

test("SalesService.syncOfflinePosSales treats repeated client request IDs as duplicates", async () => {
  const attempts: Array<Record<string, unknown>> = [];
  const sale = {
    id: "sale-1",
    saleNumber: 72,
    clientRequestId: "offline:terminal-1:request-1",
    terminalId: "terminal-1",
    customerType: CustomerType.INDIVIDUAL,
    retailerId: null,
    retailerApprovalId: null,
    paymentMethod: PaymentMethod.CASH,
    customerName: null,
    soldAt: new Date("2026-07-13T09:00:00.000Z"),
    subtotal: 6000,
    discount: 0,
    totalAmount: 6000,
    amountPaid: 6000,
    balanceDue: 0,
    notes: "Offline POS checkout.",
    createdAt: new Date("2026-07-13T09:00:01.000Z"),
    createdBy: null,
    terminal: { id: "terminal-1", name: "Front counter" },
    retailer: null,
    retailerApproval: null,
    items: [
      {
        id: "sale-item-1",
        quantity: 2,
        unitPrice: 3000,
        lineTotal: 6000,
        product,
        batchIssues: [],
      },
    ],
  };
  const service = createSalesService(
    {
      posTerminal: {
        findUnique: async ({
          select,
        }: {
          select?: Record<string, unknown>;
        }) =>
          select && "offlineEnabled" in select
            ? { id: "terminal-1", offlineEnabled: true }
            : {
                id: "terminal-1",
                displayToken: "display-token",
                isActive: true,
                deviceSecretHash: hashSecret("secret"),
              },
        update: async () => terminalRecord({ lastSyncedAt: new Date() }),
      },
      sale: {
        findUnique: async () => sale,
      },
      posOfflineSyncAttempt: {
        upsert: async ({ create }: { create: Record<string, unknown> }) => {
          attempts.push(create);
        },
      },
    },
    createAuditMock().audit,
  );

  const result = await service.syncOfflinePosSales(
    {
      terminalId: "terminal-1",
      sales: [
        {
          terminalId: "terminal-1",
          clientRequestId: "offline:terminal-1:request-1",
          customerType: CustomerType.INDIVIDUAL,
          paymentMethod: PaymentMethod.CASH,
          soldAt: "2026-07-13T09:00:00.000Z",
          items: [{ productId: product.id, quantity: "2", unitPrice: "3000" }],
        },
      ],
    },
    actor,
    "secret",
  );

  assert.equal(result.results.length, 1);
  assert.equal(result.results[0]?.status, PosOfflineSyncStatus.DUPLICATE);
  assert.equal(result.results[0]?.sale?.id, "sale-1");
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0]?.status, PosOfflineSyncStatus.DUPLICATE);
  assert.equal(attempts[0]?.saleId, "sale-1");
});

test("SalesService.listPosOfflineSyncAttempts filters reconciliation records", async () => {
  let findManyArgs: Record<string, unknown> | null = null;
  const attemptedAt = new Date("2026-07-13T10:00:00.000Z");
  const service = createSalesService(
    {
      posOfflineSyncAttempt: {
        findMany: async (args: Record<string, unknown>) => {
          findManyArgs = args;

          return [
            {
              id: "attempt-1",
              terminalId: "terminal-1",
              terminal: {
                id: "terminal-1",
                name: "Front counter",
                offlineEnabled: true,
              },
              clientRequestId: "offline:terminal-1:request-1",
              status: PosOfflineSyncStatus.CONFLICT,
              sale: null,
              payload: { clientRequestId: "offline:terminal-1:request-1" },
              errorMessage: "Insufficient allocated stock.",
              conflictCode: "BUSINESS_RULE",
              attemptedAt,
              syncedAt: null,
              createdAt: attemptedAt,
              updatedAt: attemptedAt,
            },
          ];
        },
      },
    },
    createAuditMock().audit,
  );

  const result = await service.listPosOfflineSyncAttempts({
    q: "stock",
    status: PosOfflineSyncStatus.CONFLICT,
    terminalId: "terminal-1",
    from: "2026-07-13",
    to: "2026-07-13",
  });

  assert.equal(result.length, 1);
  assert.equal(result[0]?.id, "attempt-1");
  assert.equal(result[0]?.terminal.name, "Front counter");
  assert.equal(result[0]?.status, PosOfflineSyncStatus.CONFLICT);
  assert.equal(
    (findManyArgs?.where as { status?: unknown }).status,
    PosOfflineSyncStatus.CONFLICT,
  );
  assert.equal(
    (findManyArgs?.where as { terminalId?: unknown }).terminalId,
    "terminal-1",
  );
  assert.ok((findManyArgs?.where as { attemptedAt?: unknown }).attemptedAt);
});

test("SalesService.retryPosOfflineSyncAttempt marks invalid payloads as failed", async () => {
  const attemptedAt = new Date("2026-07-13T10:15:00.000Z");
  let upsertArgs: {
    create?: Record<string, unknown>;
    update?: Record<string, unknown>;
  } | null = null;
  const baseAttempt = {
    id: "attempt-1",
    terminalId: "terminal-1",
    terminal: {
      id: "terminal-1",
      name: "Front counter",
      offlineEnabled: true,
    },
    clientRequestId: "offline:terminal-1:bad-request",
    status: PosOfflineSyncStatus.CONFLICT,
    sale: null,
    payload: { clientRequestId: "offline:terminal-1:bad-request" },
    errorMessage: "Previous sync failed.",
    conflictCode: "BUSINESS_RULE",
    attemptedAt,
    syncedAt: null,
    createdAt: attemptedAt,
    updatedAt: attemptedAt,
  };
  const service = createSalesService(
    {
      posOfflineSyncAttempt: {
        findUnique: async () => baseAttempt,
        findUniqueOrThrow: async () => ({
          ...baseAttempt,
          status: PosOfflineSyncStatus.FAILED,
          errorMessage: "Required",
          conflictCode: "INVALID_PAYLOAD",
          updatedAt: new Date("2026-07-13T10:16:00.000Z"),
        }),
        upsert: async (args: {
          create: Record<string, unknown>;
          update: Record<string, unknown>;
        }) => {
          upsertArgs = args;
        },
      },
    },
    createAuditMock().audit,
  );

  const result = await service.retryPosOfflineSyncAttempt("attempt-1", actor);

  assert.equal(result.status, PosOfflineSyncStatus.FAILED);
  assert.equal(result.conflictCode, "INVALID_PAYLOAD");
  assert.equal(upsertArgs?.update?.status, PosOfflineSyncStatus.FAILED);
  assert.equal(upsertArgs?.update?.conflictCode, "INVALID_PAYLOAD");
});

test("SalesService.retryPosOfflineSyncAttempt rejects mismatched payload identity", async () => {
  const attemptedAt = new Date("2026-07-13T10:30:00.000Z");
  let saleLookupCalled = false;
  let upsertArgs: {
    create?: Record<string, unknown>;
    update?: Record<string, unknown>;
  } | null = null;
  const baseAttempt = {
    id: "attempt-1",
    terminalId: "terminal-1",
    terminal: {
      id: "terminal-1",
      name: "Front counter",
      offlineEnabled: true,
    },
    clientRequestId: "offline:terminal-1:request-1",
    status: PosOfflineSyncStatus.CONFLICT,
    sale: null,
    payload: {
      terminalId: "terminal-2",
      clientRequestId: "offline:terminal-2:request-2",
      customerType: CustomerType.INDIVIDUAL,
      paymentMethod: PaymentMethod.CASH,
      soldAt: "2026-07-13T10:30:00.000Z",
      items: [{ productId: product.id, quantity: "1", unitPrice: "3000" }],
    },
    errorMessage: "Previous sync failed.",
    conflictCode: "BUSINESS_RULE",
    attemptedAt,
    syncedAt: null,
    createdAt: attemptedAt,
    updatedAt: attemptedAt,
  };
  const service = createSalesService(
    {
      sale: {
        findUnique: async () => {
          saleLookupCalled = true;
          return null;
        },
      },
      posOfflineSyncAttempt: {
        findUnique: async () => baseAttempt,
        findUniqueOrThrow: async () => ({
          ...baseAttempt,
          status: PosOfflineSyncStatus.FAILED,
          errorMessage: "Sync payload identity does not match this attempt.",
          conflictCode: "INVALID_PAYLOAD",
          updatedAt: new Date("2026-07-13T10:31:00.000Z"),
        }),
        upsert: async (args: {
          create: Record<string, unknown>;
          update: Record<string, unknown>;
        }) => {
          upsertArgs = args;
        },
      },
    },
    createAuditMock().audit,
  );

  const result = await service.retryPosOfflineSyncAttempt("attempt-1", actor);

  assert.equal(result.status, PosOfflineSyncStatus.FAILED);
  assert.equal(result.conflictCode, "INVALID_PAYLOAD");
  assert.equal(
    upsertArgs?.update?.errorMessage,
    "Sync payload identity does not match this attempt.",
  );
  assert.equal(saleLookupCalled, false);
});
