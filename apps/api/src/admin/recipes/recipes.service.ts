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

const itemSchema = z.object({
  rawMaterialId: z.string().trim().min(1),
  quantity: z.coerce.number().positive().max(99_999_999),
  unitId: z.string().trim().min(1),
});

const itemsSchema = z
  .array(itemSchema)
  .min(1, "Add at least one ingredient.")
  .superRefine((items, ctx) => {
    const seen = new Set<string>();
    for (const item of items) {
      if (seen.has(item.rawMaterialId)) {
        ctx.addIssue({
          code: "custom",
          message: "Each raw material can only appear once.",
        });
        return;
      }
      seen.add(item.rawMaterialId);
    }
  });

const createSchema = z.object({
  productId: z.string().trim().min(1),
  yieldQuantity: z.coerce.number().positive().max(99_999_999).optional(),
  notes: z.string().trim().max(500).optional(),
  items: itemsSchema,
});

const updateSchema = z
  .object({
    yieldQuantity: z.coerce.number().positive().max(99_999_999).optional(),
    notes: z.string().trim().max(500).nullish(),
    isActive: z.boolean().optional(),
    items: itemsSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "No changes provided.",
  });

const include = {
  product: { select: { id: true, name: true } },
  items: {
    include: {
      rawMaterial: { select: { id: true, name: true } },
      unit: { select: { id: true, abbreviation: true } },
    },
  },
} satisfies Prisma.RecipeInclude;

type RecipeWithItems = Prisma.RecipeGetPayload<{ include: typeof include }>;

function serialize(recipe: RecipeWithItems) {
  return {
    ...recipe,
    yieldQuantity: recipe.yieldQuantity.toString(),
    items: recipe.items.map((item) => ({
      ...item,
      quantity: item.quantity.toString(),
    })),
  };
}

@Injectable()
export class RecipesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async list() {
    const recipes = await this.prisma.recipe.findMany({
      include,
      orderBy: { product: { name: "asc" } },
    });

    return recipes.map(serialize);
  }

  /** Confirms every item uses its raw material's base unit. */
  private async assertItemsValid(items: z.infer<typeof itemsSchema>) {
    const materialIds = items.map((item) => item.rawMaterialId);

    const materials = await this.prisma.rawMaterial.findMany({
      where: { id: { in: materialIds } },
      select: {
        id: true,
        name: true,
        baseUnitId: true,
        baseUnit: { select: { abbreviation: true } },
      },
    });

    if (materials.length !== materialIds.length) {
      throw new BadRequestException("One or more raw materials do not exist.");
    }

    const materialsById = new Map(
      materials.map((material) => [material.id, material]),
    );

    for (const item of items) {
      const material = materialsById.get(item.rawMaterialId);

      if (material && item.unitId !== material.baseUnitId) {
        throw new BadRequestException(
          `${material.name} must use ${material.baseUnit.abbreviation}.`,
        );
      }
    }
  }

  async create(input: unknown, actor: AuthenticatedUser) {
    const parsed = createSchema.safeParse(input);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message);
    }

    const product = await this.prisma.product.findUnique({
      where: { id: parsed.data.productId },
      select: { id: true, recipe: { select: { id: true } } },
    });

    if (!product) {
      throw new BadRequestException("Selected product does not exist.");
    }
    if (product.recipe) {
      throw new ConflictException("This product already has a recipe.");
    }

    await this.assertItemsValid(parsed.data.items);

    const recipe = await this.prisma.recipe.create({
      data: {
        productId: parsed.data.productId,
        yieldQuantity: parsed.data.yieldQuantity ?? 1,
        notes: parsed.data.notes,
        items: { create: parsed.data.items },
      },
      include,
    });

    await this.audit.record({
      actorId: actor.id,
      action: "ADMIN_RECIPE_CREATED",
      entityType: "Recipe",
      entityId: recipe.id,
      metadata: { productId: recipe.productId, itemCount: recipe.items.length },
    });

    return serialize(recipe);
  }

  async update(id: string, input: unknown, actor: AuthenticatedUser) {
    const parsed = updateSchema.safeParse(input);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message);
    }

    const target = await this.prisma.recipe.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!target) {
      throw new NotFoundException("Recipe not found.");
    }

    if (parsed.data.items) {
      await this.assertItemsValid(parsed.data.items);
    }

    const items = parsed.data.items;

    const recipe = await this.prisma.$transaction(async (tx) => {
      if (items) {
        await tx.recipeItem.deleteMany({ where: { recipeId: id } });
      }

      return tx.recipe.update({
        where: { id },
        data: {
          ...(parsed.data.yieldQuantity !== undefined
            ? { yieldQuantity: parsed.data.yieldQuantity }
            : {}),
          ...(parsed.data.notes !== undefined
            ? { notes: parsed.data.notes }
            : {}),
          ...(parsed.data.isActive !== undefined
            ? { isActive: parsed.data.isActive }
            : {}),
          ...(items ? { items: { create: items } } : {}),
        },
        include,
      });
    });

    await this.audit.record({
      actorId: actor.id,
      action: "ADMIN_RECIPE_UPDATED",
      entityType: "Recipe",
      entityId: recipe.id,
      metadata: { isActive: recipe.isActive },
    });

    return serialize(recipe);
  }

  async remove(id: string, actor: AuthenticatedUser) {
    const target = await this.prisma.recipe.findUnique({
      where: { id },
      select: { id: true, productId: true },
    });

    if (!target) {
      throw new NotFoundException("Recipe not found.");
    }

    await this.prisma.recipe.delete({ where: { id } });

    await this.audit.record({
      actorId: actor.id,
      action: "ADMIN_RECIPE_DELETED",
      entityType: "Recipe",
      entityId: id,
      metadata: { productId: target.productId },
    });

    return { ok: true };
  }
}
