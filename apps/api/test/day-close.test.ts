import assert from "node:assert/strict";
import { test } from "node:test";

import { BadRequestException, ConflictException } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { DayCloseService } from "../src/sales/day-close.service";
import { actor, createAuditMock } from "./helpers";

const AUTH_ACTOR = actor as never;

// Money fields use real Prisma.Decimal so toString() behaves like production
// (Decimals drop trailing zeros: "6000", not "6000.00").
function closeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "close-1",
    businessDate: new Date("2026-07-12T00:00:00.000Z"),
    salesCount: 3,
    expectedCash: new Prisma.Decimal("6000.00"),
    expectedTransfer: new Prisma.Decimal("3000.00"),
    expectedPos: new Prisma.Decimal("0.00"),
    creditTotal: new Prisma.Decimal("2000.00"),
    countedCash: new Prisma.Decimal("5800.00"),
    cashVariance: new Prisma.Decimal("-200.00"),
    damagedQuantity: 2,
    returnedQuantity: 1,
    notes: null,
    status: "SUBMITTED",
    submittedAt: new Date("2026-07-12T19:00:00.000Z"),
    submittedBy: null,
    reviewedAt: null,
    reviewedBy: null,
    reviewNotes: null,
    ...overrides,
  };
}

// A day with: 5,000 cash sale, 3,000 transfer sale, credit sale that left
// 2,000 owing, a 1,000 cash retailer repayment, 2 damaged + 1 restocked.
function makePrisma({
  existingClose = null as Record<string, unknown> | null,
  createError = null as Error | null,
  approveCount = 1,
} = {}) {
  const created: Record<string, unknown>[] = [];
  const updated: Record<string, unknown>[] = [];
  const approved: Record<string, unknown>[] = [];

  return {
    created,
    approved,
    prisma: {
      sale: {
        findMany: async () => [
          { paymentMethod: "CASH", amountPaid: "5000.00", balanceDue: "0.00" },
          {
            paymentMethod: "TRANSFER",
            amountPaid: "3000.00",
            balanceDue: "0.00",
          },
          {
            paymentMethod: "CREDIT",
            amountPaid: "500.00",
            balanceDue: "2000.00",
          },
        ],
      },
      salesProductReturn: {
        findMany: async () => [
          { disposition: "DAMAGED", quantity: 2 },
          { disposition: "RETURN_TO_STOCK", quantity: 1 },
        ],
      },
      retailerPayment: {
        findMany: async () => [{ paymentMethod: "CASH", amount: "1000.00" }],
      },
      salesDayClose: {
        findUnique: async () => existingClose,
        findUniqueOrThrow: async () =>
          closeRow({ status: "APPROVED", reviewedAt: new Date() }),
        create: async (args: { data: Record<string, unknown> }) => {
          if (createError) {
            throw createError;
          }
          created.push(args.data);
          return closeRow({
            countedCash: String(args.data.countedCash),
            cashVariance: String(args.data.cashVariance),
          });
        },
        update: async (args: { data: Record<string, unknown> }) => {
          updated.push(args.data);
          return closeRow({
            countedCash: String(args.data.countedCash),
            cashVariance: String(args.data.cashVariance),
            submittedAt: args.data.submittedAt,
          });
        },
        updateMany: async (args: { data: Record<string, unknown> }) => {
          approved.push(args.data);
          return { count: approveCount };
        },
      },
    },
    updated,
  };
}

test("day-close preview derives expected takings by payment method", async () => {
  const { prisma } = makePrisma();
  const { audit } = createAuditMock();
  const service = new DayCloseService(prisma as never, audit as never);

  const preview = await service.preview("2026-07-12");

  assert.equal(preview.date, "2026-07-12");
  assert.equal(preview.expected.salesCount, 3);
  // 5,000 cash sale + 1,000 cash retailer repayment.
  assert.equal(preview.expected.expectedCash, "6000.00");
  assert.equal(preview.expected.expectedTransfer, "3000.00");
  assert.equal(preview.expected.expectedPos, "0.00");
  assert.equal(preview.expected.creditTotal, "2000.00");
  assert.equal(preview.expected.damagedQuantity, 2);
  assert.equal(preview.expected.returnedQuantity, 1);
  assert.equal(preview.close, null);
  assert.equal(preview.needsReclose, false);
});

test("needsReclose stays false when the submitted close still matches the day's totals", async () => {
  // The existing close matches computeExpected exactly, including
  // round-figure Decimals that stringify without trailing zeros.
  const { prisma } = makePrisma({ existingClose: closeRow() });
  const { audit } = createAuditMock();
  const service = new DayCloseService(prisma as never, audit as never);

  const preview = await service.preview("2026-07-12");

  assert.ok(preview.close);
  assert.equal(preview.needsReclose, false);
});

