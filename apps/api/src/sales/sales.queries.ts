import { Prisma } from "@prisma/client";

export const unitSelect = {
  id: true,
  name: true,
  abbreviation: true,
} satisfies Prisma.UnitSelect;

export const productSelect = {
  id: true,
  name: true,
  size: true,
  unitPrice: true,
  unit: { select: unitSelect },
} satisfies Prisma.ProductSelect;

export const userSelect = {
  id: true,
  name: true,
  email: true,
} satisfies Prisma.UserSelect;

export const retailerSelect = {
  id: true,
  name: true,
  contactPerson: true,
  phone: true,
  email: true,
  address: true,
  creditLimit: true,
  notes: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: userSelect },
} satisfies Prisma.RetailerSelect;

export const batchSelect = {
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

export const inventoryInclude = {
  unit: { select: unitSelect },
  salesBatches: {
    where: { quantityRemaining: { gt: 0 } },
    select: batchSelect,
    orderBy: [{ receivedAt: "asc" }, { batchNumber: "asc" }],
  },
} satisfies Prisma.ProductInclude;

export const saleInclude = {
  createdBy: { select: userSelect },
  retailer: { select: retailerSelect },
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

export const saleItemOptionInclude = {
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

export const returnInclude = {
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

export const posSessionInclude = {
  terminal: {
    select: {
      id: true,
      displayToken: true,
    },
  },
  retailer: { select: retailerSelect },
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

export const posTerminalInclude = {
  currentSession: {
    include: posSessionInclude,
  },
} satisfies Prisma.PosTerminalInclude;

export type ProductInventory = Prisma.ProductGetPayload<{
  include: typeof inventoryInclude;
}>;

export type RetailerWithCreatedBy = Prisma.RetailerGetPayload<{
  select: typeof retailerSelect;
}>;

export type SaleWithIncludes = Prisma.SaleGetPayload<{
  include: typeof saleInclude;
}>;

export type SaleItemOption = Prisma.SaleItemGetPayload<{
  include: typeof saleItemOptionInclude;
}>;

export type SalesReturnWithIncludes = Prisma.SalesProductReturnGetPayload<{
  include: typeof returnInclude;
}>;

export type PosSessionWithIncludes = Prisma.PosSessionGetPayload<{
  include: typeof posSessionInclude;
}>;

export type PosTerminalWithIncludes = Prisma.PosTerminalGetPayload<{
  include: typeof posTerminalInclude;
}>;
