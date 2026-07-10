import assert from "node:assert/strict";
import { test } from "node:test";

import { BadRequestException } from "@nestjs/common";
import {
  FinishedProductStockMovementType,
  ProductionMaterialStockMovementType,
  ProductionWasteType,
} from "@prisma/client";

import { ProductionService } from "../src/production/production.service";
import { actor, createAuditMock } from "./helpers";

const unit = { id: "unit-1", name: "Kilogram", abbreviation: "kg" };
const productUnit = { id: "unit-2", name: "Loaf", abbreviation: "loaf" };
const flour = {
  id: "raw-flour",
  name: "Flour",
  baseUnit: unit,
};
const sugar = {
  id: "raw-sugar",
  name: "Sugar",
  baseUnit: unit,
};
const bread = {
  id: "product-bread",
  name: "Full Loaf Bread",
  size: "",
  isActive: true,
  unit: productUnit,
  recipe: {
    id: "recipe-1",
    isActive: true,
    yieldQuantity: 10,
    items: [
      {
        id: "recipe-item-flour",
        rawMaterialId: flour.id,
        quantity: 5,
        rawMaterial: flour,
        unit,
      },
      {
        id: "recipe-item-sugar",
        rawMaterialId: sugar.id,
        quantity: 2,
        rawMaterial: sugar,
        unit,
      },
    ],
  },
};

test("ProductionService.createRun rejects invalid output counts before opening a transaction", async () => {
  let transactionCalled = false;
  const { audit } = createAuditMock();
  const service = new ProductionService(
    {
      $transaction: async () => {
        transactionCalled = true;
      },
    } as never,
    audit as never,
  );

  await assert.rejects(
    service.createRun(
      {
        productId: bread.id,
        quantityProduced: "10",
        quantityTransferred: "11",
      },
      actor,
    ),
    (error) =>
      error instanceof BadRequestException &&
      /cannot exceed quantity produced/i.test(error.message),
  );
  assert.equal(transactionCalled, false);
});

