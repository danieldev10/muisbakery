import assert from "node:assert/strict";
import { test } from "node:test";

import { BadRequestException } from "@nestjs/common";
import {
  CustomerType,
  FinishedProductStockMovementType,
  PaymentMethod,
  PosSessionStatus,
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

function createSalesService(prisma: unknown, audit: unknown) {
  return new SalesService(prisma as never, audit as never, {} as never);
}

test("SalesService.recordReturn rejects customer returns above the returnable quantity", async () => {
  const { audit, records } = createAuditMock();
  const tx = {
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
    product: {
      findUnique: async () => product,
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

test("SalesService.createSale records retailer sales against available credit", async () => {
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
  const { audit, records } = createAuditMock();
  const tx = {
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
      paymentMethod: PaymentMethod.CREDIT,
      soldAt: soldAt.toISOString(),
      items: [{ productId: product.id, quantity: "2", unitPrice: "3000" }],
    },
    actor,
  );

  assert.equal(saleCreateData?.customerType, CustomerType.RETAILER);
  assert.equal(saleCreateData?.retailerId, retailer.id);
  assert.equal(saleCreateData?.customerName, retailer.name);
  assert.equal(saleCreateData?.paymentMethod, PaymentMethod.CREDIT);
  assert.equal(saleCreateData?.amountPaid, 0);
  assert.equal(saleCreateData?.balanceDue, 6000);
  assert.equal(result.customerType, CustomerType.RETAILER);
  assert.equal(result.retailer?.name, retailer.name);
  assert.equal(result.balanceDue, "6000");
  assert.equal(records.length, 1);
});

test("SalesService.createSale rejects retailer sales above available credit", async () => {
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
              creditLimit: "500000.00",
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
    /credit limit exceeded/i,
  );
  assert.equal(saleCreated, false);
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
