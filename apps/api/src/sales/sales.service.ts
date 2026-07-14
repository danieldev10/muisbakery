import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  CustomerType,
  FinishedProductStockMovementType,
  PaymentMethod,
  PosOfflineSyncStatus,
  PosSessionStatus,
  PosTerminalStockMovementType,
  Prisma,
  RetailerOrderApprovalStatus,
  SalesReturnDisposition,
} from "@prisma/client";

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
import { recordBusinessDayActivity } from "./business-day";
import { PosDisplayEvents } from "./pos-display-events";
import {
  createPosSessionSchema,
  createPosTerminalSchema,
  adjustTerminalStockSchema,
  pairPosTerminalSchema,
  rePairPosTerminalSchema,
  createRetailerOrderApprovalSchema,
  createRetailerSchema,
  createSaleSchema,
  recordRetailerPaymentSchema,
  requestRetailerOrderApprovalSchema,
  setTerminalRetailerCreditAllocationSchema,
  setTerminalStockAllocationSchema,
  syncOfflinePosBatchSchema,
  syncOfflinePosSaleSchema,
  updateRetailerOrderApprovalSchema,
  recordReturnSchema,
  updateRetailerSchema,
  updatePosTerminalSchema,
  updatePosSessionSchema,
  upsertPosSessionItemSchema,
  type CreateSaleInput,
  type SyncOfflinePosSaleInput,
} from "./sales.schemas";
import {
  inventoryInclude,
  posOfflineSyncAttemptInclude,
  posSessionInclude,
  posTerminalInclude,
  productSelect,
  retailerPaymentSelect,
  retailerSelect,
  returnInclude,
  saleInclude,
  saleItemOptionInclude,
  type PosSessionWithIncludes,
  type SalesReturnWithIncludes,
  type SaleWithIncludes,
} from "./sales.queries";
import {
  serializeInventoryItem,
  serializePairedPosTerminal,
  serializePosOfflineSyncAttempt,
  serializePosSession,
  serializePosTerminal,
  serializeRetailer,
  serializeRetailerPayment,
  serializeReturn,
  serializeSale,
  serializeSaleItemOption,
} from "./sales.serializers";
import {
  decimalToNumber,
  formatQuantity,
  generateDisplayToken,
  productLabel,
  roundMoney,
  roundQuantity,
  toDayRange,
} from "./sales.utils";

