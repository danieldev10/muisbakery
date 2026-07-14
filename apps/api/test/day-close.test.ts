import assert from "node:assert/strict";
import { test } from "node:test";

import { BadRequestException, ConflictException } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { recordBusinessDayActivity } from "../src/sales/business-day";
import { DayCloseService } from "../src/sales/day-close.service";
import { actor, createAuditMock } from "./helpers";

const AUTH_ACTOR = actor as never;
const BUSINESS_DATE = new Date("2026-07-12T00:00:00.000Z");

function stateRow(overrides: Record<string, unknown> = {}) {
  return {
    businessDate: BUSINESS_DATE,
    activityVersion: 0,
    status: "OPEN",
    lastActivityAt: null,
    closeCutoffAt: null,
    reopenedAt: null,
    reopenedById: null,
    reopenReason: null,
    createdAt: new Date("2026-07-12T08:00:00.000Z"),
    updatedAt: new Date("2026-07-12T08:00:00.000Z"),
    ...overrides,
  };
}

function closeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "close-1",
    businessDate: BUSINESS_DATE,
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
    submittedActivityVersion: 0,
    submittedAt: new Date("2026-07-12T19:00:00.000Z"),
    submittedById: actor.id,
    submittedBy: null,
    reviewedAt: null,
    reviewedById: null,
    reviewedBy: null,
    reviewNotes: null,
    ...overrides,
  };
}

function makePrisma({
  existingClose = null as Record<string, unknown> | null,
  existingState,
  unresolvedOfflineSyncs = 0,
  closeUpdateCount,
  sales,
  retailerPayments,
} = {}) {
  let close = existingClose ? { ...existingClose } : null;
  let state = existingState
    ? { ...existingState }
    : existingClose
      ? stateRow({
          status:
            existingClose.status === "APPROVED" ? "APPROVED" : "SUBMITTED",
          activityVersion: existingClose.submittedActivityVersion ?? 0,
        })
      : stateRow();
  const created: Record<string, unknown>[] = [];
  const closeUpdates: Record<string, unknown>[] = [];
  const stateUpdates: Record<string, unknown>[] = [];
  const saleRows =
    sales ??
    [
      {
        paymentMethod: "CASH",
        amountPaid: "5000.00",
        balanceDue: "0.00",
        retailerPaymentAllocations: [],
      },
      {
        paymentMethod: "TRANSFER",
        amountPaid: "3000.00",
        balanceDue: "0.00",
        retailerPaymentAllocations: [],
      },
      {
        paymentMethod: "CREDIT",
        amountPaid: "500.00",
        balanceDue: "2000.00",
        retailerPaymentAllocations: [],
      },
    ];

  function hydratedClose() {
    if (!close) {
      return null;
    }

    return {
      ...close,
      submittedBy: null,
      reviewedBy: close.reviewedById
        ? { id: close.reviewedById, name: actor.name, email: actor.email, role: actor.role }
        : null,
      businessDayState: {
        ...state,
        reopenedBy: state.reopenedById
          ? { id: state.reopenedById, name: actor.name, email: actor.email, role: actor.role }
          : null,
      },
    };
  }

  const prisma: Record<string, unknown> = {};
  Object.assign(prisma, {
    $queryRaw: async () => [],
    $transaction: async (callback: (tx: unknown) => unknown) => callback(prisma),
    sale: { findMany: async () => saleRows },
    salesProductReturn: {
      findMany: async () => [
        { disposition: "DAMAGED", quantity: 2 },
        { disposition: "RETURN_TO_STOCK", quantity: 1 },
      ],
    },
    retailerPayment: {
      findMany: async () =>
        retailerPayments ?? [{ paymentMethod: "CASH", amount: "1000.00" }],
    },
    posOfflineSyncAttempt: { count: async () => unresolvedOfflineSyncs },
    businessDayState: {
      findUnique: async () => ({ ...state }),
      findUniqueOrThrow: async () => ({ ...state }),
      upsert: async () => ({ ...state }),
      update: async (args: { data: Record<string, unknown> }) => {
        const increment = (
          args.data.activityVersion as { increment?: number } | undefined
        )?.increment;
        state = {
          ...state,
          ...args.data,
          activityVersion: increment
            ? Number(state.activityVersion) + increment
            : (args.data.activityVersion ?? state.activityVersion),
        };
        stateUpdates.push(args.data);
        return { ...state };
      },
      updateMany: async (args: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        const matches =
          (args.where.status === undefined || args.where.status === state.status) &&
          (args.where.activityVersion === undefined ||
            args.where.activityVersion === state.activityVersion);

        if (!matches) {
          return { count: 0 };
        }

        const increment = (
          args.data.activityVersion as { increment?: number } | undefined
        )?.increment;
        state = {
          ...state,
          ...args.data,
          activityVersion: increment
            ? Number(state.activityVersion) + increment
            : (args.data.activityVersion ?? state.activityVersion),
        };
        stateUpdates.push(args.data);
        return { count: 1 };
      },
    },
    salesDayClose: {
      findUnique: async (args: { select?: unknown }) => {
        if (args.select) {
          return close ? { businessDate: close.businessDate } : null;
        }
        return hydratedClose();
      },
      findUniqueOrThrow: async () => {
        const hydrated = hydratedClose();
        if (!hydrated) throw new Error("Missing close");
        return hydrated;
      },
      findMany: async () => (close ? [hydratedClose()] : []),
      create: async (args: { data: Record<string, unknown> }) => {
        close = closeRow(args.data);
        created.push(args.data);
        return hydratedClose();
      },
      updateMany: async (args: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        const matches =
          close &&
          (args.where.status === undefined || args.where.status === close.status) &&
          (args.where.submittedActivityVersion === undefined ||
            args.where.submittedActivityVersion ===
              close.submittedActivityVersion);
        const count = closeUpdateCount ?? (matches ? 1 : 0);

        if (count > 0 && close) {
          close = { ...close, ...args.data };
          closeUpdates.push(args.data);
        }

        return { count };
      },
    },
  });

  return {
    prisma,
    created,
    closeUpdates,
    stateUpdates,
    getClose: () => close,
    getState: () => state,
  };
}

