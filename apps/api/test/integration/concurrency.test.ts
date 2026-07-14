import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

import {
  BusinessDayStatus,
  CustomerType,
  DayCloseStatus,
  PaymentMethod,
  PosOfflineSyncStatus,
  PosTerminalStockMovementType,
  RetailerOrderApprovalStatus,
  Role,
  SalesReturnDisposition,
  type User,
} from "@prisma/client";

import { AuditService } from "../../src/audit/audit.service";
import type { AuthenticatedUser } from "../../src/auth/auth.types";
import { PrismaService } from "../../src/database/prisma.service";
import { DayCloseService } from "../../src/sales/day-close.service";
import { PosDisplayEvents } from "../../src/sales/pos-display-events";
import { SalesService } from "../../src/sales/sales.service";
import { holdRowLock, resetApplicationData } from "./support/database";

let prisma: PrismaService;
let sales: SalesService;
let dayClose: DayCloseService;
let sequence = 0;

function actor(user: User): AuthenticatedUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };
}

async function actors() {
  const suffix = ++sequence;
  const [admin, salesUser, secondSalesUser, management, secondManagement] =
    await Promise.all([
      prisma.user.create({
        data: {
          name: "Admin One",
          email: `admin-${suffix}@phase8.test`,
          passwordHash: "test-only",
          role: Role.ADMIN,
        },
      }),
      prisma.user.create({
        data: {
          name: "Sales One",
          email: `sales-a-${suffix}@phase8.test`,
          passwordHash: "test-only",
          role: Role.SALES,
        },
      }),
      prisma.user.create({
        data: {
          name: "Sales Two",
          email: `sales-b-${suffix}@phase8.test`,
          passwordHash: "test-only",
          role: Role.SALES,
        },
      }),
      prisma.user.create({
        data: {
          name: "Management One",
          email: `management-a-${suffix}@phase8.test`,
          passwordHash: "test-only",
          role: Role.MANAGEMENT,
        },
      }),
      prisma.user.create({
        data: {
          name: "Management Two",
          email: `management-b-${suffix}@phase8.test`,
          passwordHash: "test-only",
          role: Role.MANAGEMENT,
        },
      }),
    ]);

  return {
    admin: actor(admin),
    sales: actor(salesUser),
    secondSales: actor(secondSalesUser),
    management: actor(management),
    secondManagement: actor(secondManagement),
  };
}

async function productWithStock(quantity: number) {
  const suffix = ++sequence;
  const unit = await prisma.unit.create({
    data: {
      name: `Loaf ${suffix}`,
      abbreviation: `lf${suffix}`,
    },
  });
  const product = await prisma.product.create({
    data: {
      name: `Phase 8 Bread ${suffix}`,
      size: "700g",
      unitId: unit.id,
      unitPrice: "100.00",
    },
  });
  const batch = await prisma.salesProductBatch.create({
    data: {
      productId: product.id,
      batchNumber: 1,
      batchDate: new Date("2035-01-01T00:00:00.000Z"),
      quantityReceived: quantity,
      quantityRemaining: quantity,
      unitCost: "60.00",
      totalCost: (quantity * 60).toFixed(2),
      receivedAt: new Date("2035-01-01T06:00:00.000Z"),
    },
  });

  return { product, batch };
}

async function createTerminal(
  admin: AuthenticatedUser,
  salesActor: AuthenticatedUser,
  options: { offlineEnabled?: boolean; pair?: boolean } = {},
) {
  const pairingCode = "123456";
  const created = await sales.createPosTerminal(
    {
      name: `Phase 8 Terminal ${++sequence}`,
      pairingCode,
      offlineEnabled: options.offlineEnabled ?? false,
    },
    admin,
  );

  if (!options.pair) {
    return { id: created.id, deviceSecret: null };
  }

  const paired = await sales.pairPosTerminal(
    { terminalId: created.id, pairingCode },
    salesActor,
  );
  return { id: created.id, deviceSecret: paired.deviceSecret };
}

