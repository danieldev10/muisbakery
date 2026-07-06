import type { PaymentMethod, SalesReturnDisposition } from "@/lib/operations/types";
import type { AppRole } from "@/lib/roles";

export type ManagementUnitRef = {
  id: string;
  name: string;
  abbreviation: string;
};

export type ManagementUserRef = {
  id: string;
  name: string | null;
  email: string;
  role: AppRole;
};

export type ManagementRawMaterialRef = {
  id: string;
  name: string;
  unitCost: string | null;
  baseUnit: ManagementUnitRef;
};

export type ManagementProductRef = {
  id: string;
  name: string;
  unitPrice: string | null;
  unit: ManagementUnitRef;
};

export type ManagementMonth = {
  value: string;
  label: string;
  start: string;
  end: string;
};

export type ManagementAuditEntry = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  actor: ManagementUserRef | null;
};

export type ManagementInventoryReport = {
  valuation: {
    rawMaterials: string;
    finishedGoods: string;
    totalStockValue: string;
  };
  lowStockThreshold: string;
  lowStock: {
    rawMaterials: RawMaterialStockItem[];
    finishedProducts: FinishedProductStockItem[];
  };
  rawMaterials: RawMaterialStockItem[];
  finishedProducts: FinishedProductStockItem[];
};

export type RawMaterialStockItem = {
  rawMaterial: ManagementRawMaterialRef;
  totalRemaining: string;
  estimatedValue: string;
  batches: Array<{
    id: string;
    batchNumber: number;
    batchLabel: string;
    batchDate: string;
    quantityReceived: string;
    quantityRemaining: string;
    unitCost: string | null;
    estimatedValue: string;
    receivedAt: string;
    supplier: { id: string; name: string } | null;
  }>;
};

export type FinishedProductStockItem = {
  product: ManagementProductRef;
  totalRemaining: string;
  estimatedRetailValue: string;
  batches: Array<{
    id: string;
    batchNumber: number;
    batchDate: string;
    quantityReceived: string;
    quantityRemaining: string;
    estimatedRetailValue: string;
    receivedAt: string;
    productionRun: { id: string; producedAt: string } | null;
  }>;
};

export type ManagementProfitLossReport = {
  month: ManagementMonth;
  revenue: {
    salesCount: number;
    subtotal: string;
    discount: string;
    totalRevenue: string;
    amountPaid: string;
    balanceDue: string;
  };
  costs: {
    materialPurchasedCost: string;
    materialIssuedCost: string;
  };
  losses: {
    productionWasteQuantity: string;
    productionWasteEstimatedValue: string;
    damagedReturnsQuantity: string;
    damagedReturnsEstimatedValue: string;
    totalEstimatedLoss: string;
  };
  profit: {
    estimatedGrossProfit: string;
    estimatedNetAfterRecordedLosses: string;
    grossMarginPercent: string;
  };
  notes: string[];
};

export type ManagementProductionReport = {
  month: ManagementMonth;
  summary: {
    runsCount: number;
    quantityProduced: string;
    quantityTransferred: string;
    wasteQuantity: string;
  };
  outputByProduct: Array<{
    product: ManagementProductRef;
    runsCount: number;
    quantityProduced: string;
    quantityTransferred: string;
    wasteQuantity: string;
  }>;
  materialUsage: Array<{
    rawMaterial: ManagementRawMaterialRef;
    expectedQuantity: string;
    actualQuantity: string;
  }>;
  wasteByProduct: Array<{
    product: ManagementProductRef;
    count: number;
    quantity: string;
    estimatedRetailValue: string;
  }>;
  runs: Array<{
    id: string;
    quantityProduced: string;
    quantityTransferred: string;
    wasteQuantity: string;
    producedAt: string;
    notes: string | null;
    product: ManagementProductRef;
    createdBy: ManagementUserRef | null;
    materialUsages: Array<{
      id: string;
      expectedQuantity: string | null;
      actualQuantity: string;
      rawMaterial: ManagementRawMaterialRef;
    }>;
  }>;
};

export type ManagementSalesReport = {
  month: ManagementMonth;
  summary: {
    salesCount: number;
    totalRevenue: string;
    amountPaid: string;
    balanceDue: string;
    quantitySold: string;
    damagedQuantity: string;
    returnedToStockQuantity: string;
  };
  paymentSummary: Array<{
    method: PaymentMethod;
    count: number;
    amount: string;
  }>;
  productSummary: Array<{
    product: ManagementProductRef;
    quantitySold: string;
    revenue: string;
  }>;
  sales: Array<{
    id: string;
    saleNumber: number;
    paymentMethod: PaymentMethod;
    soldAt: string;
    totalAmount: string;
    amountPaid: string;
    balanceDue: string;
    createdBy: ManagementUserRef | null;
    items: Array<{
      id: string;
      quantity: string;
      lineTotal: string;
      product: ManagementProductRef;
    }>;
  }>;
  returns: Array<{
    id: string;
    disposition: SalesReturnDisposition;
    quantity: string;
    reason: string | null;
    recordedAt: string;
    product: ManagementProductRef;
    createdBy: ManagementUserRef | null;
  }>;
};

export type ManagementAuditReport = {
  since: string;
  totalRecentActions: number;
  roleActivity: Array<{ role: string; count: number }>;
  entityActivity: Array<{ entityType: string; count: number }>;
  entries: ManagementAuditEntry[];
};

export type ManagementDashboardReport = {
  month: ManagementMonth;
  summary: {
    totalRevenue: string;
    estimatedMaterialCost: string;
    estimatedGrossProfit: string;
    rawMaterialStockValue: string;
    finishedGoodsStockValue: string;
    productionRuns: number;
    productsSold: string;
    lowStockAlerts: number;
  };
  lowStock: ManagementInventoryReport["lowStock"];
  latestActivity: ManagementAuditEntry[];
};
