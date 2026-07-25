import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

import {
  CustomerType,
  DayCloseStatus,
  PaymentMethod,
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
  const [admin, firstSales, secondSales, firstManagement, secondManagement] =
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
    sales: actor(firstSales),
    secondSales: actor(secondSales),
    management: actor(firstManagement),
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
      retailerPrice: "100.00",
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

async function individualSale(
  productId: string,
  quantity: number,
  salesActor: AuthenticatedUser,
) {
  return sales.createSale(
    {
      customerType: CustomerType.INDIVIDUAL,
      paymentMethod: PaymentMethod.CASH,
      amountPaid: quantity * 100,
      items: [{ productId, quantity }],
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

test("concurrent online sales cannot oversell central FIFO stock", async () => {
  const users = await actors();
  const { product, batch } = await productWithStock(10);
  const lock = await holdRowLock("Product", product.id);

  try {
    const settledPromise = Promise.allSettled([
      individualSale(product.id, 7, users.sales),
      individualSale(product.id, 7, users.secondSales),
    ]);
    await lock.waitForBlockedTransactions(2);
    await lock.release();
    const settled = await settledPromise;

    assert.deepEqual(resultCounts(settled), { fulfilled: 1, rejected: 1 });
    const storedBatch = await prisma.salesProductBatch.findUniqueOrThrow({
      where: { id: batch.id },
    });
    assert.equal(storedBatch.quantityRemaining, 3);
    assert.equal(await prisma.sale.count(), 1);
  } finally {
    await lock.rollback();
  }
});

test("two cashiers cannot claim the same sales counter", async () => {
  const users = await actors();
  const terminal = await prisma.posTerminal.create({
    data: {
      name: `Shared Counter ${++sequence}`,
      displayToken: `shared-counter-${sequence}`,
      createdById: users.admin.id,
    },
  });
  const payload = {
    terminalId: terminal.id,
    customerType: CustomerType.INDIVIDUAL,
  };

  const settled = await Promise.allSettled([
    sales.createPosSession(payload, users.sales),
    sales.createPosSession(payload, users.secondSales),
  ]);

  assert.deepEqual(resultCounts(settled), { fulfilled: 1, rejected: 1 });
  const storedTerminal = await prisma.posTerminal.findUniqueOrThrow({
    where: { id: terminal.id },
    include: { currentSession: true },
  });
  assert.equal(storedTerminal.currentSession?.status, "ACTIVE");
  assert.ok(
    [users.sales.id, users.secondSales.id].includes(
      storedTerminal.currentSession?.createdById ?? "",
    ),
  );
  assert.equal(
    await prisma.posSession.count({
      where: {
        terminalId: terminal.id,
        status: "ACTIVE",
      },
    }),
    1,
  );
});

test("two online credit sales cannot reuse one Admin approval", async () => {
  const users = await actors();
  const { product } = await productWithStock(20);
  const retailer = await prisma.retailer.create({
    data: {
      name: `Retailer ${++sequence}`,
      createdById: users.admin.id,
    },
  });

  await sales.createSale(
    {
      customerType: CustomerType.RETAILER,
      retailerId: retailer.id,
      paymentMethod: PaymentMethod.CREDIT,
      amountPaid: 0,
      items: [{ productId: product.id, quantity: 1 }],
    },
    users.sales,
  );

  const approval = await prisma.retailerOrderApproval.create({
    data: {
      retailerId: retailer.id,
      approvedAmount: "1000.00",
      status: RetailerOrderApprovalStatus.APPROVED,
      approvedById: users.admin.id,
      reviewedAt: new Date(),
    },
  });

  const payload = {
    customerType: CustomerType.RETAILER,
    retailerId: retailer.id,
    retailerApprovalId: approval.id,
    paymentMethod: PaymentMethod.CREDIT,
    amountPaid: 0,
    items: [{ productId: product.id, quantity: 1 }],
  };
  const settled = await Promise.allSettled([
    sales.createSale(payload, users.sales),
    sales.createSale(payload, users.secondSales),
  ]);

  assert.deepEqual(resultCounts(settled), { fulfilled: 1, rejected: 1 });
  const storedApproval = await prisma.retailerOrderApproval.findUniqueOrThrow({
    where: { id: approval.id },
  });
  assert.equal(storedApproval.status, RetailerOrderApprovalStatus.USED);
  assert.ok(storedApproval.usedAt);
  assert.equal(
    await prisma.sale.count({ where: { retailerApprovalId: approval.id } }),
    1,
  );
});

test("concurrent returns cannot exceed the original sold quantity", async () => {
  const users = await actors();
  const { product } = await productWithStock(20);
  const sale = await individualSale(product.id, 10, users.sales);
  const saleItemId = sale.items[0]?.id;
  assert.ok(saleItemId);
  const lock = await holdRowLock("SaleItem", saleItemId);

  try {
    const input = {
      saleItemId,
      disposition: SalesReturnDisposition.RETURN_TO_STOCK,
      quantity: 7,
      reason: "Concurrent customer return",
    };
    const settledPromise = Promise.allSettled([
      sales.recordReturn(input, users.sales),
      sales.recordReturn(input, users.secondSales),
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

test("two Sales users cannot submit the same business day twice", async () => {
  const users = await actors();
  const date = "2035-02-12";
  const settled = await Promise.allSettled([
    dayClose.submit({ date, countedCash: 0 }, users.sales),
    dayClose.submit({ date, countedCash: 0 }, users.secondSales),
  ]);

  assert.deepEqual(resultCounts(settled), { fulfilled: 1, rejected: 1 });
  const close = await prisma.salesDayClose.findUniqueOrThrow({
    where: { businessDate: new Date(`${date}T00:00:00.000Z`) },
  });
  assert.equal(close.status, DayCloseStatus.SUBMITTED);
  assert.equal(
    await prisma.auditLog.count({ where: { action: "SALES_DAY_CLOSED" } }),
    1,
  );
});

test("two Management users cannot approve the same close twice", async () => {
  const users = await actors();
  const submitted = await dayClose.submit(
    { date: "2035-02-13", countedCash: 0 },
    users.sales,
  );
  const settled = await Promise.allSettled([
    dayClose.approve(
      submitted.id,
      { notes: "First review" },
      users.management,
    ),
    dayClose.approve(
      submitted.id,
      { notes: "Second review" },
      users.secondManagement,
    ),
  ]);

  assert.deepEqual(resultCounts(settled), { fulfilled: 1, rejected: 1 });
  const close = await prisma.salesDayClose.findUniqueOrThrow({
    where: { id: submitted.id },
  });
  assert.equal(close.status, DayCloseStatus.APPROVED);
  assert.equal(
    await prisma.auditLog.count({
      where: { action: "MANAGEMENT_DAY_CLOSE_APPROVED" },
    }),
    1,
  );
});
