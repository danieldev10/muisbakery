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
    include: { reopenedBy: { select: actorSelect } },
  },
} satisfies Prisma.SalesDayCloseInclude;

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

  private async computeExpected(
    client: Prisma.TransactionClient,
    dateInput: string,
  ) {
    const { start, end } = toDayRange(dateInput);
    const [sales, returns, retailerPayments] = await Promise.all([
      client.sale.findMany({
        where: { soldAt: { gte: start, lt: end } },
        select: {
          paymentMethod: true,
          amountPaid: true,
          balanceDue: true,
          retailerPaymentAllocations: { select: { amount: true } },
        },
      }),
      client.salesProductReturn.findMany({
        where: { recordedAt: { gte: start, lt: end } },
        select: { disposition: true, quantity: true },
      }),
      client.retailerPayment.findMany({
        where: { paidAt: { gte: start, lt: end } },
        select: { paymentMethod: true, amount: true },
      }),
    ]);

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
    const [expected, close, state, unresolvedOfflineSyncs] = await Promise.all([
      this.computeExpected(client, parsed.data),
      this.prisma.salesDayClose.findUnique({
        where: { businessDate },
        include: dayCloseInclude,
      }),
      this.prisma.businessDayState.findUnique({ where: { businessDate } }),
      this.unresolvedOfflineSyncCount(client),
    ]);
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
            closeCutoffAt: submittedAt,
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

    return {
      range: serializeReportRange(range),
      closes: closes.map(serializeDayClose),
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

        const date = close.businessDate.toISOString().slice(0, 10);
        const [expected, unresolvedOfflineSyncs] = await Promise.all([
          this.computeExpected(tx, date),
          this.unresolvedOfflineSyncCount(tx),
        ]);
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
