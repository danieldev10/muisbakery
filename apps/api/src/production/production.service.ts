import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  FinishedProductStockMovementType,
  MaterialRequestStatus,
  ProductionMaterialStockMovementType,
  ProductionWasteType,
  Prisma,
} from "@prisma/client";
import { z } from "zod";

import { AuditService } from "../audit/audit.service";
import type { AuthenticatedUser } from "../auth/auth.types";
import {
  containsFilter,
  dateRangeFilter,
  hasPaginatedRequest,
  paginatedResult,
  parsePagination,
  queryText,
  type QueryParams,
} from "../common/pagination";
import { PrismaService } from "../database/prisma.service";

const optionalText = (max = 300) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().max(max).optional(),
  );

const optionalDate = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.coerce.date().optional(),
);

const quantitySchema = z.coerce
  .number()
  .positive("Quantity must be greater than zero.")
  .max(99_999_999)
  .refine(Number.isInteger, {
    message: "Quantity must be a whole number.",
  });

const productCountSchema = z.coerce
  .number()
  .positive("Quantity must be greater than zero.")
  .max(99_999_999)
  .refine(Number.isInteger, {
    message: "Quantity must be a whole number.",
  });

const optionalNonnegativeCount = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.coerce
    .number()
    .nonnegative("Quantity cannot be negative.")
    .max(99_999_999)
    .refine(Number.isInteger, {
      message: "Quantity must be a whole number.",
    })
    .optional(),
);

const createRequestSchema = z.object({
  productId: z.string().trim().min(1),
  requestedQuantity: quantitySchema,
  neededBy: optionalDate,
  notes: optionalText(500),
});

const materialUsageSchema = z.object({
  rawMaterialId: z.string().trim().min(1),
  quantity: quantitySchema,
});

const optionalWasteType = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.enum(ProductionWasteType).optional(),
);

const createRunSchema = z
  .object({
    productId: z.string().trim().min(1),
    quantityProduced: productCountSchema,
    quantityTransferred: optionalNonnegativeCount,
    wasteQuantity: optionalNonnegativeCount,
    wasteType: optionalWasteType,
    wasteReason: optionalText(300),
    producedAt: optionalDate,
    notes: optionalText(500),
    materialUsages: z.array(materialUsageSchema).optional(),
  })
  .superRefine((value, context) => {
    const quantityTransferred =
      value.quantityTransferred ?? value.quantityProduced;

    if (quantityTransferred > value.quantityProduced) {
      context.addIssue({
        code: "custom",
        message: "Quantity sent to Sales cannot exceed quantity produced.",
        path: ["quantityTransferred"],
      });
    }

    if (value.wasteReason && !value.wasteQuantity) {
      context.addIssue({
        code: "custom",
        message: "Enter waste quantity when adding a waste reason.",
        path: ["wasteQuantity"],
      });
    }
  });

const baseUnitSelect = {
  id: true,
  name: true,
  abbreviation: true,
} satisfies Prisma.UnitSelect;

const rawMaterialSelect = {
  id: true,
  name: true,
  baseUnit: { select: baseUnitSelect },
} satisfies Prisma.RawMaterialSelect;

const supplierSelect = {
  id: true,
  name: true,
} satisfies Prisma.SupplierSelect;

const productSelect = {
  id: true,
  name: true,
  size: true,
  unit: { select: baseUnitSelect },
} satisfies Prisma.ProductSelect;

const productOptionInclude = {
  unit: { select: baseUnitSelect },
  recipe: {
    include: {
      items: {
        include: {
          rawMaterial: { select: rawMaterialSelect },
          unit: { select: baseUnitSelect },
        },
        orderBy: { rawMaterial: { name: "asc" } },
      },
    },
  },
} satisfies Prisma.ProductInclude;

const userSelect = {
  id: true,
  name: true,
  email: true,
} satisfies Prisma.UserSelect;

