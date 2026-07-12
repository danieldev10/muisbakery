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
  name: z.string().trim().min(1).max(60),
  abbreviation: z.string().trim().min(1).max(16),
});

const updateSchema = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    abbreviation: z.string().trim().min(1).max(16).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "No changes provided.",
  });

@Injectable()
export class UnitsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.unit.findMany({ orderBy: { name: "asc" } });
  }

  async create(input: unknown, actor: AuthenticatedUser) {
    const parsed = createSchema.safeParse(input);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message);
    }

    const existing = await this.prisma.unit.findUnique({
      where: { abbreviation: parsed.data.abbreviation },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException("A unit with that abbreviation exists.");
    }

    const unit = await this.prisma.unit.create({ data: parsed.data });

    await this.audit.record({
      actorId: actor.id,
      action: "ADMIN_UNIT_CREATED",
      entityType: "Unit",
      entityId: unit.id,
      metadata: { abbreviation: unit.abbreviation },
    });

    return unit;
  }

  async update(id: string, input: unknown, actor: AuthenticatedUser) {
    const parsed = updateSchema.safeParse(input);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message);
    }

    const target = await this.prisma.unit.findUnique({
      where: { id },
    });

    if (!target) {
      throw new NotFoundException("Unit not found.");
    }

    if (parsed.data.abbreviation) {
      const clash = await this.prisma.unit.findFirst({
        where: { abbreviation: parsed.data.abbreviation, NOT: { id } },
        select: { id: true },
      });

      if (clash) {
        throw new ConflictException("A unit with that abbreviation exists.");
      }
    }

    const unit = await this.prisma.unit.update({
      where: { id },
      data: parsed.data,
    });

    await this.audit.record({
      actorId: actor.id,
      action: "ADMIN_UNIT_UPDATED",
      entityType: "Unit",
      entityId: unit.id,
      metadata: {
        isActive: unit.isActive,
        before: {
          name: target.name,
          abbreviation: target.abbreviation,
          isActive: target.isActive,
        },
        after: {
          name: unit.name,
          abbreviation: unit.abbreviation,
          isActive: unit.isActive,
        },
      },
    });

    return unit;
  }
}