async function individualSale(input: {
  productId: string;
  quantity?: number;
  terminalId?: string;
  soldAt?: Date;
  clientRequestId?: string;
}, salesActor: AuthenticatedUser) {
  return sales.createSale(
    {
      customerType: CustomerType.INDIVIDUAL,
      paymentMethod: PaymentMethod.CASH,
      terminalId: input.terminalId,
      clientRequestId: input.clientRequestId,
      soldAt: input.soldAt,
      amountPaid: (input.quantity ?? 1) * 100,
      items: [
        {
          productId: input.productId,
          quantity: input.quantity ?? 1,
          unitPrice: 100,
        },
      ],
    },
    salesActor,
  );
}

function resultCounts(results: PromiseSettledResult<unknown>[]) {
  return {
    fulfilled: results.filter((result) => result.status === "fulfilled").length,
    rejected: results.filter((result) => result.status === "rejected").length,
  };
}

before(async () => {
  prisma = new PrismaService();
  await prisma.$connect();
  const audit = new AuditService(prisma);
  sales = new SalesService(prisma, audit, new PosDisplayEvents());
  dayClose = new DayCloseService(prisma, audit);
});

beforeEach(async () => {
  await resetApplicationData(prisma);
});

after(async () => {
  await prisma.$disconnect();
});

test("two browsers consume a one-time pairing code exactly once", async () => {
  const users = await actors();
  const pairingCode = "654321";
  const terminal = await sales.createPosTerminal(
    { name: "Pairing Race", pairingCode, offlineEnabled: true },
    users.admin,
  );
  const lock = await holdRowLock("PosTerminal", terminal.id);

  try {
    const settledPromise = Promise.allSettled([
      sales.pairPosTerminal(
        { terminalId: terminal.id, pairingCode },
        users.sales,
      ),
      sales.pairPosTerminal(
        { terminalId: terminal.id, pairingCode },
        users.secondSales,
      ),
    ]);
    await lock.waitForBlockedTransactions(2);
    await lock.release();
    const settled = await settledPromise;

    assert.deepEqual(resultCounts(settled), { fulfilled: 1, rejected: 1 });
    const stored = await prisma.posTerminal.findUniqueOrThrow({
      where: { id: terminal.id },
    });
    assert.equal(stored.pairingCodeHash, null);
    assert.ok(stored.deviceSecretHash);
    assert.ok(stored.pairedAt);
    assert.equal(
      await prisma.auditLog.count({
        where: {
          action: "SALES_POS_TERMINAL_PAIRED",
          entityId: terminal.id,
        },
      }),
      1,
    );
  } finally {
    await lock.rollback();
  }
});

test("seven concurrent terminal allocations never exceed physical stock", async () => {
  const users = await actors();
  const { product, batch } = await productWithStock(100);
  const terminals = await Promise.all(
    Array.from({ length: 7 }, () => createTerminal(users.admin, users.sales)),
  );
  const lock = await holdRowLock("Product", product.id);

  try {
    const settledPromise = Promise.allSettled(
      terminals.map((terminal) =>
        sales.setPosTerminalStockAllocation(
          terminal.id,
          { productId: product.id, allocatedQuantity: 100 },
          users.admin,
        ),
      ),
    );
    await lock.waitForBlockedTransactions(7);
    await lock.release();
    const settled = await settledPromise;

    assert.deepEqual(resultCounts(settled), { fulfilled: 1, rejected: 6 });
    const [allocations, custody, central] = await Promise.all([
      prisma.posTerminalStockAllocation.findMany({
        where: { productId: product.id },
      }),
      prisma.posTerminalStockBatch.aggregate({
        where: { productId: product.id },
        _sum: { quantityRemaining: true },
      }),
      prisma.salesProductBatch.findUniqueOrThrow({ where: { id: batch.id } }),
    ]);
    const unsoldAllocated = allocations.reduce(
      (sum, allocation) =>
        sum + allocation.allocatedQuantity - allocation.soldQuantity,
      0,
    );
    assert.equal(unsoldAllocated, 100);
    assert.equal(custody._sum.quantityRemaining, 100);
    assert.equal(central.quantityRemaining, 0);
  } finally {
    await lock.rollback();
  }
});

