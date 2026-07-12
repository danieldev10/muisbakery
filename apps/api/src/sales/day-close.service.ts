import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  DayCloseStatus,
  PaymentMethod,
  Prisma,
  SalesReturnDisposition,
} from "@prisma/client";
import { z } from "zod";

import { AuditService } from "../audit/audit.service";
import type { AuthenticatedUser } from "../auth/auth.types";
import { PrismaService } from "../database/prisma.service";
import { getMonthRange, serializeMonth } from "../management/month-range";
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

const dayCloseInclude = {
  submittedBy: { select: { id: true, name: true, email: true, role: true } },
  reviewedBy: { select: { id: true, name: true, email: true, role: true } },
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
    submittedAt: close.submittedAt.toISOString(),
    submittedBy: close.submittedBy,
    reviewedAt: close.reviewedAt?.toISOString() ?? null,
    reviewedBy: close.reviewedBy,
    reviewNotes: close.reviewNotes,
  };
}

// Compare numerically: Prisma Decimals drop trailing zeros on toString()
// ("6000", not "6000.00"), so string comparison would flag every
// round-amount close as stale.
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

@Injectable()
export class DayCloseService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /**
   * Expected totals are derived from what the system recorded for the day:
   * takings by payment method (sales plus retailer repayments), new credit
   * extended, and damaged/returned stock.
   */
  private async computeExpected(dateInput: string) {
    const { start, end } = toDayRange(dateInput);

    const [sales, returns, retailerPayments] = await Promise.all([
      this.prisma.sale.findMany({
        where: { soldAt: { gte: start, lt: end } },
        select: {
          paymentMethod: true,
          amountPaid: true,
          balanceDue: true,
        },
      }),
      this.prisma.salesProductReturn.findMany({
        where: { recordedAt: { gte: start, lt: end } },
        select: { disposition: true, quantity: true },
      }),
      this.prisma.retailerPayment.findMany({
        where: { paidAt: { gte: start, lt: end } },
        select: { paymentMethod: true, amount: true },
      }),
    ]);

    const takingsByMethod = new Map<PaymentMethod, number>();

    for (const sale of sales) {
      takingsByMethod.set(
        sale.paymentMethod,
        (takingsByMethod.get(sale.paymentMethod) ?? 0) +
          decimalToNumber(sale.amountPaid),
      );
    }

    for (const payment of retailerPayments) {
      takingsByMethod.set(
        payment.paymentMethod,
        (takingsByMethod.get(payment.paymentMethod) ?? 0) +
          decimalToNumber(payment.amount),
      );
    }

    const creditTotal = sales.reduce(
      (sum, sale) => sum + decimalToNumber(sale.balanceDue),
      0,
    );
    const damagedQuantity = returns
      .filter((entry) => entry.disposition === SalesReturnDisposition.DAMAGED)
      .reduce((sum, entry) => sum + entry.quantity, 0);
    const returnedQuantity = returns
      .filter(
        (entry) =>
          entry.disposition === SalesReturnDisposition.RETURN_TO_STOCK,
      )
      .reduce((sum, entry) => sum + entry.quantity, 0);

    return {
      salesCount: sales.length,
      expectedCash: takingsByMethod.get(PaymentMethod.CASH) ?? 0,
      expectedTransfer: takingsByMethod.get(PaymentMethod.TRANSFER) ?? 0,
      expectedPos: takingsByMethod.get(PaymentMethod.POS) ?? 0,
      creditTotal,
      damagedQuantity,
      returnedQuantity,
    };
  }

  async preview(dateInput?: string) {
    const parsed = dateSchema.safeParse(
      dateInput ?? new Date().toISOString().slice(0, 10),
    );

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message);
    }

    const [expected, close] = await Promise.all([
      this.computeExpected(parsed.data),
      this.prisma.salesDayClose.findUnique({
        where: { businessDate: new Date(`${parsed.data}T00:00:00.000Z`) },
        include: dayCloseInclude,
      }),
    ]);

    return {
      date: parsed.data,
      expected: {
        salesCount: expected.salesCount,
        expectedCash: moneyString(expected.expectedCash),
        expectedTransfer: moneyString(expected.expectedTransfer),
        expectedPos: moneyString(expected.expectedPos),
        creditTotal: moneyString(expected.creditTotal),
        damagedQuantity: expected.damagedQuantity,
        returnedQuantity: expected.returnedQuantity,
      },
      close: close ? serializeDayClose(close) : null,
      needsReclose: close ? !closeMatchesExpected(close, expected) : false,
    };
  }

  async submit(input: unknown, actor: AuthenticatedUser) {
    const parsed = submitSchema.safeParse(input);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message);
    }

    const expected = await this.computeExpected(parsed.data.date);
    const countedCash = Number(moneyString(parsed.data.countedCash));
    const cashVariance = countedCash - expected.expectedCash;
    const businessDate = new Date(`${parsed.data.date}T00:00:00.000Z`);
    const existingClose = await this.prisma.salesDayClose.findUnique({
      where: { businessDate },
      include: dayCloseInclude,
    });

    let close: DayCloseWithIncludes;

    if (existingClose) {
      if (existingClose.status === DayCloseStatus.APPROVED) {
        throw new ConflictException(
          "This day has already been approved by Management. Ask Management to reopen or review the exception.",
        );
      }

      close = await this.prisma.salesDayClose.update({
        where: { id: existingClose.id },
        data: {
          salesCount: expected.salesCount,
          expectedCash: new Prisma.Decimal(moneyString(expected.expectedCash)),
          expectedTransfer: new Prisma.Decimal(
            moneyString(expected.expectedTransfer),
          ),
          expectedPos: new Prisma.Decimal(moneyString(expected.expectedPos)),
          creditTotal: new Prisma.Decimal(moneyString(expected.creditTotal)),
          countedCash: new Prisma.Decimal(moneyString(countedCash)),
          cashVariance: new Prisma.Decimal(moneyString(cashVariance)),
          damagedQuantity: expected.damagedQuantity,
          returnedQuantity: expected.returnedQuantity,
          notes: parsed.data.notes || null,
          submittedAt: new Date(),
          submittedById: actor.id,
        },
        include: dayCloseInclude,
      });

      await this.audit.record({
        actorId: actor.id,
        action: "SALES_DAY_CLOSE_UPDATED",
        entityType: "SalesDayClose",
        entityId: close.id,
        metadata: {
          businessDate: parsed.data.date,
          expectedCash: close.expectedCash.toString(),
          countedCash: close.countedCash.toString(),
          cashVariance: close.cashVariance.toString(),
        },
      });

      return serializeDayClose(close);
    }

    try {
      close = await this.prisma.salesDayClose.create({
        data: {
          businessDate,
          salesCount: expected.salesCount,
          expectedCash: new Prisma.Decimal(moneyString(expected.expectedCash)),
          expectedTransfer: new Prisma.Decimal(
            moneyString(expected.expectedTransfer),
          ),
          expectedPos: new Prisma.Decimal(moneyString(expected.expectedPos)),
          creditTotal: new Prisma.Decimal(moneyString(expected.creditTotal)),
          countedCash: new Prisma.Decimal(moneyString(countedCash)),
          cashVariance: new Prisma.Decimal(moneyString(cashVariance)),
          damagedQuantity: expected.damagedQuantity,
          returnedQuantity: expected.returnedQuantity,
          notes: parsed.data.notes || null,
          submittedById: actor.id,
        },
        include: dayCloseInclude,
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

    await this.audit.record({
      actorId: actor.id,
      action: "SALES_DAY_CLOSED",
      entityType: "SalesDayClose",
      entityId: close.id,
      metadata: {
        businessDate: parsed.data.date,
        expectedCash: close.expectedCash.toString(),
        countedCash: close.countedCash.toString(),
        cashVariance: close.cashVariance.toString(),
      },
    });

    return serializeDayClose(close);
  }

  async listForMonth(month?: string) {
    const range = getMonthRange(month);

    const closes = await this.prisma.salesDayClose.findMany({
      where: {
        businessDate: { gte: range.start, lt: range.end },
      },
      include: dayCloseInclude,
      orderBy: { businessDate: "desc" },
    });

    return {
      month: serializeMonth(range),
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
      select: { id: true },
    });

    if (!target) {
      throw new NotFoundException("Day close not found.");
    }

    // Conditional update so two managers cannot both approve, mirroring the
    // material-request cancellation guard.
    const approved = await this.prisma.salesDayClose.updateMany({
      where: { id, status: DayCloseStatus.SUBMITTED },
      data: {
        status: DayCloseStatus.APPROVED,
        reviewedAt: new Date(),
        reviewedById: actor.id,
        reviewNotes: parsed.data.notes || null,
      },
    });

    if (approved.count === 0) {
      throw new ConflictException("This close has already been reviewed.");
    }

    const close = await this.prisma.salesDayClose.findUniqueOrThrow({
      where: { id },
      include: dayCloseInclude,
    });

    await this.audit.record({
      actorId: actor.id,
      action: "MANAGEMENT_DAY_CLOSE_APPROVED",
      entityType: "SalesDayClose",
      entityId: close.id,
      metadata: {
        businessDate: close.businessDate.toISOString().slice(0, 10),
        cashVariance: close.cashVariance.toString(),
      },
    });

    return serializeDayClose(close);
  }
}
