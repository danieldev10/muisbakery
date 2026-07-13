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

export const retailerOrderApprovalSelect = {
  id: true,
  approvedAmount: true,
  status: true,
  terminal: { select: { id: true, name: true } },
  reason: true,
  expiresAt: true,
  usedAt: true,
  createdAt: true,
  reviewedAt: true,
  requestedBy: { select: userSelect },
  approvedBy: { select: userSelect },
} satisfies Prisma.RetailerOrderApprovalSelect;

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
  orderApprovals: {
    select: retailerOrderApprovalSelect,
    orderBy: { createdAt: "desc" },
    take: 20,
  },
} satisfies Prisma.RetailerSelect;

export const retailerPaymentSelect = {
  id: true,
  amount: true,
  paymentMethod: true,
  paidAt: true,
  reference: true,
  notes: true,
  createdAt: true,
  retailer: {
    select: {
      id: true,
      name: true,
    },
  },
  createdBy: { select: userSelect },
  allocations: {
    select: {
      id: true,
      amount: true,
      sale: {
        select: {
          id: true,
          saleNumber: true,
          soldAt: true,
          totalAmount: true,
          balanceDue: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  },
} satisfies Prisma.RetailerPaymentSelect;

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
  terminal: { select: { id: true, name: true } },
  retailer: { select: retailerSelect },
  retailerApproval: { select: retailerOrderApprovalSelect },
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
      offlineEnabled: true,
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
  stockAllocations: {
    include: {
      product: { select: productSelect },
    },
    orderBy: { product: { name: "asc" } },
  },
  retailerCreditAllocations: {
    include: {
      retailer: {
        select: {
          id: true,
          name: true,
          contactPerson: true,
        },
      },
    },
    orderBy: { retailer: { name: "asc" } },
  },
  pairedBy: { select: userSelect },
} satisfies Prisma.PosTerminalInclude;

export const posOfflineSyncAttemptInclude = {
  terminal: {
    select: {
      id: true,
      name: true,
      offlineEnabled: true,
    },
  },
  sale: {
    include: saleInclude,
  },
} satisfies Prisma.PosOfflineSyncAttemptInclude;

export type ProductInventory = Prisma.ProductGetPayload<{
  include: typeof inventoryInclude;
}>;

export type RetailerWithCreatedBy = Prisma.RetailerGetPayload<{
  select: typeof retailerSelect;
}>;

export type RetailerOrderApprovalWithIncludes = Prisma.RetailerOrderApprovalGetPayload<{
  select: typeof retailerOrderApprovalSelect;
}>;

export type RetailerPaymentWithIncludes = Prisma.RetailerPaymentGetPayload<{
  select: typeof retailerPaymentSelect;
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

export type PosOfflineSyncAttemptWithIncludes =
  Prisma.PosOfflineSyncAttemptGetPayload<{
    include: typeof posOfflineSyncAttemptInclude;
  }>;