test("concurrent release, adjustment, and sale preserve terminal custody balance", async () => {
  const users = await actors();
  const { product } = await productWithStock(100);
  const terminal = await createTerminal(users.admin, users.sales, {
    offlineEnabled: true,
  });
  await sales.setPosTerminalStockAllocation(
    terminal.id,
    { productId: product.id, allocatedQuantity: 60 },
    users.admin,
  );
  const custodyBatch = await prisma.posTerminalStockBatch.findFirstOrThrow({
    where: { terminalId: terminal.id, productId: product.id },
  });
  const lock = await holdRowLock("Product", product.id);

  try {
    const settledPromise = Promise.allSettled([
      sales.setPosTerminalStockAllocation(
        terminal.id,
        { productId: product.id, allocatedQuantity: 40 },
        users.admin,
      ),
      sales.adjustPosTerminalStock(
        terminal.id,
        {
          terminalBatchId: custodyBatch.id,
          countedQuantity: 50,
          reason: "Concurrent physical count",
        },
        users.admin,
      ),
      individualSale(
        { productId: product.id, quantity: 5, terminalId: terminal.id },
        users.sales,
      ),
    ]);
    await lock.waitForBlockedTransactions(3);
    await lock.release();
    const settled = await settledPromise;

    assert.deepEqual(resultCounts(settled), { fulfilled: 3, rejected: 0 });
    const [allocation, custody, movements] = await Promise.all([
      prisma.posTerminalStockAllocation.findUniqueOrThrow({
        where: {
          terminalId_productId: {
            terminalId: terminal.id,
            productId: product.id,
          },
        },
      }),
      prisma.posTerminalStockBatch.aggregate({
        where: { terminalId: terminal.id, productId: product.id },
        _sum: { quantityRemaining: true },
      }),
      prisma.posTerminalStockMovement.findMany({
        where: { terminalId: terminal.id, productId: product.id },
      }),
    ]);
    assert.equal(
      allocation.allocatedQuantity,
      allocation.soldQuantity + (custody._sum.quantityRemaining ?? 0),
    );
    assert.deepEqual(
      new Set(movements.map((movement) => movement.type)),
      new Set([
        PosTerminalStockMovementType.ALLOCATE,
        PosTerminalStockMovementType.RELEASE,
        PosTerminalStockMovementType.ADJUST,
        PosTerminalStockMovementType.SALE,
      ]),
    );
    assert.ok(movements.every((movement) => movement.balanceAfter >= 0));
  } finally {
    await lock.rollback();
  }
});