test("day-close preview derives expected takings and exposes business-day state", async () => {
  const fixture = makePrisma();
  const { audit } = createAuditMock();
  const service = new DayCloseService(fixture.prisma as never, audit as never);

  const preview = await service.preview("2026-07-12");

  assert.equal(preview.expected.salesCount, 3);
  assert.equal(preview.expected.expectedCash, "6000.00");
  assert.equal(preview.expected.expectedTransfer, "3000.00");
  assert.equal(preview.expected.creditTotal, "2000.00");
  assert.equal(preview.businessDay.status, "OPEN");
  assert.equal(preview.close, null);
});

test("a matching submitted close remains current", async () => {
  const fixture = makePrisma({ existingClose: closeRow() });
  const { audit } = createAuditMock();
  const service = new DayCloseService(fixture.prisma as never, audit as never);

  const preview = await service.preview("2026-07-12");

  assert.equal(preview.needsReclose, false);
  assert.equal(preview.businessDay.status, "SUBMITTED");
});

test("later retailer repayments do not rewrite the original sale-day totals", async () => {
  const fixture = makePrisma({
    sales: [
      {
        paymentMethod: "CREDIT",
        amountPaid: "2500.00",
        balanceDue: "0.00",
        retailerPaymentAllocations: [{ amount: "2000.00" }],
      },
    ],
    retailerPayments: [],
  });
  const { audit } = createAuditMock();
  const service = new DayCloseService(fixture.prisma as never, audit as never);

  const preview = await service.preview("2026-07-12");

  assert.equal(preview.expected.creditTotal, "2000.00");
  assert.equal(preview.expected.expectedCash, "0.00");
});

test("a changed activity version marks a submitted close for recount", async () => {
  const fixture = makePrisma({
    existingClose: closeRow({ submittedActivityVersion: 2 }),
    existingState: stateRow({ status: "STALE", activityVersion: 3 }),
  });
  const { audit } = createAuditMock();
  const service = new DayCloseService(fixture.prisma as never, audit as never);

  const preview = await service.preview("2026-07-12");

  assert.equal(preview.needsReclose, true);
  assert.equal(preview.businessDay.status, "STALE");
});

