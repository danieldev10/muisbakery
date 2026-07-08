import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  PaymentMethod,
  Prisma,
  ProductionWasteType,
  SalesReturnDisposition,
} from "@prisma/client";
import { z } from "zod";

import { AuditService } from "../audit/audit.service";
import type { AuthenticatedUser } from "../auth/auth.types";
import { PrismaService } from "../database/prisma.service";

const LOW_STOCK_THRESHOLD = 10;
const WORKFLOW_AUDIT_ACTIONS = [
  "STORE_RAW_MATERIAL_RECEIVED",
  "STORE_MATERIAL_REQUEST_ISSUED",
  "STORE_MATERIAL_REQUEST_REJECTED",
  "PRODUCTION_MATERIAL_REQUEST_CREATED",
  "PRODUCTION_MATERIAL_REQUEST_CANCELLED",
  "PRODUCTION_RUN_CREATED",
  "SALE_RECORDED",
  "SALES_RETURN_OR_DAMAGE_RECORDED",
  "MANAGEMENT_RAW_MATERIAL_UNIT_COST_UPDATED",
];

const unitSelect = {
  id: true,
  name: true,
  abbreviation: true,
} satisfies Prisma.UnitSelect;

const rawMaterialSelect = {
  id: true,
  name: true,
  unitCost: true,
  baseUnit: { select: unitSelect },
} satisfies Prisma.RawMaterialSelect;

const productSelect = {
  id: true,
  name: true,
  size: true,
  unitPrice: true,
  unit: { select: unitSelect },
} satisfies Prisma.ProductSelect;

const supplierSelect = {
  id: true,
  name: true,
} satisfies Prisma.SupplierSelect;

const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
} satisfies Prisma.UserSelect;

const rawMaterialInventoryInclude = {
  baseUnit: { select: unitSelect },
  batches: {
    where: { quantityRemaining: { gt: 0 } },
    include: {
      supplier: { select: supplierSelect },
    },
    orderBy: [{ batchDate: "asc" }, { batchNumber: "asc" }],
  },
} satisfies Prisma.RawMaterialInclude;

const productInventoryInclude = {
  unit: { select: unitSelect },
  salesBatches: {
    where: { quantityRemaining: { gt: 0 } },
    include: {
      productionRun: {
        select: {
          id: true,
          producedAt: true,
        },
      },
    },
    orderBy: [{ batchDate: "asc" }, { batchNumber: "asc" }],
  },
} satisfies Prisma.ProductInclude;

const productionRunInclude = {
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
    select: {
      id: true,
      batchNumber: true,
      batchDate: true,
      quantityReceived: true,
      quantityRemaining: true,
      receivedAt: true,
    },
    orderBy: { receivedAt: "asc" },
  },
} satisfies Prisma.ProductionRunInclude;

const saleInclude = {
  createdBy: { select: userSelect },
  items: {
    include: {
      product: { select: productSelect },
    },
    orderBy: { createdAt: "asc" },
  },
} satisfies Prisma.SaleInclude;

const salesReturnInclude = {
  product: { select: productSelect },
  batch: {
    select: {
      id: true,
      batchNumber: true,
      batchDate: true,
    },
  },
  saleItem: {
    select: {
      id: true,
      sale: {
        select: {
          id: true,
          saleNumber: true,
          soldAt: true,
        },
      },
    },
  },
  createdBy: { select: userSelect },
} satisfies Prisma.SalesProductReturnInclude;

type UnitRef = {
  id: string;
  name: string;
  abbreviation: string;
};

type ProductWithUnitPrice = {
  id: string;
  name: string;
  size: string;
  unitPrice: Prisma.Decimal | null;
  unit: UnitRef;
};

type RawMaterialWithUnit = {
  id: string;
  name: string;
  unitCost: Prisma.Decimal | null;
  baseUnit: UnitRef;
};

type MonthRange = {
  month: string;
  label: string;
  start: Date;
  end: Date;
};

type RawMaterialInventoryItem = Prisma.RawMaterialGetPayload<{
  include: typeof rawMaterialInventoryInclude;
}>;

