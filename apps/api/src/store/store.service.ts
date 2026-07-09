import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  MaterialRequestStatus,
  ProductionMaterialStockMovementType,
  Prisma,
  RawMaterialStockMovementType,
} from "@prisma/client";
import { z } from "zod";

import { AuditService } from "../audit/audit.service";
import type { AuthenticatedUser } from "../auth/auth.types";
import { PrismaService } from "../database/prisma.service";

const optionalText = (max = 300) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().max(max).optional(),
  );

const optionalId = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().min(1).optional(),
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

const optionalQuantity = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  quantitySchema.optional(),
);

const receiveSchema = z.object({
  rawMaterialId: z.string().trim().min(1),
  supplierId: optionalId,
  quantity: quantitySchema,
  receivedAt: optionalDate,
  reference: optionalText(120),
  notes: optionalText(500),
});

const issueSchema = z.object({
  quantity: optionalQuantity,
  notes: optionalText(500),
});

const rejectSchema = z.object({
  notes: optionalText(500),
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

const userSelect = {
  id: true,
  name: true,
  email: true,
} satisfies Prisma.UserSelect;

const batchInclude = {
  rawMaterial: { select: rawMaterialSelect },
  supplier: { select: supplierSelect },
  createdBy: { select: userSelect },
} satisfies Prisma.RawMaterialBatchInclude;

const receiptInclude = {
  rawMaterial: { select: rawMaterialSelect },
  batch: {
    include: {
      rawMaterial: { select: rawMaterialSelect },
    },
  },
  supplier: { select: supplierSelect },
  createdBy: { select: userSelect },
} satisfies Prisma.RawMaterialReceiptInclude;

const inventoryInclude = {
  baseUnit: { select: baseUnitSelect },
  batches: {
    where: { quantityRemaining: { gt: 0 } },
    include: { supplier: { select: supplierSelect } },
    orderBy: [{ batchDate: "asc" }, { batchNumber: "asc" }],
  },
} satisfies Prisma.RawMaterialInclude;

const requestInclude = {
  rawMaterial: { select: rawMaterialSelect },
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

type BatchWithIncludes = Prisma.RawMaterialBatchGetPayload<{
  include: typeof batchInclude;
}>;

type ReceiptWithIncludes = Prisma.RawMaterialReceiptGetPayload<{
  include: typeof receiptInclude;
}>;

type InventoryMaterial = Prisma.RawMaterialGetPayload<{
  include: typeof inventoryInclude;
}>;

type MaterialRequestWithIncludes = Prisma.MaterialRequestGetPayload<{
  include: typeof requestInclude;
}>;

function decimalToNumber(value: Prisma.Decimal | number | string) {
  return Number(value.toString());
}

function roundQuantity(value: number) {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

function formatQuantity(value: number) {
  return roundQuantity(value).toFixed(3);
}

function toBatchDate(receivedAt: Date) {
  return new Date(
    Date.UTC(
      receivedAt.getFullYear(),
      receivedAt.getMonth(),
      receivedAt.getDate(),
    ),
  );
}

// Costs are deliberately omitted from Store responses: unit costs are only
// visible to Management/Admin via the management endpoints.
function serializeBatch(batch: BatchWithIncludes) {
  return {
    id: batch.id,
    batchNumber: batch.batchNumber,
    batchLabel: `${batch.rawMaterial.name} batch ${batch.batchNumber}`,
    batchDate: batch.batchDate.toISOString(),
    quantityReceived: batch.quantityReceived.toString(),
    quantityRemaining: batch.quantityRemaining.toString(),
    receivedAt: batch.receivedAt.toISOString(),
    reference: batch.reference,
    notes: batch.notes,
    createdAt: batch.createdAt.toISOString(),
    rawMaterial: batch.rawMaterial,
    supplier: batch.supplier,
    createdBy: batch.createdBy,
  };
}

function serializeReceipt(receipt: ReceiptWithIncludes) {
  return {
    id: receipt.id,
    quantity: receipt.quantity.toString(),
    receivedAt: receipt.receivedAt.toISOString(),
    reference: receipt.reference,
    notes: receipt.notes,
    createdAt: receipt.createdAt.toISOString(),
    rawMaterial: receipt.rawMaterial,
    supplier: receipt.supplier,
    createdBy: receipt.createdBy,
    batch: {
      id: receipt.batch.id,
      batchNumber: receipt.batch.batchNumber,
      batchDate: receipt.batch.batchDate.toISOString(),
      batchLabel: `${receipt.rawMaterial.name} batch ${receipt.batch.batchNumber}`,
      quantityReceived: receipt.batch.quantityReceived.toString(),
      quantityRemaining: receipt.batch.quantityRemaining.toString(),
    },
  };
}

function serializeInventoryItem(material: InventoryMaterial) {
  const totalRemaining = material.batches.reduce(
    (sum, batch) => sum + decimalToNumber(batch.quantityRemaining),
    0,
  );

  return {
    rawMaterial: {
      id: material.id,
      name: material.name,
      baseUnit: material.baseUnit,
    },
    totalRemaining: formatQuantity(totalRemaining),
    batches: material.batches.map((batch) => ({
      id: batch.id,
      batchNumber: batch.batchNumber,
      batchLabel: `${material.name} batch ${batch.batchNumber}`,
      batchDate: batch.batchDate.toISOString(),
      quantityReceived: batch.quantityReceived.toString(),
      quantityRemaining: batch.quantityRemaining.toString(),
      receivedAt: batch.receivedAt.toISOString(),
      reference: batch.reference,
      notes: batch.notes,
      supplier: batch.supplier,
    })),
  };
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

@Injectable()
export class StoreService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async options() {
    const [rawMaterials, suppliers] = await Promise.all([
      this.prisma.rawMaterial.findMany({
        where: { isActive: true },
        select: rawMaterialSelect,
        orderBy: { name: "asc" },
      }),
      this.prisma.supplier.findMany({
        where: { isActive: true },
        select: supplierSelect,
        orderBy: { name: "asc" },
      }),
    ]);

    return { rawMaterials, suppliers };
  }

  async inventory() {
    const materials = await this.prisma.rawMaterial.findMany({
      where: {
        OR: [{ isActive: true }, { batches: { some: { quantityRemaining: { gt: 0 } } } }],
      },
      include: inventoryInclude,
      orderBy: { name: "asc" },
    });

    return materials.map(serializeInventoryItem);
  }

  async listBatches() {
    const batches = await this.prisma.rawMaterialBatch.findMany({
      include: batchInclude,
      orderBy: [{ batchDate: "desc" }, { batchNumber: "desc" }],
      take: 200,
    });

    return batches.map(serializeBatch);
  }

  async listReceipts() {
    const receipts = await this.prisma.rawMaterialReceipt.findMany({
      include: receiptInclude,
      orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }],
      take: 200,
    });

    return receipts.map(serializeReceipt);
  }

  async receive(input: unknown, actor: AuthenticatedUser) {
    const parsed = receiveSchema.safeParse(input);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message);
    }

    const receipt = await this.prisma.$transaction(
      async (tx) => {
        const receivedAt = parsed.data.receivedAt ?? new Date();
        const batchDate = toBatchDate(receivedAt);

        const material = await tx.rawMaterial.findUnique({
          where: { id: parsed.data.rawMaterialId },
          select: { id: true, name: true, isActive: true, unitCost: true },
        });

        if (!material?.isActive) {
          throw new BadRequestException("Selected raw material is not active.");
        }

        if (!material.unitCost) {
          throw new BadRequestException(
            "Management must set this material's unit cost before Store can receive it.",
          );
        }

        if (parsed.data.supplierId) {
          const supplier = await tx.supplier.findUnique({
            where: { id: parsed.data.supplierId },
            select: { id: true, isActive: true },
          });

          if (!supplier?.isActive) {
            throw new BadRequestException("Selected supplier is not active.");
          }
        }

        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "RawMaterial" WHERE "id" = ${parsed.data.rawMaterialId} FOR UPDATE`,
        );

        const existingBatch = await tx.rawMaterialBatch.findUnique({
          where: {
            rawMaterialId_batchDate: {
              rawMaterialId: parsed.data.rawMaterialId,
              batchDate,
            },
          },
        });

        const batch = existingBatch
          ? await tx.rawMaterialBatch.update({
              where: { id: existingBatch.id },
              data: {
                quantityReceived: { increment: parsed.data.quantity },
                quantityRemaining: { increment: parsed.data.quantity },
                receivedAt:
                  receivedAt < existingBatch.receivedAt
                    ? receivedAt
                    : existingBatch.receivedAt,
                supplierId: existingBatch.supplierId ?? parsed.data.supplierId,
                unitCost: existingBatch.unitCost ?? material.unitCost,
                reference: existingBatch.reference ?? parsed.data.reference,
                notes: existingBatch.notes ?? parsed.data.notes,
              },
              include: batchInclude,
            })
          : await tx.rawMaterialBatch.create({
              data: {
                rawMaterialId: parsed.data.rawMaterialId,
                supplierId: parsed.data.supplierId ?? null,
                batchNumber:
                  ((await tx.rawMaterialBatch.findFirst({
                    where: { rawMaterialId: parsed.data.rawMaterialId },
                    orderBy: { batchNumber: "desc" },
                    select: { batchNumber: true },
                  }))?.batchNumber ?? 0) + 1,
                batchDate,
                quantityReceived: parsed.data.quantity,
                quantityRemaining: parsed.data.quantity,
                unitCost: material.unitCost,
                receivedAt,
                reference: parsed.data.reference,
                notes: parsed.data.notes,
                createdById: actor.id,
              },
              include: batchInclude,
            });

        const createdReceipt = await tx.rawMaterialReceipt.create({
          data: {
            rawMaterialId: parsed.data.rawMaterialId,
            batchId: batch.id,
            supplierId: parsed.data.supplierId ?? null,
            quantity: parsed.data.quantity,
            unitCost: material.unitCost,
            receivedAt,
            reference: parsed.data.reference,
            notes: parsed.data.notes,
            createdById: actor.id,
          },
          include: receiptInclude,
        });

        await tx.rawMaterialStockMovement.create({
          data: {
            rawMaterialId: batch.rawMaterialId,
            batchId: batch.id,
            receiptId: createdReceipt.id,
            type: RawMaterialStockMovementType.RECEIVE,
            quantity: parsed.data.quantity,
            balanceAfter: batch.quantityRemaining,
            actorId: actor.id,
            note: parsed.data.reference
              ? `Receipt reference: ${parsed.data.reference}`
              : parsed.data.notes,
          },
        });

        return createdReceipt;
      },
      { timeout: 15000, maxWait: 15000 },
    );

    await this.audit.record({
      actorId: actor.id,
      action: "STORE_RAW_MATERIAL_RECEIVED",
      entityType: "RawMaterialReceipt",
      entityId: receipt.id,
      metadata: {
        rawMaterialId: receipt.rawMaterialId,
        batchId: receipt.batchId,
        batchNumber: receipt.batch.batchNumber,
        batchDate: receipt.batch.batchDate.toISOString(),
        quantity: receipt.quantity.toString(),
      },
    });

    return serializeReceipt(receipt);
  }

  async listMaterialRequests() {
    const requests = await this.prisma.materialRequest.findMany({
      include: requestInclude,
      orderBy: { createdAt: "desc" },
    });

    return requests.map(serializeRequest);
  }

  async issueMaterialRequest(
    requestId: string,
    input: unknown,
    actor: AuthenticatedUser,
  ) {
    const parsed = issueSchema.safeParse(input);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message);
    }

    const updatedRequest = await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "MaterialRequest" WHERE "id" = ${requestId} FOR UPDATE`,
        );

        const request = await tx.materialRequest.findUnique({
          where: { id: requestId },
          include: {
            rawMaterial: { select: rawMaterialSelect },
          },
        });

        if (!request) {
          throw new NotFoundException("Material request not found.");
        }

        if (request.status === MaterialRequestStatus.CANCELLED) {
          throw new BadRequestException("This request has been cancelled.");
        }

        if (request.status === MaterialRequestStatus.REJECTED) {
          throw new BadRequestException("This request has been rejected.");
        }

        if (request.status === MaterialRequestStatus.FULFILLED) {
          throw new BadRequestException("This request has already been fulfilled.");
        }

        const requestedQuantity = decimalToNumber(request.requestedQuantity);
        const issuedQuantity = decimalToNumber(request.issuedQuantity);
        const requestRemaining = roundQuantity(requestedQuantity - issuedQuantity);
        const issueQuantity = parsed.data.quantity ?? requestRemaining;

        if (issueQuantity <= 0) {
          throw new BadRequestException("There is no remaining quantity to issue.");
        }

        if (issueQuantity > requestRemaining) {
          throw new BadRequestException(
            `You can issue at most ${formatQuantity(requestRemaining)} ${request.rawMaterial.baseUnit.abbreviation}.`,
          );
        }

        const lockedBatchIds = await tx.$queryRaw<Array<{ id: string }>>(
          Prisma.sql`
            SELECT "id"
            FROM "RawMaterialBatch"
            WHERE "rawMaterialId" = ${request.rawMaterialId}
              AND "quantityRemaining" > 0
            ORDER BY "receivedAt" ASC, "batchNumber" ASC
            FOR UPDATE
          `,
        );

        const batchIds = lockedBatchIds.map((batch) => batch.id);
        const batches =
          batchIds.length > 0
            ? await tx.rawMaterialBatch.findMany({
                where: { id: { in: batchIds } },
                orderBy: [{ receivedAt: "asc" }, { batchNumber: "asc" }],
              })
            : [];

        const availableQuantity = batches.reduce(
          (sum, batch) => sum + decimalToNumber(batch.quantityRemaining),
          0,
        );

        if (availableQuantity < issueQuantity) {
          throw new BadRequestException(
            `Only ${formatQuantity(availableQuantity)} ${request.rawMaterial.baseUnit.abbreviation} is available in Store.`,
          );
        }

        let remainingToIssue = issueQuantity;

        for (const batch of batches) {
          if (remainingToIssue <= 0) {
            break;
          }

          const batchRemaining = decimalToNumber(batch.quantityRemaining);
          const quantityFromBatch = roundQuantity(
            Math.min(batchRemaining, remainingToIssue),
          );
          const balanceAfter = roundQuantity(batchRemaining - quantityFromBatch);

          await tx.rawMaterialBatch.update({
            where: { id: batch.id },
            data: { quantityRemaining: balanceAfter },
          });

          await tx.rawMaterialStockMovement.create({
            data: {
              rawMaterialId: request.rawMaterialId,
              batchId: batch.id,
              type: RawMaterialStockMovementType.ISSUE,
              quantity: quantityFromBatch,
              balanceAfter,
              actorId: actor.id,
              note: parsed.data.notes,
            },
          });

          const materialIssue = await tx.materialRequestIssue.create({
            data: {
              requestId: request.id,
              batchId: batch.id,
              quantity: quantityFromBatch,
              issuedById: actor.id,
            },
          });

          const productionBatch = await tx.productionMaterialStockBatch.create({
            data: {
              rawMaterialId: request.rawMaterialId,
              materialRequestId: request.id,
              materialRequestIssueId: materialIssue.id,
              storeBatchId: batch.id,
              quantityReceived: quantityFromBatch,
              quantityRemaining: quantityFromBatch,
              receivedAt: materialIssue.createdAt,
              createdById: actor.id,
            },
          });

          await tx.productionMaterialStockMovement.create({
            data: {
              rawMaterialId: request.rawMaterialId,
              productionBatchId: productionBatch.id,
              type: ProductionMaterialStockMovementType.RECEIVE_FROM_STORE,
              quantity: quantityFromBatch,
              balanceAfter: quantityFromBatch,
              actorId: actor.id,
              note: parsed.data.notes ?? "Issued from Store",
            },
          });

          remainingToIssue = roundQuantity(remainingToIssue - quantityFromBatch);
        }

        const nextIssuedQuantity = roundQuantity(issuedQuantity + issueQuantity);
        const nextStatus =
          nextIssuedQuantity >= requestedQuantity
            ? MaterialRequestStatus.FULFILLED
            : MaterialRequestStatus.PARTIALLY_ISSUED;

        return tx.materialRequest.update({
          where: { id: request.id },
          data: {
            issuedQuantity: nextIssuedQuantity,
            status: nextStatus,
            issuedById: actor.id,
            fulfilledAt:
              nextStatus === MaterialRequestStatus.FULFILLED ? new Date() : null,
            responseNotes: parsed.data.notes ?? request.responseNotes,
          },
          include: requestInclude,
        });
      },
      { timeout: 15000, maxWait: 15000 },
    );

    await this.audit.record({
      actorId: actor.id,
      action: "STORE_MATERIAL_REQUEST_ISSUED",
      entityType: "MaterialRequest",
      entityId: updatedRequest.id,
      metadata: {
        status: updatedRequest.status,
        rawMaterialId: updatedRequest.rawMaterialId,
        issuedQuantity: updatedRequest.issuedQuantity.toString(),
      },
    });

    return serializeRequest(updatedRequest);
  }

  async rejectMaterialRequest(
    requestId: string,
    input: unknown,
    actor: AuthenticatedUser,
  ) {
    const parsed = rejectSchema.safeParse(input);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message);
    }

    const existing = await this.prisma.materialRequest.findUnique({
      where: { id: requestId },
      select: { id: true, status: true },
    });

    if (!existing) {
      throw new NotFoundException("Material request not found.");
    }

    if (existing.status !== MaterialRequestStatus.PENDING) {
      throw new BadRequestException("Only pending requests can be rejected.");
    }

    // Conditional update so a concurrent issue/reject cannot both win.
    const rejected = await this.prisma.materialRequest.updateMany({
      where: { id: requestId, status: MaterialRequestStatus.PENDING },
      data: {
        status: MaterialRequestStatus.REJECTED,
        issuedById: actor.id,
        responseNotes: parsed.data.notes ?? null,
      },
    });

    if (rejected.count === 0) {
      throw new BadRequestException(
        "This request was updated by someone else. Refresh and try again.",
      );
    }

    const request = await this.prisma.materialRequest.findUniqueOrThrow({
      where: { id: requestId },
      include: requestInclude,
    });

    await this.audit.record({
      actorId: actor.id,
      action: "STORE_MATERIAL_REQUEST_REJECTED",
      entityType: "MaterialRequest",
      entityId: request.id,
      metadata: {
        rawMaterialId: request.rawMaterialId,
        requestedQuantity: request.requestedQuantity.toString(),
        notes: parsed.data.notes ?? null,
      },
    });

    return serializeRequest(request);
  }
}
