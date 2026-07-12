import assert from "node:assert/strict";
import { test } from "node:test";

import { ManagementService } from "../src/management/management.service";
import { createAuditMock } from "./helpers";

// One month of activity with easy numbers:
//   revenue 10,000 | COGS 2,000 | opex 2,000 | losses 800
function makePrisma() {
  return {
    sale: {
      findMany: async () => [
        {
          totalAmount: "6000.00",
          subtotal: "6200.00",
          discount: "200.00",
          amountPaid: "6000.00",
          balanceDue: "0.00",
        },
        {
          totalAmount: "4000.00",
          subtotal: "4000.00",
          discount: "0.00",
          amountPaid: "3000.00",
          balanceDue: "1000.00",
        },
      ],
    },
    rawMaterialReceipt: {
      findMany: async () => [{ quantity: "10", unitCost: "150.00" }],
    },
    materialRequestIssue: {
      findMany: async () => [
        { quantity: "5", batch: { unitCost: "200.00" } },
        { quantity: "10", batch: { unitCost: "100.00" } },
      ],
    },
    saleItemBatch: {
      findMany: async () => [
        { quantity: "2", batch: { unitCost: "500.00" } },
        { quantity: "1", batch: { unitCost: "1000.00" } },
      ],
    },
    productionWaste: {
      findMany: async () => [
        { type: "DAMAGED", quantity: "2", product: { unitPrice: "250.00" } },
        {
          type: "RETURNED_TO_PRODUCTION",
          quantity: "3",
          product: { unitPrice: "250.00" },
        },
      ],
    },
    salesProductReturn: {
      findMany: async () => [
        {
          disposition: "DAMAGED",
          quantity: "1",
          product: { unitPrice: "300.00" },
        },
      ],
    },
    expense: {
      findMany: async () => [
        { amount: "1500.00", category: { id: "cat-rent", name: "Rent" } },
        {
          amount: "500.00",
          category: { id: "cat-utilities", name: "Utilities" },
        },
      ],
    },
  };
}

test("profit/loss walks revenue through COGS, expenses, and losses to net profit", async () => {
  const { audit } = createAuditMock();
  const service = new ManagementService(
    makePrisma() as never,
    audit as never,
  );

  const report = await service.profitLoss("2026-07");

  assert.equal(report.revenue.totalRevenue, "10000.00");
  assert.equal(report.revenue.salesCount, 2);
  assert.equal(report.revenue.balanceDue, "1000.00");

  // Materials issued to production remain visible as an operating stock flow.
  assert.equal(report.costs.materialIssuedCost, "2000.00");

  // COGS: 2 x 500 + 1 x 1000 from the finished-good batches sold.
  assert.equal(report.costs.costOfGoodsSold, "2000.00");
  assert.equal(report.profit.estimatedGrossProfit, "8000.00");
  assert.equal(report.profit.grossMarginPercent, "80.00");

  // Operating expenses, largest category first.
  assert.equal(report.expenses.totalOperatingExpenses, "2000.00");
  assert.equal(report.expenses.count, 2);
  assert.deepEqual(
    report.expenses.byCategory.map((entry) => [
      entry.category.name,
      entry.amount,
    ]),
    [
      ["Rent", "1500.00"],
      ["Utilities", "500.00"],
    ],
  );

  // Losses: only DAMAGED waste (2 x 250) and damaged returns (1 x 300);
  // waste returned to production is reused, not a loss.
  assert.equal(report.losses.totalEstimatedLoss, "800.00");
  assert.equal(report.losses.wasteReturnedToProductionQuantity, "3");

  // Net = 8000 - 2000 - 800.
  assert.equal(report.profit.estimatedNetProfit, "5200.00");
  assert.equal(report.profit.netMarginPercent, "52.00");
});

test("profit/loss with no activity reports zeros instead of NaN", async () => {
  const prisma = makePrisma();
  prisma.sale.findMany = async () => [];
  prisma.materialRequestIssue.findMany = async () => [];
  prisma.saleItemBatch.findMany = async () => [];
  prisma.productionWaste.findMany = async () => [];
  prisma.salesProductReturn.findMany = async () => [];
  prisma.expense.findMany = async () => [];

  const { audit } = createAuditMock();
  const service = new ManagementService(prisma as never, audit as never);

  const report = await service.profitLoss("2026-07");

  assert.equal(report.revenue.totalRevenue, "0.00");
  assert.equal(report.profit.estimatedGrossProfit, "0.00");
  assert.equal(report.profit.grossMarginPercent, "0.00");
  assert.equal(report.profit.estimatedNetProfit, "0.00");
  assert.equal(report.profit.netMarginPercent, "0.00");
  assert.equal(report.expenses.totalOperatingExpenses, "0.00");
});
