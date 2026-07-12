import assert from "node:assert/strict";
import { test } from "node:test";

import { BadRequestException } from "@nestjs/common";
import {
  MaterialRequestStatus,
  ProductionMaterialStockMovementType,
  RawMaterialStockMovementType,
} from "@prisma/client";

import { StoreService } from "../src/store/store.service";
import { actor, createAuditMock } from "./helpers";

test("StoreService.receive rejects decimal quantities before opening a transaction", async () => {
  let transactionCalled = false;
  const { audit } = createAuditMock();
  const service = new StoreService(
    {
      $transaction: async () => {
        transactionCalled = true;
      },
    } as never,
    audit as never,
  );

  await assert.rejects(
    service.receive({ rawMaterialId: "raw-1", quantity: "1.5" }, actor),
    (error) =>
      error instanceof BadRequestException &&
      /whole number/i.test(error.message),
  );
  assert.equal(transactionCalled, false);
});

test("StoreService.receive requires Management to set unit cost first", async () => {
  const { audit } = createAuditMock();
  const tx = {
    rawMaterial: {
      findUnique: async () => ({
        id: "raw-1",
        name: "Flour",
        isActive: true,
        unitCost: null,
      }),
    },
  };
  const service = new StoreService(
    {
      $transaction: async (callback: (transaction: typeof tx) => unknown) =>
        callback(tx),
    } as never,
    audit as never,
  );

  await assert.rejects(
    service.receive({ rawMaterialId: "raw-1", quantity: "5" }, actor),
    (error) =>
      error instanceof BadRequestException &&
      /unit cost before Store can receive/i.test(error.message),
  );
});

test("StoreService.receive records stock with the Management unit cost and hides cost in the response", async () => {
  const now = new Date("2026-07-10T08:00:00.000Z");
  const rawMaterial = {
    id: "raw-1",
    name: "Flour",
    baseUnit: { id: "unit-1", name: "Kilogram", abbreviation: "kg" },
  };
  const supplier = { id: "supplier-1", name: "Main Supplier" };
  const user = { id: actor.id, name: actor.name, email: actor.email };
  const batchDate = new Date(Date.UTC(2026, 6, 10));
  const batch = {
    id: "batch-1",
    rawMaterialId: rawMaterial.id,
    batchNumber: 1,
    batchDate,
    quantityReceived: 25,
    quantityRemaining: 25,
    receivedAt: now,
    reference: "INV-001",
    notes: null,
    rawMaterial,
    supplier,
    createdBy: user,
  };

  let batchCreateData: Record<string, unknown> | null = null;
  let receiptCreateData: Record<string, unknown> | null = null;
  let stockMovementData: Record<string, unknown> | null = null;
  const { audit, records } = createAuditMock();
  const tx = {
    rawMaterial: {
      findUnique: async () => ({
        id: rawMaterial.id,
        name: rawMaterial.name,
        isActive: true,
        unitCost: "130.00",
      }),
    },
    supplier: {
      findUnique: async () => ({ id: supplier.id, isActive: true }),
    },
    $queryRaw: async () => [],
    rawMaterialBatch: {
      findUnique: async () => null,
      findFirst: async () => null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        batchCreateData = data;
        return batch;
      },
    },
    rawMaterialReceipt: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        receiptCreateData = data;
        return {
          id: "receipt-1",
          rawMaterialId: rawMaterial.id,
          batchId: batch.id,
          supplierId: supplier.id,
          quantity: data.quantity,
          unitCost: data.unitCost,
          receivedAt: now,
          reference: data.reference,
          notes: data.notes ?? null,
          createdAt: now,
          rawMaterial,
          supplier,
          createdBy: user,
          batch,
        };
      },
    },
    rawMaterialStockMovement: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        stockMovementData = data;
      },
    },
  };
  const service = new StoreService(
    {
      $transaction: async (callback: (transaction: typeof tx) => unknown) =>
        callback(tx),
    } as never,
    audit as never,
  );

  const result = await service.receive(
    {
      rawMaterialId: rawMaterial.id,
      supplierId: supplier.id,
      quantity: "25",
      receivedAt: now.toISOString(),
      reference: "INV-001",
    },
    actor,
  );

  assert.equal(batchCreateData?.unitCost, "130.00");
  assert.equal(receiptCreateData?.unitCost, "130.00");
  assert.equal(stockMovementData?.type, RawMaterialStockMovementType.RECEIVE);
  assert.equal(stockMovementData?.quantity, 25);
  assert.equal("unitCost" in result, false);
  assert.equal("unitCost" in result.batch, false);
  assert.equal(records.length, 1);
});

