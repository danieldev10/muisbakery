export type UnitRef = {
  id: string;
  name: string;
  abbreviation: string;
};

export type SupplierRef = {
  id: string;
  name: string;
};

export type UserRef = {
  id: string;
  name: string | null;
  email: string;
};

export type RawMaterialRef = {
  id: string;
  name: string;
  baseUnit: UnitRef;
};

export type ProductRef = {
  id: string;
  name: string;
  size: string;
  unit: UnitRef;
};

export type SalesProductRef = ProductRef & {
  unitPrice: string | null;
};

export type ProductRecipeOption = {
  id: string;
  yieldQuantity: string;
  items: Array<{
    id: string;
    quantity: string;
    rawMaterial: RawMaterialRef;
    unit: UnitRef;
  }>;
};

export type ProductionProductOption = ProductRef & {
  recipe: ProductRecipeOption | null;
};

export type StoreOptions = {
  rawMaterials: RawMaterialRef[];
  suppliers: SupplierRef[];
};

export type ProductionOptions = {
  rawMaterials: RawMaterialRef[];
  products: ProductionProductOption[];
};

export type RawMaterialBatch = {
  id: string;
  batchNumber: number;
  batchLabel: string;
  batchDate: string;
  quantityReceived: string;
  quantityRemaining: string;
  receivedAt: string;
  reference: string | null;
  notes: string | null;
  createdAt: string;
  rawMaterial: RawMaterialRef;
  supplier: SupplierRef | null;
  createdBy: UserRef | null;
};

export type RawMaterialReceipt = {
  id: string;
  quantity: string;
  receivedAt: string;
  reference: string | null;
  notes: string | null;
  createdAt: string;
  rawMaterial: RawMaterialRef;
  supplier: SupplierRef | null;
  createdBy: UserRef | null;
  batch: {
    id: string;
    batchNumber: number;
    batchDate: string;
    batchLabel: string;
    quantityReceived: string;
    quantityRemaining: string;
  };
};

export type InventoryBatch = {
  id: string;
  batchNumber: number;
  batchLabel: string;
  batchDate: string;
  quantityReceived: string;
  quantityRemaining: string;
  receivedAt: string;
  reference: string | null;
  notes: string | null;
  supplier: SupplierRef | null;
};

export type InventoryItem = {
  rawMaterial: RawMaterialRef;
  totalRemaining: string;
  batches: InventoryBatch[];
};

export type MaterialRequestStatus =
  | "PENDING"
  | "PARTIALLY_ISSUED"
  | "FULFILLED"
  | "CANCELLED"
  | "REJECTED";

export type MaterialRequestIssue = {
  id: string;
  quantity: string;
  createdAt: string;
  issuedBy: UserRef | null;
  batch: {
    id: string;
    batchNumber: number;
    batchLabel: string;
    batchDate: string;
    receivedAt: string;
    supplier: SupplierRef | null;
  };
};

export type MaterialRequest = {
  id: string;
  requestedQuantity: string;
  issuedQuantity: string;
  remainingQuantity: string;
  status: MaterialRequestStatus;
  neededBy: string | null;
  notes: string | null;
  responseNotes: string | null;
  fulfilledAt: string | null;
  createdAt: string;
  updatedAt: string;
  productionRequest: {
    id: string;
    requestedQuantity: string;
    status: MaterialRequestStatus;
    product: ProductRef;
  } | null;
  rawMaterial: RawMaterialRef;
  requestedBy: UserRef;
  issuedBy: UserRef | null;
  issues: MaterialRequestIssue[];
};

export type ProductionRequest = {
  id: string;
  requestedQuantity: string;
  status: MaterialRequestStatus;
  neededBy: string | null;
  notes: string | null;
  responseNotes: string | null;
  fulfilledAt: string | null;
  createdAt: string;
  updatedAt: string;
  product: ProductRef;
  requestedBy: UserRef;
  materialRequests: MaterialRequest[];
};

export type ProductionWasteType = "DAMAGED" | "RETURNED_TO_PRODUCTION";