test("two offline sales cannot reuse one retailer approval", async () => {
  const users = await actors();
  const { product } = await productWithStock(100);
  const retailer = await prisma.retailer.create({
    data: { name: `Retailer ${++sequence}`, createdById: users.admin.id },
  });
  const terminal = await createTerminal(users.admin, users.sales, {
    offlineEnabled: true,
    pair: true,
  });
  await sales.setPosTerminalStockAllocation(
    terminal.id,
    { productId: product.id, allocatedQuantity: 20 },
    users.admin,
  );
  await sales.setPosTerminalRetailerCreditAllocation(
    terminal.id,
    { retailerId: retailer.id, allocatedAmount: 1000, isActive: true },
    users.admin,
  );
  await sales.createSale(
    {
      customerType: CustomerType.RETAILER,
      retailerId: retailer.id,
      paymentMethod: PaymentMethod.CREDIT,
      amountPaid: 0,
      items: [{ productId: product.id, quantity: 1, unitPrice: 100 }],
    },
    users.sales,
  );
  const approval = await prisma.retailerOrderApproval.create({
    data: {
      retailerId: retailer.id,
      terminalId: terminal.id,
      approvedAmount: "1000.00",
      status: RetailerOrderApprovalStatus.APPROVED,
      approvedById: users.admin.id,
      reviewedAt: new Date(),
    },
  });
  const lock = await holdRowLock("RetailerOrderApproval", approval.id);

  try {
    const payload = (clientRequestId: string) => ({
      terminalId: terminal.id,
      sales: [
        {
          terminalId: terminal.id,
          clientRequestId,
          customerType: CustomerType.RETAILER,
          retailerId: retailer.id,
          retailerApprovalId: approval.id,
          paymentMethod: PaymentMethod.CREDIT,
          amountPaid: 0,
          items: [{ productId: product.id, quantity: 1, unitPrice: 100 }],
        },
      ],
    });
    const settledPromise = Promise.all([
      sales.syncOfflinePosSales(
        payload("offline-approval-race-a"),
        users.sales,
        terminal.deviceSecret ?? undefined,
      ),
      sales.syncOfflinePosSales(
        payload("offline-approval-race-b"),
        users.secondSales,
        terminal.deviceSecret ?? undefined,
      ),
    ]);
    await lock.waitForBlockedTransactions(2);
    await lock.release();
    const results = await settledPromise;
    const statuses = results.map((result) => result.results[0]?.status).sort();

    assert.deepEqual(statuses, [
      PosOfflineSyncStatus.CONFLICT,
      PosOfflineSyncStatus.SYNCED,
    ]);
    const storedApproval = await prisma.retailerOrderApproval.findUniqueOrThrow({
      where: { id: approval.id },
    });
    const creditAllocation =
      await prisma.posTerminalRetailerCreditAllocation.findUniqueOrThrow({
        where: {
          terminalId_retailerId: {
            terminalId: terminal.id,
            retailerId: retailer.id,
          },
        },
      });
    assert.equal(storedApproval.status, RetailerOrderApprovalStatus.USED);
    assert.ok(storedApproval.usedAt);
    assert.equal(creditAllocation.usedAmount.toString(), "100");
    assert.equal(
      await prisma.sale.count({ where: { retailerApprovalId: approval.id } }),
      1,
    );
  } finally {
    await lock.rollback();
  }
});

test("concurrent returns cannot exceed the original sold quantity", async () => {
  const users = await actors();
  const { product } = await productWithStock(20);
  const sale = await individualSale(
    { productId: product.id, quantity: 10 },
    users.sales,
  );
  const saleItemId = sale.items[0]?.id;
  assert.ok(saleItemId);
  const lock = await holdRowLock("SaleItem", saleItemId);

  try {
    const returnInput = {
      saleItemId,
      disposition: SalesReturnDisposition.RETURN_TO_STOCK,
      quantity: 7,
      reason: "Concurrent customer return",
    };
    const settledPromise = Promise.allSettled([
      sales.recordReturn(returnInput, users.sales),
      sales.recordReturn(returnInput, users.secondSales),
    ]);
    await lock.waitForBlockedTransactions(2);
    await lock.release();
    const settled = await settledPromise;

    assert.deepEqual(resultCounts(settled), { fulfilled: 1, rejected: 1 });
    const returned = await prisma.salesProductReturn.aggregate({
      where: { saleItemId },
      _sum: { quantity: true },
    });
    assert.equal(returned._sum.quantity, 7);
  } finally {
    await lock.rollback();
  }
});