function numericSearch(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value.replace(/^#/, ""), 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function jsonPayload(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function hashSecret(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function secretsMatch(value: string | undefined, hash: string | null) {
  if (!value || !hash) {
    return false;
  }

  const candidate = Buffer.from(hashSecret(value), "hex");
  const stored = Buffer.from(hash, "hex");

  return candidate.length === stored.length && timingSafeEqual(candidate, stored);
}

function generateDeviceSecret() {
  return randomBytes(32).toString("base64url");
}

const POS_PAIRING_CODE_TTL_MS = 60 * 60 * 1000;

function posPairingCodeExpiresAt() {
  return new Date(Date.now() + POS_PAIRING_CODE_TTL_MS);
}

function saleWhere(query: QueryParams | undefined) {
  const search = queryText(query, "q");
  const saleNumber = numericSearch(search);
  const payment = queryText(query, "payment");
  const customerType = queryText(query, "customerType");
  const productId = queryText(query, "product");
  const soldAt = dateRangeFilter(
    queryText(query, "from"),
    queryText(query, "to"),
  );
  const where: Prisma.SaleWhereInput = {};

  if (
    payment &&
    Object.values(PaymentMethod).includes(payment as PaymentMethod)
  ) {
    where.paymentMethod = payment as PaymentMethod;
  }

  if (
    customerType &&
    Object.values(CustomerType).includes(customerType as CustomerType)
  ) {
    where.customerType = customerType as CustomerType;
  }

  if (productId) {
    where.items = { some: { productId } };
  }

  if (soldAt) {
    where.soldAt = soldAt;
  }

  if (search) {
    where.OR = [
      { customerName: containsFilter(search) },
      { retailer: { name: containsFilter(search) } },
      { notes: containsFilter(search) },
      { createdBy: { name: containsFilter(search) } },
      { createdBy: { email: containsFilter(search) } },
      { items: { some: { product: { name: containsFilter(search) } } } },
      { items: { some: { product: { size: containsFilter(search) } } } },
    ];

    if (saleNumber !== undefined) {
      where.OR.push({ saleNumber });
    }

    if (Object.values(PaymentMethod).includes(search as PaymentMethod)) {
      where.OR.push({ paymentMethod: search as PaymentMethod });
    }

    if (Object.values(CustomerType).includes(search as CustomerType)) {
      where.OR.push({ customerType: search as CustomerType });
    }
  }

  return where;
}

function returnWhere(query: QueryParams | undefined) {
  const search = queryText(query, "q");
  const saleNumber = numericSearch(search);
  const productId = queryText(query, "product");
  const disposition = queryText(query, "disposition");
  const recordedAt = dateRangeFilter(
    queryText(query, "from"),
    queryText(query, "to"),
  );
  const where: Prisma.SalesProductReturnWhereInput = {};

  if (productId) {
    where.productId = productId;
  }

  if (
    disposition &&
    Object.values(SalesReturnDisposition).includes(
      disposition as SalesReturnDisposition,
    )
  ) {
    where.disposition = disposition as SalesReturnDisposition;
  }

  if (recordedAt) {
    where.recordedAt = recordedAt;
  }

  if (search) {
    where.OR = [
      { reason: containsFilter(search) },
      { product: { name: containsFilter(search) } },
      { product: { size: containsFilter(search) } },
      { createdBy: { name: containsFilter(search) } },
      { createdBy: { email: containsFilter(search) } },
    ];

    if (saleNumber !== undefined) {
      where.OR.push({
        saleItem: {
          sale: {
            saleNumber,
          },
        },
      });
      where.OR.push({ batch: { batchNumber: saleNumber } });
    }

    if (
      Object.values(SalesReturnDisposition).includes(
        search as SalesReturnDisposition,
      )
    ) {
      where.OR.push({ disposition: search as SalesReturnDisposition });
    }
  }

  return where;
}

function offlineSyncWhere(query: QueryParams | undefined) {
  const search = queryText(query, "q");
  const status = queryText(query, "status");
  const terminalId = queryText(query, "terminalId");
  const attemptedAt = dateRangeFilter(
    queryText(query, "from"),
    queryText(query, "to"),
  );
  const where: Prisma.PosOfflineSyncAttemptWhereInput = {};

  if (
    status &&
    Object.values(PosOfflineSyncStatus).includes(status as PosOfflineSyncStatus)
  ) {
    where.status = status as PosOfflineSyncStatus;
  }

  if (terminalId) {
    where.terminalId = terminalId;
  }

  if (attemptedAt) {
    where.attemptedAt = attemptedAt;
  }

  if (search) {
    where.OR = [
      { clientRequestId: containsFilter(search) },
      { errorMessage: containsFilter(search) },
      { conflictCode: containsFilter(search) },
      { terminal: { name: containsFilter(search) } },
    ];
  }

  return where;
}

@Injectable()
export class SalesService {
  private readonly logger = new Logger(SalesService.name);

  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(AuditService)
    private readonly audit: AuditService,
    @Inject(PosDisplayEvents)
    private readonly posDisplayEvents: PosDisplayEvents,
  ) {}

  async inventory() {
    const products = await this.prisma.product.findMany({
      where: {
        OR: [
          { isActive: true },
          { salesBatches: { some: { quantityRemaining: { gt: 0 } } } },
        ],
      },
      include: inventoryInclude,
      orderBy: { name: "asc" },
    });

    return products.map(serializeInventoryItem);
  }

  async options() {
    const [products, saleItems, retailers] = await Promise.all([
      this.prisma.product.findMany({
        where: {
          isActive: true,
          salesBatches: { some: { quantityRemaining: { gt: 0 } } },
        },
        include: inventoryInclude,
        orderBy: { name: "asc" },
      }),
      this.prisma.saleItem.findMany({
        include: saleItemOptionInclude,
        orderBy: { createdAt: "desc" },
        take: 80,
      }),
      this.listRetailers(),
    ]);

    return {
      products: products.map(serializeInventoryItem),
      saleItems: saleItems
        .map(serializeSaleItemOption)
        .filter((item) => Number(item.returnableQuantity) > 0),
      retailers: retailers.filter((retailer) => retailer.isActive),
      paymentMethods: Object.values(PaymentMethod),
      returnDispositions: Object.values(SalesReturnDisposition),
    };
  }

  async listRetailers() {
    const retailers = await this.prisma.retailer.findMany({
      select: retailerSelect,
      orderBy: { name: "asc" },
    });
    const retailerIds = retailers.map((retailer) => retailer.id);
    const balances =
      retailerIds.length > 0
        ? await this.prisma.sale.groupBy({
            by: ["retailerId"],
            where: {
              retailerId: { in: retailerIds },
              balanceDue: { gt: 0 },
            },
            _sum: { balanceDue: true },
          })
        : [];
    const balanceByRetailer = new Map(
      balances.map((entry) => [
        entry.retailerId,
        decimalToNumber(entry._sum.balanceDue ?? 0),
      ]),
    );

    return retailers.map((retailer) => {
      const outstandingBalance = balanceByRetailer.get(retailer.id) ?? 0;

      return serializeRetailer(retailer, {
        outstandingBalance,
      });
    });
  }

  async createRetailer(input: unknown, actor: AuthenticatedUser) {
    const parsed = createRetailerSchema.safeParse(input);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message);
    }

    const existing = await this.prisma.retailer.findUnique({
      where: { name: parsed.data.name },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException("A retailer with this name already exists.");
    }

    const retailer = await this.prisma.retailer.create({
      data: {
        name: parsed.data.name,
        contactPerson: parsed.data.contactPerson,
        phone: parsed.data.phone,
        email: parsed.data.email,
        address: parsed.data.address,
        creditLimit: new Prisma.Decimal(0),
        notes: parsed.data.notes,
        createdById: actor.id,
      },
      select: retailerSelect,
    });

    await this.audit.record({
      actorId: actor.id,
      action: "SALES_RETAILER_CREATED",
      entityType: "Retailer",
      entityId: retailer.id,
      metadata: {
        retailerName: retailer.name,
      },
    });

    return serializeRetailer(retailer);
  }

  async updateRetailer(
    id: string,
    input: unknown,
    actor: AuthenticatedUser,
  ) {
    const parsed = updateRetailerSchema.safeParse(input);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message);
    }

    const target = await this.prisma.retailer.findUnique({
      where: { id },
      select: retailerSelect,
    });

    if (!target) {
      throw new NotFoundException("Retailer not found.");
    }

    if (parsed.data.name && parsed.data.name !== target.name) {
      const clash = await this.prisma.retailer.findUnique({
        where: { name: parsed.data.name },
        select: { id: true },
      });

      if (clash && clash.id !== target.id) {
        throw new ConflictException("A retailer with this name already exists.");
      }
    }

    const retailer = await this.prisma.retailer.update({
      where: { id },
      data: {
        name: parsed.data.name,
        contactPerson: parsed.data.contactPerson,
        phone: parsed.data.phone,
        email: parsed.data.email,
        address: parsed.data.address,
        notes: parsed.data.notes,
        isActive: parsed.data.isActive,
      },
      select: retailerSelect,
    });

    await this.audit.record({
      actorId: actor.id,
      action: "SALES_RETAILER_UPDATED",
      entityType: "Retailer",
      entityId: retailer.id,
      metadata: {
        retailerName: retailer.name,
        isActive: retailer.isActive,
        before: {
          name: target.name,
          contactPerson: target.contactPerson,
          phone: target.phone,
          email: target.email,
          address: target.address,
          notes: target.notes,
          isActive: target.isActive,
        },
        after: {
          name: retailer.name,
          contactPerson: retailer.contactPerson,
          phone: retailer.phone,
          email: retailer.email,
          address: retailer.address,
          notes: retailer.notes,
          isActive: retailer.isActive,
        },
      },
    });

    return serializeRetailer(retailer);
  }

  async createRetailerOrderApproval(
    retailerId: string,
    input: unknown,
    actor: AuthenticatedUser,
  ) {
    const parsed = createRetailerOrderApprovalSchema.safeParse(input);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message);
    }

    const retailer = await this.prisma.retailer.findUnique({
      where: { id: retailerId },
      select: { id: true, name: true, isActive: true },
    });

    if (!retailer) {
      throw new NotFoundException("Retailer not found.");
    }

    if (!retailer.isActive) {
      throw new BadRequestException("That retailer account is inactive.");
    }

    if (parsed.data.terminalId) {
      const terminal = await this.prisma.posTerminal.findUnique({
        where: { id: parsed.data.terminalId },
        select: { id: true, isActive: true },
      });

      if (!terminal) {
        throw new NotFoundException("POS terminal not found.");
      }

      if (!terminal.isActive) {
        throw new BadRequestException("That POS terminal is inactive.");
      }
    }

    const approval = await this.prisma.retailerOrderApproval.create({
      data: {
        retailerId: retailer.id,
        terminalId: parsed.data.terminalId,
        approvedAmount: new Prisma.Decimal(
          roundMoney(parsed.data.approvedAmount).toFixed(2),
        ),
        status: RetailerOrderApprovalStatus.APPROVED,
        reason: parsed.data.reason,
        expiresAt: parsed.data.expiresAt,
        reviewedAt: new Date(),
        approvedById: actor.id,
      },
      select: {
        id: true,
        approvedAmount: true,
        status: true,
        reason: true,
        expiresAt: true,
        usedAt: true,
        createdAt: true,
        reviewedAt: true,
        terminal: { select: { id: true, name: true } },
        requestedBy: { select: { id: true, name: true, email: true } },
        approvedBy: { select: { id: true, name: true, email: true } },
      },
    });

    await this.audit.record({
      actorId: actor.id,
      action: "ADMIN_RETAILER_ORDER_APPROVAL_CREATED",
      entityType: "RetailerOrderApproval",
      entityId: approval.id,
      metadata: {
        retailerId: retailer.id,
        retailerName: retailer.name,
        terminalId: parsed.data.terminalId ?? null,
        approvedAmount: approval.approvedAmount.toString(),
        expiresAt: approval.expiresAt?.toISOString() ?? null,
      },
    });

    return {
      id: approval.id,
      approvedAmount: approval.approvedAmount.toString(),
      status: approval.status,
      reason: approval.reason,
      terminal: approval.terminal,
      expiresAt: approval.expiresAt?.toISOString() ?? null,
      usedAt: approval.usedAt?.toISOString() ?? null,
      createdAt: approval.createdAt.toISOString(),
      reviewedAt: approval.reviewedAt?.toISOString() ?? null,
      requestedBy: approval.requestedBy,
      approvedBy: approval.approvedBy,
    };
  }

  async requestRetailerOrderApproval(
    retailerId: string,
    input: unknown,
    actor: AuthenticatedUser,
  ) {
    const parsed = requestRetailerOrderApprovalSchema.safeParse(input);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message);
    }

    const retailer = await this.prisma.retailer.findUnique({
      where: { id: retailerId },
      select: { id: true, name: true, isActive: true },
    });

    if (!retailer) {
      throw new NotFoundException("Retailer not found.");
    }

    if (!retailer.isActive) {
      throw new BadRequestException("That retailer account is inactive.");
    }

    const balance = await this.prisma.sale.aggregate({
      where: {
        retailerId: retailer.id,
        balanceDue: { gt: 0 },
      },
      _sum: { balanceDue: true },
    });
    const outstandingBalance = decimalToNumber(balance._sum.balanceDue ?? 0);

    if (outstandingBalance <= 0) {
      throw new BadRequestException(
        "This retailer has no uncleared credit, so Admin approval is not required.",
      );
    }

    if (parsed.data.terminalId) {
      const terminal = await this.prisma.posTerminal.findUnique({
        where: { id: parsed.data.terminalId },
        select: { id: true, isActive: true },
      });

      if (!terminal) {
        throw new NotFoundException("POS terminal not found.");
      }

      if (!terminal.isActive) {
        throw new BadRequestException("That POS terminal is inactive.");
      }
    }

    const approval = await this.prisma.retailerOrderApproval.create({
      data: {
        retailerId: retailer.id,
        terminalId: parsed.data.terminalId,
        approvedAmount: new Prisma.Decimal(
          roundMoney(parsed.data.requestedAmount).toFixed(2),
        ),
        status: RetailerOrderApprovalStatus.PENDING,
        reason: parsed.data.reason,
        requestedById: actor.id,
      },
      select: {
        id: true,
        approvedAmount: true,
        status: true,
        reason: true,
        expiresAt: true,
        usedAt: true,
        createdAt: true,
        reviewedAt: true,
        terminal: { select: { id: true, name: true } },
        requestedBy: { select: { id: true, name: true, email: true } },
        approvedBy: { select: { id: true, name: true, email: true } },
      },
    });

    await this.audit.record({
      actorId: actor.id,
      action: "SALES_RETAILER_ORDER_APPROVAL_REQUESTED",
      entityType: "RetailerOrderApproval",
      entityId: approval.id,
      metadata: {
        retailerId: retailer.id,
        retailerName: retailer.name,
        terminalId: parsed.data.terminalId ?? null,
        requestedAmount: approval.approvedAmount.toString(),
        outstandingBalance: outstandingBalance.toFixed(2),
      },
    });

    return {
      id: approval.id,
      approvedAmount: approval.approvedAmount.toString(),
      status: approval.status,
      reason: approval.reason,
      terminal: approval.terminal,
      expiresAt: approval.expiresAt?.toISOString() ?? null,
      usedAt: approval.usedAt?.toISOString() ?? null,
      createdAt: approval.createdAt.toISOString(),
      reviewedAt: approval.reviewedAt?.toISOString() ?? null,
      requestedBy: approval.requestedBy,
      approvedBy: approval.approvedBy,
    };
  }

  async updateRetailerOrderApproval(
    retailerId: string,
    approvalId: string,
    input: unknown,
    actor: AuthenticatedUser,
  ) {
    const parsed = updateRetailerOrderApprovalSchema.safeParse(input);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message);
    }

    const existing = await this.prisma.retailerOrderApproval.findUnique({
      where: { id: approvalId },
      select: { id: true, retailerId: true, status: true, usedAt: true },
    });

    if (!existing || existing.retailerId !== retailerId) {
      throw new NotFoundException("Retailer order approval not found.");
    }

    if (existing.status === RetailerOrderApprovalStatus.USED || existing.usedAt) {
      throw new BadRequestException("Used retailer approvals cannot be changed.");
    }

    // Conditional update: a checkout can consume this approval between the
    // read above and here, and a review must never overwrite a USED approval.
    const updated = await this.prisma.retailerOrderApproval.updateMany({
      where: {
        id: approvalId,
        status: { not: RetailerOrderApprovalStatus.USED },
        usedAt: null,
      },
      data: {
        status: parsed.data.status,
        ...(parsed.data.status === RetailerOrderApprovalStatus.APPROVED
          ? { approvedById: actor.id, reviewedAt: new Date() }
          : {}),
        ...(parsed.data.status === RetailerOrderApprovalStatus.REVOKED
          ? { reviewedAt: new Date() }
          : {}),
      },
    });

    if (updated.count === 0) {
      throw new BadRequestException("Used retailer approvals cannot be changed.");
    }

    const approval = await this.prisma.retailerOrderApproval.findUniqueOrThrow({
      where: { id: approvalId },
      select: {
        id: true,
        approvedAmount: true,
        status: true,
        reason: true,
        expiresAt: true,
        usedAt: true,
        createdAt: true,
        reviewedAt: true,
        terminal: { select: { id: true, name: true } },
        requestedBy: { select: { id: true, name: true, email: true } },
        approvedBy: { select: { id: true, name: true, email: true } },
      },
    });

    await this.audit.record({
      actorId: actor.id,
      action: "ADMIN_RETAILER_ORDER_APPROVAL_UPDATED",
      entityType: "RetailerOrderApproval",
      entityId: approval.id,
      metadata: {
        retailerId,
        beforeStatus: existing.status,
        afterStatus: approval.status,
      },
    });

    return {
      id: approval.id,
      approvedAmount: approval.approvedAmount.toString(),
      status: approval.status,
      reason: approval.reason,
      terminal: approval.terminal,
      expiresAt: approval.expiresAt?.toISOString() ?? null,
      usedAt: approval.usedAt?.toISOString() ?? null,
      createdAt: approval.createdAt.toISOString(),
      reviewedAt: approval.reviewedAt?.toISOString() ?? null,
      requestedBy: approval.requestedBy,
      approvedBy: approval.approvedBy,
    };
  }

  async listRetailerPayments(retailerId?: string) {
    const payments = await this.prisma.retailerPayment.findMany({
      where: retailerId ? { retailerId } : undefined,
      select: retailerPaymentSelect,
      orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
      take: 120,
    });

    return payments.map(serializeRetailerPayment);
  }

  async recordRetailerPayment(
    retailerId: string,
    input: unknown,
    actor: AuthenticatedUser,
  ) {
    const parsed = recordRetailerPaymentSchema.safeParse(input);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message);
    }

    const payment = await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "Retailer" WHERE "id" = ${retailerId} FOR UPDATE`,
        );

        const retailer = await tx.retailer.findUnique({
          where: { id: retailerId },
          select: { id: true, name: true },
        });

        if (!retailer) {
          throw new NotFoundException("Retailer not found.");
        }

        const lockedSaleIds = await tx.$queryRaw<Array<{ id: string }>>(
          Prisma.sql`
            SELECT "id"
            FROM "Sale"
            WHERE "retailerId" = ${retailer.id}
              AND "balanceDue" > 0
            ORDER BY "soldAt" ASC, "saleNumber" ASC
            FOR UPDATE
          `,
        );
        const sales =
          lockedSaleIds.length > 0
            ? await tx.sale.findMany({
                where: { id: { in: lockedSaleIds.map((sale) => sale.id) } },
                select: {
                  id: true,
                  terminalId: true,
                  saleNumber: true,
                  amountPaid: true,
                  balanceDue: true,
                },
                orderBy: [{ soldAt: "asc" }, { saleNumber: "asc" }],
              })
            : [];
        const outstandingBalance = roundMoney(
          sales.reduce(
            (sum, sale) => sum + decimalToNumber(sale.balanceDue),
            0,
          ),
        );
        const amount = roundMoney(parsed.data.amount);

        if (outstandingBalance <= 0) {
          throw new BadRequestException(
            "This retailer does not have any outstanding credit balance.",
          );
        }

        if (amount > outstandingBalance) {
          throw new BadRequestException(
            `Payment cannot exceed outstanding balance of ₦${outstandingBalance.toLocaleString(
              "en",
              {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              },
            )}.`,
          );
        }

        const paidAt = parsed.data.paidAt ?? new Date();
        await recordBusinessDayActivity(tx, paidAt);

        const createdPayment = await tx.retailerPayment.create({
          data: {
            retailerId: retailer.id,
            amount: new Prisma.Decimal(amount.toFixed(2)),
            paymentMethod: parsed.data.paymentMethod,
            paidAt,
            reference: parsed.data.reference,
            notes: parsed.data.notes,
            createdById: actor.id,
          },
        });
        let remaining = amount;

        for (const sale of sales) {
          if (remaining <= 0) {
            break;
          }

          const saleBalance = decimalToNumber(sale.balanceDue);
          const allocationAmount = roundMoney(Math.min(saleBalance, remaining));

          if (allocationAmount <= 0) {
            continue;
          }

          await tx.sale.update({
            where: { id: sale.id },
            data: {
              amountPaid: new Prisma.Decimal(
                roundMoney(
                  decimalToNumber(sale.amountPaid) + allocationAmount,
                ).toFixed(2),
              ),
              balanceDue: new Prisma.Decimal(
                roundMoney(saleBalance - allocationAmount).toFixed(2),
              ),
            },
          });

          await tx.retailerPaymentAllocation.create({
            data: {
              paymentId: createdPayment.id,
              saleId: sale.id,
              amount: new Prisma.Decimal(allocationAmount.toFixed(2)),
            },
          });

          if (sale.terminalId) {
            const lockedAllocationIds = await tx.$queryRaw<
              Array<{ id: string }>
            >(
              Prisma.sql`
                SELECT "id"
                FROM "PosTerminalRetailerCreditAllocation"
                WHERE "terminalId" = ${sale.terminalId}
                  AND "retailerId" = ${retailer.id}
                FOR UPDATE
              `,
            );
            const lockedAllocationId = lockedAllocationIds[0]?.id;
            const creditAllocation = lockedAllocationId
              ? await tx.posTerminalRetailerCreditAllocation.findUnique({
                  where: { id: lockedAllocationId },
                  select: { id: true, usedAmount: true },
                })
              : null;

            if (creditAllocation) {
              const nextUsedAmount = roundMoney(
                Math.max(
                  0,
                  decimalToNumber(creditAllocation.usedAmount) -
                    allocationAmount,
                ),
              );

              await tx.posTerminalRetailerCreditAllocation.update({
                where: { id: creditAllocation.id },
                data: {
                  usedAmount: new Prisma.Decimal(nextUsedAmount.toFixed(2)),
                },
              });
            }
          }

          remaining = roundMoney(remaining - allocationAmount);
        }

        return tx.retailerPayment.findUniqueOrThrow({
          where: { id: createdPayment.id },
          select: retailerPaymentSelect,
        });
      },
      { timeout: 15000, maxWait: 15000 },
    );

    await this.audit.record({
      actorId: actor.id,
      action: "SALES_RETAILER_PAYMENT_RECORDED",
      entityType: "RetailerPayment",
      entityId: payment.id,
      metadata: {
        retailerId: payment.retailer.id,
        retailerName: payment.retailer.name,
        amount: payment.amount.toString(),
        paymentMethod: payment.paymentMethod,
        settledSales: payment.allocations.map(
          (allocation) => allocation.sale.saleNumber,
        ),
      },
    });

    return serializeRetailerPayment(payment);
  }

  async createPosTerminal(input: unknown, actor: AuthenticatedUser) {
    const parsed = createPosTerminalSchema.safeParse(input ?? {});

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message);
    }

    const terminal = await this.prisma.posTerminal.create({
      data: {
        name: parsed.data.name,
        displayToken: generateDisplayToken(),
        pairingCodeHash: hashSecret(parsed.data.pairingCode),
        pairingCodeExpiresAt: posPairingCodeExpiresAt(),
        offlineEnabled: parsed.data.offlineEnabled ?? false,
        createdById: actor.id,
      },
      include: posTerminalInclude,
    });

    await this.audit.record({
      actorId: actor.id,
      action: "ADMIN_POS_TERMINAL_CREATED",
      entityType: "PosTerminal",
      entityId: terminal.id,
      metadata: {
        name: terminal.name,
        offlineEnabled: terminal.offlineEnabled,
        pairingCodeExpiresAt: terminal.pairingCodeExpiresAt?.toISOString() ?? null,
      },
    });

    return serializePosTerminal(terminal);
  }

  async listPosTerminals() {
    const terminals = await this.prisma.posTerminal.findMany({
      include: posTerminalInclude,
      orderBy: [{ createdAt: "desc" }],
    });

    return terminals.map(serializePosTerminal);
  }

  async updatePosTerminal(
    id: string,
    input: unknown,
    actor: AuthenticatedUser,
  ) {
    const parsed = updatePosTerminalSchema.safeParse(input ?? {});

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message);
    }

    const existing = await this.prisma.posTerminal.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException("POS terminal not found.");
    }

    const terminal = await this.prisma.posTerminal.update({
      where: { id },
      data: {
        name: parsed.data.name,
        isActive: parsed.data.isActive,
        offlineEnabled: parsed.data.offlineEnabled,
        // Rotation invalidates a leaked customer-display URL without
        // recreating the terminal.
        ...(parsed.data.rotateDisplayToken
          ? { displayToken: generateDisplayToken() }
          : {}),
      },
      include: posTerminalInclude,
    });

    await this.audit.record({
      actorId: actor.id,
      action: "ADMIN_POS_TERMINAL_UPDATED",
      entityType: "PosTerminal",
      entityId: terminal.id,
      metadata: {
        name: terminal.name,
        isActive: terminal.isActive,
        offlineEnabled: terminal.offlineEnabled,
        displayTokenRotated: Boolean(parsed.data.rotateDisplayToken),
      },
    });

    return serializePosTerminal(terminal);
  }

  async rePairPosTerminal(
    id: string,
    input: unknown,
    actor: AuthenticatedUser,
  ) {
    const parsed = rePairPosTerminalSchema.safeParse(input ?? {});

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message);
    }

    const existing = await this.prisma.posTerminal.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        isActive: true,
        pairedAt: true,
        deviceSecretIssuedAt: true,
      },
    });

    if (!existing) {
      throw new NotFoundException("POS terminal not found.");
    }

    if (!existing.isActive) {
      throw new BadRequestException(
        "Activate this POS terminal before generating a pairing code.",
      );
    }

    const pairingCodeExpiresAt = posPairingCodeExpiresAt();
    const terminal = await this.prisma.posTerminal.update({
      where: { id },
      data: {
        pairingCodeHash: hashSecret(parsed.data.pairingCode),
        pairingCodeExpiresAt,
        pairedAt: null,
        pairedById: null,
        deviceSecretHash: null,
        deviceSecretIssuedAt: null,
        lastSeenAt: null,
      },
      include: posTerminalInclude,
    });

    await this.audit.record({
      actorId: actor.id,
      action: "ADMIN_POS_TERMINAL_REPAIR_STARTED",
      entityType: "PosTerminal",
      entityId: terminal.id,
      metadata: {
        terminalName: terminal.name,
        previousPairedAt: existing.pairedAt?.toISOString() ?? null,
        previousDeviceSecretIssuedAt:
          existing.deviceSecretIssuedAt?.toISOString() ?? null,
        pairingCodeExpiresAt: pairingCodeExpiresAt.toISOString(),
      },
    });

    return serializePosTerminal(terminal);
  }

  async pairPosTerminal(input: unknown, actor: AuthenticatedUser) {
    const parsed = pairPosTerminalSchema.safeParse(input ?? {});

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message);
    }

    const existing = await this.prisma.posTerminal.findUnique({
      where: { id: parsed.data.terminalId },
      select: {
        id: true,
        isActive: true,
        pairingCodeHash: true,
        pairingCodeExpiresAt: true,
        pairedAt: true,
        deviceSecretHash: true,
      },
    });

    if (!existing) {
      throw new NotFoundException("POS terminal not found.");
    }

    if (!existing.isActive) {
      throw new BadRequestException("This POS terminal has been deactivated.");
    }

    if (existing.pairedAt || existing.deviceSecretHash) {
      throw new ConflictException(
        "This POS terminal is already paired. Ask Admin to start re-pairing.",
      );
    }

    if (
      !existing.pairingCodeHash ||
      !secretsMatch(parsed.data.pairingCode, existing.pairingCodeHash)
    ) {
      throw new BadRequestException("Invalid POS terminal pairing code.");
    }

    if (
      !existing.pairingCodeExpiresAt ||
      existing.pairingCodeExpiresAt.getTime() <= Date.now()
    ) {
      throw new BadRequestException(
        "This POS terminal pairing code has expired. Ask Admin for a new code.",
      );
    }

    const pairedAt = new Date();
    const deviceSecret = generateDeviceSecret();
    const paired = await this.prisma.posTerminal.updateMany({
      where: {
        id: existing.id,
        isActive: true,
        pairedAt: null,
        deviceSecretHash: null,
        pairingCodeHash: existing.pairingCodeHash,
        pairingCodeExpiresAt: { gt: pairedAt },
      },
      data: {
        pairingCodeHash: null,
        pairingCodeExpiresAt: null,
        pairedAt,
        pairedById: actor.id,
        deviceSecretHash: hashSecret(deviceSecret),
        deviceSecretIssuedAt: pairedAt,
        lastSeenAt: pairedAt,
      },
    });

    if (paired.count === 0) {
      throw new ConflictException(
        "This pairing code was already used or the terminal pairing changed. Ask Admin for a new code.",
      );
    }

    const terminal = await this.prisma.posTerminal.findUniqueOrThrow({
      where: { id: existing.id },
      include: posTerminalInclude,
    });

    await this.audit.record({
      actorId: actor.id,
      action: "SALES_POS_TERMINAL_PAIRED",
      entityType: "PosTerminal",
      entityId: terminal.id,
      metadata: {
        terminalName: terminal.name,
      },
    });

    return serializePairedPosTerminal(terminal, deviceSecret);
  }

  private async assertTerminalDevice(
    id: string | undefined | null,
    deviceSecret: string | undefined,
  ) {
    if (!id) {
      return null;
    }

    const existing = await this.prisma.posTerminal.findUnique({
      where: { id },
      select: {
        id: true,
        displayToken: true,
        isActive: true,
        deviceSecretHash: true,
      },
    });

    if (!existing) {
      throw new NotFoundException("POS terminal not found.");
    }

    if (!existing.isActive) {
      throw new BadRequestException("This POS terminal has been deactivated.");
    }

    if (!secretsMatch(deviceSecret, existing.deviceSecretHash)) {
      throw new BadRequestException(
        "This device is not paired to that POS terminal.",
      );
    }

    return existing;
  }

  async getPosTerminal(id: string, deviceSecret: string | undefined) {
    await this.assertTerminalDevice(id, deviceSecret);

    const terminal = await this.prisma.posTerminal.update({
      where: { id },
      data: { lastSeenAt: new Date() },
      include: posTerminalInclude,
    });

    return serializePosTerminal(terminal);
  }

  async getPosOfflineSnapshot(id: string, deviceSecret: string | undefined) {
    await this.assertTerminalDevice(id, deviceSecret);

    const terminal = await this.prisma.posTerminal.update({
      where: { id },
      data: { lastSeenAt: new Date() },
      include: posTerminalInclude,
    });

    if (!terminal.offlineEnabled) {
      throw new BadRequestException(
        "Offline mode is not enabled for this POS terminal.",
      );
    }

    const serializedTerminal = serializePosTerminal(terminal);
    const allocationVersion = terminal.stockAllocations
      .map(
        (allocation) =>
          `${allocation.id}:${allocation.allocatedQuantity}:${allocation.soldQuantity}:${allocation.updatedAt.getTime()}:${allocation.batches
            .map(
              (batch) =>
                `${batch.id}:${batch.quantityRemaining}:${batch.updatedAt.getTime()}`,
            )
            .join(",")}`,
      )
      .join("|");
    const creditVersion = terminal.retailerCreditAllocations
      .map(
        (allocation) =>
          `${allocation.id}:${allocation.allocatedAmount.toString()}:${allocation.usedAmount.toString()}:${allocation.isActive}:${allocation.updatedAt.getTime()}`,
      )
      .join("|");

    return {
      terminal: serializedTerminal,
      products: serializedTerminal.stockAllocations.map((allocation) => ({
        allocation,
        inventory: {
          product: allocation.product,
          totalRemaining: allocation.remainingQuantity,
          batches: allocation.batches
            .filter((batch) => Number(batch.quantityRemaining) > 0)
            .map((batch) => ({
              id: batch.id,
              batchNumber: batch.sourceBatch.batchNumber,
              batchDate: batch.sourceBatch.batchDate,
              quantityReceived: batch.quantityAllocated,
              quantityRemaining: batch.quantityRemaining,
              receivedAt: batch.allocatedAt,
              notes: "POS terminal custody",
              productionRun: null,
              createdBy: null,
            })),
        },
      })),
      retailerCreditAllocations:
        serializedTerminal.retailerCreditAllocations.filter(
          (allocation) => allocation.isActive,
        ),
      serverTime: new Date().toISOString(),
      snapshotVersion: hashSecret(
        `${terminal.id}:${terminal.updatedAt.getTime()}:${allocationVersion}:${creditVersion}`,
      ),
    };
  }

  async syncOfflinePosSales(
    input: unknown,
    actor: AuthenticatedUser,
    deviceSecret?: string,
  ) {
    const parsed = syncOfflinePosBatchSchema.safeParse(input ?? {});

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message);
    }

    await this.assertTerminalDevice(parsed.data.terminalId, deviceSecret);

    const terminal = await this.prisma.posTerminal.findUnique({
      where: { id: parsed.data.terminalId },
      select: { id: true, offlineEnabled: true },
    });

    if (!terminal) {
      throw new NotFoundException("POS terminal not found.");
    }

    if (!terminal.offlineEnabled) {
      throw new BadRequestException(
        "Offline mode is not enabled for this POS terminal.",
      );
    }

    const results = [];

    for (const sale of parsed.data.sales) {
      results.push(await this.syncOfflinePosSale(sale, actor));
    }

    await this.prisma.posTerminal.update({
      where: { id: parsed.data.terminalId },
      data: {
        lastSeenAt: new Date(),
        lastSyncedAt: new Date(),
      },
    });

    return {
      terminalId: parsed.data.terminalId,
      serverTime: new Date().toISOString(),
      results,
    };
  }

  private async recordOfflineSyncAttempt(input: {
    terminalId: string;
    clientRequestId: string;
    status: PosOfflineSyncStatus;
    payload: unknown;
    saleId?: string | null;
    errorMessage?: string | null;
    conflictCode?: string | null;
    syncedAt?: Date | null;
  }) {
    await this.prisma.posOfflineSyncAttempt.upsert({
      where: {
        terminalId_clientRequestId: {
          terminalId: input.terminalId,
          clientRequestId: input.clientRequestId,
        },
      },
      create: {
        terminalId: input.terminalId,
        clientRequestId: input.clientRequestId,
        status: input.status,
        saleId: input.saleId ?? null,
        payload: jsonPayload(input.payload),
        errorMessage: input.errorMessage ?? null,
        conflictCode: input.conflictCode ?? null,
        attemptedAt: new Date(),
        syncedAt: input.syncedAt ?? null,
      },
      update: {
        status: input.status,
        saleId: input.saleId ?? null,
        payload: jsonPayload(input.payload),
        errorMessage: input.errorMessage ?? null,
        conflictCode: input.conflictCode ?? null,
        attemptedAt: new Date(),
        syncedAt: input.syncedAt ?? null,
      },
    });
  }

  private async syncOfflinePosSale(
    sale: SyncOfflinePosSaleInput,
    actor: AuthenticatedUser,
  ) {
    const payload = jsonPayload(sale);
    const existing = await this.prisma.sale.findUnique({
      where: { clientRequestId: sale.clientRequestId },
      include: saleInclude,
    });

    if (existing) {
      await this.recordOfflineSyncAttempt({
        terminalId: sale.terminalId,
        clientRequestId: sale.clientRequestId,
        status: PosOfflineSyncStatus.DUPLICATE,
        payload,
        saleId: existing.id,
        syncedAt: new Date(),
      });

      return {
        clientRequestId: sale.clientRequestId,
        status: PosOfflineSyncStatus.DUPLICATE,
        sale: serializeSale(existing),
        errorMessage: null,
      };
    }

    try {
      const created = await this.prisma.$transaction(
        async (tx) =>
          this.createSaleInTransaction(
            tx,
            {
              ...sale,
              terminalId: sale.terminalId,
              clientRequestId: sale.clientRequestId,
            } satisfies CreateSaleInput,
            actor,
          ),
        { timeout: 15000, maxWait: 15000 },
      );

      await this.auditSaleRecorded(created, actor);
      await this.recordOfflineSyncAttempt({
        terminalId: sale.terminalId,
        clientRequestId: sale.clientRequestId,
        status: PosOfflineSyncStatus.SYNCED,
        payload,
        saleId: created.id,
        syncedAt: new Date(),
      });

      return {
        clientRequestId: sale.clientRequestId,
        status: PosOfflineSyncStatus.SYNCED,
        sale: serializeSale(created),
        errorMessage: null,
      };
    } catch (error: unknown) {
      // A racing sync for the same clientRequestId can win between the
      // duplicate check and the insert; the unique constraint then fires
      // here. That is a duplicate, not a failure — return the winner's sale.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const winner = await this.prisma.sale.findUnique({
          where: { clientRequestId: sale.clientRequestId },
          include: saleInclude,
        });

        if (winner) {
          await this.recordOfflineSyncAttempt({
            terminalId: sale.terminalId,
            clientRequestId: sale.clientRequestId,
            status: PosOfflineSyncStatus.DUPLICATE,
            payload,
            saleId: winner.id,
            syncedAt: new Date(),
          });

          return {
            clientRequestId: sale.clientRequestId,
            status: PosOfflineSyncStatus.DUPLICATE,
            sale: serializeSale(winner),
            errorMessage: null,
          };
        }
      }

      const expectedConflict =
        error instanceof BadRequestException ||
        error instanceof NotFoundException ||
        error instanceof ConflictException;
      const errorMessage =
        error instanceof Error ? error.message : "Offline sale sync failed.";
      const status = expectedConflict
        ? PosOfflineSyncStatus.CONFLICT
        : PosOfflineSyncStatus.FAILED;

      if (!expectedConflict) {
        this.logger.error(
          `Offline POS sync failed terminal=${sale.terminalId} request=${sale.clientRequestId} reason=${errorMessage}`,
        );
      }

      await this.recordOfflineSyncAttempt({
        terminalId: sale.terminalId,
        clientRequestId: sale.clientRequestId,
        status,
        payload,
        errorMessage,
        conflictCode: expectedConflict ? "BUSINESS_RULE" : "SERVER_ERROR",
        syncedAt: null,
      });

      return {
        clientRequestId: sale.clientRequestId,
        status,
        sale: null,
        errorMessage,
      };
    }
  }

  async listPosOfflineSyncAttempts(query?: QueryParams) {
    const where = offlineSyncWhere(query);
    const orderBy = { attemptedAt: "desc" } as const;

    if (hasPaginatedRequest(query)) {
      const { page, pageSize, skip, take } = parsePagination(query);
      const [total, attempts] = await this.prisma.$transaction([
        this.prisma.posOfflineSyncAttempt.count({ where }),
        this.prisma.posOfflineSyncAttempt.findMany({
          where,
          include: posOfflineSyncAttemptInclude,
          orderBy,
          skip,
          take,
        }),
      ]);

      return paginatedResult(
        attempts.map(serializePosOfflineSyncAttempt),
        total,
        page,
        pageSize,
      );
    }

    const attempts = await this.prisma.posOfflineSyncAttempt.findMany({
      where,
      include: posOfflineSyncAttemptInclude,
      orderBy,
      take: 200,
    });

    return attempts.map(serializePosOfflineSyncAttempt);
  }

  async retryPosOfflineSyncAttempt(id: string, actor: AuthenticatedUser) {
    const attempt = await this.prisma.posOfflineSyncAttempt.findUnique({
      where: { id },
      include: posOfflineSyncAttemptInclude,
    });

    if (!attempt) {
      throw new NotFoundException("Offline POS sync attempt not found.");
    }

    if (
      attempt.status === PosOfflineSyncStatus.SYNCED ||
      attempt.status === PosOfflineSyncStatus.DUPLICATE
    ) {
      return serializePosOfflineSyncAttempt(attempt);
    }

    const parsed = syncOfflinePosSaleSchema.safeParse(attempt.payload);

    if (!parsed.success) {
      await this.recordOfflineSyncAttempt({
        terminalId: attempt.terminalId,
        clientRequestId: attempt.clientRequestId,
        status: PosOfflineSyncStatus.FAILED,
        payload: attempt.payload,
        errorMessage: parsed.error.issues[0]?.message ?? "Invalid sync payload.",
        conflictCode: "INVALID_PAYLOAD",
      });

      const updated = await this.prisma.posOfflineSyncAttempt.findUniqueOrThrow({
        where: { id },
        include: posOfflineSyncAttemptInclude,
      });

      return serializePosOfflineSyncAttempt(updated);
    }

    if (
      parsed.data.terminalId !== attempt.terminalId ||
      parsed.data.clientRequestId !== attempt.clientRequestId
    ) {
      await this.recordOfflineSyncAttempt({
        terminalId: attempt.terminalId,
        clientRequestId: attempt.clientRequestId,
        status: PosOfflineSyncStatus.FAILED,
        payload: attempt.payload,
        errorMessage: "Sync payload identity does not match this attempt.",
        conflictCode: "INVALID_PAYLOAD",
      });

      const updated = await this.prisma.posOfflineSyncAttempt.findUniqueOrThrow({
        where: { id },
        include: posOfflineSyncAttemptInclude,
      });

      return serializePosOfflineSyncAttempt(updated);
    }

    await this.syncOfflinePosSale(parsed.data, actor);

    const updated = await this.prisma.posOfflineSyncAttempt.findUniqueOrThrow({
      where: { id },
      include: posOfflineSyncAttemptInclude,
    });

    return serializePosOfflineSyncAttempt(updated);
  }

  async setPosTerminalStockAllocation(
    terminalId: string,
    input: unknown,
    actor: AuthenticatedUser,
  ) {
    const parsed = setTerminalStockAllocationSchema.safeParse(input ?? {});

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message);
    }

    const result = await this.prisma.$transaction(
      async (tx) => {
        const terminal = await tx.posTerminal.findUnique({
          where: { id: terminalId },
          select: { id: true, name: true },
        });

        if (!terminal) {
          throw new NotFoundException("POS terminal not found.");
        }

        // The Product row coordinates every mutation of central or terminal
        // custody stock for this product.
        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "Product" WHERE "id" = ${parsed.data.productId} FOR UPDATE`,
        );

        const product = await tx.product.findUnique({
          where: { id: parsed.data.productId },
          select: productSelect,
        });

        if (!product) {
          throw new NotFoundException("Product not found.");
        }

        await tx.$queryRaw(
          Prisma.sql`
            SELECT "id"
            FROM "PosTerminalStockAllocation"
            WHERE "productId" = ${product.id}
            ORDER BY "terminalId" ASC
            FOR UPDATE
          `,
        );
        const allocations = await tx.posTerminalStockAllocation.findMany({
          where: { productId: product.id },
          select: {
            id: true,
            terminalId: true,
            allocatedQuantity: true,
            soldQuantity: true,
          },
        });
        const existing = allocations.find(
          (allocation) => allocation.terminalId === terminalId,
        );
        const soldQuantity = existing?.soldQuantity ?? 0;

        if (parsed.data.allocatedQuantity < soldQuantity) {
          throw new BadRequestException(
            `Allocated quantity cannot be below the ${formatQuantity(soldQuantity)} ${product.unit.abbreviation} already sold by this terminal.`,
          );
        }

        const lockedCentralBatchIds = await tx.$queryRaw<Array<{ id: string }>>(
          Prisma.sql`
            SELECT "id"
            FROM "SalesProductBatch"
            WHERE "productId" = ${product.id}
            ORDER BY "receivedAt" ASC, "batchNumber" ASC, "id" ASC
            FOR UPDATE
          `,
        );
        const centralBatches =
          lockedCentralBatchIds.length > 0
            ? await tx.salesProductBatch.findMany({
                where: {
                  id: {
                    in: lockedCentralBatchIds.map((batch) => batch.id),
                  },
                },
                select: {
                  id: true,
                  quantityRemaining: true,
                  unitCost: true,
                  receivedAt: true,
                  batchNumber: true,
                },
                orderBy: [
                  { receivedAt: "asc" },
                  { batchNumber: "asc" },
                  { id: "asc" },
                ],
              })
            : [];
        const centralStockBefore = centralBatches.reduce(
          (sum, batch) => sum + batch.quantityRemaining,
          0,
        );

        const allocation = await tx.posTerminalStockAllocation.upsert({
          where: {
            terminalId_productId: {
              terminalId,
              productId: product.id,
            },
          },
          create: {
            terminalId,
            productId: product.id,
            allocatedQuantity: parsed.data.allocatedQuantity,
          },
          update: {
            allocatedQuantity: parsed.data.allocatedQuantity,
          },
        });

        await tx.$queryRaw(
          Prisma.sql`
            SELECT "id"
            FROM "PosTerminalStockBatch"
            WHERE "allocationId" = ${allocation.id}
            ORDER BY "allocatedAt" ASC, "id" ASC
            FOR UPDATE
          `,
        );
        const custodyBatches = await tx.posTerminalStockBatch.findMany({
          where: { allocationId: allocation.id },
          select: {
            id: true,
            sourceBatchId: true,
            quantityAllocated: true,
            quantityRemaining: true,
            allocatedAt: true,
          },
          orderBy: [{ allocatedAt: "asc" }, { id: "asc" }],
        });
        const custodyBefore = custodyBatches.reduce(
          (sum, batch) => sum + batch.quantityRemaining,
          0,
        );
        const expectedCustodyBefore = Math.max(
          (existing?.allocatedQuantity ?? 0) - soldQuantity,
          0,
        );

        if (custodyBefore !== expectedCustodyBefore) {
          throw new ConflictException(
            `Terminal stock custody is out of balance for ${productLabel(product)}. Expected ${formatQuantity(expectedCustodyBefore)} ${product.unit.abbreviation}, but found ${formatQuantity(custodyBefore)}. Reconcile the terminal before changing its allocation.`,
          );
        }

        const requestedCustody = parsed.data.allocatedQuantity - soldQuantity;
        const custodyChange = requestedCustody - custodyBefore;

        if (custodyChange > centralStockBefore) {
          throw new BadRequestException(
            `Only ${formatQuantity(centralStockBefore)} ${product.unit.abbreviation} of ${productLabel(product)} is available in central Sales stock.`,
          );
        }

        if (custodyChange > 0) {
          let remainingToAllocate = custodyChange;

          for (const batch of centralBatches) {
            if (remainingToAllocate <= 0) {
              break;
            }

            const quantityFromBatch = Math.min(
              batch.quantityRemaining,
              remainingToAllocate,
            );

            if (quantityFromBatch <= 0) {
              continue;
            }

            const centralBalanceAfter =
              batch.quantityRemaining - quantityFromBatch;
            const custodyBatch = await tx.posTerminalStockBatch.create({
              data: {
                allocationId: allocation.id,
                terminalId,
                productId: product.id,
                sourceBatchId: batch.id,
                quantityAllocated: quantityFromBatch,
                quantityRemaining: quantityFromBatch,
                unitCost: batch.unitCost,
                createdById: actor.id,
              },
            });

            await tx.salesProductBatch.update({
              where: { id: batch.id },
              data: { quantityRemaining: centralBalanceAfter },
            });
            await tx.salesProductStockMovement.create({
              data: {
                productId: product.id,
                batchId: batch.id,
                type: FinishedProductStockMovementType.ALLOCATE_TO_TERMINAL,
                quantity: quantityFromBatch,
                balanceAfter: centralBalanceAfter,
                actorId: actor.id,
                note: `Allocated to ${terminal.name ?? terminal.id}`,
              },
            });
            await tx.posTerminalStockMovement.create({
              data: {
                terminalId,
                productId: product.id,
                terminalBatchId: custodyBatch.id,
                type: PosTerminalStockMovementType.ALLOCATE,
                quantity: quantityFromBatch,
                balanceAfter: quantityFromBatch,
                actorId: actor.id,
                note: `Allocated from Sales batch ${batch.batchNumber}`,
              },
            });

            batch.quantityRemaining = centralBalanceAfter;
            remainingToAllocate -= quantityFromBatch;
          }
        } else if (custodyChange < 0) {
          let remainingToRelease = Math.abs(custodyChange);
          const centralBatchById = new Map(
            centralBatches.map((batch) => [batch.id, batch]),
          );

          for (const custodyBatch of [...custodyBatches].reverse()) {
            if (remainingToRelease <= 0) {
              break;
            }

            const quantityToRelease = Math.min(
              custodyBatch.quantityRemaining,
              remainingToRelease,
            );

            if (quantityToRelease <= 0) {
              continue;
            }

            const sourceBatch = centralBatchById.get(custodyBatch.sourceBatchId);

            if (!sourceBatch) {
              throw new ConflictException(
                "A terminal custody batch has no valid central source batch.",
              );
            }

            const custodyBalanceAfter =
              custodyBatch.quantityRemaining - quantityToRelease;
            const centralBalanceAfter =
              sourceBatch.quantityRemaining + quantityToRelease;

            await tx.posTerminalStockBatch.update({
              where: { id: custodyBatch.id },
              data: { quantityRemaining: custodyBalanceAfter },
            });
            await tx.posTerminalStockMovement.create({
              data: {
                terminalId,
                productId: product.id,
                terminalBatchId: custodyBatch.id,
                type: PosTerminalStockMovementType.RELEASE,
                quantity: quantityToRelease,
                balanceAfter: custodyBalanceAfter,
                actorId: actor.id,
                note: "Released unsold stock to central Sales custody",
              },
            });
            await tx.salesProductBatch.update({
              where: { id: sourceBatch.id },
              data: { quantityRemaining: centralBalanceAfter },
            });
            await tx.salesProductStockMovement.create({
              data: {
                productId: product.id,
                batchId: sourceBatch.id,
                type: FinishedProductStockMovementType.RELEASE_FROM_TERMINAL,
                quantity: quantityToRelease,
                balanceAfter: centralBalanceAfter,
                actorId: actor.id,
                note: `Released from ${terminal.name ?? terminal.id}`,
              },
            });

            sourceBatch.quantityRemaining = centralBalanceAfter;
            remainingToRelease -= quantityToRelease;
          }

          if (remainingToRelease > 0) {
            throw new ConflictException(
              "The requested release exceeds this terminal's unsold custody balance.",
            );
          }
        }

        const updatedTerminal = await tx.posTerminal.findUniqueOrThrow({
          where: { id: terminalId },
          include: posTerminalInclude,
        });

        return {
          allocation,
          centralStockBefore,
          custodyBefore,
          custodyChange,
          previousAllocatedQuantity: existing?.allocatedQuantity ?? 0,
          product,
          terminal,
          updatedTerminal,
        };
      },
      { timeout: 30000, maxWait: 15000 },
    );

    await this.audit.record({
      actorId: actor.id,
      action: "ADMIN_POS_TERMINAL_STOCK_ALLOCATED",
      entityType: "PosTerminalStockAllocation",
      entityId: result.allocation.id,
      metadata: {
        terminalId,
        terminalName: result.terminal.name,
        productId: result.product.id,
        productName: productLabel(result.product),
        previousAllocatedQuantity: result.previousAllocatedQuantity,
        allocatedQuantity: result.allocation.allocatedQuantity,
        soldQuantity: result.allocation.soldQuantity,
        centralStockBefore: result.centralStockBefore,
        custodyBefore: result.custodyBefore,
        custodyChange: result.custodyChange,
      },
    });

    return serializePosTerminal(result.updatedTerminal);
  }

  async adjustPosTerminalStock(
    terminalId: string,
    input: unknown,
    actor: AuthenticatedUser,
  ) {
    const parsed = adjustTerminalStockSchema.safeParse(input ?? {});

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message);
    }

    const result = await this.prisma.$transaction(
      async (tx) => {
        const candidate = await tx.posTerminalStockBatch.findFirst({
          where: {
            id: parsed.data.terminalBatchId,
            terminalId,
          },
          select: { id: true, productId: true, allocationId: true },
        });

        if (!candidate) {
          throw new NotFoundException("POS terminal custody batch not found.");
        }

        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "Product" WHERE "id" = ${candidate.productId} FOR UPDATE`,
        );
        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "PosTerminalStockAllocation" WHERE "id" = ${candidate.allocationId} FOR UPDATE`,
        );
        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "PosTerminalStockBatch" WHERE "id" = ${candidate.id} FOR UPDATE`,
        );

        const custodyBatch = await tx.posTerminalStockBatch.findUniqueOrThrow({
          where: { id: candidate.id },
          include: {
            allocation: true,
            product: { select: productSelect },
            terminal: { select: { id: true, name: true } },
          },
        });
        const previousQuantity = custodyBatch.quantityRemaining;
        const difference = parsed.data.countedQuantity - previousQuantity;

        if (difference === 0) {
          throw new BadRequestException(
            "The physical count matches the current custody balance.",
          );
        }

        const aggregateAllocatedAfter =
          custodyBatch.allocation.allocatedQuantity + difference;

        if (aggregateAllocatedAfter < custodyBatch.allocation.soldQuantity) {
          throw new ConflictException(
            "This adjustment would reduce allocated stock below quantity already sold.",
          );
        }

        await tx.posTerminalStockBatch.update({
          where: { id: custodyBatch.id },
          data: {
            quantityRemaining: parsed.data.countedQuantity,
            ...(difference > 0
              ? { quantityAllocated: { increment: difference } }
              : {}),
          },
        });
        await tx.posTerminalStockAllocation.update({
          where: { id: custodyBatch.allocationId },
          data: { allocatedQuantity: aggregateAllocatedAfter },
        });
        await tx.posTerminalStockMovement.create({
          data: {
            terminalId,
            productId: custodyBatch.productId,
            terminalBatchId: custodyBatch.id,
            type: PosTerminalStockMovementType.ADJUST,
            quantity: Math.abs(difference),
            balanceAfter: parsed.data.countedQuantity,
            actorId: actor.id,
            note: `Physical count adjustment (${difference > 0 ? "+" : ""}${difference}): ${parsed.data.reason}`,
          },
        });

        const updatedTerminal = await tx.posTerminal.findUniqueOrThrow({
          where: { id: terminalId },
          include: posTerminalInclude,
        });

        return {
          custodyBatch,
          difference,
          previousQuantity,
          terminal: custodyBatch.terminal,
          updatedTerminal,
        };
      },
      { timeout: 15000, maxWait: 15000 },
    );

    await this.audit.record({
      actorId: actor.id,
      action: "ADMIN_POS_TERMINAL_STOCK_ADJUSTED",
      entityType: "PosTerminalStockBatch",
      entityId: result.custodyBatch.id,
      metadata: {
        terminalId,
        terminalName: result.terminal.name,
        productId: result.custodyBatch.productId,
        productName: productLabel(result.custodyBatch.product),
        previousQuantity: result.previousQuantity,
        countedQuantity: parsed.data.countedQuantity,
        difference: result.difference,
        reason: parsed.data.reason,
      },
    });

    return serializePosTerminal(result.updatedTerminal);
  }

  async setPosTerminalRetailerCreditAllocation(
    terminalId: string,
    input: unknown,
    actor: AuthenticatedUser,
  ) {
    const parsed = setTerminalRetailerCreditAllocationSchema.safeParse(
      input ?? {},
    );

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message);
    }

    const [terminal, retailer] = await Promise.all([
      this.prisma.posTerminal.findUnique({
        where: { id: terminalId },
        select: { id: true, name: true },
      }),
      this.prisma.retailer.findUnique({
        where: { id: parsed.data.retailerId },
        select: { id: true, name: true, isActive: true },
      }),
    ]);

    if (!terminal) {
      throw new NotFoundException("POS terminal not found.");
    }

    if (!retailer) {
      throw new NotFoundException("Retailer not found.");
    }

    if (!retailer.isActive) {
      throw new BadRequestException("That retailer account is inactive.");
    }

    const allocatedAmount = new Prisma.Decimal(
      roundMoney(parsed.data.allocatedAmount).toFixed(2),
    );
    const allocation =
      await this.prisma.posTerminalRetailerCreditAllocation.upsert({
        where: {
          terminalId_retailerId: {
            terminalId,
            retailerId: retailer.id,
          },
        },
        create: {
          terminalId,
          retailerId: retailer.id,
          allocatedAmount,
          isActive: parsed.data.isActive,
        },
        update: {
          allocatedAmount,
          isActive: parsed.data.isActive,
        },
      });

    await this.audit.record({
      actorId: actor.id,
      action: "ADMIN_POS_TERMINAL_RETAILER_CREDIT_ALLOCATED",
      entityType: "PosTerminalRetailerCreditAllocation",
      entityId: allocation.id,
      metadata: {
        terminalId,
        terminalName: terminal.name,
        retailerId: retailer.id,
        retailerName: retailer.name,
        allocatedAmount: allocation.allocatedAmount.toString(),
        isActive: allocation.isActive,
      },
    });

    const updated = await this.prisma.posTerminal.findUniqueOrThrow({
      where: { id: terminalId },
      include: posTerminalInclude,
    });

    return serializePosTerminal(updated);
  }

  async createPosSession(
    input: unknown,
    actor: AuthenticatedUser,
    deviceSecret?: string,
  ) {
    const parsed = createPosSessionSchema.safeParse(input ?? {});

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message);
    }

    let terminalDisplayToken: string | null = null;
    let retailer:
      | { id: string; name: string; isActive: boolean }
      | null = null;

    if (parsed.data.customerType === CustomerType.RETAILER) {
      if (!parsed.data.retailerId) {
        throw new BadRequestException("Select a retailer for retailer sales.");
      }

      retailer = await this.prisma.retailer.findUnique({
        where: { id: parsed.data.retailerId },
        select: { id: true, name: true, isActive: true },
      });

      if (!retailer) {
        throw new NotFoundException("Retailer not found.");
      }

      if (!retailer.isActive) {
        throw new BadRequestException("That retailer account is inactive.");
      }
    }

    if (parsed.data.terminalId) {
      const terminal = await this.assertTerminalDevice(
        parsed.data.terminalId,
        deviceSecret,
      );
      if (!terminal) {
        throw new NotFoundException("POS terminal not found.");
      }
      terminalDisplayToken = terminal.displayToken;
    }

    let session = await this.prisma.posSession.create({
      data: {
        displayToken: generateDisplayToken(),
        terminalId: parsed.data.terminalId,
        customerType: parsed.data.customerType,
        retailerId: retailer?.id ?? null,
        retailerApprovalId:
          parsed.data.customerType === CustomerType.RETAILER
            ? parsed.data.retailerApprovalId ?? null
            : null,
        customerName: retailer?.name ?? parsed.data.customerName,
        paymentMethod: retailer ? PaymentMethod.CREDIT : PaymentMethod.CASH,
        createdById: actor.id,
        expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
      },
      include: posSessionInclude,
    });

    if (parsed.data.terminalId) {
      await this.prisma.posTerminal.update({
        where: { id: parsed.data.terminalId },
        data: { currentSessionId: session.id },
      });

      session = await this.prisma.posSession.findUniqueOrThrow({
        where: { id: session.id },
        include: posSessionInclude,
      });
    }

    const serializedSession = serializePosSession(session);

    await this.emitPosSessionUpdate(session.displayToken, serializedSession);
    if (session.terminal) {
      await this.emitPosTerminalUpdate(
        session.terminal.displayToken,
        serializedSession,
      );
    } else if (terminalDisplayToken) {
      await this.emitPosTerminalUpdate(terminalDisplayToken, serializedSession);
    }
    return serializedSession;
  }

  async getPosSession(
    id: string,
    actor: AuthenticatedUser,
    deviceSecret?: string,
  ) {
    const session = await this.getPosSessionForActor(id, actor);
    await this.assertPosSessionDevice(session, deviceSecret);
    return serializePosSession(session);
  }

  async updatePosSession(
    id: string,
    input: unknown,
    actor: AuthenticatedUser,
    deviceSecret?: string,
  ) {
    const parsed = updatePosSessionSchema.safeParse(input ?? {});

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message);
    }

    const existing = await this.getPosSessionForActor(id, actor);
    await this.assertPosSessionDevice(existing, deviceSecret);
    this.assertActivePosSession(existing);

    const nextCustomerType = parsed.data.customerType ?? existing.customerType;
    const nextRetailerId =
      nextCustomerType === CustomerType.RETAILER
        ? parsed.data.retailerId === undefined
          ? existing.retailerId
          : parsed.data.retailerId
        : null;
    const nextRetailerApprovalId =
      nextCustomerType === CustomerType.RETAILER
        ? parsed.data.retailerApprovalId === undefined
          ? existing.retailerApprovalId
          : parsed.data.retailerApprovalId
        : null;
    const nextPaymentMethod = parsed.data.paymentMethod ?? existing.paymentMethod;
    let retailer:
      | { id: string; name: string; isActive: boolean }
      | null = null;

    if (nextCustomerType === CustomerType.RETAILER) {
      if (!nextRetailerId) {
        throw new BadRequestException("Select a retailer for retailer sales.");
      }

      retailer = await this.prisma.retailer.findUnique({
        where: { id: nextRetailerId },
        select: { id: true, name: true, isActive: true },
      });

      if (!retailer) {
        throw new NotFoundException("Retailer not found.");
      }

      if (!retailer.isActive) {
        throw new BadRequestException("That retailer account is inactive.");
      }
    }

    const session = await this.prisma.posSession.update({
      where: { id: existing.id },
      data: {
        customerType: nextCustomerType,
        retailerId: nextRetailerId,
        retailerApprovalId: nextRetailerApprovalId,
        customerName:
          nextCustomerType === CustomerType.RETAILER
            ? retailer?.name
            : parsed.data.customerName,
        paymentMethod: nextPaymentMethod,
        discount: parsed.data.discount,
        amountPaid: parsed.data.amountPaid,
        notes: parsed.data.notes,
      },
      include: posSessionInclude,
    });

    const serializedSession = serializePosSession(session);

    await this.emitPosSessionUpdate(session.displayToken, serializedSession);
    if (session.terminal) {
      await this.emitPosTerminalUpdate(
        session.terminal.displayToken,
        serializedSession,
      );
    }
    return serializedSession;
  }

  async upsertPosSessionItem(
    id: string,
    input: unknown,
    actor: AuthenticatedUser,
    deviceSecret?: string,
  ) {
    const parsed = upsertPosSessionItemSchema.safeParse(input);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message);
    }

    const existing = await this.getPosSessionForActor(id, actor);
    await this.assertPosSessionDevice(existing, deviceSecret);
    this.assertActivePosSession(existing);

    const product = await this.prisma.product.findUnique({
      where: { id: parsed.data.productId },
      select: productSelect,
    });

    if (!product) {
      throw new NotFoundException("Product not found.");
    }

    const unitPrice = parsed.data.unitPrice ?? decimalToNumber(product.unitPrice ?? 0);

    if (parsed.data.quantity > 0 && unitPrice <= 0) {
      throw new BadRequestException(
        `Enter a unit price for ${productLabel(product)} before adding it to the sale.`,
      );
    }

    if (parsed.data.quantity > 0) {
      const available = await this.salesProductAvailableQuantity(product.id);

      if (available < parsed.data.quantity) {
        throw new BadRequestException(
          `Only ${formatQuantity(available)} ${product.unit.abbreviation} of ${productLabel(product)} is available for sale.`,
        );
      }
    }

    if (parsed.data.quantity === 0) {
      await this.prisma.posSessionItem.deleteMany({
        where: {
          sessionId: existing.id,
          productId: parsed.data.productId,
        },
      });
    } else {
      await this.prisma.posSessionItem.upsert({
        where: {
          sessionId_productId: {
            sessionId: existing.id,
            productId: parsed.data.productId,
          },
        },
        create: {
          sessionId: existing.id,
          productId: parsed.data.productId,
          quantity: parsed.data.quantity,
          unitPrice,
        },
        update: {
          quantity: parsed.data.quantity,
          unitPrice,
        },
      });
    }

    const session = await this.prisma.posSession.findUniqueOrThrow({
      where: { id: existing.id },
      include: posSessionInclude,
    });

    const serializedSession = serializePosSession(session);

    await this.emitPosSessionUpdate(session.displayToken, serializedSession);
    if (session.terminal) {
      await this.emitPosTerminalUpdate(
        session.terminal.displayToken,
        serializedSession,
      );
    }
    return serializedSession;
  }

  async checkoutPosSession(
    id: string,
    actor: AuthenticatedUser,
    deviceSecret?: string,
  ) {
    const session = await this.getPosSessionForActor(id, actor);
    await this.assertPosSessionDevice(session, deviceSecret);
    this.assertActivePosSession(session);

    if (session.items.length === 0) {
      throw new BadRequestException("Add at least one product before checkout.");
    }

    const parsed = createSaleSchema.safeParse({
      customerType: session.customerType,
      retailerId: session.retailerId ?? undefined,
      retailerApprovalId: session.retailerApprovalId ?? undefined,
      paymentMethod: session.paymentMethod,
      customerName: session.customerName ?? undefined,
      discount: session.discount.toString(),
      amountPaid: session.amountPaid?.toString(),
      notes: session.notes
        ? `POS checkout. ${session.notes}`
        : `POS checkout from session ${session.id}.`,
      terminalId: session.terminalId ?? undefined,
      clientRequestId: `pos:${session.id}`,
      items: session.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity.toString(),
        unitPrice: item.unitPrice.toString(),
      })),
    });

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message);
    }

    // Sale creation and session completion happen in one transaction: the
    // conditional status flip claims the session first, so concurrent
    // checkouts cannot both create a sale (and deduct stock twice).
    const { sale, updated } = await this.prisma
      .$transaction(
        async (tx) => {
          const claimed = await tx.posSession.updateMany({
            where: { id: session.id, status: PosSessionStatus.ACTIVE },
            data: {
              status: PosSessionStatus.COMPLETED,
              completedAt: new Date(),
            },
          });

          if (claimed.count === 0) {
            throw new BadRequestException(
              "This POS session has already been checked out or cancelled.",
            );
          }

          const createdSale = await this.createSaleInTransaction(
            tx,
            parsed.data,
            actor,
          );

          const updatedSession = await tx.posSession.update({
            where: { id: session.id },
            data: { completedSaleId: createdSale.id },
            include: posSessionInclude,
          });

          return { sale: createdSale, updated: updatedSession };
        },
        { timeout: 15000, maxWait: 15000 },
      )
      .catch((error: unknown) => {
        this.logger.warn(
          `POS checkout failed session=${session.id} actor=${actor.id} reason=${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        );
        throw error;
      });

    await this.auditSaleRecorded(sale, actor);

    const serializedSession = serializePosSession(updated);

    await this.emitPosSessionUpdate(updated.displayToken, serializedSession);
    if (updated.terminal) {
      await this.emitPosTerminalUpdate(
        updated.terminal.displayToken,
        serializedSession,
      );
    }
    return serializedSession;
  }

  async cancelPosSession(
    id: string,
    actor: AuthenticatedUser,
    deviceSecret?: string,
  ) {
    const existing = await this.getPosSessionForActor(id, actor);
    await this.assertPosSessionDevice(existing, deviceSecret);

    if (existing.status !== PosSessionStatus.ACTIVE) {
      return serializePosSession(existing);
    }

    const session = await this.prisma.posSession.update({
      where: { id: existing.id },
      data: { status: PosSessionStatus.CANCELLED },
      include: posSessionInclude,
    });

    const serializedSession = serializePosSession(session);

    await this.emitPosSessionUpdate(session.displayToken, serializedSession);
    if (session.terminal) {
      await this.emitPosTerminalUpdate(
        session.terminal.displayToken,
        serializedSession,
      );
    }
    return serializedSession;
  }

  async getPosDisplay(displayToken: string) {
    const session = await this.prisma.posSession.findUnique({
      where: { displayToken },
      include: posSessionInclude,
    });

    // Expired sessions answer exactly like unknown tokens so a leaked URL
    // reveals nothing once the session lapses.
    if (
      !session ||
      (session.expiresAt && session.expiresAt.getTime() <= Date.now())
    ) {
      throw new NotFoundException("POS display session not found.");
    }

    return serializePosSession(session);
  }

  async getPosTerminalDisplay(displayToken: string) {
    const terminal = await this.prisma.posTerminal.findUnique({
      where: { displayToken },
      include: posTerminalInclude,
    });

    if (!terminal) {
      throw new NotFoundException("POS terminal display not found.");
    }

    if (!terminal.isActive) {
      throw new NotFoundException("POS terminal display not found.");
    }

    return serializePosTerminal(terminal);
  }

  async listSales(query?: QueryParams) {
    const where = saleWhere(query);
    const orderBy = { soldAt: "desc" } as const;

    if (hasPaginatedRequest(query)) {
      const { page, pageSize, skip, take } = parsePagination(query);
      const [total, sales] = await this.prisma.$transaction([
        this.prisma.sale.count({ where }),
        this.prisma.sale.findMany({
          where,
          include: saleInclude,
          orderBy,
          skip,
          take,
        }),
      ]);

      return paginatedResult(sales.map(serializeSale), total, page, pageSize);
    }

    const sales = await this.prisma.sale.findMany({
      where,
      include: saleInclude,
      orderBy,
      take: 200,
    });

    return sales.map(serializeSale);
  }

  async listReturns(query?: QueryParams) {
    const where = returnWhere(query);
    const orderBy = { recordedAt: "desc" } as const;

    if (hasPaginatedRequest(query)) {
      const { page, pageSize, skip, take } = parsePagination(query);
      const [total, returns] = await this.prisma.$transaction([
        this.prisma.salesProductReturn.count({ where }),
        this.prisma.salesProductReturn.findMany({
          where,
          include: returnInclude,
          orderBy,
          skip,
          take,
        }),
      ]);

      return paginatedResult(
        returns.map(serializeReturn),
        total,
        page,
        pageSize,
      );
    }

    const returns = await this.prisma.salesProductReturn.findMany({
      where,
      include: returnInclude,
      orderBy,
      take: 200,
    });

    return returns.map(serializeReturn);
  }

  async createSale(input: unknown, actor: AuthenticatedUser) {
    const parsed = createSaleSchema.safeParse(input);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message);
    }

    if (parsed.data.clientRequestId) {
      const existing = await this.prisma.sale.findUnique({
        where: { clientRequestId: parsed.data.clientRequestId },
        include: saleInclude,
      });

      if (existing) {
        return serializeSale(existing);
      }
    }

    const sale = await this.prisma.$transaction(
      async (tx) => this.createSaleInTransaction(tx, parsed.data, actor),
      { timeout: 15000, maxWait: 15000 },
    );

    await this.auditSaleRecorded(sale, actor);

    return serializeSale(sale);
  }

  /**
   * Creates a sale and deducts finished-goods stock (FIFO). Must run inside
   * a transaction so callers (direct sales, POS checkout) stay atomic.
   */
  private async createSaleInTransaction(
    tx: Prisma.TransactionClient,
    data: CreateSaleInput,
    actor: AuthenticatedUser,
  ) {
    const productIds = data.items.map((item) => item.productId);
    const products = await tx.product.findMany({
      where: { id: { in: productIds } },
      select: productSelect,
    });
    const productById = new Map(products.map((product) => [product.id, product]));

    if (productById.size !== productIds.length) {
      throw new BadRequestException("One or more selected products do not exist.");
    }

    const lockedProductIds = [...new Set(productIds)].sort();
    await tx.$queryRaw(
      Prisma.sql`
        SELECT "id"
        FROM "Product"
        WHERE "id" IN (${Prisma.join(lockedProductIds)})
        ORDER BY "id" ASC
        FOR UPDATE
      `,
    );

    const items = data.items.map((item) => {
      const product = productById.get(item.productId);

      if (!product) {
        throw new BadRequestException("Selected product does not exist.");
      }

      const unitPrice = item.unitPrice ?? decimalToNumber(product.unitPrice ?? 0);

      if (unitPrice <= 0) {
        throw new BadRequestException(
          `Enter a unit price for ${productLabel(product)} before recording the sale.`,
        );
      }

      return {
        product,
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: roundMoney(unitPrice),
        lineTotal: roundMoney(item.quantity * unitPrice),
      };
    });

    const subtotal = roundMoney(
      items.reduce((sum, item) => sum + item.lineTotal, 0),
    );
    const discount = roundMoney(data.discount ?? 0);

    if (discount > subtotal) {
      throw new BadRequestException("Discount cannot exceed sale subtotal.");
    }

    const totalAmount = roundMoney(subtotal - discount);
    const customerType = data.customerType ?? CustomerType.INDIVIDUAL;
    let terminal:
      | {
          id: string;
          name: string | null;
          isActive: boolean;
          offlineEnabled: boolean;
        }
      | null = null;
    let retailer:
      | { id: string; name: string; isActive: boolean }
      | null = null;
    let retailerApprovalId: string | null = null;
    let terminalRetailerCreditAllocation:
      | { id: string; usedAmount: number }
      | null = null;
    let paymentMethod = data.paymentMethod;
    let customerName = data.customerName;
    let amountPaid = roundMoney(
      data.amountPaid ??
        (paymentMethod === PaymentMethod.CREDIT ? 0 : totalAmount),
    );

    if (data.terminalId) {
      terminal = await tx.posTerminal.findUnique({
        where: { id: data.terminalId },
        select: { id: true, name: true, isActive: true, offlineEnabled: true },
      });

      if (!terminal) {
        throw new NotFoundException("POS terminal not found.");
      }

      if (!terminal.isActive) {
        throw new BadRequestException("This POS terminal has been deactivated.");
      }
    }

    if (customerType === CustomerType.RETAILER) {
      if (!data.retailerId) {
        throw new BadRequestException("Select a retailer for retailer sales.");
      }

      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "Retailer" WHERE "id" = ${data.retailerId} FOR UPDATE`,
      );

      retailer = await tx.retailer.findUnique({
        where: { id: data.retailerId },
        select: {
          id: true,
          name: true,
          isActive: true,
        },
      });

      if (!retailer) {
        throw new NotFoundException("Retailer not found.");
      }

      if (!retailer.isActive) {
        throw new BadRequestException("That retailer account is inactive.");
      }

      customerName = retailer.name;
    }

    if (amountPaid > totalAmount) {
      throw new BadRequestException("Amount paid cannot exceed total amount.");
    }

    const balanceDue = roundMoney(totalAmount - amountPaid);
    const soldAt = data.soldAt ?? new Date();

    if (retailer && paymentMethod === PaymentMethod.CREDIT && balanceDue > 0) {
      const currentBalance = await tx.sale.aggregate({
        where: {
          retailerId: retailer.id,
          balanceDue: { gt: 0 },
        },
        _sum: { balanceDue: true },
      });
      const outstandingBalance = decimalToNumber(
        currentBalance._sum.balanceDue ?? 0,
      );

      if (outstandingBalance > 0) {
        if (!data.retailerApprovalId) {
          throw new BadRequestException(
            "This retailer has uncleared credit. Admin approval is required before another credit sale can be recorded.",
          );
        }

        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "RetailerOrderApproval" WHERE "id" = ${data.retailerApprovalId} FOR UPDATE`,
        );

        const approval = await tx.retailerOrderApproval.findUnique({
          where: { id: data.retailerApprovalId },
          select: {
            id: true,
            retailerId: true,
            terminalId: true,
            approvedAmount: true,
            status: true,
            expiresAt: true,
            usedAt: true,
          },
        });

        if (!approval || approval.retailerId !== retailer.id) {
          throw new BadRequestException(
            "Select a valid Admin approval for this retailer.",
          );
        }

        if (approval.terminalId && approval.terminalId !== terminal?.id) {
          throw new BadRequestException(
            "This Admin approval is assigned to another POS terminal.",
          );
        }

        if (
          approval.status !== RetailerOrderApprovalStatus.APPROVED ||
          approval.usedAt
        ) {
          throw new BadRequestException(
            "This retailer approval has already been used or revoked.",
          );
        }

        if (approval.expiresAt && approval.expiresAt.getTime() <= Date.now()) {
          throw new BadRequestException("This retailer approval has expired.");
        }

        if (decimalToNumber(approval.approvedAmount) < balanceDue) {
          throw new BadRequestException(
            `Admin approval covers ₦${decimalToNumber(
              approval.approvedAmount,
            ).toLocaleString("en", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}, which is below this sale total.`,
          );
        }

        retailerApprovalId = approval.id;
      }
    }

    if (
      terminal?.offlineEnabled &&
      retailer &&
      paymentMethod === PaymentMethod.CREDIT &&
      balanceDue > 0
    ) {
      const lockedCreditAllocationIds = await tx.$queryRaw<
        Array<{ id: string }>
      >(
        Prisma.sql`
          SELECT "id"
          FROM "PosTerminalRetailerCreditAllocation"
          WHERE "terminalId" = ${terminal.id}
            AND "retailerId" = ${retailer.id}
          FOR UPDATE
        `,
      );
      const lockedCreditAllocationId = lockedCreditAllocationIds[0]?.id;
      const creditAllocation = lockedCreditAllocationId
        ? await tx.posTerminalRetailerCreditAllocation.findUnique({
            where: { id: lockedCreditAllocationId },
            select: {
              id: true,
              allocatedAmount: true,
              usedAmount: true,
              isActive: true,
            },
          })
        : null;

      if (!creditAllocation || !creditAllocation.isActive) {
        throw new BadRequestException(
          `${retailer.name} has no active retailer credit allocation for this POS terminal.`,
        );
      }

      const remainingCredit = roundMoney(
        decimalToNumber(creditAllocation.allocatedAmount) -
          decimalToNumber(creditAllocation.usedAmount),
      );

      if (remainingCredit < balanceDue) {
        throw new BadRequestException(
          `Only ₦${remainingCredit.toLocaleString("en", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })} retailer credit is allocated to this POS terminal for ${retailer.name}.`,
        );
      }

      terminalRetailerCreditAllocation = {
        id: creditAllocation.id,
        usedAmount: decimalToNumber(creditAllocation.usedAmount),
      };
    }

    const terminalAllocations = new Map<
      string,
      {
        id: string;
        allocatedQuantity: number;
        soldQuantity: number;
        batches: Array<{
          id: string;
          sourceBatchId: string;
          quantityRemaining: number;
        }>;
      }
    >();

    if (terminal) {
      for (const item of items) {
        const lockedAllocationIds = await tx.$queryRaw<Array<{ id: string }>>(
          Prisma.sql`
            SELECT "id"
            FROM "PosTerminalStockAllocation"
            WHERE "terminalId" = ${terminal.id}
              AND "productId" = ${item.productId}
            FOR UPDATE
          `,
        );
        const lockedAllocationId = lockedAllocationIds[0]?.id;
        const allocation = lockedAllocationId
          ? await tx.posTerminalStockAllocation.findUnique({
              where: { id: lockedAllocationId },
            })
          : null;

        if (!allocation) {
          if (terminal.offlineEnabled) {
            throw new BadRequestException(
              `${productLabel(item.product)} has not been allocated to this POS terminal.`,
            );
          }

          continue;
        }

        const lockedCustodyBatchIds = await tx.$queryRaw<
          Array<{ id: string }>
        >(
          Prisma.sql`
            SELECT "id"
            FROM "PosTerminalStockBatch"
            WHERE "allocationId" = ${allocation.id}
              AND "quantityRemaining" > 0
            ORDER BY "allocatedAt" ASC, "id" ASC
            FOR UPDATE
          `,
        );
        const custodyBatches =
          lockedCustodyBatchIds.length > 0
            ? await tx.posTerminalStockBatch.findMany({
                where: {
                  id: {
                    in: lockedCustodyBatchIds.map((batch) => batch.id),
                  },
                },
                select: {
                  id: true,
                  sourceBatchId: true,
                  quantityRemaining: true,
                  allocatedAt: true,
                },
                orderBy: [{ allocatedAt: "asc" }, { id: "asc" }],
              })
            : [];
        const remainingAllocation = custodyBatches.reduce(
          (sum, batch) => sum + batch.quantityRemaining,
          0,
        );
        const expectedRemaining =
          allocation.allocatedQuantity - allocation.soldQuantity;

        if (remainingAllocation !== expectedRemaining) {
          throw new ConflictException(
            `${productLabel(item.product)} custody is out of balance for this POS terminal. Sync or reconcile the terminal before selling it.`,
          );
        }

        if (remainingAllocation < item.quantity) {
          throw new BadRequestException(
            `Only ${formatQuantity(remainingAllocation)} ${item.product.unit.abbreviation} of ${productLabel(item.product)} is allocated to this POS terminal.`,
          );
        }

        terminalAllocations.set(item.productId, {
          id: allocation.id,
          allocatedQuantity: allocation.allocatedQuantity,
          soldQuantity: allocation.soldQuantity,
          batches: custodyBatches,
        });
      }
    }

    const stockBatches = new Map<
      string,
      Array<{ id: string; quantityRemaining: number }>
    >();

    for (const item of items) {
      if (terminalAllocations.has(item.productId)) {
        continue;
      }

      const lockedBatchIds = await tx.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`
          SELECT "id"
          FROM "SalesProductBatch"
          WHERE "productId" = ${item.productId}
            AND "quantityRemaining" > 0
          ORDER BY "receivedAt" ASC, "batchNumber" ASC
          FOR UPDATE
        `,
      );
      const batches =
        lockedBatchIds.length > 0
          ? await tx.salesProductBatch.findMany({
              where: { id: { in: lockedBatchIds.map((batch) => batch.id) } },
              orderBy: [{ receivedAt: "asc" }, { batchNumber: "asc" }],
            })
          : [];
      const physicalStock = batches.reduce(
        (sum, batch) => sum + batch.quantityRemaining,
        0,
      );

      if (physicalStock < item.quantity) {
        throw new BadRequestException(
          `Only ${formatQuantity(physicalStock)} ${item.product.unit.abbreviation} of ${productLabel(item.product)} is available in central Sales stock.`,
        );
      }

      stockBatches.set(item.productId, batches);
    }

    await recordBusinessDayActivity(tx, soldAt);

    const createdSale = await tx.sale.create({
      data: {
        clientRequestId: data.clientRequestId,
        terminalId: terminal?.id ?? null,
        customerType,
        retailerId: retailer?.id ?? null,
        retailerApprovalId,
        paymentMethod,
        customerName,
        soldAt,
        subtotal,
        discount,
        totalAmount,
        amountPaid,
        balanceDue,
        notes: data.notes,
        createdById: actor.id,
      },
    });

    if (retailerApprovalId) {
      await tx.retailerOrderApproval.update({
        where: { id: retailerApprovalId },
        data: {
          status: RetailerOrderApprovalStatus.USED,
          usedAt: new Date(),
        },
      });
    }

    if (terminalRetailerCreditAllocation) {
      await tx.posTerminalRetailerCreditAllocation.update({
        where: { id: terminalRetailerCreditAllocation.id },
        data: {
          usedAmount: new Prisma.Decimal(
            roundMoney(
              terminalRetailerCreditAllocation.usedAmount + balanceDue,
            ).toFixed(2),
          ),
        },
      });
    }

    for (const item of items) {
      const allocation = terminalAllocations.get(item.productId);

      const saleItem = await tx.saleItem.create({
        data: {
          saleId: createdSale.id,
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          lineTotal: item.lineTotal,
        },
      });

      let remainingToSell = item.quantity;

      if (allocation && terminal) {
        for (const batch of allocation.batches) {
          if (remainingToSell <= 0) {
            break;
          }

          const quantityFromBatch = Math.min(
            batch.quantityRemaining,
            remainingToSell,
          );

          if (quantityFromBatch <= 0) {
            continue;
          }

          const balanceAfter = batch.quantityRemaining - quantityFromBatch;

          await tx.posTerminalStockBatch.update({
            where: { id: batch.id },
            data: { quantityRemaining: balanceAfter },
          });
          await tx.saleItemBatch.create({
            data: {
              saleItemId: saleItem.id,
              batchId: batch.sourceBatchId,
              terminalBatchId: batch.id,
              quantity: quantityFromBatch,
            },
          });
          await tx.posTerminalStockMovement.create({
            data: {
              terminalId: terminal.id,
              productId: item.productId,
              terminalBatchId: batch.id,
              type: PosTerminalStockMovementType.SALE,
              quantity: quantityFromBatch,
              balanceAfter,
              saleId: createdSale.id,
              saleItemId: saleItem.id,
              actorId: actor.id,
              note: `Sale #${createdSale.saleNumber}`,
            },
          });

          remainingToSell -= quantityFromBatch;
        }

        await tx.posTerminalStockAllocation.update({
          where: { id: allocation.id },
          data: {
            soldQuantity: { increment: item.quantity },
          },
        });

        continue;
      }

      const batches = stockBatches.get(item.productId) ?? [];

      for (const batch of batches) {
        if (remainingToSell <= 0) {
          break;
        }

        const batchRemaining = decimalToNumber(batch.quantityRemaining);
        const quantityFromBatch = roundQuantity(
          Math.min(batchRemaining, remainingToSell),
        );
        const balanceAfter = roundQuantity(batchRemaining - quantityFromBatch);

        await tx.salesProductBatch.update({
          where: { id: batch.id },
          data: { quantityRemaining: balanceAfter },
        });

        await tx.saleItemBatch.create({
          data: {
            saleItemId: saleItem.id,
            batchId: batch.id,
            quantity: quantityFromBatch,
          },
        });

        await tx.salesProductStockMovement.create({
          data: {
            productId: item.productId,
            batchId: batch.id,
            type: FinishedProductStockMovementType.SALE,
            quantity: quantityFromBatch,
            balanceAfter,
            actorId: actor.id,
            note: `Sale #${createdSale.saleNumber}`,
          },
        });

        remainingToSell = roundQuantity(remainingToSell - quantityFromBatch);
      }
    }

    return tx.sale.findUniqueOrThrow({
      where: { id: createdSale.id },
      include: saleInclude,
    });
  }

  private async auditSaleRecorded(
    sale: SaleWithIncludes,
    actor: AuthenticatedUser,
  ) {
    await this.audit.record({
      actorId: actor.id,
      action: "SALE_RECORDED",
      entityType: "Sale",
      entityId: sale.id,
      metadata: {
        saleNumber: sale.saleNumber,
        totalAmount: sale.totalAmount.toString(),
        paymentMethod: sale.paymentMethod,
        customerType: sale.customerType,
        retailerId: sale.retailerId,
        retailerApprovalId: sale.retailerApprovalId,
      },
    });
  }

  async recordReturn(input: unknown, actor: AuthenticatedUser) {
    const parsed = recordReturnSchema.safeParse(input);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message);
    }

    const recordedAt = parsed.data.recordedAt ?? new Date();
    const returns = await this.prisma.$transaction(
      async (tx) => {
        if (parsed.data.saleItemId) {
          return this.recordSaleItemReturn(tx, {
            saleItemId: parsed.data.saleItemId,
            disposition: parsed.data.disposition,
            quantity: parsed.data.quantity,
            reason: parsed.data.reason,
            recordedAt,
            actorId: actor.id,
          });
        }

        if (parsed.data.disposition === SalesReturnDisposition.RETURN_TO_STOCK) {
          throw new BadRequestException(
            "Select a sale item before returning goods to stock.",
          );
        }

        if (!parsed.data.productId) {
          throw new BadRequestException("Select a product.");
        }

        return this.recordDamagedStock(tx, {
          productId: parsed.data.productId,
          quantity: parsed.data.quantity,
          reason: parsed.data.reason,
          recordedAt,
          actorId: actor.id,
        });
      },
      { timeout: 15000, maxWait: 15000 },
    );

    await this.audit.record({
      actorId: actor.id,
      action: "SALES_RETURN_OR_DAMAGE_RECORDED",
      entityType: "SalesProductReturn",
      entityId: returns[0]?.id ?? null,
      metadata: {
        disposition: parsed.data.disposition,
        quantity: parsed.data.quantity,
        productId: parsed.data.productId,
        saleItemId: parsed.data.saleItemId,
      },
    });

    return returns.map(serializeReturn);
  }

  async summary(dateInput?: string) {
    const { start, end } = toDayRange(dateInput);
    const [sales, returns] = await Promise.all([
      this.prisma.sale.findMany({
        where: { soldAt: { gte: start, lt: end } },
        include: saleInclude,
        orderBy: { soldAt: "desc" },
      }),
      this.prisma.salesProductReturn.findMany({
        where: { recordedAt: { gte: start, lt: end } },
        include: returnInclude,
        orderBy: { recordedAt: "desc" },
      }),
    ]);

    const productSummary = new Map<
      string,
      {
        product: ReturnType<typeof serializeSale>["items"][number]["product"];
        quantitySold: number;
        revenue: number;
      }
    >();
    const paymentSummary = new Map<PaymentMethod, { count: number; amount: number }>();

    for (const sale of sales) {
      const existingPayment = paymentSummary.get(sale.paymentMethod) ?? {
        count: 0,
        amount: 0,
      };
      paymentSummary.set(sale.paymentMethod, {
        count: existingPayment.count + 1,
        amount: roundMoney(
          existingPayment.amount + decimalToNumber(sale.totalAmount),
        ),
      });

      for (const item of sale.items) {
        const existing = productSummary.get(item.product.id) ?? {
          product: item.product,
          quantitySold: 0,
          revenue: 0,
        };
        productSummary.set(item.product.id, {
          product: item.product,
          quantitySold: roundQuantity(
            existing.quantitySold + decimalToNumber(item.quantity),
          ),
          revenue: roundMoney(existing.revenue + decimalToNumber(item.lineTotal)),
        });
      }
    }

    const totalRevenue = roundMoney(
      sales.reduce((sum, sale) => sum + decimalToNumber(sale.totalAmount), 0),
    );
    const amountPaid = roundMoney(
      sales.reduce((sum, sale) => sum + decimalToNumber(sale.amountPaid), 0),
    );
    const balanceDue = roundMoney(
      sales.reduce((sum, sale) => sum + decimalToNumber(sale.balanceDue), 0),
    );
    const damagedQuantity = roundQuantity(
      returns
        .filter((entry) => entry.disposition === SalesReturnDisposition.DAMAGED)
        .reduce((sum, entry) => sum + decimalToNumber(entry.quantity), 0),
    );
    const returnedToStockQuantity = roundQuantity(
      returns
        .filter(
          (entry) => entry.disposition === SalesReturnDisposition.RETURN_TO_STOCK,
        )
        .reduce((sum, entry) => sum + decimalToNumber(entry.quantity), 0),
    );

    return {
      date: start.toISOString(),
      salesCount: sales.length,
      totalRevenue: totalRevenue.toFixed(2),
      amountPaid: amountPaid.toFixed(2),
      balanceDue: balanceDue.toFixed(2),
      damagedQuantity: damagedQuantity.toFixed(3),
      returnedToStockQuantity: returnedToStockQuantity.toFixed(3),
      paymentSummary: Object.values(PaymentMethod).map((method) => {
        const value = paymentSummary.get(method) ?? { count: 0, amount: 0 };

        return {
          method,
          count: value.count,
          amount: value.amount.toFixed(2),
        };
      }),
      productSummary: [...productSummary.values()].map((entry) => ({
        product: entry.product,
        quantitySold: entry.quantitySold.toFixed(3),
        revenue: entry.revenue.toFixed(2),
      })),
      sales: sales.map(serializeSale),
      returns: returns.map(serializeReturn),
    };
  }

  private async recordSaleItemReturn(
    tx: Prisma.TransactionClient,
    input: {
      saleItemId: string;
      disposition: SalesReturnDisposition;
      quantity: number;
      reason?: string;
      recordedAt: Date;
      actorId: string;
    },
  ) {
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "SaleItem" WHERE "id" = ${input.saleItemId} FOR UPDATE`,
    );

    const saleItem = await tx.saleItem.findUnique({
      where: { id: input.saleItemId },
      include: {
        product: { select: productSelect },
        batchIssues: {
          include: { batch: true, terminalBatch: true },
          orderBy: { createdAt: "asc" },
        },
        returns: {
          select: {
            batchId: true,
            terminalBatchId: true,
            quantity: true,
          },
        },
      },
    });

    if (!saleItem) {
      throw new NotFoundException("Sale item not found.");
    }

    const returnedQuantity = saleItem.returns.reduce(
      (sum, entry) => sum + decimalToNumber(entry.quantity),
      0,
    );
    const returnableQuantity = roundQuantity(
      decimalToNumber(saleItem.quantity) - returnedQuantity,
    );

    if (input.quantity > returnableQuantity) {
      throw new BadRequestException(
        `You can return at most ${formatQuantity(returnableQuantity)} ${saleItem.product.unit.abbreviation}.`,
      );
    }

    await recordBusinessDayActivity(tx, input.recordedAt);

    let remainingToReturn = input.quantity;
    const createdReturns: SalesReturnWithIncludes[] = [];
    const returnedByIssue = new Map<string, number>();
    let unbatchedReturnedQuantity = 0;

    for (const entry of saleItem.returns) {
      const quantity = decimalToNumber(entry.quantity);

      if (entry.batchId) {
        const issueKey = `${entry.batchId}:${entry.terminalBatchId ?? "central"}`;
        returnedByIssue.set(
          issueKey,
          roundQuantity((returnedByIssue.get(issueKey) ?? 0) + quantity),
        );
      } else {
        unbatchedReturnedQuantity = roundQuantity(
          unbatchedReturnedQuantity + quantity,
        );
      }
    }

    for (const issue of saleItem.batchIssues) {
      if (remainingToReturn <= 0) {
        break;
      }

      const issueQuantity = roundQuantity(decimalToNumber(issue.quantity));
      const issueKey = `${issue.batchId}:${issue.terminalBatchId ?? "central"}`;
      const alreadyReturned = returnedByIssue.get(issueKey) ?? 0;
      let availableFromIssue = roundQuantity(
        Math.max(issueQuantity - alreadyReturned, 0),
      );

      if (unbatchedReturnedQuantity > 0) {
        const historicalReturnQuantity = roundQuantity(
          Math.min(availableFromIssue, unbatchedReturnedQuantity),
        );
        availableFromIssue = roundQuantity(
          availableFromIssue - historicalReturnQuantity,
        );
        unbatchedReturnedQuantity = roundQuantity(
          unbatchedReturnedQuantity - historicalReturnQuantity,
        );
      }

      const quantityToBatch = roundQuantity(
        Math.min(availableFromIssue, remainingToReturn),
      );

      if (quantityToBatch <= 0) {
        continue;
      }

      if (input.disposition === SalesReturnDisposition.DAMAGED) {
        const createdReturn = await tx.salesProductReturn.create({
          data: {
            saleItemId: saleItem.id,
            productId: saleItem.productId,
            batchId: issue.batchId,
            terminalBatchId: issue.terminalBatchId,
            disposition: SalesReturnDisposition.DAMAGED,
            quantity: quantityToBatch,
            reason: input.reason,
            recordedAt: input.recordedAt,
            createdById: input.actorId,
          },
          include: returnInclude,
        });

        createdReturns.push(createdReturn);
        remainingToReturn = roundQuantity(remainingToReturn - quantityToBatch);
        continue;
      }

      if (issue.terminalBatchId) {
        if (!issue.terminalBatch) {
          throw new ConflictException(
            "The original terminal custody batch is no longer available.",
          );
        }

        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "PosTerminalStockAllocation" WHERE "id" = ${issue.terminalBatch.allocationId} FOR UPDATE`,
        );
        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "PosTerminalStockBatch" WHERE "id" = ${issue.terminalBatchId} FOR UPDATE`,
        );

        const custodyBatch = await tx.posTerminalStockBatch.findUniqueOrThrow({
          where: { id: issue.terminalBatchId },
          select: {
            id: true,
            allocationId: true,
            terminalId: true,
            productId: true,
            quantityRemaining: true,
          },
        });
        const custodyBalanceAfter =
          custodyBatch.quantityRemaining + quantityToBatch;

        await tx.posTerminalStockBatch.update({
          where: { id: custodyBatch.id },
          data: { quantityRemaining: custodyBalanceAfter },
        });
        await tx.posTerminalStockAllocation.update({
          where: { id: custodyBatch.allocationId },
          data: { soldQuantity: { decrement: quantityToBatch } },
        });
        await tx.posTerminalStockMovement.create({
          data: {
            terminalId: custodyBatch.terminalId,
            productId: custodyBatch.productId,
            terminalBatchId: custodyBatch.id,
            type: PosTerminalStockMovementType.RETURN,
            quantity: quantityToBatch,
            balanceAfter: custodyBalanceAfter,
            saleItemId: saleItem.id,
            actorId: input.actorId,
            note: input.reason ?? "Customer return to terminal stock",
          },
        });

        const createdReturn = await tx.salesProductReturn.create({
          data: {
            saleItemId: saleItem.id,
            productId: saleItem.productId,
            batchId: issue.batchId,
            terminalBatchId: custodyBatch.id,
            disposition: SalesReturnDisposition.RETURN_TO_STOCK,
            quantity: quantityToBatch,
            reason: input.reason,
            recordedAt: input.recordedAt,
            createdById: input.actorId,
          },
          include: returnInclude,
        });

        createdReturns.push(createdReturn);
        remainingToReturn = roundQuantity(
          remainingToReturn - quantityToBatch,
        );
        continue;
      }

      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "SalesProductBatch" WHERE "id" = ${issue.batchId} FOR UPDATE`,
      );

      const batch = await tx.salesProductBatch.findUniqueOrThrow({
        where: { id: issue.batchId },
      });
      const balanceAfter = roundQuantity(
        decimalToNumber(batch.quantityRemaining) + quantityToBatch,
      );

      await tx.salesProductBatch.update({
        where: { id: batch.id },
        data: { quantityRemaining: balanceAfter },
      });

      await tx.salesProductStockMovement.create({
        data: {
          productId: saleItem.productId,
          batchId: batch.id,
          type: FinishedProductStockMovementType.RETURN,
          quantity: quantityToBatch,
          balanceAfter,
          actorId: input.actorId,
          note: input.reason ?? "Customer return to stock",
        },
      });

      const createdReturn = await tx.salesProductReturn.create({
        data: {
          saleItemId: saleItem.id,
          productId: saleItem.productId,
          batchId: batch.id,
          disposition: SalesReturnDisposition.RETURN_TO_STOCK,
          quantity: quantityToBatch,
          reason: input.reason,
          recordedAt: input.recordedAt,
          createdById: input.actorId,
        },
        include: returnInclude,
      });

      createdReturns.push(createdReturn);
      remainingToReturn = roundQuantity(remainingToReturn - quantityToBatch);
    }

    if (remainingToReturn > 0) {
      throw new BadRequestException(
        `Only ${formatQuantity(
          roundQuantity(input.quantity - remainingToReturn),
        )} ${saleItem.product.unit.abbreviation} can be matched to the original sale batches.`,
      );
    }

    return createdReturns;
  }

  private async recordDamagedStock(
    tx: Prisma.TransactionClient,
    input: {
      productId: string;
      quantity: number;
      reason?: string;
      recordedAt: Date;
      actorId: string;
    },
  ) {
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "Product" WHERE "id" = ${input.productId} FOR UPDATE`,
    );

    const product = await tx.product.findUnique({
      where: { id: input.productId },
      select: productSelect,
    });

    if (!product) {
      throw new NotFoundException("Product not found.");
    }

    const lockedBatchIds = await tx.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`
        SELECT "id"
        FROM "SalesProductBatch"
        WHERE "productId" = ${input.productId}
          AND "quantityRemaining" > 0
        ORDER BY "receivedAt" ASC, "batchNumber" ASC
        FOR UPDATE
      `,
    );
    const batches =
      lockedBatchIds.length > 0
        ? await tx.salesProductBatch.findMany({
            where: { id: { in: lockedBatchIds.map((batch) => batch.id) } },
            orderBy: [{ receivedAt: "asc" }, { batchNumber: "asc" }],
          })
        : [];
    const availableQuantity = batches.reduce(
      (sum, batch) => sum + decimalToNumber(batch.quantityRemaining),
      0,
    );
    if (availableQuantity < input.quantity) {
      throw new BadRequestException(
        `Only ${formatQuantity(availableQuantity)} ${product.unit.abbreviation} of ${productLabel(product)} is available in central Sales stock. Use a terminal adjustment if the damaged stock is held by a POS terminal.`,
      );
    }

    await recordBusinessDayActivity(tx, input.recordedAt);

    let remainingToDamage = input.quantity;
    const createdReturns: SalesReturnWithIncludes[] = [];

    for (const batch of batches) {
      if (remainingToDamage <= 0) {
        break;
      }

      const batchRemaining = decimalToNumber(batch.quantityRemaining);
      const quantityFromBatch = roundQuantity(
        Math.min(batchRemaining, remainingToDamage),
      );
      const balanceAfter = roundQuantity(batchRemaining - quantityFromBatch);

      await tx.salesProductBatch.update({
        where: { id: batch.id },
        data: { quantityRemaining: balanceAfter },
      });

      await tx.salesProductStockMovement.create({
        data: {
          productId: input.productId,
          batchId: batch.id,
          type: FinishedProductStockMovementType.DAMAGED,
          quantity: quantityFromBatch,
          balanceAfter,
          actorId: input.actorId,
          note: input.reason ?? "Damaged Sales stock",
        },
      });

      const createdReturn = await tx.salesProductReturn.create({
        data: {
          productId: input.productId,
          batchId: batch.id,
          disposition: SalesReturnDisposition.DAMAGED,
          quantity: quantityFromBatch,
          reason: input.reason,
          recordedAt: input.recordedAt,
          createdById: input.actorId,
        },
        include: returnInclude,
      });

      createdReturns.push(createdReturn);
      remainingToDamage = roundQuantity(remainingToDamage - quantityFromBatch);
    }

    return createdReturns;
  }

  private async getPosSessionForActor(id: string, actor: AuthenticatedUser) {
    const session = await this.prisma.posSession.findUnique({
      where: { id },
      include: posSessionInclude,
    });

    if (!session) {
      throw new NotFoundException("POS session not found.");
    }

    if (actor.role !== "ADMIN" && session.createdById !== actor.id) {
      throw new BadRequestException("You can only manage your own POS session.");
    }

    return session;
  }

  private async assertPosSessionDevice(
    session: PosSessionWithIncludes,
    deviceSecret?: string,
  ) {
    if (!session.terminalId) {
      return;
    }

    await this.assertTerminalDevice(session.terminalId, deviceSecret);
  }

  private assertActivePosSession(session: PosSessionWithIncludes) {
    if (session.status !== PosSessionStatus.ACTIVE) {
      throw new BadRequestException("This POS session is no longer active.");
    }
  }

  private async salesProductAvailableQuantity(productId: string) {
    const result = await this.prisma.salesProductBatch.aggregate({
      where: {
        productId,
        quantityRemaining: { gt: 0 },
      },
      _sum: { quantityRemaining: true },
    });

    return result._sum.quantityRemaining
      ? roundQuantity(decimalToNumber(result._sum.quantityRemaining))
      : 0;
  }

  private async emitPosSessionUpdate(
    displayToken: string,
    session?: ReturnType<typeof serializePosSession>,
  ) {
    if (!this.posDisplayEvents.hasSessionSubscribers(displayToken)) {
      return;
    }

    this.posDisplayEvents.emitSessionUpdate(
      displayToken,
      session ?? (await this.getPosDisplay(displayToken)),
    );
  }

  private async emitPosTerminalUpdate(
    displayToken: string,
    session?: ReturnType<typeof serializePosSession>,
  ) {
    if (!this.posDisplayEvents.hasTerminalSubscribers(displayToken)) {
      return;
    }

    if (session) {
      this.posDisplayEvents.emitTerminalSessionUpdate(displayToken, session);
      return;
    }

    this.posDisplayEvents.emitTerminalUpdate(
      displayToken,
      await this.getPosTerminalDisplay(displayToken),
    );
  }
}