test("StoreService.issueMaterialRequest issues stock FIFO across raw material batches", async () => {
  const now = new Date("2026-07-10T09:00:00.000Z");
  const rawMaterial = {
    id: "raw-1",
    name: "Flour",
    baseUnit: { id: "unit-1", name: "Kilogram", abbreviation: "kg" },
  };
  const requester = {
    id: "requester-1",
    name: "Production User",
    email: "production@muisbakery.local",
  };
  const issuer = { id: actor.id, name: actor.name, email: actor.email };
  const request = {
    id: "request-1",
    rawMaterialId: rawMaterial.id,
    requestedQuantity: 10,
    issuedQuantity: 0,
    status: MaterialRequestStatus.PENDING,
    neededBy: null,
    notes: null,
    responseNotes: null,
    fulfilledAt: null,
    createdAt: now,
    updatedAt: now,
    rawMaterial,
    productionRequest: null,
    productionRequestId: null,
    requestedBy: requester,
    issuedBy: null,
    issues: [],
  };
  const batches = [
    {
      id: "batch-old",
      rawMaterialId: rawMaterial.id,
      quantityRemaining: 6,
      receivedAt: new Date("2026-07-08T09:00:00.000Z"),
      batchNumber: 1,
    },
    {
      id: "batch-new",
      rawMaterialId: rawMaterial.id,
      quantityRemaining: 10,
      receivedAt: new Date("2026-07-09T09:00:00.000Z"),
      batchNumber: 2,
    },
  ];
  const batchUpdates: Array<{ id: string; quantityRemaining: unknown }> = [];
  const storeMovements: Record<string, unknown>[] = [];
  const productionMovements: Record<string, unknown>[] = [];
  let requestUpdateData: Record<string, unknown> | null = null;
  let queryCount = 0;
  const { audit } = createAuditMock();
  const tx = {
    $queryRaw: async () => {
      queryCount += 1;
      return queryCount === 2
        ? batches.map((batch) => ({ id: batch.id }))
        : [];
    },
    materialRequest: {
      findUnique: async () => request,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        requestUpdateData = data;
        return {
          ...request,
          ...data,
          issuedBy: issuer,
          updatedAt: now,
          issues: [],
        };
      },
    },
    rawMaterialBatch: {
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
    rawMaterialStockMovement: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        storeMovements.push(data);
      },
    },
    materialRequestIssue: {
      create: async ({ data }: { data: Record<string, unknown> }) => ({
        id: `issue-${data.batchId}`,
        createdAt: now,
      }),
    },
    productionMaterialStockBatch: {
      create: async ({ data }: { data: Record<string, unknown> }) => ({
        id: `production-${data.storeBatchId}`,
      }),
    },
    productionMaterialStockMovement: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        productionMovements.push(data);
      },
    },
  };
  const service = new StoreService(
    {
      $transaction: async (callback: (transaction: typeof tx) => unknown) =>
        callback(tx),
    } as never,
    audit as never,
  );

  const result = await service.issueMaterialRequest(
    request.id,
    { quantity: "8", notes: "Issue for morning production" },
    actor,
  );

  assert.deepEqual(batchUpdates, [
    { id: "batch-old", quantityRemaining: 0 },
    { id: "batch-new", quantityRemaining: 8 },
  ]);
  assert.deepEqual(
    storeMovements.map((entry) => ({
      batchId: entry.batchId,
      type: entry.type,
      quantity: entry.quantity,
    })),
    [
      {
        batchId: "batch-old",
        type: RawMaterialStockMovementType.ISSUE,
        quantity: 6,
      },
      {
        batchId: "batch-new",
        type: RawMaterialStockMovementType.ISSUE,
        quantity: 2,
      },
    ],
  );
  assert.deepEqual(
    productionMovements.map((entry) => ({
      type: entry.type,
      quantity: entry.quantity,
    })),
    [
      { type: ProductionMaterialStockMovementType.RECEIVE_FROM_STORE, quantity: 6 },
      { type: ProductionMaterialStockMovementType.RECEIVE_FROM_STORE, quantity: 2 },
    ],
  );
  assert.equal(requestUpdateData?.issuedQuantity, 8);
  assert.equal(requestUpdateData?.status, MaterialRequestStatus.PARTIALLY_ISSUED);
  assert.equal(result.status, MaterialRequestStatus.PARTIALLY_ISSUED);
  assert.equal(result.issuedQuantity, "8");
});

test("StoreService.rejectMaterialRequest rejects the remaining quantity on partially issued requests", async () => {
  const now = new Date("2026-07-10T10:30:00.000Z");
  const rawMaterial = {
    id: "raw-1",
    name: "Flour",
    baseUnit: { id: "unit-1", name: "Kilogram", abbreviation: "kg" },
  };
  const requester = {
    id: "requester-1",
    name: "Production User",
    email: "production@muisbakery.local",
  };
  const issuer = { id: actor.id, name: actor.name, email: actor.email };
  const request = {
    id: "request-1",
    rawMaterialId: rawMaterial.id,
    requestedQuantity: 10,
    issuedQuantity: 4,
    status: MaterialRequestStatus.PARTIALLY_ISSUED,
    neededBy: null,
    notes: null,
    responseNotes: null,
    fulfilledAt: null,
    createdAt: now,
    updatedAt: now,
    rawMaterial,
    requestedBy: requester,
    issuedBy: issuer,
    issues: [],
  };
  let updateManyArgs: {
    where?: { status?: { in?: MaterialRequestStatus[] } };
    data?: Record<string, unknown>;
  } | null = null;
  const { audit, records } = createAuditMock();
  const prisma = {
      materialRequest: {
        findUnique: async () => ({
          id: request.id,
          status: request.status,
        }),
        updateMany: async (args: {
          where: { status: { in: MaterialRequestStatus[] } };
          data: Record<string, unknown>;
        }) => {
          updateManyArgs = args;
          return { count: 1 };
        },
        findUniqueOrThrow: async () => ({
          ...request,
          status: MaterialRequestStatus.REJECTED,
          responseNotes: "Not needed again this week",
        }),
      },
    $transaction: async (callback: (transaction: unknown) => unknown) =>
      callback(prisma),
  };
  const service = new StoreService(
    prisma as never,
    audit as never,
  );

  const result = await service.rejectMaterialRequest(
    request.id,
    { notes: "Not needed again this week" },
    actor,
  );

  assert.equal(result.status, MaterialRequestStatus.REJECTED);
  assert.equal(result.issuedQuantity, "4");
  assert.equal(result.remainingQuantity, "6.000");
  assert.deepEqual(updateManyArgs?.where?.status?.in, [
    MaterialRequestStatus.PENDING,
    MaterialRequestStatus.PARTIALLY_ISSUED,
  ]);
  assert.equal(updateManyArgs?.data?.status, MaterialRequestStatus.REJECTED);
  assert.equal(records.length, 1);
});
