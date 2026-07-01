import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomBytes } from "node:crypto";
import {
  FinishedProductStockMovementType,
  PaymentMethod,
  PosSessionStatus,
  Prisma,
  SalesReturnDisposition,
} from "@prisma/client";
import { z } from "zod";

import { AuditService } from "../audit/audit.service";
import type { AuthenticatedUser } from "../auth/auth.types";
import { PrismaService } from "../database/prisma.service";
import { PosDisplayEvents } from "./pos-display-events";

const optionalText = (max = 300) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().max(max).optional(),
  );

const nullableText = (max = 300) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    z.string().trim().max(max).nullable().optional(),
  );

const optionalDate = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z.coerce.date().optional(),
);

const quantitySchema = z.coerce
  .number()
  .positive("Quantity must be greater than zero.")
  .max(99_999_999);

const moneySchema = z.coerce
  .number()
  .nonnegative("Amount cannot be negative.")
  .max(999_999_999);

const nonnegativeQuantitySchema = z.coerce
  .number()
  .nonnegative("Quantity cannot be negative.")
  .max(99_999_999);

const optionalMoneySchema = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  moneySchema.optional(),
);

const nullableMoneySchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  moneySchema.nullable().optional(),
);

const saleItemSchema = z.object({
  productId: z.string().trim().min(1),
  quantity: quantitySchema,
  unitPrice: optionalMoneySchema,
});

const createSaleSchema = z
  .object({
    paymentMethod: z.enum(PaymentMethod),
    customerName: optionalText(160),
    soldAt: optionalDate,
    discount: optionalMoneySchema,
    amountPaid: optionalMoneySchema,
    notes: optionalText(500),
    items: z.array(saleItemSchema).min(1, "Add at least one sale item."),
  })
  .superRefine((value, context) => {
    const productIds = new Set<string>();

    value.items.forEach((item, index) => {
      if (productIds.has(item.productId)) {
        context.addIssue({
          code: "custom",
          message: "Each product can only appear once on a sale.",
          path: ["items", index, "productId"],
        });
      }
      productIds.add(item.productId);
    });
  });

const recordReturnSchema = z
  .object({
    saleItemId: z.preprocess(
      (value) =>
        typeof value === "string" && value.trim() === "" ? undefined : value,
      z.string().trim().min(1).optional(),
    ),
    productId: z.preprocess(
      (value) =>
        typeof value === "string" && value.trim() === "" ? undefined : value,
      z.string().trim().min(1).optional(),
    ),
    disposition: z.enum(SalesReturnDisposition),
    quantity: quantitySchema,
    reason: optionalText(500),
    recordedAt: optionalDate,
  })
  .superRefine((value, context) => {
    if (
      value.disposition === SalesReturnDisposition.RETURN_TO_STOCK &&
      !value.saleItemId
    ) {
      context.addIssue({
        code: "custom",
        message: "Select a sale item before returning goods to stock.",
        path: ["saleItemId"],
      });
    }

    if (!value.saleItemId && !value.productId) {
      context.addIssue({
        code: "custom",
        message: "Select a product or a sale item.",
        path: ["productId"],
      });
    }
  });

const createPosTerminalSchema = z.object({
  name: optionalText(100),
});

const createPosSessionSchema = z.object({
  customerName: optionalText(160),
  terminalId: optionalText(80),
});

const updatePosSessionSchema = z.object({
  customerName: nullableText(160),
  paymentMethod: z.enum(PaymentMethod).optional(),
  discount: optionalMoneySchema,
  amountPaid: nullableMoneySchema,
  notes: nullableText(500),
});

const upsertPosSessionItemSchema = z.object({
  productId: z.string().trim().min(1),
  quantity: nonnegativeQuantitySchema,
  unitPrice: optionalMoneySchema,
});

const unitSelect = {
  id: true,
  name: true,
  abbreviation: true,
} satisfies Prisma.UnitSelect;

const productSelect = {
  id: true,
  name: true,
  unitPrice: true,
  unit: { select: unitSelect },
} satisfies Prisma.ProductSelect;

const userSelect = {
  id: true,
  name: true,
  email: true,
} satisfies Prisma.UserSelect;

const batchSelect = {
  id: true,
  batchNumber: true,
  batchDate: true,
  quantityReceived: true,
  quantityRemaining: true,
  receivedAt: true,
  notes: true,
  productionRun: {
    select: {
      id: true,
      producedAt: true,
    },
  },
  createdBy: { select: userSelect },
} satisfies Prisma.SalesProductBatchSelect;

