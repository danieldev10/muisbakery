import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { z } from "zod";

import { AuditService } from "../../audit/audit.service";
import type { AuthenticatedUser } from "../../auth/auth.types";
import { PrismaService } from "../../database/prisma.service";

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).optional(),
});

const updateSchema = createSchema
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .refine((value) => Object.keys(value).length > 0, {
    message: "No changes provided.",
  });

@Injectable()
export class ExpenseCategoriesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.expenseCategory.findMany({ orderBy: { name: "asc" } });
  }

  async create(input: unknown, actor: AuthenticatedUser) {
    const parsed = createSchema.safeParse(input);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message);
    }

    const existing = await this.prisma.expenseCategory.findUnique({
      where: { name: parsed.data.name },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException("That expense category already exists.");
    }

    const category = await this.prisma.expenseCategory.create({
      data: parsed.data,
    });

    await this.audit.record({
      actorId: actor.id,
      action: "ADMIN_EXPENSE_CATEGORY_CREATED",
      entityType: "ExpenseCategory",
      entityId: category.id,
      metadata: { name: category.name },
    });

    return category;
  }

  async update(id: string, input: unknown, actor: AuthenticatedUser) {
    const parsed = updateSchema.safeParse(input);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message);
    }

    const target = await this.prisma.expenseCategory.findUnique({
      where: { id },
    });

    if (!target) {
      throw new NotFoundException("Expense category not found.");
    }

    if (parsed.data.name) {
      const clash = await this.prisma.expenseCategory.findFirst({
        where: { name: parsed.data.name, NOT: { id } },
        select: { id: true },
      });

      if (clash) {
        throw new ConflictException("That expense category already exists.");
      }
    }

    const category = await this.prisma.expenseCategory.update({
      where: { id },
      data: parsed.data,
    });

    await this.audit.record({
      actorId: actor.id,
      action: "ADMIN_EXPENSE_CATEGORY_UPDATED",
      entityType: "ExpenseCategory",
      entityId: category.id,
      metadata: {
        isActive: category.isActive,
        before: {
          name: target.name,
          description: target.description,
          isActive: target.isActive,
        },
        after: {
          name: category.name,
          description: category.description,
          isActive: category.isActive,
        },
      },
    });

    return category;
  }
}