export type ProductionWaste = {
  id: string;
  type: ProductionWasteType;
  quantity: string;
  reason: string | null;
  recordedAt: string;
  createdAt: string;
  product: ProductRef;
  createdBy: UserRef | null;
  productionRun: {
    id: string;
    producedAt: string;
    product: ProductRef;
  } | null;
};

export type ProductionRun = {
  id: string;
  quantityProduced: string;
  expectedQuantity: string | null;
  shortfallQuantity: string | null;
  quantityTransferred: string;
  wasteQuantity: string;
  producedAt: string;
  notes: string | null;
  createdAt: string;
  product: ProductRef;
  createdBy: UserRef | null;
  materialUsages: Array<{
    id: string;
    expectedQuantity: string | null;
    actualQuantity: string;
    rawMaterial: RawMaterialRef;
  }>;
  waste: Array<{
    id: string;
    type: ProductionWasteType;
    quantity: string;
    reason: string | null;
    recordedAt: string;
    product: ProductRef;
    createdBy: UserRef | null;
  }>;
  salesBatches: Array<{
    id: string;
    batchNumber: number;
    batchDate: string;
    quantityReceived: string;
    quantityRemaining: string;
    receivedAt: string;
    product: ProductRef;
  }>;
};

export type ProductionMaterialInventoryItem = {
  rawMaterial: RawMaterialRef;
  totalRemaining: string;
  batches: Array<{
    id: string;
    quantityReceived: string;
    quantityRemaining: string;
    receivedAt: string;
    materialRequest: {
      id: string;
      createdAt: string;
    } | null;
    storeBatch: {
      id: string;
      batchNumber: number;
      batchDate: string;
    } | null;
    createdBy: UserRef | null;
  }>;
};

export type SalesInventoryItem = {
  product: SalesProductRef;
  totalRemaining: string;
  batches: Array<{
    id: string;
    batchNumber: number;
    batchDate: string;
    quantityReceived: string;
    quantityRemaining: string;
    receivedAt: string;
    notes: string | null;
    productionRun: {
      id: string;
      producedAt: string;
    } | null;
    createdBy: UserRef | null;
  }>;
};

export type PaymentMethod = "CASH" | "TRANSFER" | "POS" | "CREDIT";

export type CustomerType = "INDIVIDUAL" | "RETAILER";

export type SalesReturnDisposition = "RETURN_TO_STOCK" | "DAMAGED";

export type Retailer = {
  id: string;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  creditLimit: string;
  outstandingBalance: string;
  availableCredit: string;
  requiresOrderApproval: boolean;
  orderApprovals: RetailerOrderApproval[];
  orderApprovalRequests: RetailerOrderApproval[];
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: UserRef | null;
};

export type RetailerOrderApproval = {
  id: string;
  approvedAmount: string;
  status: "PENDING" | "APPROVED" | "USED" | "REVOKED";
  reason: string | null;
  expiresAt: string | null;
  usedAt: string | null;
  createdAt: string;
  reviewedAt: string | null;
  requestedBy: UserRef | null;
  approvedBy: UserRef | null;
};

export type RetailerPayment = {
  id: string;
  amount: string;
  paymentMethod: PaymentMethod;
  paidAt: string;
  reference: string | null;
  notes: string | null;
  createdAt: string;
  retailer: {
    id: string;
    name: string;
  };
  createdBy: UserRef | null;
  allocations: Array<{
    id: string;
    amount: string;
    sale: {
      id: string;
      saleNumber: number;
      soldAt: string;
      totalAmount: string;
      balanceDue: string;
    };
  }>;
};

export type SaleItemBatch = {
  id: string;
  quantity: string;
  batch: {
    id: string;
    batchNumber: number;
    batchDate: string;
  };
};

export type SaleItem = {
  id: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
  product: SalesProductRef;
  batchIssues: SaleItemBatch[];
};

