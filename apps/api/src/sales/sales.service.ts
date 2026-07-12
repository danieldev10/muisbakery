import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  CustomerType,
  FinishedProductStockMovementType,
  PaymentMethod,
  PosSessionStatus,
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
import { PosDisplayEvents } from "./pos-display-events";
import {
  createPosSessionSchema,
  createPosTerminalSchema,
  createRetailerOrderApprovalSchema,
  createRetailerSchema,
  createSaleSchema,
  recordRetailerPaymentSchema,
  requestRetailerOrderApprovalSchema,
  updateRetailerOrderApprovalSchema,
  recordReturnSchema,
  updateRetailerSchema,
  updatePosTerminalSchema,
  updatePosSessionSchema,
  upsertPosSessionItemSchema,
  type CreateSaleInput,
} from "./sales.schemas";
import {
  inventoryInclude,
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

    const approval = await this.prisma.retailerOrderApproval.create({
      data: {
        retailerId: retailer.id,
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
        approvedAmount: approval.approvedAmount.toString(),
        expiresAt: approval.expiresAt?.toISOString() ?? null,
      },
    });

    return {
      id: approval.id,
      approvedAmount: approval.approvedAmount.toString(),
      status: approval.status,
      reason: approval.reason,
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

    const approval = await this.prisma.retailerOrderApproval.create({
      data: {
        retailerId: retailer.id,
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
        requestedAmount: approval.approvedAmount.toString(),
        outstandingBalance: outstandingBalance.toFixed(2),
      },
    });

    return {
      id: approval.id,
      approvedAmount: approval.approvedAmount.toString(),
      status: approval.status,
      reason: approval.reason,
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

        const createdPayment = await tx.retailerPayment.create({
          data: {
            retailerId: retailer.id,
            amount: new Prisma.Decimal(amount.toFixed(2)),
            paymentMethod: parsed.data.paymentMethod,
            paidAt: parsed.data.paidAt ?? new Date(),
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

  async getPosTerminal(id: string) {
    const existing = await this.prisma.posTerminal.findUnique({
      where: { id },
      include: posTerminalInclude,
    });

    if (!existing) {
      throw new NotFoundException("POS terminal not found.");
    }

    if (!existing.isActive) {
      throw new BadRequestException("This POS terminal has been deactivated.");
    }

    const terminal = await this.prisma.posTerminal.update({
      where: { id },
      data: { lastSeenAt: new Date() },
      include: posTerminalInclude,
    });

    return serializePosTerminal(terminal);
  }

  async createPosSession(input: unknown, actor: AuthenticatedUser) {
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
      const terminal = await this.prisma.posTerminal.findUnique({
        where: { id: parsed.data.terminalId },
        select: { id: true, displayToken: true, isActive: true },
      });

      if (!terminal) {
        throw new NotFoundException("POS terminal not found.");
      }

      if (!terminal.isActive) {
        throw new BadRequestException("This POS terminal has been deactivated.");
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

  async getPosSession(id: string, actor: AuthenticatedUser) {
    const session = await this.getPosSessionForActor(id, actor);
    return serializePosSession(session);
  }

  async updatePosSession(
    id: string,
    input: unknown,
    actor: AuthenticatedUser,
  ) {
    const parsed = updatePosSessionSchema.safeParse(input ?? {});

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message);
    }

    const existing = await this.getPosSessionForActor(id, actor);
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
  ) {
    const parsed = upsertPosSessionItemSchema.safeParse(input);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message);
    }

    const existing = await this.getPosSessionForActor(id, actor);
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

  async checkoutPosSession(id: string, actor: AuthenticatedUser) {
    const session = await this.getPosSessionForActor(id, actor);
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

  async cancelPosSession(id: string, actor: AuthenticatedUser) {
    const existing = await this.getPosSessionForActor(id, actor);

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
    let retailer:
      | { id: string; name: string; isActive: boolean }
      | null = null;
    let retailerApprovalId: string | null = null;
    let paymentMethod = data.paymentMethod;
    let customerName = data.customerName;
    let amountPaid = roundMoney(
      data.amountPaid ??
        (paymentMethod === PaymentMethod.CREDIT ? 0 : totalAmount),
    );

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

    const createdSale = await tx.sale.create({
      data: {
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

    for (const item of items) {
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
      const availableQuantity = batches.reduce(
        (sum, batch) => sum + decimalToNumber(batch.quantityRemaining),
        0,
      );

      if (availableQuantity < item.quantity) {
        throw new BadRequestException(
          `Only ${formatQuantity(availableQuantity)} ${item.product.unit.abbreviation} of ${productLabel(item.product)} is available for sale.`,
        );
      }

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
          include: { batch: true },
          orderBy: { createdAt: "asc" },
        },
        returns: { select: { batchId: true, quantity: true } },
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

    let remainingToReturn = input.quantity;
    const createdReturns: SalesReturnWithIncludes[] = [];
    const returnedByBatch = new Map<string, number>();
    let unbatchedReturnedQuantity = 0;

    for (const entry of saleItem.returns) {
      const quantity = decimalToNumber(entry.quantity);

      if (entry.batchId) {
        returnedByBatch.set(
          entry.batchId,
          roundQuantity((returnedByBatch.get(entry.batchId) ?? 0) + quantity),
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
      const alreadyReturned = returnedByBatch.get(issue.batchId) ?? 0;
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
        `Only ${formatQuantity(availableQuantity)} ${product.unit.abbreviation} of ${productLabel(product)} is available in Sales stock.`,
      );
    }

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
