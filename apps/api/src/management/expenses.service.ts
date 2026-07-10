import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PaymentMethod, Prisma } from "@prisma/client";
import { z } from "zod";

import { AuditService } from "../audit/audit.service";
import type { AuthenticatedUser } from "../auth/auth.types";
import { PrismaService } from "../database/prisma.service";
import { getMonthRange, serializeMonth } from "./month-range";

const createExpenseSchema = z.object({
  categoryId: z.string().trim().min(1, "Category is required."),
  amount: z.coerce
    .number({ message: "Amount is required." })
    .positive("Amount must be greater than zero.")
    .max(99_999_999),
  incurredAt: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must use YYYY-MM-DD format."),
  vendor: z.string().trim().max(120).optional(),
  paymentMethod: z.nativeEnum(PaymentMethod).default(PaymentMethod.CASH),
  notes: z.string().trim().max(500).optional(),
});

const voidExpenseSchema = z.object({
  reason: z.string().trim().min(3, "A void reason is required.").max(300),
});

const expenseInclude = {
  category: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true, email: true, role: true } },
  voidedBy: { select: { id: true, name: true, email: true, role: true } },
} satisfies Prisma.ExpenseInclude;

type ExpenseWithIncludes = Prisma.ExpenseGetPayload<{
  include: typeof expenseInclude;
}>;

function moneyString(value: number) {
  return (Math.round((value + Number.EPSILON) * 100) / 100).toFixed(2);
}

function serializeExpense(expense: ExpenseWithIncludes) {
  return {
    id: expense.id,
    amount: expense.amount.toString(),
    incurredAt: expense.incurredAt.toISOString(),
    vendor: expense.vendor,
    paymentMethod: expense.paymentMethod,
    notes: expense.notes,
    createdAt: expense.createdAt.toISOString(),
    category: expense.category,
    createdBy: expense.createdBy,
    voidedAt: expense.voidedAt?.toISOString() ?? null,
    voidedBy: expense.voidedBy,
    voidReason: expense.voidReason,
  };
}

@Injectable()
export class ExpensesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async list(month?: string) {
    const range = getMonthRange(month);

    const [expenses, categories] = await Promise.all([
      this.prisma.expense.findMany({
        where: {
          incurredAt: { gte: range.start, lt: range.end },
        },
        include: expenseInclude,
        orderBy: [{ incurredAt: "desc" }, { createdAt: "desc" }],
      }),
      this.prisma.expenseCategory.findMany({
        where: { isActive: true },
        select: { id: true, name: true, description: true },
        orderBy: { name: "asc" },
      }),
    ]);

    const active = expenses.filter((expense) => !expense.voidedAt);
    const totalAmount = active.reduce(
      (sum, expense) => sum + Number(expense.amount),
      0,
    );

    const byCategory = new Map<
      string,
      { category: { id: string; name: string }; count: number; amount: number }
    >();

    for (const expense of active) {
      const entry = byCategory.get(expense.category.id) ?? {
        category: expense.category,
        count: 0,
        amount: 0,
      };
      entry.count += 1;
      entry.amount += Number(expense.amount);
      byCategory.set(expense.category.id, entry);
    }

    return {
      month: serializeMonth(range),
      summary: {
        count: active.length,
        voidedCount: expenses.length - active.length,
        totalAmount: moneyString(totalAmount),
        byCategory: [...byCategory.values()]
          .sort((a, b) => b.amount - a.amount)
          .map((entry) => ({
            category: entry.category,
            count: entry.count,
            amount: moneyString(entry.amount),
          })),
      },
      categories,
      expenses: expenses.map(serializeExpense),
    };
  }

  async create(input: unknown, actor: AuthenticatedUser) {
    const parsed = createExpenseSchema.safeParse(input);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message);
    }

    const incurredAt = new Date(`${parsed.data.incurredAt}T00:00:00.000Z`);

    if (Number.isNaN(incurredAt.getTime())) {
      throw new BadRequestException("Incurred date is not a valid date.");
    }

    const category = await this.prisma.expenseCategory.findUnique({
      where: { id: parsed.data.categoryId },
      select: { id: true, name: true, isActive: true },
    });

    if (!category) {
      throw new NotFoundException("Expense category not found.");
    }

    if (!category.isActive) {
      throw new BadRequestException(
        "That expense category has been deactivated.",
      );
    }

    const expense = await this.prisma.expense.create({
      data: {
        categoryId: category.id,
        amount: new Prisma.Decimal(moneyString(parsed.data.amount)),
        incurredAt,
        vendor: parsed.data.vendor || null,
        paymentMethod: parsed.data.paymentMethod,
        notes: parsed.data.notes || null,
        createdById: actor.id,
      },
      include: expenseInclude,
    });

    await this.audit.record({
      actorId: actor.id,
      action: "MANAGEMENT_EXPENSE_RECORDED",
      entityType: "Expense",
      entityId: expense.id,
      metadata: {
        category: category.name,
        amount: expense.amount.toString(),
        incurredAt: parsed.data.incurredAt,
      },
    });

    return serializeExpense(expense);
  }

  async void(id: string, input: unknown, actor: AuthenticatedUser) {
    const parsed = voidExpenseSchema.safeParse(input);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message);
    }

    const target = await this.prisma.expense.findUnique({
      where: { id },
      select: { id: true, voidedAt: true, amount: true },
    });

    if (!target) {
      throw new NotFoundException("Expense not found.");
    }

    if (target.voidedAt) {
      throw new ConflictException("That expense is already voided.");
    }

    const expense = await this.prisma.expense.update({
      where: { id },
      data: {
        voidedAt: new Date(),
        voidedById: actor.id,
        voidReason: parsed.data.reason,
      },
      include: expenseInclude,
    });

    await this.audit.record({
      actorId: actor.id,
      action: "MANAGEMENT_EXPENSE_VOIDED",
      entityType: "Expense",
      entityId: expense.id,
      metadata: {
        amount: expense.amount.toString(),
        reason: parsed.data.reason,
      },
    });

    return serializeExpense(expense);
  }
}