export type Sale = {
  id: string;
  saleNumber: number;
  customerType: CustomerType;
  retailer: Retailer | null;
  retailerApproval: RetailerOrderApproval | null;
  paymentMethod: PaymentMethod;
  customerName: string | null;
  soldAt: string;
  subtotal: string;
  discount: string;
  totalAmount: string;
  amountPaid: string;
  balanceDue: string;
  notes: string | null;
  createdAt: string;
  createdBy: UserRef | null;
  items: SaleItem[];
};

export type SaleItemOption = {
  id: string;
  quantity: string;
  returnableQuantity: string;
  unitPrice: string;
  lineTotal: string;
  sale: {
    id: string;
    saleNumber: number;
    soldAt: string;
  };
  product: SalesProductRef;
  batchIssues: SaleItemBatch[];
};

export type SalesOptions = {
  products: SalesInventoryItem[];
  saleItems: SaleItemOption[];
  retailers: Retailer[];
  paymentMethods: PaymentMethod[];
  returnDispositions: SalesReturnDisposition[];
};

export type SalesReturn = {
  id: string;
  disposition: SalesReturnDisposition;
  quantity: string;
  reason: string | null;
  recordedAt: string;
  createdAt: string;
  product: SalesProductRef;
  batch: {
    id: string;
    batchNumber: number;
    batchDate: string;
  } | null;
  saleItem: {
    id: string;
    quantity: string;
    sale: {
      id: string;
      saleNumber: number;
      soldAt: string;
    };
    product: SalesProductRef;
  } | null;
  createdBy: UserRef | null;
};

export type SalesSummary = {
  date: string;
  salesCount: number;
  totalRevenue: string;
  amountPaid: string;
  balanceDue: string;
  damagedQuantity: string;
  returnedToStockQuantity: string;
  paymentSummary: Array<{
    method: PaymentMethod;
    count: number;
    amount: string;
  }>;
  productSummary: Array<{
    product: SalesProductRef;
    quantitySold: string;
    revenue: string;
  }>;
  sales: Sale[];
  returns: SalesReturn[];
};

export type PosSessionStatus = "ACTIVE" | "COMPLETED" | "CANCELLED" | "EXPIRED";

export type PosSessionItem = {
  id: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
  product: SalesProductRef;
};

export type PosSession = {
  id: string;
  displayToken: string;
  terminal: {
    id: string;
    displayToken: string;
  } | null;
  status: PosSessionStatus;
  customerType: CustomerType;
  retailer: Retailer | null;
  retailerApprovalId: string | null;
  customerName: string | null;
  paymentMethod: PaymentMethod;
  discount: string;
  amountPaid: string;
  balanceDue: string;
  subtotal: string;
  totalAmount: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  completedSale: {
    id: string;
    saleNumber: number;
    totalAmount: string;
    amountPaid: string;
    balanceDue: string;
    soldAt: string;
  } | null;
  items: PosSessionItem[];
};

export type PosTerminal = {
  id: string;
  name: string | null;
  displayToken: string;
  isActive: boolean;
  offlineEnabled: boolean;
  lastSeenAt: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
  currentSession: PosSession | null;
};

export type DayCloseStatus = "SUBMITTED" | "APPROVED";

export type SalesDayClose = {
  id: string;
  businessDate: string;
  salesCount: number;
  expectedCash: string;
  expectedTransfer: string;
  expectedPos: string;
  creditTotal: string;
  countedCash: string;
  cashVariance: string;
  damagedQuantity: number;
  returnedQuantity: number;
  notes: string | null;
  status: DayCloseStatus;
  submittedAt: string;
  submittedBy: UserRef | null;
  reviewedAt: string | null;
  reviewedBy: UserRef | null;
  reviewNotes: string | null;
};

export type DayClosePreview = {
  date: string;
  expected: {
    salesCount: number;
    expectedCash: string;
    expectedTransfer: string;
    expectedPos: string;
    creditTotal: string;
    damagedQuantity: number;
    returnedQuantity: number;
  };
  close: SalesDayClose | null;
  needsReclose: boolean;
};

export type DayCloseListReport = {
  month: { value: string; label: string; start: string; end: string };
  closes: SalesDayClose[];
};
