import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  FinishedProductStockMovementType,
  PaymentMethod,
  PosSessionStatus,
  Prisma,
  SalesReturnDisposition,
} from "@prisma/client";

import { AuditService } from "../audit/audit.service";
import type { AuthenticatedUser } from "../auth/auth.types";
import { PrismaService } from "../database/prisma.service";
import { PosDisplayEvents } from "./pos-display-events";
import {
  createPosSessionSchema,
  createPosTerminalSchema,
  createSaleSchema,
  recordReturnSchema,
  updatePosSessionSchema,
  upsertPosSessionItemSchema,
  type CreateSaleInput,
} from "./sales.schemas";
import {
  inventoryInclude,
  posSessionInclude,
  posTerminalInclude,
  productSelect,
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

@Injectable()
export class SalesService {
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
    const [products, saleItems] = await Promise.all([
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
    ]);

    return {
      products: products.map(serializeInventoryItem),
      saleItems: saleItems
        .map(serializeSaleItemOption)
        .filter((item) => Number(item.returnableQuantity) > 0),
      paymentMethods: Object.values(PaymentMethod),
      returnDispositions: Object.values(SalesReturnDisposition),
    };
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
        createdById: actor.id,
      },
      include: posTerminalInclude,
    });

    return serializePosTerminal(terminal);
  }

  async getPosTerminal(id: string) {
    const terminal = await this.prisma.posTerminal.findUnique({
      where: { id },
      include: posTerminalInclude,
    });

    if (!terminal) {
      throw new NotFoundException("POS terminal not found.");
    }

    return serializePosTerminal(terminal);
  }

  async createPosSession(input: unknown, actor: AuthenticatedUser) {
    const parsed = createPosSessionSchema.safeParse(input ?? {});

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message);
    }

    let terminalDisplayToken: string | null = null;

    if (parsed.data.terminalId) {
      const terminal = await this.prisma.posTerminal.findUnique({
        where: { id: parsed.data.terminalId },
        select: { id: true, displayToken: true },
      });

      if (!terminal) {
        throw new NotFoundException("POS terminal not found.");
      }

      terminalDisplayToken = terminal.displayToken;
    }

    let session = await this.prisma.posSession.create({
      data: {
        displayToken: generateDisplayToken(),
        terminalId: parsed.data.terminalId,
        customerName: parsed.data.customerName,
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

    const session = await this.prisma.posSession.update({
      where: { id: existing.id },
      data: {
        customerName: parsed.data.customerName,
        paymentMethod: parsed.data.paymentMethod,
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
    const { sale, updated } = await this.prisma.$transaction(
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
    );

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

    if (!session) {
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

    return serializePosTerminal(terminal);
  }

  async listSales() {
    const sales = await this.prisma.sale.findMany({
      include: saleInclude,
      orderBy: { soldAt: "desc" },
      take: 200,
    });

    return sales.map(serializeSale);
  }

  async listReturns() {
    const returns = await this.prisma.salesProductReturn.findMany({
      include: returnInclude,
      orderBy: { recordedAt: "desc" },
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
    const amountPaid = roundMoney(
      data.amountPaid ??
        (data.paymentMethod === PaymentMethod.CREDIT ? 0 : totalAmount),
    );

    if (amountPaid > totalAmount) {
      throw new BadRequestException("Amount paid cannot exceed total amount.");
    }

    const balanceDue = roundMoney(totalAmount - amountPaid);
    const soldAt = data.soldAt ?? new Date();

    const createdSale = await tx.sale.create({
      data: {
        paymentMethod: data.paymentMethod,
        customerName: data.customerName,
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
    const saleItem = await tx.saleItem.findUnique({
      where: { id: input.saleItemId },
      include: {
        product: { select: productSelect },
        batchIssues: {
          include: { batch: true },
          orderBy: { createdAt: "asc" },
        },
        returns: { select: { quantity: true } },
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

    if (input.disposition === SalesReturnDisposition.DAMAGED) {
      const damaged = await tx.salesProductReturn.create({
        data: {
          saleItemId: saleItem.id,
          productId: saleItem.productId,
          disposition: SalesReturnDisposition.DAMAGED,
          quantity: input.quantity,
          reason: input.reason,
          recordedAt: input.recordedAt,
          createdById: input.actorId,
        },
        include: returnInclude,
      });

      return [damaged];
    }

    let remainingToReturn = input.quantity;
    const createdReturns: SalesReturnWithIncludes[] = [];

    for (const issue of saleItem.batchIssues) {
      if (remainingToReturn <= 0) {
        break;
      }

      const issueQuantity = decimalToNumber(issue.quantity);
      const quantityToBatch = roundQuantity(
        Math.min(issueQuantity, remainingToReturn),
      );

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
