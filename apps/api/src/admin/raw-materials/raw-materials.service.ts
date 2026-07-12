import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { AuditService } from "../../audit/audit.service";
import type { AuthenticatedUser } from "../../auth/auth.types";
import { PrismaService } from "../../database/prisma.service";

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(300).optional(),
  baseUnitId: z.string().trim().min(1),
});

const updateSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(300).nullish(),
    baseUnitId: z.string().trim().min(1).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "No changes provided.",
  });

const include = {
  baseUnit: { select: { id: true, name: true, abbreviation: true } },
} satisfies Prisma.RawMaterialInclude;

@Injectable()
export class RawMaterialsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.rawMaterial.findMany({
      include,
      orderBy: { name: "asc" },
    });
  }

  private async assertUnitExists(unitId: string) {
    const unit = await this.prisma.unit.findUnique({
      where: { id: unitId },
      select: { id: true, isActive: true },
    });

    if (!unit) {
      throw new BadRequestException("Selected unit does not exist.");
    }
  }

  async create(input: unknown, actor: AuthenticatedUser) {
    const parsed = createSchema.safeParse(input);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message);
    }

    await this.assertUnitExists(parsed.data.baseUnitId);

    const existing = await this.prisma.rawMaterial.findUnique({
      where: { name: parsed.data.name },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException("A raw material with that name exists.");
    }

    const material = await this.prisma.rawMaterial.create({
      data: parsed.data,
      include,
    });

    await this.audit.record({
      actorId: actor.id,
      action: "ADMIN_RAW_MATERIAL_CREATED",
      entityType: "RawMaterial",
      entityId: material.id,
      metadata: { name: material.name },
    });

    return material;
  }

  async update(id: string, input: unknown, actor: AuthenticatedUser) {
    const parsed = updateSchema.safeParse(input);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message);
    }

    const target = await this.prisma.rawMaterial.findUnique({
      where: { id },
      include,
    });

    if (!target) {
      throw new NotFoundException("Raw material not found.");
    }

    if (parsed.data.baseUnitId) {
      await this.assertUnitExists(parsed.data.baseUnitId);
    }

    if (parsed.data.name) {
      const clash = await this.prisma.rawMaterial.findFirst({
        where: { name: parsed.data.name, NOT: { id } },
        select: { id: true },
      });

      if (clash) {
        throw new ConflictException("A raw material with that name exists.");
      }
    }

    const material = await this.prisma.rawMaterial.update({
      where: { id },
      data: parsed.data,
      include,
    });

    await this.audit.record({
      actorId: actor.id,
      action: "ADMIN_RAW_MATERIAL_UPDATED",
      entityType: "RawMaterial",
      entityId: material.id,
      metadata: {
        isActive: material.isActive,
        before: {
          name: target.name,
          description: target.description,
          baseUnitId: target.baseUnitId,
          isActive: target.isActive,
        },
        after: {
          name: material.name,
          description: material.description,
          baseUnitId: material.baseUnitId,
          isActive: material.isActive,
        },
      },
    });

    return material;
  }
}