test("the day cannot be submitted over unresolved offline sync attempts", async () => {
  const fixture = makePrisma({ unresolvedOfflineSyncs: 2 });
  const { audit } = createAuditMock();
  const service = new DayCloseService(fixture.prisma as never, audit as never);

  await assert.rejects(
    service.submit({ date: "2026-07-12", countedCash: "6000" }, AUTH_ACTOR),
    (error) =>
      error instanceof ConflictException &&
      /2 offline sale\(s\)/.test(error.message),
  );
  assert.equal(fixture.created.length, 0);
});

test("submission captures the locked activity version and cash variance", async () => {
  const fixture = makePrisma({
    existingState: stateRow({ activityVersion: 4 }),
  });
  const { audit, records } = createAuditMock();
  const service = new DayCloseService(fixture.prisma as never, audit as never);

  const result = await service.submit(
    { date: "2026-07-12", countedCash: "5800" },
    AUTH_ACTOR,
  );

  assert.equal(fixture.created.length, 1);
  assert.equal(fixture.created[0].submittedActivityVersion, 4);
  assert.equal(Number(String(fixture.created[0].cashVariance)), -200);
  assert.equal(fixture.getState().status, "SUBMITTED");
  assert.equal(result.businessDay.activityVersion, 4);
  assert.equal(records[0]?.action, "SALES_DAY_CLOSED");
});

test("a stale close can be recounted and resubmitted at the current version", async () => {
  const fixture = makePrisma({
    existingClose: closeRow({ submittedActivityVersion: 2 }),
    existingState: stateRow({ status: "STALE", activityVersion: 3 }),
  });
  const { audit, records } = createAuditMock();
  const service = new DayCloseService(fixture.prisma as never, audit as never);

  await service.submit(
    { date: "2026-07-12", countedCash: "5800" },
    AUTH_ACTOR,
  );

  assert.equal(fixture.closeUpdates[0].submittedActivityVersion, 3);
  assert.equal(fixture.getState().status, "SUBMITTED");
  assert.equal(records[0]?.action, "SALES_DAY_CLOSE_UPDATED");
});

test("an approved business day cannot be overwritten by Sales", async () => {
  const fixture = makePrisma({
    existingClose: closeRow({ status: "APPROVED" }),
    existingState: stateRow({ status: "APPROVED" }),
  });
  const { audit } = createAuditMock();
  const service = new DayCloseService(fixture.prisma as never, audit as never);

  await assert.rejects(
    service.submit({ date: "2026-07-12", countedCash: "100" }, AUTH_ACTOR),
    (error) =>
      error instanceof ConflictException && /must reopen/i.test(error.message),
  );
});

test("submit rejects malformed dates and negative cash counts", async () => {
  const fixture = makePrisma();
  const { audit } = createAuditMock();
  const service = new DayCloseService(fixture.prisma as never, audit as never);

  await assert.rejects(
    service.submit({ date: "12-07-2026", countedCash: "100" }, AUTH_ACTOR),
    BadRequestException,
  );
  await assert.rejects(
    service.submit({ date: "2026-07-12", countedCash: "-5" }, AUTH_ACTOR),
    BadRequestException,
  );
});

test("approval rejects a stale submitted version and persists STALE state", async () => {
  const fixture = makePrisma({
    existingClose: closeRow({ submittedActivityVersion: 2 }),
    existingState: stateRow({ status: "SUBMITTED", activityVersion: 3 }),
  });
  const { audit } = createAuditMock();
  const service = new DayCloseService(fixture.prisma as never, audit as never);

  await assert.rejects(
    service.approve("close-1", {}, AUTH_ACTOR),
    (error) => error instanceof ConflictException && /stale/i.test(error.message),
  );
  assert.equal(fixture.getState().status, "STALE");
  assert.equal(fixture.getClose()?.status, "SUBMITTED");
});