const requestInclude = {
  rawMaterial: { select: rawMaterialSelect },
  productionRequest: {
    include: {
      product: { select: productSelect },
    },
  },
  requestedBy: { select: userSelect },
  issuedBy: { select: userSelect },
  issues: {
    include: {
      batch: {
        include: {
          supplier: { select: supplierSelect },
        },
      },
      issuedBy: { select: userSelect },
    },
    orderBy: { createdAt: "asc" },
  },
} satisfies Prisma.MaterialRequestInclude;

const productionRequestInclude = {
  product: { select: productSelect },
  requestedBy: { select: userSelect },
  materialRequests: {
    include: requestInclude,
    orderBy: { rawMaterial: { name: "asc" } },
  },
} satisfies Prisma.ProductionRequestInclude;

const runInclude = {
  product: { select: productSelect },
  createdBy: { select: userSelect },
  materialUsages: {
    include: {
      rawMaterial: { select: rawMaterialSelect },
    },
    orderBy: { createdAt: "asc" },
  },
  waste: {
    include: {
      product: { select: productSelect },
      createdBy: { select: userSelect },
    },
    orderBy: { recordedAt: "asc" },
  },
  salesBatches: {
    include: {
      product: { select: productSelect },
    },
    orderBy: { receivedAt: "asc" },
  },
} satisfies Prisma.ProductionRunInclude;

const wasteInclude = {
  product: { select: productSelect },
  productionRun: {
    include: {
      product: { select: productSelect },
    },
  },
  createdBy: { select: userSelect },
} satisfies Prisma.ProductionWasteInclude;

const productionInventoryInclude = {
  baseUnit: { select: baseUnitSelect },
  productionBatches: {
    where: { quantityRemaining: { gt: 0 } },
    include: {
      materialRequest: {
        select: {
          id: true,
          createdAt: true,
        },
      },
      storeBatch: {
        select: {
          id: true,
          batchNumber: true,
          batchDate: true,
        },
      },
      createdBy: { select: userSelect },
    },
    orderBy: [{ receivedAt: "asc" }, { createdAt: "asc" }],
  },
} satisfies Prisma.RawMaterialInclude;

type MaterialRequestWithIncludes = Prisma.MaterialRequestGetPayload<{
  include: typeof requestInclude;
}>;

type ProductionRequestWithIncludes = Prisma.ProductionRequestGetPayload<{
  include: typeof productionRequestInclude;
}>;

type ProductOption = Prisma.ProductGetPayload<{
  include: typeof productOptionInclude;
}>;

type ProductionRunWithIncludes = Prisma.ProductionRunGetPayload<{
  include: typeof runInclude;
}>;

type ProductionWasteWithIncludes = Prisma.ProductionWasteGetPayload<{
  include: typeof wasteInclude;
}>;

type ProductionInventoryMaterial = Prisma.RawMaterialGetPayload<{
  include: typeof productionInventoryInclude;
}>;

function decimalToNumber(
  value: Prisma.Decimal | number | string | null | undefined,
) {
  return value === null || value === undefined ? 0 : Number(value.toString());
}

