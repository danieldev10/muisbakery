import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import {
  CustomerType,
  PaymentMethod,
  PosSessionStatus,
  Prisma,
  SalePriceType,
} from "@prisma/client";

import { PosDisplayEvents } from "../src/sales/pos-display-events";
import { SalesService } from "../src/sales/sales.service";
import { actor, createAuditMock } from "./helpers";

const now = new Date("2026-07-24T08:00:00.000Z");

function createService(prisma: unknown, audit: unknown) {
  return new SalesService(
    prisma as never,
    audit as never,
    new PosDisplayEvents(),
  );
}

function terminalRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "counter-1",
    name: "Front counter",
    displayToken: "counter-display-token",
    isActive: true,
    currentSessionId: null,
    currentSession: null,
    createdById: actor.id,
    createdBy: {
      id: actor.id,
      name: actor.name,
      email: actor.email,
    },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function sessionRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "session-1",
    displayToken: "session-display-token",
    terminalId: "counter-1",
    terminal: {
      id: "counter-1",
      name: "Front counter",
      displayToken: "counter-display-token",
      isActive: true,
    },
    status: PosSessionStatus.ACTIVE,
    customerType: CustomerType.INDIVIDUAL,
    priceType: SalePriceType.WALK_IN,
    retailerId: null,
    retailer: null,
    retailerApprovalId: null,
    customerName: null,
    paymentMethod: PaymentMethod.CASH,
    discount: new Prisma.Decimal(0),
    amountPaid: null,
    notes: null,
    createdById: actor.id,
    expiresAt: new Date("2026-07-24T20:00:00.000Z"),
    completedAt: null,
    completedSaleId: null,
    completedSale: null,
    createdAt: now,
    updatedAt: now,
    items: [],
    ...overrides,
  };
}

test("SalesService creates an online sales counter without pairing credentials", async () => {
  let createData: Record<string, unknown> | null = null;
  const { audit, records } = createAuditMock();
  const prisma = {
    posTerminal: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        createData = data;
        return terminalRecord({ name: data.name });
      },
    },
  };
  const service = createService(prisma, audit);

  const created = await service.createPosTerminal(
    { name: "Front counter" },
    actor,
  );

  assert.equal(created.name, "Front counter");
  assert.equal(createData?.name, "Front counter");
  assert.equal(createData?.createdById, actor.id);
  assert.equal("pairingCodeHash" in (createData ?? {}), false);
  assert.equal("deviceSecretHash" in (createData ?? {}), false);
  assert.equal(records[0]?.action, "ADMIN_POS_TERMINAL_CREATED");
});

test("SalesService creates a server-backed session for an active counter", async () => {
  const terminal = terminalRecord();
  const createdSession = sessionRecord();
  let terminalUpdate: Record<string, unknown> | null = null;
  const prisma = {
    retailer: {
      findUnique: async () => null,
    },
    $transaction: async (
      callback: (tx: Record<string, unknown>) => Promise<unknown>,
    ) =>
      callback({
        $queryRaw: async () => [{ id: terminal.id }],
        posSession: {
          updateMany: async () => ({ count: 0 }),
          create: async () => createdSession,
          findUniqueOrThrow: async () => createdSession,
        },
        posTerminal: {
          findUnique: async () => terminal,
          update: async ({ data }: { data: Record<string, unknown> }) => {
            terminalUpdate = data;
            return terminal;
          },
        },
      }),
  };
  const { audit } = createAuditMock();
  const service = createService(prisma, audit);

  const result = await service.createPosSession(
    {
      terminalId: terminal.id,
      customerType: CustomerType.INDIVIDUAL,
    },
    actor,
  );

  assert.equal(result.id, createdSession.id);
  assert.equal(result.status, PosSessionStatus.ACTIVE);
  assert.equal(terminalUpdate?.currentSessionId, createdSession.id);
});

test("SalesService refuses to start a session on an inactive counter", async () => {
  const terminal = terminalRecord({ isActive: false });
  const prisma = {
    retailer: {
      findUnique: async () => null,
    },
    $transaction: async (
      callback: (tx: Record<string, unknown>) => Promise<unknown>,
    ) =>
      callback({
        $queryRaw: async () => [{ id: terminal.id }],
        posTerminal: {
          findUnique: async () => terminal,
        },
      }),
  };
  const { audit } = createAuditMock();
  const service = createService(prisma, audit);

  await assert.rejects(
    service.createPosSession(
      {
        terminalId: "counter-1",
        customerType: CustomerType.INDIVIDUAL,
      },
      actor,
    ),
    (error) =>
      error instanceof BadRequestException &&
      /sales counter is not available/i.test(error.message),
  );
});

test("SalesService preserves a counter session owned by the same cashier", async () => {
  const active = sessionRecord();
  const terminal = terminalRecord({
    currentSessionId: active.id,
    currentSession: {
      id: active.id,
      status: PosSessionStatus.ACTIVE,
      expiresAt: null,
      createdById: actor.id,
      createdBy: {
        name: actor.name,
        email: actor.email,
      },
    },
  });
  let createCalled = false;
  const prisma = {
    retailer: {
      findUnique: async () => null,
    },
    $transaction: async (
      callback: (tx: Record<string, unknown>) => Promise<unknown>,
    ) =>
      callback({
        $queryRaw: async () => [{ id: terminal.id }],
        posTerminal: {
          findUnique: async () => terminal,
        },
        posSession: {
          create: async () => {
            createCalled = true;
            return active;
          },
          findUniqueOrThrow: async () => active,
        },
      }),
  };
  const { audit } = createAuditMock();
  const service = createService(prisma, audit);

  const result = await service.createPosSession(
    {
      terminalId: terminal.id,
      customerType: CustomerType.INDIVIDUAL,
    },
    actor,
  );

  assert.equal(result.id, active.id);
  assert.equal(createCalled, false);
});