test("approval recalculates totals and rejects changed financial data", async () => {
  const fixture = makePrisma({
    existingClose: closeRow({ expectedCash: new Prisma.Decimal("100.00") }),
  });
  const { audit } = createAuditMock();
  const service = new DayCloseService(fixture.prisma as never, audit as never);

  await assert.rejects(
    service.approve("close-1", {}, AUTH_ACTOR),
    (error) => error instanceof ConflictException && /stale/i.test(error.message),
  );
  assert.equal(fixture.getState().status, "STALE");
});

test("approval conditionally signs the matching version and records audit", async () => {
  const fixture = makePrisma({ existingClose: closeRow() });
  const { audit, records } = createAuditMock();
  const service = new DayCloseService(fixture.prisma as never, audit as never);

  const result = await service.approve(
    "close-1",
    { notes: "Till float verified" },
    AUTH_ACTOR,
  );

  assert.equal(result.status, "APPROVED");
  assert.equal(result.businessDay.status, "APPROVED");
  assert.equal(fixture.getState().status, "APPROVED");
  assert.equal(records[0]?.action, "MANAGEMENT_DAY_CLOSE_APPROVED");
});

test("a competing approval cannot sign the close twice", async () => {
  const fixture = makePrisma({
    existingClose: closeRow(),
    closeUpdateCount: 0,
  });
  const { audit } = createAuditMock();
  const service = new DayCloseService(fixture.prisma as never, audit as never);

  await assert.rejects(
    service.approve("close-1", {}, AUTH_ACTOR),
    (error) =>
      error instanceof ConflictException && /updated while/i.test(error.message),
  );
});

test("approved-day postings are rejected until Management reopens the day", async () => {
  const fixture = makePrisma({
    existingState: stateRow({ status: "APPROVED", activityVersion: 7 }),
  });

  await assert.rejects(
    recordBusinessDayActivity(
      fixture.prisma as never,
      new Date("2026-07-12T20:00:00.000Z"),
    ),
    (error) =>
      error instanceof ConflictException && /must reopen/i.test(error.message),
  );
  assert.equal(fixture.getState().activityVersion, 7);
});

test("financial activity increments the version and makes a submitted close stale", async () => {
  const fixture = makePrisma({
    existingState: stateRow({ status: "SUBMITTED", activityVersion: 7 }),
  });

  await recordBusinessDayActivity(
    fixture.prisma as never,
    new Date("2026-07-12T20:00:00.000Z"),
  );

  assert.equal(fixture.getState().activityVersion, 8);
  assert.equal(fixture.getState().status, "STALE");
  assert.ok(fixture.getState().lastActivityAt instanceof Date);
});

test("Management reopen requires a reason and invalidates the approved version", async () => {
  const fixture = makePrisma({
    existingClose: closeRow({ status: "APPROVED" }),
    existingState: stateRow({ status: "APPROVED", activityVersion: 5 }),
  });
  const { audit, records } = createAuditMock();
  const service = new DayCloseService(fixture.prisma as never, audit as never);

  await assert.rejects(
    service.reopen("close-1", { reason: "" }, AUTH_ACTOR),
    BadRequestException,
  );

  const reopened = await service.reopen(
    "close-1",
    { reason: "Late transfer correction" },
    AUTH_ACTOR,
  );

  assert.equal(reopened.businessDay.status, "OPEN");
  assert.equal(reopened.businessDay.activityVersion, 6);
  assert.equal(reopened.businessDay.reopenReason, "Late transfer correction");
  assert.equal(records[0]?.action, "MANAGEMENT_DAY_REOPENED");
});

test("Sales can submit a fresh close after an explicit Management reopen", async () => {
  const fixture = makePrisma({
    existingClose: closeRow({ status: "APPROVED", submittedActivityVersion: 5 }),
    existingState: stateRow({
      status: "OPEN",
      activityVersion: 6,
      reopenedAt: new Date(),
      reopenedById: actor.id,
      reopenReason: "Correction required",
    }),
  });
  const { audit } = createAuditMock();
  const service = new DayCloseService(fixture.prisma as never, audit as never);

  const result = await service.submit(
    { date: "2026-07-12", countedCash: "6000" },
    AUTH_ACTOR,
  );

  assert.equal(result.status, "SUBMITTED");
  assert.equal(result.submittedActivityVersion, 6);
  assert.equal(result.businessDay.status, "SUBMITTED");
});
