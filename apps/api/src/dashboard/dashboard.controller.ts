import { Controller, Get, Inject, Req } from "@nestjs/common";
import {
  MaterialRequestStatus,
  PosSessionStatus,
  Prisma,
  SalesReturnDisposition,
} from "@prisma/client";
import type { Request } from "express";

import { AuthService } from "../auth/auth.service";
import type { AuthenticatedUser } from "../auth/auth.types";
import { PrismaService } from "../database/prisma.service";

type DashboardTone = "default" | "good" | "warning" | "danger";

type DashboardCard = {
  label: string;
  value: string;
  detail?: string;
  tone?: DashboardTone;
};

type DashboardAction = {
  label: string;
  href: string;
  description: string;
};

type DashboardItem = {
  id: string;
  title: string;
  detail?: string;
  department?: string;
  meta?: string;
  reference?: string;
  value?: string;
  tone?: DashboardTone;
  href?: string;
};

type DashboardSection = {
  title: string;
  description?: string;
  emptyText: string;
  items: DashboardItem[];
};

type DashboardResponse = {
  role: AuthenticatedUser["role"];
  eyebrow: string;
  title: string;
  description: string;
  cards: DashboardCard[];
  actions: DashboardAction[];
  sections: DashboardSection[];
};

const lowStockThreshold = 10;

const unitSelect = {
  id: true,
  name: true,
  abbreviation: true,
} satisfies Prisma.UnitSelect;

const rawMaterialSelect = {
  id: true,
  name: true,
  baseUnit: { select: unitSelect },
} satisfies Prisma.RawMaterialSelect;

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
  role: true,
} satisfies Prisma.UserSelect;

function decimalToNumber(
  value: Prisma.Decimal | number | string | null | undefined,
) {
  return value === null || value === undefined ? 0 : Number(value.toString());
}

function formatInteger(value: number) {
  return value.toLocaleString("en", { maximumFractionDigits: 0 });
}