test("SalesService does not let another cashier take over an active counter", async () => {
  const otherCashier = {
    ...actor,
    id: "user-2",
    name: "Second Cashier",
    email: "second@muisbakery.local",
  };
  const active = sessionRecord();
  const terminal = terminalRecord({
    currentSessionId: active.id,
    currentSession: {
      id: active.id,
      status: PosSessionStatus.ACTIVE,
      expiresAt: null,
      createdById: actor.id,
      createdBy: {
        name: actor.name,
        email: actor.email,
      },
    },
  });
  let updateCalled = false;
  const prisma = {
    retailer: {
      findUnique: async () => null,
    },
    $transaction: async (
      callback: (tx: Record<string, unknown>) => Promise<unknown>,
    ) =>
      callback({
        $queryRaw: async () => [{ id: terminal.id }],
        posTerminal: {
          findUnique: async () => terminal,
          update: async () => {
            updateCalled = true;
            return terminal;
          },
        },
        posSession: {
          updateMany: async () => {
            updateCalled = true;
            return { count: 1 };
          },
        },
      }),
  };
  const { audit } = createAuditMock();
  const service = createService(prisma, audit);

  await assert.rejects(
    service.createPosSession(
      {
        terminalId: terminal.id,
        customerType: CustomerType.INDIVIDUAL,
      },
      otherCashier,
    ),
    (error) =>
      error instanceof ConflictException &&
      /currently in use by Test User/i.test(error.message),
  );
  assert.equal(updateCalled, false);
});

test("SalesService rejects cashier-entered session discounts", async () => {
  const prisma = {};
  const { audit } = createAuditMock();
  const service = createService(prisma, audit);

  await assert.rejects(
    service.updatePosSession("session-1", { discount: 100 }, actor),
    (error) =>
      error instanceof BadRequestException &&
      /cashiers cannot set discount amounts/i.test(error.message),
  );
});

test("SalesService rejects cashier-entered discounts on direct sales", async () => {
  const prisma = {};
  const { audit } = createAuditMock();
  const service = createService(prisma, audit);

  await assert.rejects(
    service.createSale(
      {
        customerType: CustomerType.INDIVIDUAL,
        paymentMethod: PaymentMethod.CASH,
        discount: 100,
        items: [{ productId: "product-1", quantity: 1 }],
      },
      actor,
    ),
    (error) =>
      error instanceof BadRequestException &&
      /cashiers cannot set discount amounts/i.test(error.message),
  );
});

test("SalesService cancellation releases the counter's current session", async () => {
  const active = sessionRecord();
  const cancelled = sessionRecord({ status: PosSessionStatus.CANCELLED });
  let releasedWhere: Record<string, unknown> | null = null;
  const prisma = {
    posSession: {
      findUnique: async () => active,
    },
    $transaction: async (
      callback: (tx: Record<string, unknown>) => Promise<unknown>,
    ) =>
      callback({
        posSession: {
          update: async () => cancelled,
          findUniqueOrThrow: async () => cancelled,
        },
        posTerminal: {
          updateMany: async ({
            where,
          }: {
            where: Record<string, unknown>;
          }) => {
            releasedWhere = where;
            return { count: 1 };
          },
        },
      }),
  };
  const { audit } = createAuditMock();
  const service = createService(prisma, audit);

  const result = await service.cancelPosSession(active.id, actor);

  assert.equal(result.status, PosSessionStatus.CANCELLED);
  assert.deepEqual(releasedWhere, {
    id: active.terminalId,
    currentSessionId: active.id,
  });
});

test("SalesService can rotate a counter display token", async () => {
  const existing = terminalRecord();
  let updateData: Record<string, unknown> | null = null;
  const prisma = {
    posTerminal: {
      findUnique: async () => existing,
    },
    $transaction: async (
      callback: (tx: Record<string, unknown>) => Promise<unknown>,
    ) =>
      callback({
        posSession: {
          updateMany: async () => ({ count: 0 }),
        },
        posTerminal: {
          update: async ({ data }: { data: Record<string, unknown> }) => {
            updateData = data;
            return terminalRecord({
              displayToken: String(data.displayToken),
            });
          },
        },
      }),
  };
  const { audit, records } = createAuditMock();
  const service = createService(prisma, audit);

  const updated = await service.updatePosTerminal(
    existing.id,
    { rotateDisplayToken: true },
    actor,
  );

  assert.notEqual(updated.displayToken, existing.displayToken);
  assert.equal(typeof updateData?.displayToken, "string");
  assert.equal(records[0]?.metadata?.displayTokenRotated, true);
});

test("SalesService hides expired public display sessions", async () => {
  const prisma = {
    posSession: {
      findUnique: async () =>
        sessionRecord({
          expiresAt: new Date("2020-01-01T00:00:00.000Z"),
        }),
    },
  };
  const { audit } = createAuditMock();
  const service = createService(prisma, audit);

  await assert.rejects(
    service.getPosDisplay("expired-token"),
    NotFoundException,
  );
});
