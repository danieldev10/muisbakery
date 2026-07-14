import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";

import { ExpensesService } from "../src/management/expenses.service";
import { actor, createAuditMock } from "./helpers";

const AUTH_ACTOR = actor as never;

type ExpenseRow = {
  id: string;
  amount: string;
  incurredAt: Date;
  vendor: string | null;
  paymentMethod: string;
  notes: string | null;
  createdAt: Date;
  category: { id: string; name: string };
  createdBy: unknown;
  voidedAt: Date | null;
  voidedBy: unknown;
  voidReason: string | null;
};

function expenseRow(overrides: Partial<ExpenseRow> = {}): ExpenseRow {
  return {
    id: "expense-1",
    amount: "5000.00",
    incurredAt: new Date("2026-07-03T00:00:00.000Z"),
    vendor: "NEPA",
    paymentMethod: "CASH",
    notes: null,
    createdAt: new Date("2026-07-03T09:00:00.000Z"),
    category: { id: "cat-utilities", name: "Utilities" },
    createdBy: null,
    voidedAt: null,
    voidedBy: null,
    voidReason: null,
    ...overrides,
  };
}

function makeService({
  expenses = [] as ExpenseRow[],
  category = {
    id: "cat-utilities",
    name: "Utilities",
    isActive: true,
  } as Record<string, unknown> | null,
  existing = null as Record<string, unknown> | null,
}) {
  const created: Record<string, unknown>[] = [];
  const updated: Record<string, unknown>[] = [];

  const prisma = {
    expense: {
      findMany: async (args: { where: Record<string, unknown> }) => {
        void args;
        return expenses;
      },
      findUnique: async () => existing,
      create: async (args: { data: Record<string, unknown> }) => {
        created.push(args.data);
        return expenseRow({
          amount: String(args.data.amount),
          vendor: (args.data.vendor as string | null) ?? null,
        });
      },
      update: async (args: { data: Record<string, unknown> }) => {
        updated.push(args.data);
        return expenseRow({
          voidedAt: args.data.voidedAt as Date,
          voidReason: args.data.voidReason as string,
        });
      },
    },
    expenseCategory: {
      findMany: async () => [
        { id: "cat-utilities", name: "Utilities", description: null },
      ],
      findUnique: async () => category,
    },
  };

  const { audit, records } = createAuditMock();

  return {
    service: new ExpensesService(prisma as never, audit as never),
    created,
    updated,
    auditRecords: records as Array<Record<string, unknown>>,
  };
}

test("recording an expense stores a rounded amount and writes an audit entry", async () => {
  const { service, created, auditRecords } = makeService({});

  await service.create(
    {
      categoryId: "cat-utilities",
      amount: "5000.005",
      incurredAt: "2026-07-03",
      vendor: "NEPA",
      paymentMethod: "TRANSFER",
    },
    AUTH_ACTOR,
  );

  assert.equal(created.length, 1);
  assert.equal(String(created[0].amount), "5000.01");
  assert.deepEqual(created[0].incurredAt, new Date("2026-07-03T00:00:00.000Z"));
  assert.equal(created[0].createdById, actor.id);

  assert.equal(auditRecords.length, 1);
  assert.equal(auditRecords[0].action, "MANAGEMENT_EXPENSE_RECORDED");
});

test("recording an expense rejects a non-positive amount", async () => {
  const { service, created } = makeService({});

  await assert.rejects(
    service.create(
      { categoryId: "cat-utilities", amount: "0", incurredAt: "2026-07-03" },
      AUTH_ACTOR,
    ),
    BadRequestException,
  );
  assert.equal(created.length, 0);
});

test("recording an expense rejects a deactivated category", async () => {
  const { service } = makeService({
    category: { id: "cat-utilities", name: "Utilities", isActive: false },
  });

  await assert.rejects(
    service.create(
      {
        categoryId: "cat-utilities",
        amount: "100",
        incurredAt: "2026-07-03",
      },
      AUTH_ACTOR,
    ),
    /deactivated/,
  );
});

test("recording an expense rejects an unknown category", async () => {
  const { service } = makeService({ category: null });

  await assert.rejects(
    service.create(
      { categoryId: "missing", amount: "100", incurredAt: "2026-07-03" },
      AUTH_ACTOR,
    ),
    NotFoundException,
  );
});

test("voiding an expense records the reason and an audit entry", async () => {
  const { service, updated, auditRecords } = makeService({
    existing: { id: "expense-1", voidedAt: null, amount: "5000.00" },
  });

  const result = await service.void(
    "expense-1",
    { reason: "Duplicate entry" },
    AUTH_ACTOR,
  );

  assert.equal(updated.length, 1);
  assert.equal(updated[0].voidReason, "Duplicate entry");
  assert.equal(updated[0].voidedById, actor.id);
  assert.ok(result.voidedAt);

  assert.equal(auditRecords.length, 1);
  assert.equal(auditRecords[0].action, "MANAGEMENT_EXPENSE_VOIDED");
});

test("voiding is rejected without a reason and for already-voided expenses", async () => {
  const { service } = makeService({
    existing: { id: "expense-1", voidedAt: null, amount: "5000.00" },
  });

  await assert.rejects(
    service.void("expense-1", { reason: "" }, AUTH_ACTOR),
    BadRequestException,
  );

  const alreadyVoided = makeService({
    existing: {
      id: "expense-1",
      voidedAt: new Date(),
      amount: "5000.00",
    },
  });

  await assert.rejects(
    alreadyVoided.service.void(
      "expense-1",
      { reason: "Duplicate entry" },
      AUTH_ACTOR,
    ),
    ConflictException,
  );
});

test("the period list excludes voided expenses from totals but keeps them visible", async () => {
  const { service } = makeService({
    expenses: [
      expenseRow({ id: "expense-1", amount: "5000.00" }),
      expenseRow({
        id: "expense-2",
        amount: "2500.00",
        category: { id: "cat-rent", name: "Rent" },
      }),
      expenseRow({
        id: "expense-3",
        amount: "9999.00",
        voidedAt: new Date("2026-07-04T00:00:00.000Z"),
        voidReason: "Wrong amount",
      }),
    ],
  });

  const report = await service.list("2026-07");

  assert.equal(report.range.from, "2026-07-01");
  assert.equal(report.range.to, "2026-07-31");
  assert.equal(report.summary.count, 2);
  assert.equal(report.summary.voidedCount, 1);
  assert.equal(report.summary.totalAmount, "7500.00");
  assert.equal(report.expenses.length, 3);

  assert.deepEqual(
    report.summary.byCategory.map((entry) => [
      entry.category.name,
      entry.amount,
    ]),
    [
      ["Utilities", "5000.00"],
      ["Rent", "2500.00"],
    ],
  );
});
