import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  BusinessDayStatus,
  DayCloseStatus,
  PaymentMethod,
  PosOfflineSyncStatus,
  Prisma,
  SalesReturnDisposition,
} from "@prisma/client";
import { z } from "zod";

import { AuditService } from "../audit/audit.service";
import type { AuthenticatedUser } from "../auth/auth.types";
import { PrismaService } from "../database/prisma.service";
import {
  getReportRange,
  serializeReportRange,
} from "../management/report-range";
import {
  businessDateFromString,
  lockBusinessDayState,
} from "./business-day";
import { decimalToNumber, toDayRange } from "./sales.utils";

const dateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must use YYYY-MM-DD format.");

const submitSchema = z.object({
  date: dateSchema,
  countedCash: z.coerce
    .number({ message: "Counted cash is required." })
    .nonnegative("Counted cash cannot be negative.")
    .max(99_999_999),
  notes: z.string().trim().max(500).optional(),
});

const approveSchema = z.object({
  notes: z.string().trim().max(300).optional(),
});

const prepareSchema = z.object({ date: dateSchema });

const terminalConfirmationSchema = z.object({
  date: dateSchema,
  cutoffAt: z.coerce.date(),
  pendingSaleCount: z.coerce.number().int().nonnegative().max(50_000),
});

const overrideReadinessSchema = z.object({
  date: dateSchema,
  terminalIds: z.array(z.string().trim().min(1)).min(1),
  reason: z
    .string()
    .trim()
    .min(5, "Enter a reason for overriding terminal readiness.")
    .max(500),
});

const reopenSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(5, "Enter a reason for reopening this business day.")
    .max(500),
});

const actorSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
} as const;

const dayCloseInclude = {
  submittedBy: { select: actorSelect },
  reviewedBy: { select: actorSelect },
  businessDayState: {
    include: {
      reopenedBy: { select: actorSelect },
      terminalReadiness: {
        include: {
          terminal: { select: { id: true, name: true, lastSyncedAt: true } },
          overriddenBy: { select: actorSelect },
        },
        orderBy: { terminal: { name: "asc" } },
      },
    },
  },
} satisfies Prisma.SalesDayCloseInclude;

const readinessInclude = {
  terminal: { select: { id: true, name: true, lastSyncedAt: true } },
  overriddenBy: { select: actorSelect },
} satisfies Prisma.PosTerminalDayCloseReadinessInclude;

type TerminalReadinessWithIncludes =
  Prisma.PosTerminalDayCloseReadinessGetPayload<{
    include: typeof readinessInclude;
  }>;

type DayCloseWithIncludes = Prisma.SalesDayCloseGetPayload<{
  include: typeof dayCloseInclude;
}>;

type ExpectedDayCloseTotals = {
  salesCount: number;
  expectedCash: number;
  expectedTransfer: number;
  expectedPos: number;
  creditTotal: number;
  damagedQuantity: number;
  returnedQuantity: number;
};

function isTerminalReady(row: TerminalReadinessWithIncludes) {
  return Boolean(
    row.overriddenAt ||
      (row.confirmedAt &&
        row.syncedThroughAt &&
        row.syncedThroughAt.getTime() >= row.cutoffAt.getTime() &&
        row.pendingSaleCount === 0),
  );
}

function serializeTerminalReadiness(row: TerminalReadinessWithIncludes) {
  return {
    id: row.id,
    businessDate: row.businessDate.toISOString(),
    cutoffAt: row.cutoffAt.toISOString(),
    terminal: {
      ...row.terminal,
      lastSyncedAt: row.terminal.lastSyncedAt?.toISOString() ?? null,
    },
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
    syncedThroughAt: row.syncedThroughAt?.toISOString() ?? null,
    pendingSaleCount: row.pendingSaleCount,
    overriddenAt: row.overriddenAt?.toISOString() ?? null,
    overriddenBy: row.overriddenBy,
    overrideReason: row.overrideReason,
    ready: isTerminalReady(row),
  };
}