test("needsReclose flips when sales are recorded after the close was submitted", async () => {
  const { prisma } = makePrisma({
    existingClose: closeRow({
      expectedCash: new Prisma.Decimal("4000.00"),
      salesCount: 2,
    }),
  });
  const { audit } = createAuditMock();
  const service = new DayCloseService(prisma as never, audit as never);

  const preview = await service.preview("2026-07-12");

  assert.equal(preview.needsReclose, true);
});

test("submitting a close stores the cash variance and writes an audit entry", async () => {
  const { prisma, created } = makePrisma();
  const { audit, records } = createAuditMock();
  const service = new DayCloseService(prisma as never, audit as never);

  await service.submit(
    { date: "2026-07-12", countedCash: "5800", notes: "" },
    AUTH_ACTOR,
  );

  assert.equal(created.length, 1);
  assert.equal(Number(String(created[0].countedCash)), 5800);
  assert.equal(Number(String(created[0].cashVariance)), -200);
  assert.equal(created[0].submittedById, actor.id);

  const auditRecords = records as Array<Record<string, unknown>>;
  assert.equal(auditRecords.length, 1);
  assert.equal(auditRecords[0].action, "SALES_DAY_CLOSED");
});

test("a submitted day close can be re-submitted when same-day activity changes", async () => {
  const { prisma, updated } = makePrisma({
    existingClose: closeRow({
      salesCount: 1,
      expectedCash: new Prisma.Decimal("1000.00"),
      expectedTransfer: new Prisma.Decimal("0.00"),
      expectedPos: new Prisma.Decimal("0.00"),
      creditTotal: new Prisma.Decimal("0.00"),
      damagedQuantity: 0,
      returnedQuantity: 0,
    }),
  });
  const { audit, records } = createAuditMock();
  const service = new DayCloseService(prisma as never, audit as never);

  await service.submit(
    { date: "2026-07-12", countedCash: "5800" },
    AUTH_ACTOR,
  );

  assert.equal(updated.length, 1);
  assert.equal(Number(String(updated[0].countedCash)), 5800);
  assert.equal(records[0]?.action, "SALES_DAY_CLOSE_UPDATED");
});

test("an approved day close cannot be overwritten by Sales", async () => {
  const { prisma } = makePrisma({
    existingClose: closeRow({ status: "APPROVED" }),
  });
  const { audit } = createAuditMock();
  const service = new DayCloseService(prisma as never, audit as never);

  await assert.rejects(
    service.submit({ date: "2026-07-12", countedCash: "100" }, AUTH_ACTOR),
    (error) =>
      error instanceof ConflictException &&
      /already been approved/i.test(error.message),
  );
});

test("submit rejects malformed dates and negative counts", async () => {
  const { prisma } = makePrisma();
  const { audit } = createAuditMock();
  const service = new DayCloseService(prisma as never, audit as never);

  await assert.rejects(
    service.submit({ date: "12-07-2026", countedCash: "100" }, AUTH_ACTOR),
    BadRequestException,
  );
  await assert.rejects(
    service.submit({ date: "2026-07-12", countedCash: "-5" }, AUTH_ACTOR),
    BadRequestException,
  );
});

test("approval is conditional so two managers cannot both sign off", async () => {
  const contested = makePrisma({
    existingClose: closeRow(),
    approveCount: 0,
  });
  const { audit } = createAuditMock();
  const service = new DayCloseService(
    contested.prisma as never,
    audit as never,
  );

  await assert.rejects(
    service.approve("close-1", { notes: "ok" }, AUTH_ACTOR),
    (error) =>
      error instanceof ConflictException &&
      /already been reviewed/.test(error.message),
  );
});

test("approving a submitted close records reviewer metadata and an audit entry", async () => {
  const { prisma, approved } = makePrisma({ existingClose: closeRow() });
  const { audit, records } = createAuditMock();
  const service = new DayCloseService(prisma as never, audit as never);

  const result = await service.approve(
    "close-1",
    { notes: "Variance explained by till float" },
    AUTH_ACTOR,
  );

  assert.equal(approved.length, 1);
  assert.equal(approved[0].status, "APPROVED");
  assert.equal(approved[0].reviewedById, actor.id);
  assert.equal(result.status, "APPROVED");

  const auditRecords = records as Array<Record<string, unknown>>;
  assert.equal(auditRecords.length, 1);
  assert.equal(auditRecords[0].action, "MANAGEMENT_DAY_CLOSE_APPROVED");
});