function formatMoney(value: number) {
  return `NGN ${value.toLocaleString("en", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatQuantity(value: number, unit?: string) {
  const formatted = value.toLocaleString("en", {
    maximumFractionDigits: 3,
  });

  return unit ? `${formatted} ${unit}` : formatted;
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
  }).format(value);
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function formatShortReference(value?: string | null) {
  if (!value) {
    return undefined;
  }

  return value.length > 8 ? `...${value.slice(-8)}` : value;
}

function todayRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  end.setDate(start.getDate() + 1);
  return { start, end };
}

function monthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { start, end };
}

function openMaterialRequestWhere() {
  return {
    status: {
      in: [
        MaterialRequestStatus.PENDING,
        MaterialRequestStatus.PARTIALLY_ISSUED,
      ],
    },
  } satisfies Prisma.MaterialRequestWhereInput;
}

@Controller("dashboard")
export class DashboardController {
  constructor(
    @Inject(AuthService)
    private readonly auth: AuthService,
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
  ) {}

  @Get("summary")
  async summary(@Req() request: Request): Promise<DashboardResponse> {
    const user = await this.auth.requireUser(request);

    if (user.role === "ADMIN") {
      return this.adminDashboard(user);
    }

    if (user.role === "STORE") {
      return this.storeDashboard(user);
    }

    if (user.role === "PRODUCTION") {
      return this.productionDashboard(user);
    }

    if (user.role === "SALES") {
      return this.salesDashboard(user);
    }

    return this.managementDashboard(user);
  }

  private async adminDashboard(
    user: AuthenticatedUser,
  ): Promise<DashboardResponse> {
    const [
      activeUserCount,
      inactiveUserCount,
      rawMaterialCount,
      productCount,
      supplierCount,
      recipeCount,
      unitCount,
      auditLogCount,
      latestAuditLogs,
    ] = await Promise.all([
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.user.count({ where: { isActive: false } }),
      this.prisma.rawMaterial.count({ where: { isActive: true } }),
      this.prisma.product.count({ where: { isActive: true } }),
      this.prisma.supplier.count({ where: { isActive: true } }),
      this.prisma.recipe.count({ where: { isActive: true } }),
      this.prisma.unit.count({ where: { isActive: true } }),
      this.prisma.auditLog.count(),
      this.latestAuditLogs(7),
    ]);

    return {
      role: user.role,
      eyebrow: "Admin dashboard",
      title: "System setup overview",
      description:
        "Master data, users, and recent configuration activity for the bakery.",
      cards: [
        {
          label: "Active users",
          value: formatInteger(activeUserCount),
          detail: `${formatInteger(inactiveUserCount)} inactive`,
          tone: "good",
        },
        {
          label: "Catalog items",
          value: formatInteger(rawMaterialCount + productCount),
          detail: `${formatInteger(rawMaterialCount)} materials, ${formatInteger(productCount)} products`,
        },
        {
          label: "Recipes",
          value: formatInteger(recipeCount),
          detail: `${formatInteger(supplierCount)} suppliers`,
        },
        {
          label: "Audit entries",
          value: formatInteger(auditLogCount),
          detail: `${formatInteger(unitCount)} active units`,
        },
      ],
      actions: [
        {
          label: "Manage users",
          href: "/admin/users",
          description: "Create staff accounts and assign department roles.",
        },
        {
          label: "Raw materials",
          href: "/admin/raw-materials",
          description: "Maintain the raw material dropdown used by Store.",
        },
        {
          label: "Products",
          href: "/admin/products",
          description: "Maintain finished goods and selling prices.",
        },
        {
          label: "Recipes",
          href: "/admin/recipes",
          description: "Connect products to the raw materials Production uses.",
        },
      ],
      sections: [this.auditSection(latestAuditLogs)],
    };
  }

  private async storeDashboard(
    user: AuthenticatedUser,
  ): Promise<DashboardResponse> {
    const [materials, openRequestCount, openRequests, recentReceipts, oldestBatches] =
      await Promise.all([
        this.prisma.rawMaterial.findMany({
          where: {
            OR: [
              { isActive: true },
              { batches: { some: { quantityRemaining: { gt: 0 } } } },
            ],
          },
          include: {
            baseUnit: { select: unitSelect },
            batches: {
              where: { quantityRemaining: { gt: 0 } },
              orderBy: [{ receivedAt: "asc" }, { batchNumber: "asc" }],
            },
          },
          orderBy: { name: "asc" },
        }),
        this.prisma.materialRequest.count({
          where: openMaterialRequestWhere(),
        }),
        this.prisma.materialRequest.findMany({
          where: openMaterialRequestWhere(),
          include: {
            rawMaterial: { select: rawMaterialSelect },
            requestedBy: { select: userSelect },
          },
          orderBy: { createdAt: "asc" },
          take: 5,
        }),
        this.prisma.rawMaterialReceipt.findMany({
          include: {
            rawMaterial: { select: rawMaterialSelect },
            supplier: { select: { id: true, name: true } },
          },
          orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }],
          take: 5,
        }),
        this.prisma.rawMaterialBatch.findMany({
          where: { quantityRemaining: { gt: 0 } },
          include: {
            rawMaterial: { select: rawMaterialSelect },
            supplier: { select: { id: true, name: true } },
          },
          orderBy: [{ receivedAt: "asc" }, { batchNumber: "asc" }],
          take: 5,
        }),
      ]);

    const inventory = materials.map((material) => {
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
        id: material.id,
        name: material.name,
        unit: material.baseUnit.abbreviation,
        batches: material.batches.length,
        totalRemaining,
        estimatedValue,
      };
    });
    const stockedMaterials = inventory.filter((item) => item.totalRemaining > 0);
    const lowMaterials = inventory.filter(
      (item) => item.totalRemaining <= lowStockThreshold,
    );
    const totalBatches = inventory.reduce((sum, item) => sum + item.batches, 0);
    const stockValue = inventory.reduce(
      (sum, item) => sum + item.estimatedValue,
      0,
    );

    return {
      role: user.role,
      eyebrow: "Store dashboard",
      title: "Raw material control",
      description:
        "Material stock, FIFO batches, and Production requests waiting on Store.",
      cards: [
        {
          label: "Stocked materials",
          value: formatInteger(stockedMaterials.length),
          detail: `${formatInteger(materials.length)} total materials tracked`,
          tone: "good",
        },
        {
          label: "Open requests",
          value: formatInteger(openRequestCount),
          detail: "Pending or partially issued",
          tone: openRequestCount > 0 ? "warning" : "default",
        },
        {
          label: "FIFO batches",
          value: formatInteger(totalBatches),
          detail: "Batches with stock remaining",
        },
        {
          label: "Estimated stock value",
          value: formatMoney(stockValue),
          detail: `${formatInteger(lowMaterials.length)} low stock alerts`,
          tone: lowMaterials.length > 0 ? "warning" : "default",
        },
      ],
      actions: [
        {
          label: "Receive materials",
          href: "/store/receiving",
          description: "Record raw materials received into today's batch.",
        },
        {
          label: "Review requests",
          href: "/store/requests",
          description: "Issue requested materials to Production using FIFO.",
        },
        {
          label: "View inventory",
          href: "/store/inventory",
          description: "Check current raw material stock by batch.",
        },
      ],
      sections: [
        {
          title: "Requests needing Store action",
          emptyText: "No open Production material requests.",
          items: openRequests.map((request) => ({
            id: request.id,
            title: request.rawMaterial.name,
            detail: `Requested by ${request.requestedBy.name ?? request.requestedBy.email}`,
            meta: formatDateTime(request.createdAt),
            value: `${formatQuantity(
              decimalToNumber(request.requestedQuantity) -
                decimalToNumber(request.issuedQuantity),
              request.rawMaterial.baseUnit.abbreviation,
            )} left`,
            tone: "warning",
            href: "/store/requests",
          })),
        },
        {
          title: "Oldest stock to use first",
          description: "FIFO batches with remaining stock.",
          emptyText: "No raw material batches currently have stock.",
          items: oldestBatches.map((batch) => ({
            id: batch.id,
            title: `${batch.rawMaterial.name} batch ${batch.batchNumber}`,
            detail: batch.supplier
              ? `Supplier: ${batch.supplier.name}`
              : "No supplier recorded",
            meta: `Received ${formatDate(batch.receivedAt)}`,
            value: formatQuantity(
              decimalToNumber(batch.quantityRemaining),
              batch.rawMaterial.baseUnit.abbreviation,
            ),
            href: "/store/inventory",
          })),
        },
        {
          title: "Recent receipts",
          emptyText: "No raw materials have been received yet.",
          items: recentReceipts.map((receipt) => ({
            id: receipt.id,
            title: receipt.rawMaterial.name,
            detail: receipt.supplier
              ? `Supplier: ${receipt.supplier.name}`
              : "No supplier recorded",
            meta: formatDateTime(receipt.receivedAt),
            value: formatQuantity(
              decimalToNumber(receipt.quantity),
              receipt.rawMaterial.baseUnit.abbreviation,
            ),
            href: "/store/receiving",
          })),
        },
      ],
    };
  }

  private async productionDashboard(
    user: AuthenticatedUser,
  ): Promise<DashboardResponse> {
    const today = todayRange();
    const [
      openRequestCount,
      openRequests,
      productionMaterials,
      todayRuns,
      recentRuns,
    ] = await Promise.all([
      this.prisma.materialRequest.count({
        where: openMaterialRequestWhere(),
      }),
      this.prisma.materialRequest.findMany({
        where: openMaterialRequestWhere(),
        include: {
          rawMaterial: { select: rawMaterialSelect },
        },
        orderBy: { createdAt: "asc" },
        take: 5,
      }),
      this.prisma.rawMaterial.findMany({
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
        include: {
          baseUnit: { select: unitSelect },
          productionBatches: {
            where: { quantityRemaining: { gt: 0 } },
            orderBy: [{ receivedAt: "asc" }, { createdAt: "asc" }],
          },
        },
        orderBy: { name: "asc" },
      }),
      this.prisma.productionRun.findMany({
        where: {
          producedAt: {
            gte: today.start,
            lt: today.end,
          },
        },
        include: {
          product: { select: productSelect },
        },
        orderBy: { producedAt: "desc" },
      }),
      this.prisma.productionRun.findMany({
        include: {
          product: { select: productSelect },
        },
        orderBy: { producedAt: "desc" },
        take: 5,
      }),
    ]);

    const materialStock = productionMaterials.map((material) => {
      const totalRemaining = material.productionBatches.reduce(
        (sum, batch) => sum + decimalToNumber(batch.quantityRemaining),
        0,
      );

      return {
        id: material.id,
        name: material.name,
        unit: material.baseUnit.abbreviation,
        totalRemaining,
      };
    });
    const stockedMaterialCount = materialStock.filter(
      (material) => material.totalRemaining > 0,
    ).length;
    const lowMaterialCount = materialStock.filter(
      (material) => material.totalRemaining <= lowStockThreshold,
    ).length;
    const producedToday = todayRuns.reduce(
      (sum, run) => sum + decimalToNumber(run.quantityProduced),
      0,
    );
    const transferredToday = todayRuns.reduce(
      (sum, run) => sum + decimalToNumber(run.quantityTransferred),
      0,
    );
    const wasteToday = todayRuns.reduce(
      (sum, run) => sum + decimalToNumber(run.wasteQuantity),
      0,
    );

    return {
      role: user.role,
      eyebrow: "Production dashboard",
      title: "Production floor overview",
      description:
        "Open material requests, available production stock, and today's finished output.",
      cards: [
        {
          label: "Open requests",
          value: formatInteger(openRequestCount),
          detail: "Waiting on Store issue",
          tone: openRequestCount > 0 ? "warning" : "default",
        },
        {
          label: "Materials in stock",
          value: formatInteger(stockedMaterialCount),
          detail: `${formatInteger(lowMaterialCount)} low stock alerts`,
          tone: lowMaterialCount > 0 ? "warning" : "good",
        },
        {
          label: "Produced today",
          value: formatQuantity(producedToday),
          detail: `${formatQuantity(transferredToday)} sent to Sales`,
          tone: "good",
        },
        {
          label: "Waste today",
          value: formatQuantity(wasteToday),
          detail: `${formatInteger(todayRuns.length)} runs today`,
          tone: wasteToday > 0 ? "warning" : "default",
        },
      ],
      actions: [
        {
          label: "Request materials",
          href: "/production/requests",
          description: "Ask Store for the raw materials needed for production.",
        },
        {
          label: "Record output",
          href: "/production/output",
          description: "Record finished products and send them to Sales stock.",
        },
        {
          label: "Check inventory",
          href: "/production/inventory",
          description: "Review raw materials available inside Production.",
        },
      ],
      sections: [
        {
          title: "Production material stock",
          emptyText: "Production has no raw material stock yet.",
          items: materialStock
            .filter((material) => material.totalRemaining > 0)
            .slice(0, 6)
            .map((material) => ({
              id: material.id,
              title: material.name,
              detail: "Available for production runs",
              value: formatQuantity(material.totalRemaining, material.unit),
              tone:
                material.totalRemaining <= lowStockThreshold
                  ? "warning"
                  : "default",
              href: "/production/inventory",
            })),
        },
        {
          title: "Open material requests",
          emptyText: "No open requests. Production has nothing waiting on Store.",
          items: openRequests.map((request) => ({
            id: request.id,
            title: request.rawMaterial.name,
            detail: request.status.replaceAll("_", " ").toLowerCase(),
            meta: formatDateTime(request.createdAt),
            value: `${formatQuantity(
              decimalToNumber(request.requestedQuantity) -
                decimalToNumber(request.issuedQuantity),
              request.rawMaterial.baseUnit.abbreviation,
            )} left`,
            tone: "warning",
            href: "/production/requests",
          })),
        },
        {
          title: "Recent production runs",
          emptyText: "No production runs have been recorded yet.",
          items: recentRuns.map((run) => ({
            id: run.id,
            title: run.product.name,
            detail: `${formatQuantity(
              decimalToNumber(run.quantityTransferred),
              run.product.unit.abbreviation,
            )} sent to Sales`,
            meta: formatDateTime(run.producedAt),
            value: formatQuantity(
              decimalToNumber(run.quantityProduced),
              run.product.unit.abbreviation,
            ),
            href: "/production/runs",
          })),
        },
      ],
    };
  }

  private async salesDashboard(
    user: AuthenticatedUser,
  ): Promise<DashboardResponse> {
    const today = todayRange();
    const [salesToday, activePosCount, products, recentSales, returnsToday] =
      await Promise.all([
        this.prisma.sale.findMany({
          where: {
            soldAt: {
              gte: today.start,
              lt: today.end,
            },
          },
          include: {
            items: {
              include: {
                product: { select: productSelect },
              },
            },
            createdBy: { select: userSelect },
          },
          orderBy: { soldAt: "desc" },
        }),
        this.prisma.posSession.count({
          where: { status: PosSessionStatus.ACTIVE },
        }),
        this.prisma.product.findMany({
          where: {
            OR: [
              { isActive: true },
              { salesBatches: { some: { quantityRemaining: { gt: 0 } } } },
            ],
          },
          include: {
            unit: { select: unitSelect },
            salesBatches: {
              where: { quantityRemaining: { gt: 0 } },
            },
          },
          orderBy: { name: "asc" },
        }),
        this.prisma.sale.findMany({
          include: {
            createdBy: { select: userSelect },
            items: {
              include: {
                product: { select: productSelect },
              },
            },
          },
          orderBy: { soldAt: "desc" },
          take: 5,
        }),
        this.prisma.salesProductReturn.findMany({
          where: {
            recordedAt: {
              gte: today.start,
              lt: today.end,
            },
          },
          include: {
            product: { select: productSelect },
          },
          orderBy: { recordedAt: "desc" },
        }),
      ]);

    const revenueToday = salesToday.reduce(
      (sum, sale) => sum + decimalToNumber(sale.totalAmount),
      0,
    );
    const balanceDueToday = salesToday.reduce(
      (sum, sale) => sum + decimalToNumber(sale.balanceDue),
      0,
    );
    const quantitySoldToday = salesToday.reduce(
      (sum, sale) =>
        sum +
        sale.items.reduce(
          (itemSum, item) => itemSum + decimalToNumber(item.quantity),
          0,
        ),
      0,
    );
    const productStock = products.map((product) => {
      const totalRemaining = product.salesBatches.reduce(
        (sum, batch) => sum + decimalToNumber(batch.quantityRemaining),
        0,
      );

      return {
        id: product.id,
        name: product.name,
        unit: product.unit.abbreviation,
        totalRemaining,
        retailValue: totalRemaining * decimalToNumber(product.unitPrice),
      };
    });
    const stockedProductCount = productStock.filter(
      (product) => product.totalRemaining > 0,
    ).length;
    const lowProductCount = productStock.filter(
      (product) => product.totalRemaining <= lowStockThreshold,
    ).length;
    const damagedToday = returnsToday
      .filter((entry) => entry.disposition === SalesReturnDisposition.DAMAGED)
      .reduce((sum, entry) => sum + decimalToNumber(entry.quantity), 0);

    return {
      role: user.role,
      eyebrow: "Sales dashboard",
      title: "Sales floor overview",
      description:
        "Today's sales, active POS activity, and finished product stock.",
      cards: [
        {
          label: "Revenue today",
          value: formatMoney(revenueToday),
          detail: `${formatInteger(salesToday.length)} sales`,
          tone: "good",
        },
        {
          label: "Products sold",
          value: formatQuantity(quantitySoldToday),
          detail: `${formatMoney(balanceDueToday)} still due`,
        },
        {
          label: "Active POS carts",
          value: formatInteger(activePosCount),
          detail: "Open cashier sessions",
        },
        {
          label: "Finished goods alerts",
          value: formatInteger(lowProductCount),
          detail: `${formatInteger(stockedProductCount)} stocked products`,
          tone: lowProductCount > 0 ? "warning" : "default",
        },
      ],
      actions: [
        {
          label: "Open POS",
          href: "/sales/pos",
          description: "Sell finished products from the point of sale.",
        },
        {
          label: "Check inventory",
          href: "/sales/inventory",
          description: "Review finished goods available for sale.",
        },
        {
          label: "Daily summary",
          href: "/sales/daily-summary",
          description: "See daily revenue, payments, and product movement.",
        },
      ],
      sections: [
        {
          title: "Finished goods stock",
          emptyText: "Sales has no finished goods in stock.",
          items: productStock
            .filter((product) => product.totalRemaining > 0)
            .slice(0, 6)
            .map((product) => ({
              id: product.id,
              title: product.name,
              detail: "Available for sale",
              value: formatQuantity(product.totalRemaining, product.unit),
              meta: formatMoney(product.retailValue),
              tone:
                product.totalRemaining <= lowStockThreshold
                  ? "warning"
                  : "default",
              href: "/sales/inventory",
            })),
        },
        {
          title: "Recent sales",
          emptyText: "No sales have been recorded yet.",
          items: recentSales.map((sale) => ({
            id: sale.id,
            title: `Sale #${sale.saleNumber}`,
            detail: `${sale.items.length} item${sale.items.length === 1 ? "" : "s"}`,
            meta: formatDateTime(sale.soldAt),
            value: formatMoney(decimalToNumber(sale.totalAmount)),
            href: "/sales/daily-summary",
          })),
        },
        {
          title: "Returns and damage today",
          emptyText: "No returns or damaged goods recorded today.",
          items: returnsToday.map((entry) => ({
            id: entry.id,
            title: entry.product.name,
            detail: entry.disposition.replaceAll("_", " ").toLowerCase(),
            meta: formatDateTime(entry.recordedAt),
            value: formatQuantity(
              decimalToNumber(entry.quantity),
              entry.product.unit.abbreviation,
            ),
            tone:
              entry.disposition === SalesReturnDisposition.DAMAGED
                ? "warning"
                : "default",
            href: "/sales/returns",
          })),
        },
        {
          title: "Damage total today",
          emptyText: "No damaged stock today.",
          items:
            damagedToday > 0
              ? [
                  {
                    id: "damaged-today",
                    title: "Damaged stock",
                    detail: "Quantity recorded as damaged today",
                    value: formatQuantity(damagedToday),
                    tone: "warning",
                    href: "/sales/returns",
                  },
                ]
              : [],
        },
      ],
    };
  }

  private async managementDashboard(
    user: AuthenticatedUser,
  ): Promise<DashboardResponse> {
    const month = monthRange();
    const [sales, productionRuns, lowRawMaterials, lowProducts, latestAuditLogs] =
      await Promise.all([
        this.prisma.sale.aggregate({
          where: {
            soldAt: {
              gte: month.start,
              lt: month.end,
            },
          },
          _count: { _all: true },
          _sum: {
            totalAmount: true,
            balanceDue: true,
          },
        }),
        this.prisma.productionRun.findMany({
          where: {
            producedAt: {
              gte: month.start,
              lt: month.end,
            },
          },
          include: {
            product: { select: productSelect },
          },
          orderBy: { producedAt: "desc" },
          take: 5,
        }),
        this.lowRawMaterialItems(),
        this.lowFinishedProductItems(),
        this.latestAuditLogs(5),
      ]);

    return {
      role: user.role,
      eyebrow: "Management dashboard",
      title: "Business overview",
      description:
        "Current month revenue, production activity, stock alerts, and audit activity.",
      cards: [
        {
          label: "Revenue this month",
          value: formatMoney(decimalToNumber(sales._sum.totalAmount)),
          detail: `${formatInteger(sales._count._all)} sales`,
          tone: "good",
        },
        {
          label: "Balance due",
          value: formatMoney(decimalToNumber(sales._sum.balanceDue)),
          detail: "Outstanding customer payments",
          tone: decimalToNumber(sales._sum.balanceDue) > 0 ? "warning" : "default",
        },
        {
          label: "Production runs",
          value: formatInteger(productionRuns.length),
          detail: "Recent runs shown below",
        },
        {
          label: "Stock alerts",
          value: formatInteger(lowRawMaterials.length + lowProducts.length),
          detail: "Low raw and finished stock",
          tone:
            lowRawMaterials.length + lowProducts.length > 0
              ? "warning"
              : "default",
        },
      ],
      actions: [
        {
          label: "Management dashboard",
          href: "/management/dashboard",
          description: "Open the full management reporting dashboard.",
        },
        {
          label: "Profit/loss",
          href: "/management/profit-loss",
          description: "Review monthly profit/loss estimates.",
        },
        {
          label: "Audit log",
          href: "/management/audit-log",
          description: "Monitor activity across departments.",
        },
      ],
      sections: [
        {
          title: "Recent production",
          emptyText: "No production runs this month.",
          items: productionRuns.map((run) => ({
            id: run.id,
            title: run.product.name,
            detail: `${formatQuantity(
              decimalToNumber(run.quantityTransferred),
              run.product.unit.abbreviation,
            )} sent to Sales`,
            meta: formatDateTime(run.producedAt),
            value: formatQuantity(
              decimalToNumber(run.quantityProduced),
              run.product.unit.abbreviation,
            ),
            href: "/management/production",
          })),
        },
        {
          title: "Low raw material stock",
          emptyText: "No low raw material alerts.",
          items: lowRawMaterials,
        },
        {
          title: "Low finished goods stock",
          emptyText: "No low finished goods alerts.",
          items: lowProducts,
        },
        this.auditSection(latestAuditLogs),
      ],
    };
  }

  private async latestAuditLogs(take: number) {
    return this.prisma.auditLog.findMany({
      include: {
        actor: { select: userSelect },
      },
      orderBy: { createdAt: "desc" },
      take,
    });
  }

  private auditSection(
    entries: Awaited<ReturnType<DashboardController["latestAuditLogs"]>>,
  ): DashboardSection {
    return {
      title: "Latest activity",
      description: "Recent changes and sign-ins across the system.",
      emptyText: "No audit activity has been recorded yet.",
      items: entries.map((entry) => ({
        id: entry.id,
        title: entry.action.replaceAll("_", " ").toLowerCase(),
        detail: entry.actor ? (entry.actor.name ?? entry.actor.email) : "System",
        department: entry.actor?.role ?? "SYSTEM",
        meta: formatDateTime(entry.createdAt),
        reference: formatShortReference(entry.entityId),
        value: entry.entityType,
        href: "/management/audit-log",
      })),
    };
  }

  private async lowRawMaterialItems(): Promise<DashboardItem[]> {
    const materials = await this.prisma.rawMaterial.findMany({
      where: {
        OR: [
          { isActive: true },
          { batches: { some: { quantityRemaining: { gt: 0 } } } },
        ],
      },
      include: {
        baseUnit: { select: unitSelect },
        batches: {
          where: { quantityRemaining: { gt: 0 } },
        },
      },
      orderBy: { name: "asc" },
    });

    return materials
      .map((material) => {
        const totalRemaining = material.batches.reduce(
          (sum, batch) => sum + decimalToNumber(batch.quantityRemaining),
          0,
        );

        return {
          id: material.id,
          title: material.name,
          detail: "Raw material stock remaining",
          value: formatQuantity(totalRemaining, material.baseUnit.abbreviation),
          tone: "warning" as const,
          href: "/management/inventory",
          totalRemaining,
        };
      })
      .filter((item) => item.totalRemaining <= lowStockThreshold)
      .slice(0, 5)
      .map(({ totalRemaining: _totalRemaining, ...item }) => item);
  }

  private async lowFinishedProductItems(): Promise<DashboardItem[]> {
    const products = await this.prisma.product.findMany({
      where: {
        OR: [
          { isActive: true },
          { salesBatches: { some: { quantityRemaining: { gt: 0 } } } },
        ],
      },
      include: {
        unit: { select: unitSelect },
        salesBatches: {
          where: { quantityRemaining: { gt: 0 } },
        },
      },
      orderBy: { name: "asc" },
    });

    return products
      .map((product) => {
        const totalRemaining = product.salesBatches.reduce(
          (sum, batch) => sum + decimalToNumber(batch.quantityRemaining),
          0,
        );

        return {
          id: product.id,
          title: product.name,
          detail: "Finished goods remaining",
          value: formatQuantity(totalRemaining, product.unit.abbreviation),
          tone: "warning" as const,
          href: "/management/inventory",
          totalRemaining,
        };
      })
      .filter((item) => item.totalRemaining <= lowStockThreshold)
      .slice(0, 5)
      .map(({ totalRemaining: _totalRemaining, ...item }) => item);
  }
}