test("ProductionService.createRun consumes production materials FIFO and transfers finished goods to Sales", async () => {
  const producedAt = new Date("2026-07-10T11:00:00.000Z");
  const createdAt = new Date("2026-07-10T11:01:00.000Z");
  const productionBatches = {
    [flour.id]: [
      {
        id: "flour-old",
        rawMaterialId: flour.id,
        quantityRemaining: 4,
        receivedAt: new Date("2026-07-08T07:00:00.000Z"),
        createdAt: new Date("2026-07-08T07:00:00.000Z"),
      },
      {
        id: "flour-new",
        rawMaterialId: flour.id,
        quantityRemaining: 3,
        receivedAt: new Date("2026-07-09T07:00:00.000Z"),
        createdAt: new Date("2026-07-09T07:00:00.000Z"),
      },
    ],
    [sugar.id]: [
      {
        id: "sugar-old",
        rawMaterialId: sugar.id,
        quantityRemaining: 3,
        receivedAt: new Date("2026-07-08T08:00:00.000Z"),
        createdAt: new Date("2026-07-08T08:00:00.000Z"),
      },
    ],
  };
  let createdRunData: Record<string, unknown> | null = null;
  const materialUsageWrites: Record<string, unknown>[] = [];
  const productionBatchUpdates: Array<{
    id: string;
    quantityRemaining: unknown;
  }> = [];
  const productionMovements: Record<string, unknown>[] = [];
  const wasteWrites: Record<string, unknown>[] = [];
  const salesBatchWrites: Record<string, unknown>[] = [];
  const salesMovements: Record<string, unknown>[] = [];
  let queryCall = 0;
  const { audit, records } = createAuditMock();
  const tx = {
    product: {
      findUnique: async () => bread,
    },
    productionRun: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        createdRunData = data;
        return {
          id: "run-1",
          productId: bread.id,
          quantityProduced: data.quantityProduced,
          expectedQuantity: data.expectedQuantity,
          quantityTransferred: data.quantityTransferred,
          wasteQuantity: data.wasteQuantity,
          producedAt: data.producedAt,
          notes: data.notes ?? null,
          createdAt,
          createdById: actor.id,
        };
      },
      findUniqueOrThrow: async () => ({
        id: "run-1",
        productId: bread.id,
        quantityProduced: createdRunData?.quantityProduced,
        expectedQuantity: createdRunData?.expectedQuantity,
        quantityTransferred: createdRunData?.quantityTransferred,
        wasteQuantity: createdRunData?.wasteQuantity,
        producedAt,
        notes: createdRunData?.notes ?? null,
        createdAt,
        product: bread,
        createdBy: {
          id: actor.id,
          name: actor.name,
          email: actor.email,
        },
        materialUsages: materialUsageWrites.map((usage, index) => ({
          id: `usage-${index + 1}`,
          expectedQuantity: usage.expectedQuantity,
          actualQuantity: usage.actualQuantity,
          rawMaterial: usage.rawMaterialId === flour.id ? flour : sugar,
          createdAt,
        })),
        waste: wasteWrites.map((waste, index) => ({
          id: `waste-${index + 1}`,
          type: waste.type,
          quantity: waste.quantity,
          reason: waste.reason,
          recordedAt: waste.recordedAt,
          product: bread,
          createdBy: {
            id: actor.id,
            name: actor.name,
            email: actor.email,
          },
        })),
        salesBatches: salesBatchWrites.map((batch, index) => ({
          id: `sales-batch-${index + 1}`,
          batchNumber: batch.batchNumber,
          batchDate: batch.batchDate,
          quantityReceived: batch.quantityReceived,
          quantityRemaining: batch.quantityRemaining,
          receivedAt: batch.receivedAt,
          product: bread,
        })),
      }),
    },
    rawMaterial: {
      findMany: async () => [flour, sugar],
    },
    $queryRaw: async () => {
      queryCall += 1;

      if (queryCall === 1) {
        return productionBatches[flour.id].map((batch) => ({ id: batch.id }));
      }

      if (queryCall === 2) {
        return productionBatches[sugar.id].map((batch) => ({ id: batch.id }));
      }

      return [];
    },
    productionMaterialStockBatch: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) => {
        const allBatches = [
          ...productionBatches[flour.id],
          ...productionBatches[sugar.id],
        ];
        return allBatches.filter((batch) => where.id.in.includes(batch.id));
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { quantityRemaining: unknown };
      }) => {
        productionBatchUpdates.push({
          id: where.id,
          quantityRemaining: data.quantityRemaining,
        });
      },
    },
    productionRunMaterialUsage: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        materialUsageWrites.push(data);
      },
    },
    productionMaterialStockMovement: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        productionMovements.push(data);
      },
    },
    productionWaste: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        wasteWrites.push(data);
      },
    },
    salesProductBatch: {
      findFirst: async () => ({ batchNumber: 3 }),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        salesBatchWrites.push(data);
        return { id: "sales-batch-4", ...data };
      },
    },
    salesProductStockMovement: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        salesMovements.push(data);
      },
    },
  };
  const service = new ProductionService(
    {
      $transaction: async (callback: (transaction: typeof tx) => unknown) =>
        callback(tx),
    } as never,
    audit as never,
  );

  const result = await service.createRun(
    {
      productId: bread.id,
      quantityProduced: "10",
      quantityTransferred: "8",
      wasteQuantity: "2",
      wasteType: ProductionWasteType.DAMAGED,
      wasteReason: "Burnt loaves",
      producedAt: producedAt.toISOString(),
      notes: "Morning batch",
    },
    actor,
  );

  assert.equal(createdRunData?.expectedQuantity, 10);
  assert.deepEqual(
    materialUsageWrites.map((usage) => ({
      rawMaterialId: usage.rawMaterialId,
      expectedQuantity: usage.expectedQuantity,
      actualQuantity: usage.actualQuantity,
    })),
    [
      { rawMaterialId: flour.id, expectedQuantity: 5, actualQuantity: 5 },
      { rawMaterialId: sugar.id, expectedQuantity: 2, actualQuantity: 2 },
    ],
  );
  assert.deepEqual(productionBatchUpdates, [
    { id: "flour-old", quantityRemaining: 0 },
    { id: "flour-new", quantityRemaining: 2 },
    { id: "sugar-old", quantityRemaining: 1 },
  ]);
  assert.deepEqual(
    productionMovements.map((entry) => ({
      batchId: entry.productionBatchId,
      type: entry.type,
      quantity: entry.quantity,
    })),
    [
      {
        batchId: "flour-old",
        type: ProductionMaterialStockMovementType.CONSUME,
        quantity: 4,
      },
      {
        batchId: "flour-new",
        type: ProductionMaterialStockMovementType.CONSUME,
        quantity: 1,
      },
      {
        batchId: "sugar-old",
        type: ProductionMaterialStockMovementType.CONSUME,
        quantity: 2,
      },
    ],
  );
  assert.equal(wasteWrites[0]?.quantity, 2);
  assert.equal(salesBatchWrites[0]?.batchNumber, 4);
  assert.equal(salesBatchWrites[0]?.quantityReceived, 8);
  assert.equal(salesMovements[0]?.type, FinishedProductStockMovementType.RECEIVE_FROM_PRODUCTION);
  assert.equal(salesMovements[0]?.quantity, 8);
  assert.equal(records.length, 1);
  assert.equal(result.quantityProduced, "10");
  assert.equal(result.expectedQuantity, "10");
  assert.equal(result.quantityTransferred, "8");
  assert.equal(result.wasteQuantity, "2");
});