test("sale and day-close preparation serialize into one valid ordering", async () => {
  const users = await actors();
  const { product } = await productWithStock(10);
  const date = "2035-02-10";
  const businessDate = new Date(`${date}T00:00:00.000Z`);
  await prisma.businessDayState.create({ data: { businessDate } });
  const lock = await holdRowLock("BusinessDayState", businessDate);

  try {
    const settledPromise = Promise.allSettled([
      individualSale(
        {
          productId: product.id,
          soldAt: new Date(`${date}T10:00:00.000Z`),
        },
        users.sales,
      ),
      dayClose.prepare({ date }, users.secondSales),
    ]);
    await lock.waitForBlockedTransactions(2);
    await lock.release();
    const settled = await settledPromise;
    const state = await prisma.businessDayState.findUniqueOrThrow({
      where: { businessDate },
    });
    const saleCount = await prisma.sale.count();

    assert.equal(state.status, BusinessDayStatus.CLOSING);
    assert.equal(settled[1]?.status, "fulfilled");
    assert.ok(saleCount === 0 || saleCount === 1);
    assert.equal(state.activityVersion, saleCount);
    assert.equal(settled[0]?.status, saleCount === 1 ? "fulfilled" : "rejected");
  } finally {
    await lock.rollback();
  }
});

test("a sale racing Management approval cannot make approved totals stale", async () => {
  const users = await actors();
  const { product } = await productWithStock(10);
  const date = "2035-02-11";
  const businessDate = new Date(`${date}T00:00:00.000Z`);
  await individualSale(
    {
      productId: product.id,
      soldAt: new Date(`${date}T09:00:00.000Z`),
    },
    users.sales,
  );
  await dayClose.prepare({ date }, users.sales);
  const submitted = await dayClose.submit(
    { date, countedCash: 100 },
    users.sales,
  );
  const lock = await holdRowLock("BusinessDayState", businessDate);

  try {
    const settledPromise = Promise.allSettled([
      individualSale(
        {
          productId: product.id,
          soldAt: new Date(`${date}T12:00:00.000Z`),
        },
        users.secondSales,
      ),
      dayClose.approve(submitted.id, { notes: "Reviewed" }, users.management),
    ]);
    await lock.waitForBlockedTransactions(2);
    await lock.release();
    const settled = await settledPromise;
    const close = await prisma.salesDayClose.findUniqueOrThrow({
      where: { id: submitted.id },
    });

    assert.deepEqual(resultCounts(settled), { fulfilled: 1, rejected: 1 });
    assert.equal(settled[0]?.status, "rejected");
    assert.equal(settled[1]?.status, "fulfilled");
    assert.equal(await prisma.sale.count(), 1);
    assert.equal(close.status, DayCloseStatus.APPROVED);
    assert.equal(close.expectedCash.toString(), "100");
  } finally {
    await lock.rollback();
  }
});

test("duplicate concurrent submission and approval each produce one winner", async () => {
  const users = await actors();
  const date = "2035-02-12";
  const businessDate = new Date(`${date}T00:00:00.000Z`);
  await dayClose.prepare({ date }, users.sales);
  const submissionLock = await holdRowLock("BusinessDayState", businessDate);
  let closeId: string;

  try {
    const settledPromise = Promise.allSettled([
      dayClose.submit({ date, countedCash: 0 }, users.sales),
      dayClose.submit({ date, countedCash: 0 }, users.secondSales),
    ]);
    await submissionLock.waitForBlockedTransactions(2);
    await submissionLock.release();
    const settled = await settledPromise;
    assert.deepEqual(resultCounts(settled), { fulfilled: 1, rejected: 1 });
    const close = await prisma.salesDayClose.findUniqueOrThrow({
      where: { businessDate },
    });
    closeId = close.id;
  } finally {
    await submissionLock.rollback();
  }

  const approvalLock = await holdRowLock("BusinessDayState", businessDate);
  try {
    const settledPromise = Promise.allSettled([
      dayClose.approve(closeId, { notes: "First review" }, users.management),
      dayClose.approve(
        closeId,
        { notes: "Second review" },
        users.secondManagement,
      ),
    ]);
    await approvalLock.waitForBlockedTransactions(2);
    await approvalLock.release();
    const settled = await settledPromise;

    assert.deepEqual(resultCounts(settled), { fulfilled: 1, rejected: 1 });
    assert.equal(
      await prisma.auditLog.count({ where: { action: "SALES_DAY_CLOSED" } }),
      1,
    );
    assert.equal(
      await prisma.auditLog.count({
        where: { action: "MANAGEMENT_DAY_CLOSE_APPROVED" },
      }),
      1,
    );
  } finally {
    await approvalLock.rollback();
  }
});