function readinessSummary(rows: TerminalReadinessWithIncludes[]) {
  const serialized = rows.map(serializeTerminalReadiness);

  return {
    required: serialized.length,
    ready: serialized.filter((entry) => entry.ready).length,
    pending: serialized.filter((entry) => !entry.ready).length,
    terminals: serialized,
  };
}

function moneyString(value: number) {
  return (Math.round((value + Number.EPSILON) * 100) / 100).toFixed(2);
}

function serializeBusinessDayState(
  state: DayCloseWithIncludes["businessDayState"],
) {
  return {
    status: state.status,
    activityVersion: state.activityVersion,
    lastActivityAt: state.lastActivityAt?.toISOString() ?? null,
    closeCutoffAt: state.closeCutoffAt?.toISOString() ?? null,
    reopenedAt: state.reopenedAt?.toISOString() ?? null,
    reopenedBy: state.reopenedBy,
    reopenReason: state.reopenReason,
    terminalReadiness: readinessSummary(state.terminalReadiness ?? []),
  };
}

function serializeDayClose(close: DayCloseWithIncludes) {
  return {
    id: close.id,
    businessDate: close.businessDate.toISOString(),
    salesCount: close.salesCount,
    expectedCash: close.expectedCash.toString(),
    expectedTransfer: close.expectedTransfer.toString(),
    expectedPos: close.expectedPos.toString(),
    creditTotal: close.creditTotal.toString(),
    countedCash: close.countedCash.toString(),
    cashVariance: close.cashVariance.toString(),
    damagedQuantity: close.damagedQuantity,
    returnedQuantity: close.returnedQuantity,
    notes: close.notes,
    status: close.status,
    submittedActivityVersion: close.submittedActivityVersion,
    businessDay: serializeBusinessDayState(close.businessDayState),
    submittedAt: close.submittedAt.toISOString(),
    submittedBy: close.submittedBy,
    reviewedAt: close.reviewedAt?.toISOString() ?? null,
    reviewedBy: close.reviewedBy,
    reviewNotes: close.reviewNotes,
  };
}

function moneyEquals(stored: Prisma.Decimal, expected: number) {
  return Number(stored.toString()) === Number(moneyString(expected));
}

function closeMatchesExpected(
  close: DayCloseWithIncludes,
  expected: ExpectedDayCloseTotals,
) {
  return (
    close.salesCount === expected.salesCount &&
    moneyEquals(close.expectedCash, expected.expectedCash) &&
    moneyEquals(close.expectedTransfer, expected.expectedTransfer) &&
    moneyEquals(close.expectedPos, expected.expectedPos) &&
    moneyEquals(close.creditTotal, expected.creditTotal) &&
    close.damagedQuantity === expected.damagedQuantity &&
    close.returnedQuantity === expected.returnedQuantity
  );
}

function expectedPayload(expected: ExpectedDayCloseTotals) {
  return {
    salesCount: expected.salesCount,
    expectedCash: moneyString(expected.expectedCash),
    expectedTransfer: moneyString(expected.expectedTransfer),
    expectedPos: moneyString(expected.expectedPos),
    creditTotal: moneyString(expected.creditTotal),
    damagedQuantity: expected.damagedQuantity,
    returnedQuantity: expected.returnedQuantity,
  };
}