type ProductInventoryItem = Prisma.ProductGetPayload<{
  include: typeof productInventoryInclude;
}>;

type ProductionRunWithIncludes = Prisma.ProductionRunGetPayload<{
  include: typeof productionRunInclude;
}>;

type SaleWithIncludes = Prisma.SaleGetPayload<{
  include: typeof saleInclude;
}>;

type SalesReturnWithIncludes = Prisma.SalesProductReturnGetPayload<{
  include: typeof salesReturnInclude;
}>;

function decimalToNumber(
  value: Prisma.Decimal | number | string | null | undefined,
) {
  return value === null || value === undefined ? 0 : Number(value.toString());
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundQuantity(value: number) {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

function moneyString(value: number) {
  return roundMoney(value).toFixed(2);
}

function quantityString(value: number) {
  return roundQuantity(value).toFixed(3);
}

function countString(value: number) {
  return String(Math.round(value));
}

function percentString(value: number) {
  return roundMoney(value).toFixed(2);
}

const unitCostSchema = z.object({
  unitCost: z.preprocess(
    (value) =>
      value === null || (typeof value === "string" && value.trim() === "")
        ? undefined
        : value,
    z.coerce
      .number({ message: "Unit cost is required." })
      .nonnegative("Unit cost cannot be negative.")
      .max(99_999_999),
  ),
});

function getMonthRange(month?: string): MonthRange {
  const target = month?.trim();
  let year: number;
  let monthIndex: number;

  if (!target) {
    const today = new Date();
    year = today.getFullYear();
    monthIndex = today.getMonth();
  } else {
    const match = /^(\d{4})-(\d{2})$/.exec(target);

    if (!match) {
      throw new BadRequestException("Month must use YYYY-MM format.");
    }

    year = Number(match[1]);
    monthIndex = Number(match[2]) - 1;

    if (monthIndex < 0 || monthIndex > 11) {
      throw new BadRequestException("Month must use a valid month number.");
    }
  }

  const start = new Date(Date.UTC(year, monthIndex, 1));
  const end = new Date(Date.UTC(year, monthIndex + 1, 1));
  const normalizedMonth = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
  const label = new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(start);

  return { month: normalizedMonth, label, start, end };
}

function serializeProduct(product: ProductWithUnitPrice) {
  return {
    id: product.id,
    name: product.name,
    size: product.size,
    unitPrice: product.unitPrice?.toString() ?? null,
    unit: product.unit,
  };
}

function productLabel(product: ReturnType<typeof serializeProduct>) {
  return product.size ? `${product.name} - ${product.size}` : product.name;
}

function serializeRawMaterial(rawMaterial: RawMaterialWithUnit) {
  return {
    id: rawMaterial.id,
    name: rawMaterial.name,
    unitCost: rawMaterial.unitCost?.toString() ?? null,
    baseUnit: rawMaterial.baseUnit,
  };
}

function serializeUser(
  user: Prisma.UserGetPayload<{ select: typeof userSelect }> | null,
) {
  return user
    ? {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      }
    : null;
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
    createdBy: serializeUser(sale.createdBy),
    items: sale.items.map((item) => ({
      id: item.id,
      quantity: item.quantity.toString(),
      unitPrice: item.unitPrice.toString(),
      lineTotal: item.lineTotal.toString(),
      product: serializeProduct(item.product),
    })),
  };
}

function serializeReturn(returnEntry: SalesReturnWithIncludes) {
  return {
    id: returnEntry.id,
    disposition: returnEntry.disposition,
    quantity: returnEntry.quantity.toString(),
    reason: returnEntry.reason,
    recordedAt: returnEntry.recordedAt.toISOString(),
    createdAt: returnEntry.createdAt.toISOString(),
    product: serializeProduct(returnEntry.product),
    batch: returnEntry.batch
      ? {
          id: returnEntry.batch.id,
          batchNumber: returnEntry.batch.batchNumber,
          batchDate: returnEntry.batch.batchDate.toISOString(),
        }
      : null,
    saleItem: returnEntry.saleItem
      ? {
          id: returnEntry.saleItem.id,
          sale: {
            id: returnEntry.saleItem.sale.id,
            saleNumber: returnEntry.saleItem.sale.saleNumber,
            soldAt: returnEntry.saleItem.sale.soldAt.toISOString(),
          },
        }
      : null,
    createdBy: serializeUser(returnEntry.createdBy),
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
    product: serializeProduct(run.product),
    createdBy: serializeUser(run.createdBy),
    materialUsages: run.materialUsages.map((usage) => ({
      id: usage.id,
      expectedQuantity: usage.expectedQuantity?.toString() ?? null,
      actualQuantity: usage.actualQuantity.toString(),
      rawMaterial: serializeRawMaterial(usage.rawMaterial),
    })),
    waste: run.waste.map((waste) => ({
      id: waste.id,
      type: waste.type,
      quantity: waste.quantity.toString(),
      reason: waste.reason,
      recordedAt: waste.recordedAt.toISOString(),
      product: serializeProduct(waste.product),
      createdBy: serializeUser(waste.createdBy),
    })),
    salesBatches: run.salesBatches.map((batch) => ({
      id: batch.id,
      batchNumber: batch.batchNumber,
      batchDate: batch.batchDate.toISOString(),
      quantityReceived: batch.quantityReceived.toString(),
      quantityRemaining: batch.quantityRemaining.toString(),
      receivedAt: batch.receivedAt.toISOString(),
    })),
  };
}

function getSaleWhere(range: MonthRange) {
  return {
    soldAt: {
      gte: range.start,
      lt: range.end,
    },
  } satisfies Prisma.SaleWhereInput;
}

function getRecordedAtWhere(range: MonthRange) {
  return {
    recordedAt: {
      gte: range.start,
      lt: range.end,
    },
  };
}

@Injectable()
export class ManagementService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(AuditService)
    private readonly audit: AuditService,
  ) {}

  async dashboard(month?: string) {
    const [profitLoss, inventory, production, sales] = await Promise.all([
      this.profitLoss(month),
      this.inventory(),
      this.production(month),
      this.sales(month),
    ]);

    const productionOutput = [...production.outputByProduct]
      .sort(
        (left, right) =>
          Number(right.quantityProduced) - Number(left.quantityProduced),
      )
      .slice(0, 5)
      .map((entry) => ({
        label: productLabel(entry.product),
        value: entry.quantityProduced,
        detail: `${entry.runsCount} runs`,
      }));

    const salesRevenue = [...sales.productSummary]
      .sort((left, right) => Number(right.revenue) - Number(left.revenue))
      .slice(0, 5)
      .map((entry) => ({
        label: productLabel(entry.product),
        value: entry.revenue,
        detail: `${entry.quantitySold} sold`,
      }));

    return {
      month: profitLoss.month,
      summary: {
        totalRevenue: profitLoss.revenue.totalRevenue,
        estimatedMaterialCost: profitLoss.costs.materialIssuedCost,
        estimatedGrossProfit: profitLoss.profit.estimatedGrossProfit,
        rawMaterialStockValue: inventory.valuation.rawMaterials,
        finishedGoodsStockValue: inventory.valuation.finishedGoods,
        productionRuns: production.summary.runsCount,
        productsSold: sales.summary.quantitySold,
        lowStockAlerts:
          inventory.lowStock.rawMaterials.length +
          inventory.lowStock.finishedProducts.length,
      },
      charts: {
        profitability: [
          {
            label: "Revenue",
            value: profitLoss.revenue.totalRevenue,
            detail: `${profitLoss.revenue.salesCount} sales`,
          },
          {
            label: "Material cost",
            value: profitLoss.costs.materialIssuedCost,
            detail: "Issued to production",
          },
          {
            label: "Gross profit",
            value: profitLoss.profit.estimatedGrossProfit,
            detail: `${profitLoss.profit.grossMarginPercent}% margin`,
          },
        ],
        stockValue: [
          {
            label: "Raw materials",
            value: inventory.valuation.rawMaterials,
            detail: `${inventory.rawMaterials.length} materials`,
          },
          {
            label: "Finished goods",
            value: inventory.valuation.finishedGoods,
            detail: `${inventory.finishedProducts.length} products`,
          },
        ],
        productionOutput,
        salesRevenue,
      },
    };
  }

  async profitLoss(month?: string) {
    const range = getMonthRange(month);
    const salesWhere = getSaleWhere(range);

    const [sales, materialReceipts, materialIssues, productionWaste, returns] =
      await Promise.all([
        this.prisma.sale.findMany({
          where: salesWhere,
          include: saleInclude,
          orderBy: { soldAt: "desc" },
        }),
        this.prisma.rawMaterialReceipt.findMany({
          where: {
            receivedAt: {
              gte: range.start,
              lt: range.end,
            },
          },
          select: {
            quantity: true,
            unitCost: true,
          },
        }),
        this.prisma.materialRequestIssue.findMany({
          where: {
            createdAt: {
              gte: range.start,
              lt: range.end,
            },
          },
          select: {
            quantity: true,
            batch: {
              select: {
                unitCost: true,
              },
            },
          },
        }),
        this.prisma.productionWaste.findMany({
          where: getRecordedAtWhere(range),
          include: {
            product: { select: productSelect },
          },
        }),
        this.prisma.salesProductReturn.findMany({
          where: getRecordedAtWhere(range),
          include: {
            product: { select: productSelect },
          },
        }),
      ]);

    const totalRevenue = sales.reduce(
      (sum, sale) => sum + decimalToNumber(sale.totalAmount),
      0,
    );
    const subtotal = sales.reduce(
      (sum, sale) => sum + decimalToNumber(sale.subtotal),
      0,
    );
    const discount = sales.reduce(
      (sum, sale) => sum + decimalToNumber(sale.discount),
      0,
    );
    const amountPaid = sales.reduce(
      (sum, sale) => sum + decimalToNumber(sale.amountPaid),
      0,
    );
    const balanceDue = sales.reduce(
      (sum, sale) => sum + decimalToNumber(sale.balanceDue),
      0,
    );
    const materialPurchasedCost = materialReceipts.reduce(
      (sum, receipt) =>
        sum +
        decimalToNumber(receipt.quantity) * decimalToNumber(receipt.unitCost),
      0,
    );
    const materialIssuedCost = materialIssues.reduce(
      (sum, issue) =>
        sum +
        decimalToNumber(issue.quantity) *
          decimalToNumber(issue.batch.unitCost),
      0,
    );
    // Only damaged waste is a real loss; waste returned to production is
    // reused in later runs and is reported separately without a loss value.
    const damagedProductionWaste = productionWaste.filter(
      (waste) => waste.type === ProductionWasteType.DAMAGED,
    );
    const productionWasteQuantity = damagedProductionWaste.reduce(
      (sum, waste) => sum + decimalToNumber(waste.quantity),
      0,
    );
    const productionWasteEstimatedValue = damagedProductionWaste.reduce(
      (sum, waste) =>
        sum +
        decimalToNumber(waste.quantity) *
          decimalToNumber(waste.product.unitPrice),
      0,
    );
    const wasteReturnedToProductionQuantity = productionWaste
      .filter((waste) => waste.type === ProductionWasteType.RETURNED_TO_PRODUCTION)
      .reduce((sum, waste) => sum + decimalToNumber(waste.quantity), 0);
    const damagedReturns = returns.filter(
      (returnEntry) =>
        returnEntry.disposition === SalesReturnDisposition.DAMAGED,
    );
    const damagedReturnsQuantity = damagedReturns.reduce(
      (sum, returnEntry) => sum + decimalToNumber(returnEntry.quantity),
      0,
    );
    const damagedReturnsEstimatedValue = damagedReturns.reduce(
      (sum, returnEntry) =>
        sum +
        decimalToNumber(returnEntry.quantity) *
          decimalToNumber(returnEntry.product.unitPrice),
      0,
    );
    const totalEstimatedLoss =
      productionWasteEstimatedValue + damagedReturnsEstimatedValue;
    const estimatedGrossProfit = totalRevenue - materialIssuedCost;
    const estimatedNetAfterRecordedLosses =
      estimatedGrossProfit - totalEstimatedLoss;
    const grossMarginPercent =
      totalRevenue > 0 ? (estimatedGrossProfit / totalRevenue) * 100 : 0;

    return {
      month: {
        value: range.month,
        label: range.label,
        start: range.start.toISOString(),
        end: range.end.toISOString(),
      },
      revenue: {
        salesCount: sales.length,
        subtotal: moneyString(subtotal),
        discount: moneyString(discount),
        totalRevenue: moneyString(totalRevenue),
        amountPaid: moneyString(amountPaid),
        balanceDue: moneyString(balanceDue),
      },
      costs: {
        materialPurchasedCost: moneyString(materialPurchasedCost),
        materialIssuedCost: moneyString(materialIssuedCost),
      },
      losses: {
        productionWasteQuantity: countString(productionWasteQuantity),
        productionWasteEstimatedValue: moneyString(
          productionWasteEstimatedValue,
        ),
        wasteReturnedToProductionQuantity: countString(
          wasteReturnedToProductionQuantity,
        ),
        damagedReturnsQuantity: countString(damagedReturnsQuantity),
        damagedReturnsEstimatedValue: moneyString(damagedReturnsEstimatedValue),
        totalEstimatedLoss: moneyString(totalEstimatedLoss),
      },
      profit: {
        estimatedGrossProfit: moneyString(estimatedGrossProfit),
        estimatedNetAfterRecordedLosses: moneyString(
          estimatedNetAfterRecordedLosses,
        ),
        grossMarginPercent: percentString(grossMarginPercent),
      },
      notes: [
        "Material costs are estimated from issued raw material batches with unit costs.",
        "Waste and damaged-return losses use product selling price as estimated retail value.",
        "Waste returned to production is reused in later runs and is not counted as a loss.",
        "Overheads, salaries, rent, utilities, and other operating expenses are not modeled yet.",
      ],
    };
  }

  async inventory() {
    const [rawMaterials, products] = await Promise.all([
      this.prisma.rawMaterial.findMany({
        include: rawMaterialInventoryInclude,
        orderBy: { name: "asc" },
      }),
      this.prisma.product.findMany({
        include: productInventoryInclude,
        orderBy: { name: "asc" },
      }),
    ]);

    const rawMaterialInventory = rawMaterials.map((material) =>
      this.serializeRawMaterialInventory(material),
    );
    const finishedProducts = products.map((product) =>
      this.serializeProductInventory(product),
    );
    const rawMaterialsValue = rawMaterialInventory.reduce(
      (sum, item) => sum + Number(item.estimatedValue),
      0,
    );
    const finishedGoodsValue = finishedProducts.reduce(
      (sum, item) => sum + Number(item.estimatedRetailValue),
      0,
    );

    return {
      valuation: {
        rawMaterials: moneyString(rawMaterialsValue),
        finishedGoods: moneyString(finishedGoodsValue),
        totalStockValue: moneyString(rawMaterialsValue + finishedGoodsValue),
      },
      lowStockThreshold: quantityString(LOW_STOCK_THRESHOLD),
      lowStock: {
        rawMaterials: rawMaterialInventory.filter(
          (item) => Number(item.totalRemaining) <= LOW_STOCK_THRESHOLD,
        ),
        finishedProducts: finishedProducts.filter(
          (item) => Number(item.totalRemaining) <= LOW_STOCK_THRESHOLD,
        ),
      },
      rawMaterials: rawMaterialInventory,
      finishedProducts,
    };
  }

  async updateRawMaterialUnitCost(
    rawMaterialId: string,
    input: unknown,
    actor: AuthenticatedUser,
  ) {
    const parsed = unitCostSchema.safeParse(input);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message);
    }

    const existing = await this.prisma.rawMaterial.findUnique({
      where: { id: rawMaterialId },
      select: {
        id: true,
        name: true,
        unitCost: true,
      },
    });

    if (!existing) {
      throw new NotFoundException("Raw material not found.");
    }

    const updated = await this.prisma.rawMaterial.update({
      where: { id: rawMaterialId },
      data: { unitCost: parsed.data.unitCost },
      select: rawMaterialSelect,
    });

    await this.audit.record({
      actorId: actor.id,
      action: "MANAGEMENT_RAW_MATERIAL_UNIT_COST_UPDATED",
      entityType: "RawMaterial",
      entityId: updated.id,
      metadata: {
        rawMaterialName: updated.name,
        previousUnitCost: existing.unitCost?.toString() ?? null,
        unitCost: updated.unitCost?.toString() ?? null,
      },
    });

    return serializeRawMaterial(updated);
  }

  async production(month?: string) {
    const range = getMonthRange(month);
    const runs = await this.prisma.productionRun.findMany({
      where: {
        producedAt: {
          gte: range.start,
          lt: range.end,
        },
      },
      include: productionRunInclude,
      orderBy: { producedAt: "desc" },
    });
    const outputByProduct = new Map<
      string,
      {
        product: ReturnType<typeof serializeProduct>;
        runsCount: number;
        quantityProduced: number;
        quantityTransferred: number;
        wasteQuantity: number;
      }
    >();
    const materialUsage = new Map<
      string,
      {
        rawMaterial: ReturnType<typeof serializeRawMaterial>;
        expectedQuantity: number;
        actualQuantity: number;
      }
    >();
    const wasteByProduct = new Map<
      string,
      {
        product: ReturnType<typeof serializeProduct>;
        quantity: number;
        estimatedRetailValue: number;
        count: number;
      }
    >();

    for (const run of runs) {
      const product = serializeProduct(run.product);
      const output = outputByProduct.get(run.product.id) ?? {
        product,
        runsCount: 0,
        quantityProduced: 0,
        quantityTransferred: 0,
        wasteQuantity: 0,
      };

      output.runsCount += 1;
      output.quantityProduced += decimalToNumber(run.quantityProduced);
      output.quantityTransferred += decimalToNumber(run.quantityTransferred);
      output.wasteQuantity += decimalToNumber(run.wasteQuantity);
      outputByProduct.set(run.product.id, output);

      for (const usage of run.materialUsages) {
        const rawMaterial = serializeRawMaterial(usage.rawMaterial);
        const usageSummary = materialUsage.get(usage.rawMaterial.id) ?? {
          rawMaterial,
          expectedQuantity: 0,
          actualQuantity: 0,
        };

        usageSummary.expectedQuantity += decimalToNumber(
          usage.expectedQuantity,
        );
        usageSummary.actualQuantity += decimalToNumber(usage.actualQuantity);
        materialUsage.set(usage.rawMaterial.id, usageSummary);
      }

      for (const waste of run.waste) {
        const wasteSummary = wasteByProduct.get(waste.product.id) ?? {
          product: serializeProduct(waste.product),
          quantity: 0,
          estimatedRetailValue: 0,
          count: 0,
        };

        wasteSummary.quantity += decimalToNumber(waste.quantity);
        // Waste returned to production is reusable, so only damaged waste
        // carries an estimated loss value.
        if (waste.type === ProductionWasteType.DAMAGED) {
          wasteSummary.estimatedRetailValue +=
            decimalToNumber(waste.quantity) *
            decimalToNumber(waste.product.unitPrice);
        }
        wasteSummary.count += 1;
        wasteByProduct.set(waste.product.id, wasteSummary);
      }
    }

    const totalProduced = runs.reduce(
      (sum, run) => sum + decimalToNumber(run.quantityProduced),
      0,
    );
    const totalTransferred = runs.reduce(
      (sum, run) => sum + decimalToNumber(run.quantityTransferred),
      0,
    );
    const totalWaste = runs.reduce(
      (sum, run) => sum + decimalToNumber(run.wasteQuantity),
      0,
    );
    const undercutRuns = runs.filter(
      (run) =>
        run.expectedQuantity !== null &&
        run.quantityProduced < run.expectedQuantity,
    ).length;

    return {
      month: {
        value: range.month,
        label: range.label,
        start: range.start.toISOString(),
        end: range.end.toISOString(),
      },
      summary: {
        runsCount: runs.length,
        quantityProduced: countString(totalProduced),
        quantityTransferred: countString(totalTransferred),
        wasteQuantity: countString(totalWaste),
        undercutRuns,
      },
      outputByProduct: Array.from(outputByProduct.values()).map((entry) => ({
        product: entry.product,
        runsCount: entry.runsCount,
        quantityProduced: countString(entry.quantityProduced),
        quantityTransferred: countString(entry.quantityTransferred),
        wasteQuantity: countString(entry.wasteQuantity),
      })),
      materialUsage: Array.from(materialUsage.values()).map((entry) => ({
        rawMaterial: entry.rawMaterial,
        expectedQuantity: quantityString(entry.expectedQuantity),
        actualQuantity: quantityString(entry.actualQuantity),
      })),
      wasteByProduct: Array.from(wasteByProduct.values()).map((entry) => ({
        product: entry.product,
        count: entry.count,
        quantity: countString(entry.quantity),
        estimatedRetailValue: moneyString(entry.estimatedRetailValue),
      })),
      runs: runs.map(serializeRun),
    };
  }

  async sales(month?: string) {
    const range = getMonthRange(month);
    const sales = await this.prisma.sale.findMany({
      where: getSaleWhere(range),
      include: saleInclude,
      orderBy: { soldAt: "desc" },
    });
    const returns = await this.prisma.salesProductReturn.findMany({
      where: getRecordedAtWhere(range),
      include: salesReturnInclude,
      orderBy: { recordedAt: "desc" },
    });
    const paymentTotals = new Map<
      PaymentMethod,
      { method: PaymentMethod; count: number; amount: number }
    >(
      Object.values(PaymentMethod).map((method) => [
        method,
        { method, count: 0, amount: 0 },
      ]),
    );
    const productSummary = new Map<
      string,
      {
        product: ReturnType<typeof serializeProduct>;
        quantitySold: number;
        revenue: number;
      }
    >();

    for (const sale of sales) {
      const paymentTotal = paymentTotals.get(sale.paymentMethod);

      if (paymentTotal) {
        paymentTotal.count += 1;
        paymentTotal.amount += decimalToNumber(sale.totalAmount);
      }

      for (const item of sale.items) {
        const product = serializeProduct(item.product);
        const summary = productSummary.get(item.product.id) ?? {
          product,
          quantitySold: 0,
          revenue: 0,
        };

        summary.quantitySold += decimalToNumber(item.quantity);
        summary.revenue += decimalToNumber(item.lineTotal);
        productSummary.set(item.product.id, summary);
      }
    }

    const totalRevenue = sales.reduce(
      (sum, sale) => sum + decimalToNumber(sale.totalAmount),
      0,
    );
    const amountPaid = sales.reduce(
      (sum, sale) => sum + decimalToNumber(sale.amountPaid),
      0,
    );
    const balanceDue = sales.reduce(
      (sum, sale) => sum + decimalToNumber(sale.balanceDue),
      0,
    );
    const quantitySold = Array.from(productSummary.values()).reduce(
      (sum, entry) => sum + entry.quantitySold,
      0,
    );
    const damagedQuantity = returns
      .filter((returnEntry) => returnEntry.disposition === "DAMAGED")
      .reduce((sum, returnEntry) => sum + decimalToNumber(returnEntry.quantity), 0);
    const returnedToStockQuantity = returns
      .filter((returnEntry) => returnEntry.disposition === "RETURN_TO_STOCK")
      .reduce((sum, returnEntry) => sum + decimalToNumber(returnEntry.quantity), 0);

    return {
      month: {
        value: range.month,
        label: range.label,
        start: range.start.toISOString(),
        end: range.end.toISOString(),
      },
      summary: {
        salesCount: sales.length,
        totalRevenue: moneyString(totalRevenue),
        amountPaid: moneyString(amountPaid),
        balanceDue: moneyString(balanceDue),
        quantitySold: countString(quantitySold),
        damagedQuantity: countString(damagedQuantity),
        returnedToStockQuantity: countString(returnedToStockQuantity),
      },
      paymentSummary: Array.from(paymentTotals.values()).map((entry) => ({
        method: entry.method,
        count: entry.count,
        amount: moneyString(entry.amount),
      })),
      productSummary: Array.from(productSummary.values()).map((entry) => ({
        product: entry.product,
        quantitySold: countString(entry.quantitySold),
        revenue: moneyString(entry.revenue),
      })),
      sales: sales.map(serializeSale),
      returns: returns.map(serializeReturn),
    };
  }

  async auditLog() {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [entries, recentEntries] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: { action: { in: WORKFLOW_AUDIT_ACTIONS } },
        include: {
          actor: { select: userSelect },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      this.prisma.auditLog.findMany({
        where: {
          action: { in: WORKFLOW_AUDIT_ACTIONS },
          createdAt: {
            gte: since,
          },
        },
        include: {
          actor: { select: userSelect },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const roleActivity = new Map<string, number>();
    const entityActivity = new Map<string, number>();

    for (const entry of recentEntries) {
      const role = entry.actor?.role ?? "SYSTEM";
      roleActivity.set(role, (roleActivity.get(role) ?? 0) + 1);
      entityActivity.set(
        entry.entityType,
        (entityActivity.get(entry.entityType) ?? 0) + 1,
      );
    }

    return {
      since: since.toISOString(),
      totalRecentActions: recentEntries.length,
      roleActivity: Array.from(roleActivity.entries()).map(([role, count]) => ({
        role,
        count,
      })),
      entityActivity: Array.from(entityActivity.entries()).map(
        ([entityType, count]) => ({
          entityType,
          count,
        }),
      ),
      entries: entries.map((entry) => ({
        id: entry.id,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        metadata: entry.metadata,
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
        createdAt: entry.createdAt.toISOString(),
        actor: serializeUser(entry.actor),
      })),
    };
  }

  private serializeRawMaterialInventory(material: RawMaterialInventoryItem) {
    const totalRemaining = material.batches.reduce(
      (sum, batch) => sum + decimalToNumber(batch.quantityRemaining),
      0,
    );
    const estimatedValue = material.batches.reduce(
      (sum, batch) =>
        sum +
        decimalToNumber(batch.quantityRemaining) *
          decimalToNumber(batch.unitCost),
      0,
    );

    return {
      rawMaterial: serializeRawMaterial({
        id: material.id,
        name: material.name,
        unitCost: material.unitCost,
        baseUnit: material.baseUnit,
      }),
      totalRemaining: quantityString(totalRemaining),
      estimatedValue: moneyString(estimatedValue),
      batches: material.batches.map((batch) => {
        const batchValue =
          decimalToNumber(batch.quantityRemaining) *
          decimalToNumber(batch.unitCost);

        return {
          id: batch.id,
          batchNumber: batch.batchNumber,
          batchLabel: `${material.name} batch ${batch.batchNumber}`,
          batchDate: batch.batchDate.toISOString(),
          quantityReceived: batch.quantityReceived.toString(),
          quantityRemaining: batch.quantityRemaining.toString(),
          unitCost: batch.unitCost?.toString() ?? null,
          estimatedValue: moneyString(batchValue),
          receivedAt: batch.receivedAt.toISOString(),
          supplier: batch.supplier,
        };
      }),
    };
  }

  private serializeProductInventory(product: ProductInventoryItem) {
    const totalRemaining = product.salesBatches.reduce(
      (sum, batch) => sum + decimalToNumber(batch.quantityRemaining),
      0,
    );
    const estimatedRetailValue =
      totalRemaining * decimalToNumber(product.unitPrice);

    return {
      product: serializeProduct(product),
      totalRemaining: countString(totalRemaining),
      estimatedRetailValue: moneyString(estimatedRetailValue),
      batches: product.salesBatches.map((batch) => ({
        id: batch.id,
        batchNumber: batch.batchNumber,
        batchDate: batch.batchDate.toISOString(),
        quantityReceived: batch.quantityReceived.toString(),
        quantityRemaining: batch.quantityRemaining.toString(),
        estimatedRetailValue: moneyString(
          decimalToNumber(batch.quantityRemaining) *
            decimalToNumber(product.unitPrice),
        ),
        receivedAt: batch.receivedAt.toISOString(),
        productionRun: batch.productionRun
          ? {
              id: batch.productionRun.id,
              producedAt: batch.productionRun.producedAt.toISOString(),
            }
          : null,
      })),
    };
  }
}
