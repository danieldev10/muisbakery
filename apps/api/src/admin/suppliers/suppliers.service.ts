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

const optionalText = z.string().trim().max(200).optional();

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  contactName: optionalText,
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().toLowerCase().email().optional().or(z.literal("")),
  address: optionalText,
  notes: z.string().trim().max(500).optional(),
});

const updateSchema = createSchema
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .refine((value) => Object.keys(value).length > 0, {
    message: "No changes provided.",
  });

function normalize<T extends { email?: string }>(data: T) {
  return { ...data, email: data.email === "" ? undefined : data.email };
}

@Injectable()
export class SuppliersService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.supplier.findMany({ orderBy: { name: "asc" } });
  }

  async create(input: unknown, actor: AuthenticatedUser) {
    const parsed = createSchema.safeParse(input);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message);
    }

    const existing = await this.prisma.supplier.findUnique({
      where: { name: parsed.data.name },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException("A supplier with that name exists.");
    }

    const supplier = await this.prisma.supplier.create({
      data: normalize(parsed.data),
    });

    await this.audit.record({
      actorId: actor.id,
      action: "ADMIN_SUPPLIER_CREATED",
      entityType: "Supplier",
      entityId: supplier.id,
      metadata: { name: supplier.name },
    });

    return supplier;
  }

  async update(id: string, input: unknown, actor: AuthenticatedUser) {
    const parsed = updateSchema.safeParse(input);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message);
    }

    const target = await this.prisma.supplier.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!target) {
      throw new NotFoundException("Supplier not found.");
    }

    if (parsed.data.name) {
      const clash = await this.prisma.supplier.findFirst({
        where: { name: parsed.data.name, NOT: { id } },
        select: { id: true },
      });

      if (clash) {
        throw new ConflictException("A supplier with that name exists.");
      }
    }

    const supplier = await this.prisma.supplier.update({
      where: { id },
      data: normalize(parsed.data),
    });

    await this.audit.record({
      actorId: actor.id,
      action: "ADMIN_SUPPLIER_UPDATED",
      entityType: "Supplier",
      entityId: supplier.id,
      metadata: { isActive: supplier.isActive },
    });

    return supplier;
  }
}
