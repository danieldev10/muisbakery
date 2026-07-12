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

const priceSchema = z.coerce.number().nonnegative().max(99_999_999);

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  size: z.string().trim().max(80).optional(),
  description: z.string().trim().max(300).optional(),
  unitId: z.string().trim().min(1),
  unitPrice: priceSchema.optional(),
});

const updateSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    size: z.string().trim().max(80).optional(),
    description: z.string().trim().max(300).nullish(),
    unitId: z.string().trim().min(1).optional(),
    unitPrice: priceSchema.nullish(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "No changes provided.",
  });

const include = {
  unit: { select: { id: true, name: true, abbreviation: true } },
} satisfies Prisma.ProductInclude;

type ProductWithUnit = Prisma.ProductGetPayload<{ include: typeof include }>;

function serialize(product: ProductWithUnit) {
  return {
    ...product,
    unitPrice: product.unitPrice ? product.unitPrice.toString() : null,
  };
}

@Injectable()
export class ProductsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async list() {
    const products = await this.prisma.product.findMany({
      include,
      orderBy: { name: "asc" },
    });

    return products.map(serialize);
  }

  /** All-time produced and sold totals per product, for the admin overview chart. */
  async stats() {
    const [products, produced, sold] = await Promise.all([
      this.prisma.product.findMany({
        select: { id: true, name: true, size: true },
        orderBy: { name: "asc" },
      }),
      this.prisma.productionRun.groupBy({
        by: ["productId"],
        _sum: { quantityProduced: true },
      }),
      this.prisma.saleItem.groupBy({
        by: ["productId"],
        _sum: { quantity: true },
      }),
    ]);

    const producedById = new Map(
      produced.map((entry) => [entry.productId, entry._sum.quantityProduced ?? 0]),
    );
    const soldById = new Map(
      sold.map((entry) => [entry.productId, entry._sum.quantity ?? 0]),
    );

    return products.map((product) => ({
      product,
      totalProduced: producedById.get(product.id) ?? 0,
      totalSold: soldById.get(product.id) ?? 0,
    }));
  }

  private async assertUnitExists(unitId: string) {
    const unit = await this.prisma.unit.findUnique({
      where: { id: unitId },
      select: { id: true },
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

    await this.assertUnitExists(parsed.data.unitId);

    const size = parsed.data.size ?? "";
    const existing = await this.prisma.product.findUnique({
      where: { name_size: { name: parsed.data.name, size } },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException("A product with that name and size exists.");
    }

    const product = await this.prisma.product.create({
      data: { ...parsed.data, size },
      include,
    });

    await this.audit.record({
      actorId: actor.id,
      action: "ADMIN_PRODUCT_CREATED",
      entityType: "Product",
      entityId: product.id,
      metadata: { name: product.name },
    });

    return serialize(product);
  }

  async update(id: string, input: unknown, actor: AuthenticatedUser) {
    const parsed = updateSchema.safeParse(input);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message);
    }

    const target = await this.prisma.product.findUnique({
      where: { id },
      include,
    });

    if (!target) {
      throw new NotFoundException("Product not found.");
    }

    if (parsed.data.unitId) {
      await this.assertUnitExists(parsed.data.unitId);
    }

    if (parsed.data.name || parsed.data.size !== undefined) {
      const nextName = parsed.data.name ?? target.name;
      const nextSize = parsed.data.size ?? target.size;
      const clash = await this.prisma.product.findFirst({
        where: { name: nextName, size: nextSize, NOT: { id } },
        select: { id: true },
      });

      if (clash) {
        throw new ConflictException("A product with that name and size exists.");
      }
    }

    const product = await this.prisma.product.update({
      where: { id },
      data: parsed.data,
      include,
    });

    await this.audit.record({
      actorId: actor.id,
      action: "ADMIN_PRODUCT_UPDATED",
      entityType: "Product",
      entityId: product.id,
      metadata: {
        isActive: product.isActive,
        before: {
          name: target.name,
          size: target.size,
          description: target.description,
          unitId: target.unitId,
          unitPrice: target.unitPrice?.toString() ?? null,
          isActive: target.isActive,
        },
        after: {
          name: product.name,
          size: product.size,
          description: product.description,
          unitId: product.unitId,
          unitPrice: product.unitPrice?.toString() ?? null,
          isActive: product.isActive,
        },
      },
    });

    return serialize(product);
  }
}