function roundQuantity(value: number) {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundUnitCost(value: number) {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

function wholeQuantity(value: number) {
  return Math.max(1, Math.ceil(value - Number.EPSILON));
}

function productLabel(product: { name: string; size: string }) {
  return product.size ? `${product.name} - ${product.size}` : product.name;
}

function toBatchDate(value: Date) {
  return new Date(
    Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()),
  );
}

function materialRequestWhere(
  actor: AuthenticatedUser,
  query: QueryParams | undefined,
) {
  const search = queryText(query, "q");
  const materialId = queryText(query, "material");
  const status = queryText(query, "status");
  const createdAt = dateRangeFilter(
    queryText(query, "from"),
    queryText(query, "to"),
  );
  const where: Prisma.MaterialRequestWhereInput =
    actor.role === "ADMIN" ? {} : { requestedById: actor.id };

  if (materialId) {
    where.rawMaterialId = materialId;
  }

  if (
    status &&
    Object.values(MaterialRequestStatus).includes(status as MaterialRequestStatus)
  ) {
    where.status = status as MaterialRequestStatus;
  }

  if (createdAt) {
    where.createdAt = createdAt;
  }

  if (search) {
    where.OR = [
      { rawMaterial: { name: containsFilter(search) } },
      { rawMaterial: { baseUnit: { abbreviation: containsFilter(search) } } },
      { notes: containsFilter(search) },
      { responseNotes: containsFilter(search) },
      { requestedBy: { name: containsFilter(search) } },
      { requestedBy: { email: containsFilter(search) } },
    ];

    if (Object.values(MaterialRequestStatus).includes(search as MaterialRequestStatus)) {
      where.OR.push({ status: search as MaterialRequestStatus });
    }
  }

  return where;
}

function productionRequestWhere(
  actor: AuthenticatedUser,
  query: QueryParams | undefined,
) {
  const search = queryText(query, "q");
  const productId = queryText(query, "product");
  const status = queryText(query, "status");
  const createdAt = dateRangeFilter(
    queryText(query, "from"),
    queryText(query, "to"),
  );
  const where: Prisma.ProductionRequestWhereInput =
    actor.role === "ADMIN" ? {} : { requestedById: actor.id };

  if (productId) {
    where.productId = productId;
  }

  if (
    status &&
    Object.values(MaterialRequestStatus).includes(status as MaterialRequestStatus)
  ) {
    where.status = status as MaterialRequestStatus;
  }

  if (createdAt) {
    where.createdAt = createdAt;
  }

  if (search) {
    where.OR = [
      { product: { name: containsFilter(search) } },
      { product: { size: containsFilter(search) } },
      { product: { unit: { abbreviation: containsFilter(search) } } },
      { notes: containsFilter(search) },
      { responseNotes: containsFilter(search) },
      { requestedBy: { name: containsFilter(search) } },
      { requestedBy: { email: containsFilter(search) } },
    ];

    if (Object.values(MaterialRequestStatus).includes(search as MaterialRequestStatus)) {
      where.OR.push({ status: search as MaterialRequestStatus });
    }
  }

  return where;
}

function serializeRequest(request: MaterialRequestWithIncludes) {
  const requestedQuantity = decimalToNumber(request.requestedQuantity);
  const issuedQuantity = decimalToNumber(request.issuedQuantity);
  const remainingQuantity = Math.max(
    0,
    roundQuantity(requestedQuantity - issuedQuantity),
  );

  return {
    id: request.id,
    requestedQuantity: request.requestedQuantity.toString(),
    issuedQuantity: request.issuedQuantity.toString(),
    remainingQuantity: remainingQuantity.toFixed(3),
    status: request.status,
    neededBy: request.neededBy?.toISOString() ?? null,
    notes: request.notes,
    responseNotes: request.responseNotes,
    fulfilledAt: request.fulfilledAt?.toISOString() ?? null,
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
    productionRequest: request.productionRequest
      ? {
          id: request.productionRequest.id,
          requestedQuantity: request.productionRequest.requestedQuantity.toString(),
          status: request.productionRequest.status,
          product: request.productionRequest.product,
        }
      : null,
    rawMaterial: request.rawMaterial,
    requestedBy: request.requestedBy,
    issuedBy: request.issuedBy,
    issues: request.issues.map((issue) => ({
      id: issue.id,
      quantity: issue.quantity.toString(),
      createdAt: issue.createdAt.toISOString(),
      issuedBy: issue.issuedBy,
      batch: {
        id: issue.batch.id,
        batchNumber: issue.batch.batchNumber,
        batchLabel: `${request.rawMaterial.name} batch ${issue.batch.batchNumber}`,
        batchDate: issue.batch.batchDate.toISOString(),
        receivedAt: issue.batch.receivedAt.toISOString(),
        supplier: issue.batch.supplier,
      },
    })),
  };
}

function serializeProductionRequest(request: ProductionRequestWithIncludes) {
  return {
    id: request.id,
    requestedQuantity: request.requestedQuantity.toString(),
    status: request.status,
    neededBy: request.neededBy?.toISOString() ?? null,
    notes: request.notes,
    responseNotes: request.responseNotes,
    fulfilledAt: request.fulfilledAt?.toISOString() ?? null,
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
    product: request.product,
    requestedBy: request.requestedBy,
    materialRequests: request.materialRequests.map(serializeRequest),
  };
}

function serializeWaste(waste: ProductionWasteWithIncludes) {
  return {
    id: waste.id,
    type: waste.type,
    quantity: waste.quantity.toString(),
    reason: waste.reason,
    recordedAt: waste.recordedAt.toISOString(),
    createdAt: waste.createdAt.toISOString(),
    product: waste.product,
    createdBy: waste.createdBy,
    productionRun: waste.productionRun
      ? {
          id: waste.productionRun.id,
          producedAt: waste.productionRun.producedAt.toISOString(),
          product: waste.productionRun.product,
        }
      : null,
  };
}

function serializeProductOption(product: ProductOption) {
  return {
    id: product.id,
    name: product.name,
    size: product.size,
    unit: product.unit,
    recipe:
      product.recipe && product.recipe.isActive
        ? {
            id: product.recipe.id,
            yieldQuantity: product.recipe.yieldQuantity.toString(),
            items: product.recipe.items.map((item) => ({
              id: item.id,
              quantity: item.quantity.toString(),
              rawMaterial: item.rawMaterial,
              unit: item.unit,
            })),
          }
        : null,
  };
}

function serializeProductionInventoryItem(material: ProductionInventoryMaterial) {
  const totalRemaining = material.productionBatches.reduce(
    (sum, batch) => sum + decimalToNumber(batch.quantityRemaining),
    0,
  );

  return {
    rawMaterial: {
      id: material.id,
      name: material.name,
      baseUnit: material.baseUnit,
    },
    totalRemaining: roundQuantity(totalRemaining).toFixed(3),
    batches: material.productionBatches.map((batch) => ({
      id: batch.id,
      quantityReceived: batch.quantityReceived.toString(),
      quantityRemaining: batch.quantityRemaining.toString(),
      receivedAt: batch.receivedAt.toISOString(),
      materialRequest: batch.materialRequest
        ? {
            id: batch.materialRequest.id,
            createdAt: batch.materialRequest.createdAt.toISOString(),
          }
        : null,
      storeBatch: batch.storeBatch
        ? {
            id: batch.storeBatch.id,
            batchNumber: batch.storeBatch.batchNumber,
            batchDate: batch.storeBatch.batchDate.toISOString(),
          }
        : null,
      createdBy: batch.createdBy,
    })),
  };
}

function serializeRun(run: ProductionRunWithIncludes) {
  const shortfall =
    run.expectedQuantity !== null && run.quantityProduced < run.expectedQuantity
      ? run.expectedQuantity - run.quantityProduced
      : 0;

  return {
    id: run.id,
    quantityProduced: run.quantityProduced.toString(),
    expectedQuantity: run.expectedQuantity?.toString() ?? null,
    shortfallQuantity: shortfall > 0 ? String(shortfall) : null,
    quantityTransferred: run.quantityTransferred.toString(),
    wasteQuantity: run.wasteQuantity.toString(),
    producedAt: run.producedAt.toISOString(),
    notes: run.notes,
    createdAt: run.createdAt.toISOString(),
    product: run.product,
    createdBy: run.createdBy,
    materialUsages: run.materialUsages.map((usage) => ({
      id: usage.id,
      expectedQuantity: usage.expectedQuantity?.toString() ?? null,
      actualQuantity: usage.actualQuantity.toString(),
      rawMaterial: usage.rawMaterial,
    })),
    waste: run.waste.map((waste) => ({
      id: waste.id,
      type: waste.type,
      quantity: waste.quantity.toString(),
      reason: waste.reason,
      recordedAt: waste.recordedAt.toISOString(),
      product: waste.product,
      createdBy: waste.createdBy,
    })),
    salesBatches: run.salesBatches.map((batch) => ({
      id: batch.id,
      batchNumber: batch.batchNumber,
      batchDate: batch.batchDate.toISOString(),
      quantityReceived: batch.quantityReceived.toString(),
      quantityRemaining: batch.quantityRemaining.toString(),
      receivedAt: batch.receivedAt.toISOString(),
      product: batch.product,
    })),
  };
}

/**
 * Lower-bound output implied by the recipe and the materials actually used:
 * the limiting recipe ingredient determines how many recipe batches the
 * consumed materials could have produced. Undercutting shows up as
 * quantityProduced falling below this number.
 */
function expectedOutputForUsages(
  product: ProductOption,
  usages: Array<{ rawMaterialId: string; quantity: number }>,
) {
  const recipe = product.recipe;

  if (!recipe?.isActive || recipe.items.length === 0) {
    return null;
  }

  const yieldQuantity = decimalToNumber(recipe.yieldQuantity);

  if (yieldQuantity <= 0) {
    return null;
  }

  const usageByMaterial = new Map(
    usages.map((usage) => [usage.rawMaterialId, usage.quantity]),
  );
  let limitingBatches: number | null = null;

  for (const item of recipe.items) {
    const perBatch = decimalToNumber(item.quantity);

    if (perBatch <= 0) {
      continue;
    }

    const used = usageByMaterial.get(item.rawMaterialId) ?? 0;
    const batches = used / perBatch;
    limitingBatches =
      limitingBatches === null ? batches : Math.min(limitingBatches, batches);
  }

  if (limitingBatches === null) {
    return null;
  }

  return Math.floor(limitingBatches * yieldQuantity + 1e-9);
}

function expectedUsagesForProduct(product: ProductOption, quantityProduced: number) {
  if (!product.recipe?.isActive) {
    return [];
  }

  const yieldQuantity = decimalToNumber(product.recipe.yieldQuantity);

  if (yieldQuantity <= 0) {
    return [];
  }

  return product.recipe.items
    .map((item) => ({
      rawMaterialId: item.rawMaterialId,
      expectedQuantity: wholeQuantity(
        (decimalToNumber(item.quantity) * quantityProduced) / yieldQuantity,
      ),
    }))
    .filter((item) => item.expectedQuantity > 0);
}

function mergeMaterialUsages(
  usages: Array<{ rawMaterialId: string; quantity: number }>,
) {
  const usageByMaterial = new Map<string, number>();

  for (const usage of usages) {
    usageByMaterial.set(
      usage.rawMaterialId,
      roundQuantity(
        (usageByMaterial.get(usage.rawMaterialId) ?? 0) + usage.quantity,
      ),
    );
  }

  return [...usageByMaterial.entries()].map(([rawMaterialId, quantity]) => ({
    rawMaterialId,
    quantity,
  }));
}

@Injectable()
export class ProductionService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async options() {
    const [rawMaterials, products] = await Promise.all([
      this.prisma.rawMaterial.findMany({
        where: { isActive: true },
        select: rawMaterialSelect,
        orderBy: { name: "asc" },
      }),
      this.prisma.product.findMany({
        where: { isActive: true },
        include: productOptionInclude,
        orderBy: { name: "asc" },
      }),
    ]);

    return {
      rawMaterials,
      products: products.map(serializeProductOption),
    };
  }

  async inventory() {
    const materials = await this.prisma.rawMaterial.findMany({
      where: {
        OR: [
          { isActive: true },
          {
            productionBatches: {
              some: { quantityRemaining: { gt: 0 } },
            },
          },
        ],
      },
      include: productionInventoryInclude,
      orderBy: { name: "asc" },
    });

    return materials.map(serializeProductionInventoryItem);
  }

  async listMaterialRequests(
    actor: AuthenticatedUser,
    query?: QueryParams,
  ) {
    const where = productionRequestWhere(actor, query);
    const orderBy = { createdAt: "desc" } as const;

    if (hasPaginatedRequest(query)) {
      const { page, pageSize, skip, take } = parsePagination(query);
      const [total, requests] = await this.prisma.$transaction([
        this.prisma.productionRequest.count({ where }),
        this.prisma.productionRequest.findMany({
          where,
          include: productionRequestInclude,
          orderBy,
          skip,
          take,
        }),
      ]);

      return paginatedResult(
        requests.map(serializeProductionRequest),
        total,
        page,
        pageSize,
      );
    }

    const requests = await this.prisma.productionRequest.findMany({
      where,
      include: productionRequestInclude,
      orderBy,
      take: 200,
    });

    return requests.map(serializeProductionRequest);
  }

  async createMaterialRequest(input: unknown, actor: AuthenticatedUser) {
    const parsed = createRequestSchema.safeParse(input);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message);
    }

    const request = await this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: parsed.data.productId },
        include: productOptionInclude,
      });

      if (!product?.isActive) {
        throw new BadRequestException("Selected product is not active.");
      }

      if (!product.recipe?.isActive || product.recipe.items.length === 0) {
        throw new BadRequestException(
          "Add an active recipe for this product before requesting production materials.",
        );
      }

      const yieldQuantity = decimalToNumber(product.recipe.yieldQuantity);

      if (yieldQuantity <= 0) {
        throw new BadRequestException("Recipe yield must be greater than zero.");
      }

      const materialLines = product.recipe.items.map((item) => ({
        rawMaterialId: item.rawMaterialId,
        requestedQuantity: wholeQuantity(
          (decimalToNumber(item.quantity) * parsed.data.requestedQuantity) /
            yieldQuantity,
        ),
        neededBy: parsed.data.neededBy,
        notes: null,
        requestedById: actor.id,
      }));

      if (materialLines.length === 0) {
        throw new BadRequestException(
          "Recipe must include at least one raw material.",
        );
      }

      return tx.productionRequest.create({
        data: {
          productId: parsed.data.productId,
          requestedQuantity: parsed.data.requestedQuantity,
          neededBy: parsed.data.neededBy,
          notes: parsed.data.notes,
          requestedById: actor.id,
          materialRequests: {
            create: materialLines,
          },
        },
        include: productionRequestInclude,
      });
    });

    await this.audit.record({
      actorId: actor.id,
      action: "PRODUCTION_PRODUCT_REQUEST_CREATED",
      entityType: "ProductionRequest",
      entityId: request.id,
      metadata: {
        productId: request.productId,
        requestedQuantity: request.requestedQuantity.toString(),
        materialLineCount: request.materialRequests.length,
      },
    });

    return serializeProductionRequest(request);
  }

  async cancelMaterialRequest(id: string, actor: AuthenticatedUser) {
    const request = await this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.productionRequest.findUnique({
          where: { id },
          select: {
            id: true,
            requestedById: true,
            status: true,
          },
        });

        if (!existing) {
          throw new NotFoundException("Production request not found.");
        }

        if (actor.role !== "ADMIN" && existing.requestedById !== actor.id) {
          throw new BadRequestException("You can only cancel your own requests.");
        }

        if (existing.status !== MaterialRequestStatus.PENDING) {
          throw new BadRequestException("Only pending requests can be cancelled.");
        }

        const cancelled = await tx.productionRequest.updateMany({
          where: {
            id,
            status: MaterialRequestStatus.PENDING,
            ...(actor.role === "ADMIN" ? {} : { requestedById: actor.id }),
          },
          data: { status: MaterialRequestStatus.CANCELLED },
        });

        if (cancelled.count === 0) {
          throw new BadRequestException(
            "This request was updated by someone else. Refresh and try again.",
          );
        }

        await tx.materialRequest.updateMany({
          where: {
            productionRequestId: id,
            status: MaterialRequestStatus.PENDING,
          },
          data: { status: MaterialRequestStatus.CANCELLED },
        });

        return tx.productionRequest.findUniqueOrThrow({
          where: { id },
          include: productionRequestInclude,
        });
      },
      { timeout: 15000, maxWait: 15000 },
    );

    await this.audit.record({
      actorId: actor.id,
      action: "PRODUCTION_PRODUCT_REQUEST_CANCELLED",
      entityType: "ProductionRequest",
      entityId: request.id,
      metadata: { status: request.status },
    });

    return serializeProductionRequest(request);
  }

  async listRuns() {
    const runs = await this.prisma.productionRun.findMany({
      include: runInclude,
      orderBy: { producedAt: "desc" },
      take: 200,
    });

    return runs.map(serializeRun);
  }

  async listWaste() {
    const waste = await this.prisma.productionWaste.findMany({
      include: wasteInclude,
      orderBy: { recordedAt: "desc" },
      take: 200,
    });

    return waste.map(serializeWaste);
  }

  async createRun(input: unknown, actor: AuthenticatedUser) {
    const parsed = createRunSchema.safeParse(input);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message);
    }

    const producedAt = parsed.data.producedAt ?? new Date();
    const quantityTransferred =
      parsed.data.quantityTransferred ?? parsed.data.quantityProduced;
    const wasteQuantity = parsed.data.wasteQuantity ?? 0;
    const providedMaterialUsages = mergeMaterialUsages(
      parsed.data.materialUsages ?? [],
    );

    const run = await this.prisma.$transaction(
      async (tx) => {
        const product = await tx.product.findUnique({
          where: { id: parsed.data.productId },
          include: productOptionInclude,
        });

        if (!product || !product.isActive) {
          throw new BadRequestException("Selected product is not active.");
        }

        const expectedUsages = expectedUsagesForProduct(
          product,
          parsed.data.quantityProduced,
        );
        const expectedByMaterial = new Map(
          expectedUsages.map((usage) => [
            usage.rawMaterialId,
            usage.expectedQuantity,
          ]),
        );
        const materialUsages =
          providedMaterialUsages.length > 0
            ? providedMaterialUsages
            : expectedUsages.map((usage) => ({
                rawMaterialId: usage.rawMaterialId,
                quantity: usage.expectedQuantity,
              }));

        if (materialUsages.length === 0) {
          throw new BadRequestException(
            "Add an active recipe for this product before recording production output.",
          );
        }

        const expectedOutput = expectedOutputForUsages(product, materialUsages);

        const createdRun = await tx.productionRun.create({
          data: {
            productId: parsed.data.productId,
            quantityProduced: parsed.data.quantityProduced,
            expectedQuantity: expectedOutput,
            quantityTransferred,
            wasteQuantity,
            producedAt,
            notes: parsed.data.notes,
            createdById: actor.id,
          },
        });

        const rawMaterials = await tx.rawMaterial.findMany({
          where: {
            id: { in: materialUsages.map((usage) => usage.rawMaterialId) },
          },
          select: rawMaterialSelect,
        });
        const rawMaterialById = new Map(
          rawMaterials.map((material) => [material.id, material]),
        );

        if (rawMaterialById.size !== materialUsages.length) {
          throw new BadRequestException(
            "One or more selected raw materials do not exist.",
          );
        }

        let totalMaterialCost = 0;

        for (const usage of materialUsages) {
          const rawMaterial = rawMaterialById.get(usage.rawMaterialId);

          if (!rawMaterial) {
            throw new BadRequestException("Selected raw material not found.");
          }

          const lockedBatchIds = await tx.$queryRaw<Array<{ id: string }>>(
            Prisma.sql`
              SELECT "id"
              FROM "ProductionMaterialStockBatch"
              WHERE "rawMaterialId" = ${usage.rawMaterialId}
                AND "quantityRemaining" > 0
              ORDER BY "receivedAt" ASC, "createdAt" ASC
              FOR UPDATE
            `,
          );
          const batches =
            lockedBatchIds.length > 0
              ? await tx.productionMaterialStockBatch.findMany({
                  where: { id: { in: lockedBatchIds.map((batch) => batch.id) } },
                  include: {
                    storeBatch: {
                      select: {
                        unitCost: true,
                      },
                    },
                  },
                  orderBy: [{ receivedAt: "asc" }, { createdAt: "asc" }],
                })
              : [];
          const availableQuantity = batches.reduce(
            (sum, batch) => sum + decimalToNumber(batch.quantityRemaining),
            0,
          );

          if (availableQuantity < usage.quantity) {
            throw new BadRequestException(
              `Production only has ${roundQuantity(availableQuantity).toFixed(3)} ${rawMaterial.baseUnit.abbreviation} of ${rawMaterial.name}.`,
            );
          }

          await tx.productionRunMaterialUsage.create({
            data: {
              productionRunId: createdRun.id,
              rawMaterialId: usage.rawMaterialId,
              expectedQuantity: expectedByMaterial.get(usage.rawMaterialId),
              actualQuantity: usage.quantity,
            },
          });

          let remainingToConsume = usage.quantity;

          for (const batch of batches) {
            if (remainingToConsume <= 0) {
              break;
            }

            const batchRemaining = decimalToNumber(batch.quantityRemaining);
            const quantityFromBatch = roundQuantity(
              Math.min(batchRemaining, remainingToConsume),
            );
            const balanceAfter = roundQuantity(
              batchRemaining - quantityFromBatch,
            );
            const unitCost = decimalToNumber(batch.storeBatch?.unitCost);

            totalMaterialCost = roundMoney(
              totalMaterialCost + quantityFromBatch * unitCost,
            );

            await tx.productionMaterialStockBatch.update({
              where: { id: batch.id },
              data: { quantityRemaining: balanceAfter },
            });

            await tx.productionMaterialStockMovement.create({
              data: {
                rawMaterialId: usage.rawMaterialId,
                productionBatchId: batch.id,
                productionRunId: createdRun.id,
                type: ProductionMaterialStockMovementType.CONSUME,
                quantity: quantityFromBatch,
                balanceAfter,
                actorId: actor.id,
                note: `Consumed for ${productLabel(product)}`,
              },
            });

            remainingToConsume = roundQuantity(
              remainingToConsume - quantityFromBatch,
            );
          }
        }

        if (wasteQuantity > 0) {
          await tx.productionWaste.create({
            data: {
              productionRunId: createdRun.id,
              productId: parsed.data.productId,
              type: parsed.data.wasteType ?? ProductionWasteType.DAMAGED,
              quantity: wasteQuantity,
              reason: parsed.data.wasteReason,
              recordedAt: producedAt,
              createdById: actor.id,
            },
          });
        }

        if (quantityTransferred > 0) {
          await tx.$queryRaw(
            Prisma.sql`SELECT "id" FROM "Product" WHERE "id" = ${parsed.data.productId} FOR UPDATE`,
          );

          const latestBatch = await tx.salesProductBatch.findFirst({
            where: { productId: parsed.data.productId },
            orderBy: { batchNumber: "desc" },
            select: { batchNumber: true },
          });
          const batchNumber = (latestBatch?.batchNumber ?? 0) + 1;
          const batchUnitCost =
            parsed.data.quantityProduced > 0
              ? roundUnitCost(totalMaterialCost / parsed.data.quantityProduced)
              : 0;
          const batchTotalCost = roundMoney(batchUnitCost * quantityTransferred);

          const batch = await tx.salesProductBatch.create({
            data: {
              productId: parsed.data.productId,
              productionRunId: createdRun.id,
              batchNumber,
              batchDate: toBatchDate(producedAt),
              quantityReceived: quantityTransferred,
              quantityRemaining: quantityTransferred,
              unitCost: batchUnitCost,
              totalCost: batchTotalCost,
              receivedAt: producedAt,
              notes: parsed.data.notes,
              createdById: actor.id,
            },
          });

          await tx.salesProductStockMovement.create({
            data: {
              productId: parsed.data.productId,
              batchId: batch.id,
              type: FinishedProductStockMovementType.RECEIVE_FROM_PRODUCTION,
              quantity: quantityTransferred,
              balanceAfter: quantityTransferred,
              actorId: actor.id,
              note: "Received from Production",
            },
          });
        }

        return tx.productionRun.findUniqueOrThrow({
          where: { id: createdRun.id },
          include: runInclude,
        });
      },
      { timeout: 15000, maxWait: 15000 },
    );

    await this.audit.record({
      actorId: actor.id,
      action: "PRODUCTION_RUN_CREATED",
      entityType: "ProductionRun",
      entityId: run.id,
      metadata: {
        productId: run.productId,
        quantityProduced: run.quantityProduced.toString(),
        expectedQuantity: run.expectedQuantity?.toString() ?? null,
        quantityTransferred: run.quantityTransferred.toString(),
        wasteQuantity: run.wasteQuantity.toString(),
      },
    });

    return serializeRun(run);
  }
}
