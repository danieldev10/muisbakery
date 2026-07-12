import assert from "node:assert/strict";
import { test } from "node:test";

import { BadRequestException } from "@nestjs/common";
import {
  PaymentMethod,
  ProductionWasteType,
  SalesReturnDisposition,
} from "@prisma/client";

import { ManagementService } from "../src/management/management.service";
import { actor, createAuditMock } from "./helpers";

const unit = { id: "unit-1", name: "Loaf", abbreviation: "loaf" };
const product = {
  id: "product-1",
  name: "Full Loaf Bread",
  size: "",
  unitPrice: 1500,
  unit,
};
const rawMaterial = {
  id: "raw-1",
  name: "Flour",
  unitCost: 120,
  baseUnit: { id: "unit-2", name: "Kilogram", abbreviation: "kg" },
};

test("ManagementService.profitLoss calculates revenue, material costs, and recorded losses for a month", async () => {
  const service = new ManagementService(
    {
      sale: {
        findMany: async () => [
          {
            id: "sale-1",
            saleNumber: 1,
            paymentMethod: PaymentMethod.CASH,
            customerName: null,
            soldAt: new Date("2026-07-10T09:00:00.000Z"),
            subtotal: 11000,
            discount: 1000,
            totalAmount: 10000,
            amountPaid: 10000,
            balanceDue: 0,
            notes: null,
            createdAt: new Date("2026-07-10T09:00:00.000Z"),
            createdBy: null,
            items: [],
          },
          {
            id: "sale-2",
            saleNumber: 2,
            paymentMethod: PaymentMethod.CREDIT,
            customerName: "Amina Stores",
            soldAt: new Date("2026-07-10T10:00:00.000Z"),
            subtotal: 5000,
            discount: 0,
            totalAmount: 5000,
            amountPaid: 2000,
            balanceDue: 3000,
            notes: null,
            createdAt: new Date("2026-07-10T10:00:00.000Z"),
            createdBy: null,
            items: [],
          },
        ],
      },
      rawMaterialReceipt: {
        findMany: async () => [
          { quantity: 10, unitCost: 100 },
          { quantity: 5, unitCost: 200 },
        ],
      },
      materialRequestIssue: {
        findMany: async () => [
          { quantity: 4, batch: { unitCost: 100 } },
          { quantity: 2, batch: { unitCost: 200 } },
        ],
      },
      saleItemBatch: {
        findMany: async () => [
          { quantity: 4, batch: { unitCost: 100 } },
          { quantity: 2, batch: { unitCost: 200 } },
        ],
      },
      productionWaste: {
        findMany: async () => [
          {
            type: ProductionWasteType.DAMAGED,
            quantity: 3,
            product,
          },
          {
            type: ProductionWasteType.RETURNED_TO_PRODUCTION,
            quantity: 2,
            product,
          },
        ],
      },
      salesProductReturn: {
        findMany: async () => [
          {
            disposition: SalesReturnDisposition.DAMAGED,
            quantity: 1,
            product,
          },
          {
            disposition: SalesReturnDisposition.RETURN_TO_STOCK,
            quantity: 1,
            product,
          },
        ],
      },
      expense: {
        findMany: async () => [
          { amount: 1200, category: { id: "cat-rent", name: "Rent" } },
        ],
      },
    } as never,
    createAuditMock().audit as never,
  );

  const result = await service.profitLoss("2026-07");

  assert.equal(result.month.value, "2026-07");
  assert.equal(result.revenue.salesCount, 2);
  assert.equal(result.revenue.subtotal, "16000.00");
  assert.equal(result.revenue.discount, "1000.00");
  assert.equal(result.revenue.totalRevenue, "15000.00");
  assert.equal(result.revenue.amountPaid, "12000.00");
  assert.equal(result.revenue.balanceDue, "3000.00");
  assert.equal(result.costs.materialPurchasedCost, "2000.00");
  assert.equal(result.costs.materialIssuedCost, "800.00");
  assert.equal(result.costs.costOfGoodsSold, "800.00");
  assert.equal(result.losses.productionWasteQuantity, "3");
  assert.equal(result.losses.productionWasteEstimatedValue, "4500.00");
  assert.equal(result.losses.wasteReturnedToProductionQuantity, "2");
  assert.equal(result.losses.damagedReturnsQuantity, "1");
  assert.equal(result.losses.damagedReturnsEstimatedValue, "1500.00");
  assert.equal(result.losses.totalEstimatedLoss, "6000.00");
  assert.equal(result.expenses.totalOperatingExpenses, "1200.00");
  assert.equal(result.expenses.count, 1);
  assert.equal(result.profit.estimatedGrossProfit, "14200.00");
  assert.equal(result.profit.estimatedNetProfit, "7000.00");
  assert.equal(result.profit.grossMarginPercent, "94.67");
  assert.equal(result.profit.netMarginPercent, "46.67");
});

test("ManagementService.profitLoss rejects invalid month filters", async () => {
  const service = new ManagementService(
    {} as never,
    createAuditMock().audit as never,
  );

  await assert.rejects(
    service.profitLoss("2026-13"),
    (error) =>
      error instanceof BadRequestException &&
      /valid month number/i.test(error.message),
  );
});

test("ManagementService.updateRawMaterialUnitCost updates management-owned costs and records audit metadata", async () => {
  const { audit, records } = createAuditMock();
  const service = new ManagementService(
    {
      rawMaterial: {
        findUnique: async () => ({
          id: rawMaterial.id,
          name: rawMaterial.name,
          unitCost: 100,
        }),
        update: async ({ data }: { data: { unitCost: number } }) => ({
          ...rawMaterial,
          unitCost: data.unitCost,
        }),
      },
    } as never,
    audit as never,
  );

  const result = await service.updateRawMaterialUnitCost(
    rawMaterial.id,
    { unitCost: "125.50" },
    actor,
  );

  assert.equal(result.unitCost, "125.5");
  assert.deepEqual(records, [
    {
      actorId: actor.id,
      action: "MANAGEMENT_RAW_MATERIAL_UNIT_COST_UPDATED",
      entityType: "RawMaterial",
      entityId: rawMaterial.id,
      metadata: {
        rawMaterialName: rawMaterial.name,
        previousUnitCost: "100",
        unitCost: "125.5",
      },
    },
  ]);
});