test("late offline sales become DAY_CLOSE_LOCKED reconciliation records", async () => {
  const users = await actors();
  const { product } = await productWithStock(20);
  const terminal = await createTerminal(users.admin, users.sales, {
    offlineEnabled: true,
    pair: true,
  });
  await sales.setPosTerminalStockAllocation(
    terminal.id,
    { productId: product.id, allocatedQuantity: 10 },
    users.admin,
  );
  const date = "2035-02-13";
  await dayClose.prepare({ date }, users.sales);

  const result = await sales.syncOfflinePosSales(
    {
      terminalId: terminal.id,
      sales: [
        {
          terminalId: terminal.id,
          clientRequestId: "late-offline-sale",
          customerType: CustomerType.INDIVIDUAL,
          paymentMethod: PaymentMethod.CASH,
          amountPaid: 100,
          soldAt: new Date(`${date}T18:00:00.000Z`),
          items: [{ productId: product.id, quantity: 1, unitPrice: 100 }],
        },
      ],
    },
    users.sales,
    terminal.deviceSecret ?? undefined,
  );

  assert.equal(result.results[0]?.status, PosOfflineSyncStatus.CONFLICT);
  const attempt = await prisma.posOfflineSyncAttempt.findUniqueOrThrow({
    where: {
      terminalId_clientRequestId: {
        terminalId: terminal.id,
        clientRequestId: "late-offline-sale",
      },
    },
  });
  assert.equal(attempt.conflictCode, "DAY_CLOSE_LOCKED");
  assert.equal(attempt.saleId, null);
});

test("terminal readiness confirmation and Management override are auditable", async () => {
  const users = await actors();
  const first = await createTerminal(users.admin, users.sales, {
    offlineEnabled: true,
    pair: true,
  });
  const second = await createTerminal(users.admin, users.sales, {
    offlineEnabled: true,
    pair: true,
  });
  const date = "2035-02-14";
  const prepared = await dayClose.prepare({ date }, users.sales);
  assert.ok(prepared.cutoffAt);

  await dayClose.confirmTerminalReadiness(
    first.id,
    { date, cutoffAt: prepared.cutoffAt, pendingSaleCount: 0 },
    users.sales,
  );
  await dayClose.overrideTerminalReadiness(
    {
      date,
      terminalIds: [second.id],
      reason: "Terminal hardware is unavailable for supervised close",
    },
    users.management,
  );

  const rows = await prisma.posTerminalDayCloseReadiness.findMany({
    where: { businessDate: new Date(`${date}T00:00:00.000Z`) },
  });
  const confirmed = rows.find((row) => row.terminalId === first.id);
  const overridden = rows.find((row) => row.terminalId === second.id);
  assert.ok(confirmed?.confirmedAt);
  assert.equal(confirmed?.pendingSaleCount, 0);
  assert.ok(overridden?.overriddenAt);
  assert.equal(overridden?.overriddenById, users.management.id);
  assert.equal(
    await prisma.auditLog.count({
      where: { action: "POS_TERMINAL_DAY_CLOSE_CONFIRMED" },
    }),
    1,
  );
  assert.equal(
    await prisma.auditLog.count({
      where: { action: "MANAGEMENT_DAY_CLOSE_TERMINALS_OVERRIDDEN" },
    }),
    1,
  );
});