const inventoryInclude = {
  unit: { select: unitSelect },
  salesBatches: {
    where: { quantityRemaining: { gt: 0 } },
    select: batchSelect,
    orderBy: [{ receivedAt: "asc" }, { batchNumber: "asc" }],
  },
} satisfies Prisma.ProductInclude;

const saleInclude = {
  createdBy: { select: userSelect },
  items: {
    include: {
      product: { select: productSelect },
      batchIssues: {
        include: {
          batch: {
            select: {
              id: true,
              batchNumber: true,
              batchDate: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "asc" },
  },
} satisfies Prisma.SaleInclude;

const saleItemOptionInclude = {
  sale: {
    select: {
      id: true,
      saleNumber: true,
      soldAt: true,
    },
  },
  product: { select: productSelect },
  batchIssues: {
    include: {
      batch: {
        select: {
          id: true,
          batchNumber: true,
          batchDate: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  },
  returns: {
    select: {
      quantity: true,
    },
  },
} satisfies Prisma.SaleItemInclude;

const returnInclude = {
  saleItem: {
    include: {
      sale: {
        select: {
          id: true,
          saleNumber: true,
          soldAt: true,
        },
      },
      product: { select: productSelect },
    },
  },
  product: { select: productSelect },
  batch: {
    select: {
      id: true,
      batchNumber: true,
      batchDate: true,
    },
  },
  createdBy: { select: userSelect },
} satisfies Prisma.SalesProductReturnInclude;

const posSessionInclude = {
  terminal: {
    select: {
      id: true,
      displayToken: true,
    },
  },
  completedSale: {
    select: {
      id: true,
      saleNumber: true,
      totalAmount: true,
      amountPaid: true,
      balanceDue: true,
      soldAt: true,
    },
  },
  items: {
    include: {
      product: { select: productSelect },
    },
    orderBy: { createdAt: "asc" },
  },
} satisfies Prisma.PosSessionInclude;

const posTerminalInclude = {
  currentSession: {
    include: posSessionInclude,
  },
} satisfies Prisma.PosTerminalInclude;

type ProductInventory = Prisma.ProductGetPayload<{
  include: typeof inventoryInclude;
}>;

type SaleWithIncludes = Prisma.SaleGetPayload<{
  include: typeof saleInclude;
}>;

type SaleItemOption = Prisma.SaleItemGetPayload<{
  include: typeof saleItemOptionInclude;
}>;

type SalesReturnWithIncludes = Prisma.SalesProductReturnGetPayload<{
  include: typeof returnInclude;
}>;

type PosSessionWithIncludes = Prisma.PosSessionGetPayload<{
  include: typeof posSessionInclude;
}>;

type PosTerminalWithIncludes = Prisma.PosTerminalGetPayload<{
  include: typeof posTerminalInclude;
}>;

function decimalToNumber(value: Prisma.Decimal | number | string) {
  return Number(value.toString());
}

function roundQuantity(value: number) {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function formatQuantity(value: number) {
  return roundQuantity(value).toFixed(3);
}

function toDayRange(dateInput?: string) {
  const base = dateInput ? new Date(`${dateInput}T00:00:00`) : new Date();

  if (Number.isNaN(base.getTime())) {
    throw new BadRequestException("Enter a valid summary date.");
  }

  const start = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  const end = new Date(start);
  end.setDate(start.getDate() + 1);

  return { start, end };
}

function serializeBatch(batch: ProductInventory["salesBatches"][number]) {
  return {
    id: batch.id,
    batchNumber: batch.batchNumber,
    batchDate: batch.batchDate.toISOString(),
    quantityReceived: batch.quantityReceived.toString(),
    quantityRemaining: batch.quantityRemaining.toString(),
    receivedAt: batch.receivedAt.toISOString(),
    notes: batch.notes,
    productionRun: batch.productionRun
      ? {
          id: batch.productionRun.id,
          producedAt: batch.productionRun.producedAt.toISOString(),
        }
      : null,
    createdBy: batch.createdBy,
  };
}

function serializeInventoryItem(product: ProductInventory) {
  const totalRemaining = product.salesBatches.reduce(
    (sum, batch) => sum + decimalToNumber(batch.quantityRemaining),
    0,
  );

  return {
    product: {
      id: product.id,
      name: product.name,
      unit: product.unit,
      unitPrice: product.unitPrice?.toString() ?? null,
    },
    totalRemaining: formatQuantity(totalRemaining),
    batches: product.salesBatches.map(serializeBatch),
  };
}

function serializeSale(sale: SaleWithIncludes) {
  return {
    id: sale.id,
    saleNumber: sale.saleNumber,
    paymentMethod: sale.paymentMethod,
    customerName: sale.customerName,
    soldAt: sale.soldAt.toISOString(),
    subtotal: sale.subtotal.toString(),
    discount: sale.discount.toString(),
    totalAmount: sale.totalAmount.toString(),
    amountPaid: sale.amountPaid.toString(),
    balanceDue: sale.balanceDue.toString(),
    notes: sale.notes,
    createdAt: sale.createdAt.toISOString(),
    createdBy: sale.createdBy,
    items: sale.items.map((item) => ({
      id: item.id,
      quantity: item.quantity.toString(),
      unitPrice: item.unitPrice.toString(),
      lineTotal: item.lineTotal.toString(),
      product: item.product,
      batchIssues: item.batchIssues.map((issue) => ({
        id: issue.id,
        quantity: issue.quantity.toString(),
        batch: {
          id: issue.batch.id,
          batchNumber: issue.batch.batchNumber,
          batchDate: issue.batch.batchDate.toISOString(),
        },
      })),
    })),
  };
}

function serializeSaleItemOption(item: SaleItemOption) {
  const soldQuantity = decimalToNumber(item.quantity);
  const returnedQuantity = item.returns.reduce(
    (sum, entry) => sum + decimalToNumber(entry.quantity),
    0,
  );
  const returnableQuantity = Math.max(
    0,
    roundQuantity(soldQuantity - returnedQuantity),
  );

  return {
    id: item.id,
    quantity: item.quantity.toString(),
    returnableQuantity: returnableQuantity.toFixed(3),
    unitPrice: item.unitPrice.toString(),
    lineTotal: item.lineTotal.toString(),
    sale: {
      id: item.sale.id,
      saleNumber: item.sale.saleNumber,
      soldAt: item.sale.soldAt.toISOString(),
    },
    product: item.product,
    batchIssues: item.batchIssues.map((issue) => ({
      id: issue.id,
      quantity: issue.quantity.toString(),
      batch: {
        id: issue.batch.id,
        batchNumber: issue.batch.batchNumber,
        batchDate: issue.batch.batchDate.toISOString(),
      },
    })),
  };
}

function serializeReturn(entry: SalesReturnWithIncludes) {
  return {
    id: entry.id,
    disposition: entry.disposition,
    quantity: entry.quantity.toString(),
    reason: entry.reason,
    recordedAt: entry.recordedAt.toISOString(),
    createdAt: entry.createdAt.toISOString(),
    product: entry.product,
    batch: entry.batch
      ? {
          id: entry.batch.id,
          batchNumber: entry.batch.batchNumber,
          batchDate: entry.batch.batchDate.toISOString(),
        }
      : null,
    saleItem: entry.saleItem
      ? {
          id: entry.saleItem.id,
          quantity: entry.saleItem.quantity.toString(),
          sale: {
            id: entry.saleItem.sale.id,
            saleNumber: entry.saleItem.sale.saleNumber,
            soldAt: entry.saleItem.sale.soldAt.toISOString(),
          },
          product: entry.saleItem.product,
        }
      : null,
    createdBy: entry.createdBy,
  };
}

function generateDisplayToken() {
  return randomBytes(12).toString("base64url");
}

function serializePosSession(session: PosSessionWithIncludes) {
  const items = session.items.map((item) => {
    const quantity = decimalToNumber(item.quantity);
    const unitPrice = decimalToNumber(item.unitPrice);
    const lineTotal = roundMoney(quantity * unitPrice);

    return {
      id: item.id,
      quantity: item.quantity.toString(),
      unitPrice: item.unitPrice.toString(),
      lineTotal: lineTotal.toFixed(2),
      product: item.product,
    };
  });
  const subtotal = roundMoney(
    items.reduce((sum, item) => sum + Number(item.lineTotal), 0),
  );
  const discount = decimalToNumber(session.discount);
  const totalAmount = Math.max(0, roundMoney(subtotal - discount));
  const amountPaid =
    session.amountPaid !== null
      ? decimalToNumber(session.amountPaid)
      : session.paymentMethod === PaymentMethod.CREDIT
        ? 0
        : totalAmount;
  const balanceDue = Math.max(0, roundMoney(totalAmount - amountPaid));

  return {
    id: session.id,
    displayToken: session.displayToken,
    terminal: session.terminal,
    status: session.status,
    customerName: session.customerName,
    paymentMethod: session.paymentMethod,
    discount: session.discount.toString(),
    amountPaid: amountPaid.toFixed(2),
    balanceDue: balanceDue.toFixed(2),
    subtotal: subtotal.toFixed(2),
    totalAmount: totalAmount.toFixed(2),
    notes: session.notes,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
    completedAt: session.completedAt?.toISOString() ?? null,
    completedSale: session.completedSale
      ? {
          id: session.completedSale.id,
          saleNumber: session.completedSale.saleNumber,
          totalAmount: session.completedSale.totalAmount.toString(),
          amountPaid: session.completedSale.amountPaid.toString(),
          balanceDue: session.completedSale.balanceDue.toString(),
          soldAt: session.completedSale.soldAt.toISOString(),
        }
      : null,
    items,
  };
}

function serializePosTerminal(terminal: PosTerminalWithIncludes) {
  return {
    id: terminal.id,
    name: terminal.name,
    displayToken: terminal.displayToken,
    createdAt: terminal.createdAt.toISOString(),
    updatedAt: terminal.updatedAt.toISOString(),
    currentSession: terminal.currentSession
      ? serializePosSession(terminal.currentSession)
      : null,
  };
}

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
        `Enter a unit price for ${product.name} before adding it to the sale.`,
      );
    }

    if (parsed.data.quantity > 0) {
      const available = await this.salesProductAvailableQuantity(product.id);

      if (available < parsed.data.quantity) {
        throw new BadRequestException(
          `Only ${formatQuantity(available)} ${product.unit.abbreviation} of ${product.name} is available for sale.`,
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

    const sale = await this.createSale(
      {
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
      },
      actor,
    );

    const updated = await this.prisma.posSession.update({
      where: { id: session.id },
      data: {
        status: PosSessionStatus.COMPLETED,
        completedAt: new Date(),
        completedSaleId: sale.id,
      },
      include: posSessionInclude,
    });

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
      take: 50,
    });

    return sales.map(serializeSale);
  }

  async listReturns() {
    const returns = await this.prisma.salesProductReturn.findMany({
      include: returnInclude,
      orderBy: { recordedAt: "desc" },
      take: 80,
    });

    return returns.map(serializeReturn);
  }

  async createSale(input: unknown, actor: AuthenticatedUser) {
    const parsed = createSaleSchema.safeParse(input);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message);
    }

    const productIds = parsed.data.items.map((item) => item.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: productSelect,
    });
    const productById = new Map(products.map((product) => [product.id, product]));

    if (productById.size !== productIds.length) {
      throw new BadRequestException("One or more selected products do not exist.");
    }

    const items = parsed.data.items.map((item) => {
      const product = productById.get(item.productId);

      if (!product) {
        throw new BadRequestException("Selected product does not exist.");
      }

      const unitPrice = item.unitPrice ?? decimalToNumber(product.unitPrice ?? 0);

      if (unitPrice <= 0) {
        throw new BadRequestException(
          `Enter a unit price for ${product.name} before recording the sale.`,
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
    const discount = roundMoney(parsed.data.discount ?? 0);

    if (discount > subtotal) {
      throw new BadRequestException("Discount cannot exceed sale subtotal.");
    }

    const totalAmount = roundMoney(subtotal - discount);
    const amountPaid = roundMoney(
      parsed.data.amountPaid ??
        (parsed.data.paymentMethod === PaymentMethod.CREDIT ? 0 : totalAmount),
    );

    if (amountPaid > totalAmount) {
      throw new BadRequestException("Amount paid cannot exceed total amount.");
    }

    const balanceDue = roundMoney(totalAmount - amountPaid);
    const soldAt = parsed.data.soldAt ?? new Date();

    const sale = await this.prisma.$transaction(
      async (tx) => {
        const createdSale = await tx.sale.create({
          data: {
            paymentMethod: parsed.data.paymentMethod,
            customerName: parsed.data.customerName,
            soldAt,
            subtotal,
            discount,
            totalAmount,
            amountPaid,
            balanceDue,
            notes: parsed.data.notes,
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
              `Only ${formatQuantity(availableQuantity)} ${item.product.unit.abbreviation} of ${item.product.name} is available for sale.`,
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
      },
      { timeout: 15000, maxWait: 15000 },
    );

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

    return serializeSale(sale);
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
        `Only ${formatQuantity(availableQuantity)} ${product.unit.abbreviation} of ${product.name} is available in Sales stock.`,
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
          type: FinishedProductStockMovementType.ADJUSTMENT,
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