@Injectable()
export class DayCloseService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private unresolvedOfflineSyncCount(client: Prisma.TransactionClient) {
    return client.posOfflineSyncAttempt.count({
      where: {
        status: {
          in: [PosOfflineSyncStatus.CONFLICT, PosOfflineSyncStatus.FAILED],
        },
        terminal: { isActive: true },
      },
    });
  }

  private async terminalReadiness(
    client: Prisma.TransactionClient,
    businessDate: Date,
  ): Promise<TerminalReadinessWithIncludes[]> {
    const rows = await client.posTerminalDayCloseReadiness.findMany({
      where: { businessDate },
      orderBy: { terminalId: "asc" },
    });
    const result: TerminalReadinessWithIncludes[] = [];

    // Prisma's query-based relation loader can overlap reads on one pg
    // transaction client. Resolve these small readiness relations explicitly
    // and sequentially so the same code is safe inside and outside a lock.
    for (const row of rows) {
      const terminal = await client.posTerminal.findUniqueOrThrow({
        where: { id: row.terminalId },
        select: { id: true, name: true, lastSyncedAt: true },
      });
      const overriddenBy = row.overriddenById
        ? await client.user.findUnique({
            where: { id: row.overriddenById },
            select: actorSelect,
          })
        : null;

      result.push({ ...row, terminal, overriddenBy });
    }

    return result.sort((left, right) => {
      const byName = (left.terminal.name ?? "").localeCompare(
        right.terminal.name ?? "",
      );
      return byName || left.terminalId.localeCompare(right.terminalId);
    });
  }

  private async assertTerminalsReady(
    client: Prisma.TransactionClient,
    businessDate: Date,
  ) {
    const rows = await this.terminalReadiness(client, businessDate);
    const pending = rows.filter((row) => !isTerminalReady(row));

    if (pending.length > 0) {
      const names = pending
        .map((row) => row.terminal.name || row.terminal.id)
        .join(", ");
      throw new ConflictException(
        `${pending.length} POS terminal(s) have not confirmed an empty queue through the close cutoff: ${names}. Sync them or ask Management to record an override.`,
      );
    }

    return rows;
  }

  async prepare(input: unknown, actor: AuthenticatedUser) {
    const parsed = prepareSchema.safeParse(input);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message);
    }

    const outcome = await this.prisma.$transaction(
      async (tx) => {
        const businessDate = businessDateFromString(parsed.data.date);
        const state = await lockBusinessDayState(tx, businessDate);

        if (state.status === BusinessDayStatus.APPROVED) {
          throw new ConflictException(
            "This business day is approved. Management must reopen it before another close can start.",
          );
        }

        if (state.status === BusinessDayStatus.SUBMITTED) {
          throw new ConflictException(
            "This business day has already been submitted to Management.",
          );
        }

        if (state.status === BusinessDayStatus.CLOSING && state.closeCutoffAt) {
          return {
            cutoffAt: state.closeCutoffAt,
            created: false,
          };
        }

        const cutoffAt = new Date();
        const terminals = await tx.posTerminal.findMany({
          where: {
            isActive: true,
            offlineEnabled: true,
            pairedAt: { not: null },
            deviceSecretHash: { not: null },
          },
          select: { id: true },
          orderBy: { id: "asc" },
        });

        await tx.posTerminalDayCloseReadiness.deleteMany({
          where: { businessDate },
        });

        if (terminals.length > 0) {
          await tx.posTerminalDayCloseReadiness.createMany({
            data: terminals.map((terminal) => ({
              businessDate,
              terminalId: terminal.id,
              cutoffAt,
            })),
          });
        }

        const updated = await tx.businessDayState.updateMany({
          where: {
            businessDate,
            activityVersion: state.activityVersion,
            status: state.status,
          },
          data: {
            status: BusinessDayStatus.CLOSING,
            closeCutoffAt: cutoffAt,
          },
        });

        if (updated.count === 0) {
          throw new ConflictException(
            "Activity changed while the close was starting. Refresh and try again.",
          );
        }

        return {
          cutoffAt,
          created: true,
        };
      },
      { timeout: 15000, maxWait: 15000 },
    );
    const businessDate = businessDateFromString(parsed.data.date);
    const rows = await this.terminalReadiness(
      this.prisma as unknown as Prisma.TransactionClient,
      businessDate,
    );

    if (outcome.created) {
      await this.audit.record({
        actorId: actor.id,
        action: "SALES_DAY_CLOSE_STARTED",
        entityType: "BusinessDayState",
        entityId: parsed.data.date,
        metadata: {
          businessDate: parsed.data.date,
          cutoffAt: outcome.cutoffAt.toISOString(),
          terminalIds: rows.map((row) => row.terminalId),
        },
      });
    }

    return {
      date: parsed.data.date,
      status: BusinessDayStatus.CLOSING,
      cutoffAt: outcome.cutoffAt.toISOString(),
      terminalReadiness: readinessSummary(rows),
    };
  }

  async confirmTerminalReadiness(
    terminalId: string,
    input: unknown,
    actor: AuthenticatedUser,
  ) {
    const parsed = terminalConfirmationSchema.safeParse(input);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message);
    }

    if (parsed.data.pendingSaleCount !== 0) {
      throw new ConflictException(
        "This terminal still has pending offline sales. Sync or reconcile them before confirming day close readiness.",
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const businessDate = businessDateFromString(parsed.data.date);
      const state = await lockBusinessDayState(tx, businessDate);

      if (
        state.status !== BusinessDayStatus.CLOSING ||
        !state.closeCutoffAt ||
        state.closeCutoffAt.getTime() !== parsed.data.cutoffAt.getTime()
      ) {
        throw new ConflictException(
          "This day-close cutoff is no longer active. Refresh the terminal snapshot.",
        );
      }

      const readiness = await tx.posTerminalDayCloseReadiness.findUnique({
        where: { businessDate_terminalId: { businessDate, terminalId } },
      });

      if (!readiness || readiness.cutoffAt.getTime() !== state.closeCutoffAt.getTime()) {
        throw new ConflictException(
          "This terminal is not part of the active day-close cutoff.",
        );
      }

      const unresolved = await tx.posOfflineSyncAttempt.count({
        where: {
          terminalId,
          status: {
            in: [PosOfflineSyncStatus.CONFLICT, PosOfflineSyncStatus.FAILED],
          },
        },
      });

      if (unresolved > 0) {
        throw new ConflictException(
          `${unresolved} offline sale(s) from this terminal still require reconciliation.`,
        );
      }

      const confirmedAt = new Date();
      const row = await tx.posTerminalDayCloseReadiness.update({
        where: { id: readiness.id },
        data: {
          confirmedAt,
          syncedThroughAt: confirmedAt,
          pendingSaleCount: 0,
        },
        include: readinessInclude,
      });
      await tx.posTerminal.update({
        where: { id: terminalId },
        data: { lastSeenAt: confirmedAt, lastSyncedAt: confirmedAt },
      });

      return row;
    });

    await this.audit.record({
      actorId: actor.id,
      action: "POS_TERMINAL_DAY_CLOSE_CONFIRMED",
      entityType: "PosTerminalDayCloseReadiness",
      entityId: result.id,
      metadata: {
        businessDate: parsed.data.date,
        terminalId,
        cutoffAt: result.cutoffAt.toISOString(),
        pendingSaleCount: 0,
      },
    });

    return serializeTerminalReadiness(result);
  }

  async overrideTerminalReadiness(input: unknown, actor: AuthenticatedUser) {
    const parsed = overrideReadinessSchema.safeParse(input);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message);
    }

    const terminalIds = [...new Set(parsed.data.terminalIds)];
    const rows = await this.prisma.$transaction(async (tx) => {
      const businessDate = businessDateFromString(parsed.data.date);
      const state = await lockBusinessDayState(tx, businessDate);

      if (state.status !== BusinessDayStatus.CLOSING) {
        throw new ConflictException(
          "Terminal readiness can only be overridden while a day close is waiting for terminal synchronization.",
        );
      }

      const targets = await tx.posTerminalDayCloseReadiness.findMany({
        where: { businessDate, terminalId: { in: terminalIds } },
        select: { id: true, terminalId: true },
      });

      if (targets.length !== terminalIds.length) {
        throw new BadRequestException(
          "One or more selected terminals do not belong to this day-close cutoff.",
        );
      }

      const overriddenAt = new Date();
      await tx.posTerminalDayCloseReadiness.updateMany({
        where: { id: { in: targets.map((target) => target.id) } },
        data: {
          overriddenAt,
          overriddenById: actor.id,
          overrideReason: parsed.data.reason,
        },
      });

      return this.terminalReadiness(tx, businessDate);
    });

    await this.audit.record({
      actorId: actor.id,
      action: "MANAGEMENT_DAY_CLOSE_TERMINALS_OVERRIDDEN",
      entityType: "BusinessDayState",
      entityId: parsed.data.date,
      metadata: {
        businessDate: parsed.data.date,
        terminalIds,
        reason: parsed.data.reason,
      },
    });

    return {
      date: parsed.data.date,
      terminalReadiness: readinessSummary(rows),
    };
  }

  private async computeExpected(
    client: Prisma.TransactionClient,
    dateInput: string,
  ) {
    const { start, end } = toDayRange(dateInput);
    // A TransactionClient owns one PostgreSQL connection. Keep these reads
    // sequential so pg never receives overlapping queries on that connection.
    const sales = await client.sale.findMany({
      where: { soldAt: { gte: start, lt: end } },
      select: {
        paymentMethod: true,
        amountPaid: true,
        balanceDue: true,
        retailerPaymentAllocations: { select: { amount: true } },
      },
    });
    const returns = await client.salesProductReturn.findMany({
      where: { recordedAt: { gte: start, lt: end } },
      select: { disposition: true, quantity: true },
    });
    const retailerPayments = await client.retailerPayment.findMany({
      where: { paidAt: { gte: start, lt: end } },
      select: { paymentMethod: true, amount: true },
    });

    const takingsByMethod = new Map<PaymentMethod, number>();

    for (const sale of sales) {
      const settledAfterSale = sale.retailerPaymentAllocations.reduce(
        (sum, allocation) => sum + decimalToNumber(allocation.amount),
        0,
      );
      const paidAtSale = Math.max(
        decimalToNumber(sale.amountPaid) - settledAfterSale,
        0,
      );
      takingsByMethod.set(
        sale.paymentMethod,
        (takingsByMethod.get(sale.paymentMethod) ?? 0) + paidAtSale,
      );
    }

    for (const payment of retailerPayments) {
      takingsByMethod.set(
        payment.paymentMethod,
        (takingsByMethod.get(payment.paymentMethod) ?? 0) +
          decimalToNumber(payment.amount),
      );
    }

    return {
      salesCount: sales.length,
      expectedCash: takingsByMethod.get(PaymentMethod.CASH) ?? 0,
      expectedTransfer: takingsByMethod.get(PaymentMethod.TRANSFER) ?? 0,
      expectedPos: takingsByMethod.get(PaymentMethod.POS) ?? 0,
      creditTotal: sales.reduce(
        (sum, sale) =>
          sum +
          decimalToNumber(sale.balanceDue) +
          sale.retailerPaymentAllocations.reduce(
            (allocationSum, allocation) =>
              allocationSum + decimalToNumber(allocation.amount),
            0,
          ),
        0,
      ),
      damagedQuantity: returns
        .filter(
          (entry) => entry.disposition === SalesReturnDisposition.DAMAGED,
        )
        .reduce((sum, entry) => sum + entry.quantity, 0),
      returnedQuantity: returns
        .filter(
          (entry) =>
            entry.disposition === SalesReturnDisposition.RETURN_TO_STOCK,
        )
        .reduce((sum, entry) => sum + entry.quantity, 0),
    };
  }

  async preview(dateInput?: string) {
    const parsed = dateSchema.safeParse(
      dateInput ?? new Date().toISOString().slice(0, 10),
    );

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message);
    }

    const client = this.prisma as unknown as Prisma.TransactionClient;
    const businessDate = businessDateFromString(parsed.data);
    // The pg adapter may reuse one client for these related reads. Keep them
    // sequential so a route refresh cannot issue overlapping client queries.
    const expected = await this.computeExpected(client, parsed.data);
    const close = await this.prisma.salesDayClose.findUnique({
      where: { businessDate },
      include: dayCloseInclude,
    });
    const state = await this.prisma.businessDayState.findUnique({
      where: { businessDate },
    });
    const terminalReadiness = state
      ? await this.terminalReadiness(client, businessDate)
      : [];
    const unresolvedOfflineSyncs = await this.unresolvedOfflineSyncCount(client);
    const businessDayStatus = state?.status ?? BusinessDayStatus.OPEN;
    const activityVersion = state?.activityVersion ?? 0;

    return {
      date: parsed.data,
      expected: expectedPayload(expected),
      close: close ? serializeDayClose(close) : null,
      businessDay: {
        status: businessDayStatus,
        activityVersion,
        lastActivityAt: state?.lastActivityAt?.toISOString() ?? null,
        closeCutoffAt: state?.closeCutoffAt?.toISOString() ?? null,
        terminalReadiness: readinessSummary(terminalReadiness),
      },
      needsReclose: close
        ? businessDayStatus === BusinessDayStatus.STALE ||
          businessDayStatus === BusinessDayStatus.OPEN ||
          close.submittedActivityVersion !== activityVersion ||
          !closeMatchesExpected(close, expected)
        : false,
      unresolvedOfflineSyncs,
    };
  }

  async submit(input: unknown, actor: AuthenticatedUser) {
    const parsed = submitSchema.safeParse(input);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message);
    }

    const outcome = await this.prisma.$transaction(
      async (tx) => {
        const businessDate = businessDateFromString(parsed.data.date);
        const state = await lockBusinessDayState(tx, businessDate);
        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "SalesDayClose" WHERE "businessDate" = ${businessDate} FOR UPDATE`,
        );
        const existingClose = await tx.salesDayClose.findUnique({
          where: { businessDate },
          include: dayCloseInclude,
        });

        if (state.status === BusinessDayStatus.APPROVED) {
          throw new ConflictException(
            "This day has already been approved by Management. Management must reopen it before Sales can submit another close.",
          );
        }

        if (
          existingClose?.status === DayCloseStatus.APPROVED &&
          !state.reopenedAt
        ) {
          throw new ConflictException(
            "This day has already been approved by Management. Management must reopen it before Sales can submit another close.",
          );
        }

        if (
          state.status !== BusinessDayStatus.CLOSING ||
          !state.closeCutoffAt
        ) {
          throw new ConflictException(
            "Start the day-close cutoff and synchronize all required POS terminals before submitting the drawer count.",
          );
        }

        await this.assertTerminalsReady(tx, businessDate);

        const unresolvedOfflineSyncs = await this.unresolvedOfflineSyncCount(tx);

        if (unresolvedOfflineSyncs > 0) {
          throw new ConflictException(
            `${unresolvedOfflineSyncs} offline sale(s) have not synced cleanly. Resolve them in Admin > POS sync before closing the day.`,
          );
        }

        const expected = await this.computeExpected(tx, parsed.data.date);
        const countedCash = Number(moneyString(parsed.data.countedCash));
        const cashVariance = countedCash - expected.expectedCash;
        const submittedAt = new Date();
        const closeData = {
          ...expectedPayload(expected),
          expectedCash: new Prisma.Decimal(moneyString(expected.expectedCash)),
          expectedTransfer: new Prisma.Decimal(
            moneyString(expected.expectedTransfer),
          ),
          expectedPos: new Prisma.Decimal(moneyString(expected.expectedPos)),
          creditTotal: new Prisma.Decimal(moneyString(expected.creditTotal)),
          countedCash: new Prisma.Decimal(moneyString(countedCash)),
          cashVariance: new Prisma.Decimal(moneyString(cashVariance)),
          notes: parsed.data.notes || null,
          status: DayCloseStatus.SUBMITTED,
          submittedActivityVersion: state.activityVersion,
          submittedAt,
          submittedById: actor.id,
          reviewedAt: null,
          reviewedById: null,
          reviewNotes: null,
        };
        let action = "SALES_DAY_CLOSED";

        if (existingClose) {
          const updated = await tx.salesDayClose.updateMany({
            where: {
              id: existingClose.id,
              status: existingClose.status,
              submittedActivityVersion:
                existingClose.submittedActivityVersion,
            },
            data: closeData,
          });

          if (updated.count === 0) {
            throw new ConflictException(
              "This close was updated by another user. Refresh and review it before trying again.",
            );
          }

          action = "SALES_DAY_CLOSE_UPDATED";
        } else {
          try {
            await tx.salesDayClose.create({
              data: { ...closeData, businessDate },
            });
          } catch (error) {
            if (
              error instanceof Prisma.PrismaClientKnownRequestError &&
              error.code === "P2002"
            ) {
              throw new ConflictException(
                "This day has just been closed by another user. Refresh and review the submitted close.",
              );
            }

            throw error;
          }
        }

        const stateUpdated = await tx.businessDayState.updateMany({
          where: {
            businessDate,
            activityVersion: state.activityVersion,
            status: state.status,
          },
          data: {
            status: BusinessDayStatus.SUBMITTED,
          },
        });

        if (stateUpdated.count === 0) {
          throw new ConflictException(
            "Activity was recorded while this close was being submitted. Refresh, recount, and submit again.",
          );
        }

        const close = await tx.salesDayClose.findUniqueOrThrow({
          where: { businessDate },
          include: dayCloseInclude,
        });

        return { close, action };
      },
      { timeout: 15000, maxWait: 15000 },
    );

    await this.audit.record({
      actorId: actor.id,
      action: outcome.action,
      entityType: "SalesDayClose",
      entityId: outcome.close.id,
      metadata: {
        businessDate: parsed.data.date,
        activityVersion: outcome.close.submittedActivityVersion,
        expectedCash: outcome.close.expectedCash.toString(),
        countedCash: outcome.close.countedCash.toString(),
        cashVariance: outcome.close.cashVariance.toString(),
      },
    });

    return serializeDayClose(outcome.close);
  }

  async listForRange(from?: string, to?: string) {
    const range = getReportRange(from, to);
    const closes = await this.prisma.salesDayClose.findMany({
      where: { businessDate: { gte: range.start, lt: range.end } },
      include: dayCloseInclude,
      orderBy: { businessDate: "desc" },
    });
    const preparations = await this.prisma.businessDayState.findMany({
      where: {
        businessDate: { gte: range.start, lt: range.end },
        status: BusinessDayStatus.CLOSING,
      },
      include: {
        terminalReadiness: {
          include: readinessInclude,
          orderBy: [{ terminal: { name: "asc" } }, { terminalId: "asc" }],
        },
      },
      orderBy: { businessDate: "desc" },
    });

    return {
      range: serializeReportRange(range),
      closes: closes.map(serializeDayClose),
      preparations: preparations.map((state) => ({
        businessDate: state.businessDate.toISOString(),
        status: state.status,
        cutoffAt: state.closeCutoffAt?.toISOString() ?? null,
        terminalReadiness: readinessSummary(state.terminalReadiness),
      })),
    };
  }

  async approve(id: string, input: unknown, actor: AuthenticatedUser) {
    const parsed = approveSchema.safeParse(input ?? {});

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message);
    }

    const target = await this.prisma.salesDayClose.findUnique({
      where: { id },
      select: { businessDate: true },
    });

    if (!target) {
      throw new NotFoundException("Day close not found.");
    }

    const outcome = await this.prisma.$transaction(
      async (tx) => {
        const state = await lockBusinessDayState(tx, target.businessDate);
        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "SalesDayClose" WHERE "id" = ${id} FOR UPDATE`,
        );
        const close = await tx.salesDayClose.findUnique({
          where: { id },
          include: dayCloseInclude,
        });

        if (!close) {
          throw new NotFoundException("Day close not found.");
        }

        if (
          close.status !== DayCloseStatus.SUBMITTED ||
          state.status !== BusinessDayStatus.SUBMITTED
        ) {
          throw new ConflictException(
            "This close is no longer awaiting approval. Refresh and review its current state.",
          );
        }


        await this.assertTerminalsReady(tx, close.businessDate);

        const date = close.businessDate.toISOString().slice(0, 10);
        const expected = await this.computeExpected(tx, date);
        const unresolvedOfflineSyncs = await this.unresolvedOfflineSyncCount(tx);
        const isStale =
          unresolvedOfflineSyncs > 0 ||
          close.submittedActivityVersion !== state.activityVersion ||
          !closeMatchesExpected(close, expected);

        if (isStale) {
          await tx.businessDayState.updateMany({
            where: {
              businessDate: close.businessDate,
              status: BusinessDayStatus.SUBMITTED,
            },
            data: { status: BusinessDayStatus.STALE },
          });

          return { stale: true as const, close: null };
        }

        const reviewedAt = new Date();
        const approved = await tx.salesDayClose.updateMany({
          where: {
            id,
            status: DayCloseStatus.SUBMITTED,
            submittedActivityVersion: state.activityVersion,
          },
          data: {
            status: DayCloseStatus.APPROVED,
            reviewedAt,
            reviewedById: actor.id,
            reviewNotes: parsed.data.notes || null,
          },
        });

        if (approved.count === 0) {
          throw new ConflictException(
            "This close was updated while it was being approved. Refresh and review it again.",
          );
        }

        const stateApproved = await tx.businessDayState.updateMany({
          where: {
            businessDate: close.businessDate,
            status: BusinessDayStatus.SUBMITTED,
            activityVersion: state.activityVersion,
          },
          data: { status: BusinessDayStatus.APPROVED },
        });

        if (stateApproved.count === 0) {
          throw new ConflictException(
            "Activity was recorded while this close was being approved. Refresh and review it again.",
          );
        }

        return {
          stale: false as const,
          close: await tx.salesDayClose.findUniqueOrThrow({
            where: { id },
            include: dayCloseInclude,
          }),
        };
      },
      { timeout: 15000, maxWait: 15000 },
    );

    if (outcome.stale) {
      throw new ConflictException(
        "This close is stale because financial activity changed after submission. Sales must recount and submit it again.",
      );
    }

    await this.audit.record({
      actorId: actor.id,
      action: "MANAGEMENT_DAY_CLOSE_APPROVED",
      entityType: "SalesDayClose",
      entityId: outcome.close.id,
      metadata: {
        businessDate: outcome.close.businessDate.toISOString().slice(0, 10),
        activityVersion: outcome.close.submittedActivityVersion,
        cashVariance: outcome.close.cashVariance.toString(),
      },
    });

    return serializeDayClose(outcome.close);
  }

  async reopen(id: string, input: unknown, actor: AuthenticatedUser) {
    const parsed = reopenSchema.safeParse(input);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message);
    }

    const target = await this.prisma.salesDayClose.findUnique({
      where: { id },
      select: { businessDate: true },
    });

    if (!target) {
      throw new NotFoundException("Day close not found.");
    }

    const close = await this.prisma.$transaction(
      async (tx) => {
        const state = await lockBusinessDayState(tx, target.businessDate);
        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "SalesDayClose" WHERE "id" = ${id} FOR UPDATE`,
        );
        const currentClose = await tx.salesDayClose.findUnique({
          where: { id },
        });

        if (
          !currentClose ||
          currentClose.status !== DayCloseStatus.APPROVED ||
          state.status !== BusinessDayStatus.APPROVED
        ) {
          throw new ConflictException(
            "Only an approved business day can be reopened.",
          );
        }

        const reopenedAt = new Date();
        const reopened = await tx.businessDayState.updateMany({
          where: {
            businessDate: target.businessDate,
            status: BusinessDayStatus.APPROVED,
            activityVersion: state.activityVersion,
          },
          data: {
            status: BusinessDayStatus.OPEN,
            activityVersion: { increment: 1 },
            closeCutoffAt: null,
            reopenedAt,
            reopenedById: actor.id,
            reopenReason: parsed.data.reason,
          },
        });

        if (reopened.count === 0) {
          throw new ConflictException(
            "This business day changed while it was being reopened. Refresh and try again.",
          );
        }

        return tx.salesDayClose.findUniqueOrThrow({
          where: { id },
          include: dayCloseInclude,
        });
      },
      { timeout: 15000, maxWait: 15000 },
    );

    await this.audit.record({
      actorId: actor.id,
      action: "MANAGEMENT_DAY_REOPENED",
      entityType: "SalesDayClose",
      entityId: close.id,
      metadata: {
        businessDate: close.businessDate.toISOString().slice(0, 10),
        reason: parsed.data.reason,
        activityVersion: close.businessDayState.activityVersion,
      },
    });

    return serializeDayClose(close);
  }
}
