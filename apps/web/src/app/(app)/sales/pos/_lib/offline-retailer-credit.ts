import type {
  PosOfflineQueuedSale,
  PosOfflineSalePayload,
  PosOfflineSnapshot,
  Retailer,
} from "@/lib/operations/types";

const unresolvedStatuses = new Set<PosOfflineQueuedSale["status"]>([
  "PENDING",
  "SYNCING",
  "FAILED",
  "CONFLICT",
]);

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function offlineSaleBalanceDue(payload: PosOfflineSalePayload) {
  const subtotal = payload.items.reduce(
    (sum, item) =>
      sum + Number(item.quantity) * Number(item.unitPrice ?? 0),
    0,
  );
  const total = Math.max(0, roundMoney(subtotal - Number(payload.discount ?? 0)));
  const amountPaid = Number(payload.amountPaid ?? 0);

  if (![subtotal, total, amountPaid].every(Number.isFinite)) {
    throw new Error("The offline sale contains an invalid monetary amount.");
  }

  return Math.max(0, roundMoney(total - amountPaid));
}

function unresolvedCreditSales(
  terminalId: string,
  queuedSales: PosOfflineQueuedSale[],
) {
  return queuedSales.filter(
    (sale) =>
      sale.terminalId === terminalId &&
      unresolvedStatuses.has(sale.status) &&
      sale.payload.customerType === "RETAILER" &&
      sale.payload.paymentMethod === "CREDIT" &&
      Boolean(sale.payload.retailerId),
  );
}

function queuedCreditByRetailer(
  terminalId: string,
  queuedSales: PosOfflineQueuedSale[],
) {
  const amounts = new Map<string, number>();

  for (const sale of unresolvedCreditSales(terminalId, queuedSales)) {
    const retailerId = sale.payload.retailerId;

    if (!retailerId) {
      continue;
    }

    amounts.set(
      retailerId,
      roundMoney(
        (amounts.get(retailerId) ?? 0) +
          offlineSaleBalanceDue(sale.payload),
      ),
    );
  }

  return amounts;
}

export function deriveOfflineRetailers(
  snapshot: PosOfflineSnapshot,
  queuedSales: PosOfflineQueuedSale[],
): Retailer[] {
  const queuedCredit = queuedCreditByRetailer(
    snapshot.terminal.id,
    queuedSales,
  );
  const consumedApprovalIds = new Set(
    unresolvedCreditSales(snapshot.terminal.id, queuedSales).flatMap((sale) =>
      sale.payload.retailerApprovalId
        ? [sale.payload.retailerApprovalId]
        : [],
    ),
  );
  const allocationByRetailer = new Map(
    snapshot.retailerCreditAllocations
      .filter((allocation) => allocation.isActive)
      .map((allocation) => [allocation.retailer.id, allocation]),
  );

  const now = Date.now();

  return (snapshot.retailers ?? [])
    .filter((retailer) => retailer.isActive)
    .map((retailer) => {
      const allocation = allocationByRetailer.get(retailer.id);
      const locallyQueued = queuedCredit.get(retailer.id) ?? 0;
      const outstanding = roundMoney(
        Number(retailer.outstandingBalance) + locallyQueued,
      );
      const availableCredit = Math.max(
        0,
        roundMoney(Number(allocation?.remainingAmount ?? 0) - locallyQueued),
      );

      return {
        ...retailer,
        creditLimit: allocation?.allocatedAmount ?? "0.00",
        outstandingBalance: outstanding.toFixed(2),
        availableCredit: availableCredit.toFixed(2),
        requiresOrderApproval: outstanding > 0,
        orderApprovals: retailer.orderApprovals.filter(
          (approval) =>
            !consumedApprovalIds.has(approval.id) &&
            (!approval.expiresAt ||
              new Date(approval.expiresAt).getTime() > now),
        ),
      };
    });
}

export type OfflineCreditReservation = {
  terminalId: string;
  retailerId: string;
  allocationId: string;
  amount: number;
  approvalId: string | null;
};

export function validateOfflineRetailerCreditSale(input: {
  snapshot: PosOfflineSnapshot;
  payload: PosOfflineSalePayload;
  queuedSales: PosOfflineQueuedSale[];
  reservedApprovalIds?: ReadonlySet<string>;
  now?: Date;
}): OfflineCreditReservation | null {
  const { payload, snapshot } = input;

  if (
    payload.customerType !== "RETAILER" ||
    payload.paymentMethod !== "CREDIT"
  ) {
    return null;
  }

  if (!payload.retailerId) {
    throw new Error("Select a retailer before recording an offline credit sale.");
  }

  const balanceDue = offlineSaleBalanceDue(payload);

  if (balanceDue <= 0) {
    return null;
  }

  const retailer = (snapshot.retailers ?? []).find(
    (candidate) => candidate.id === payload.retailerId && candidate.isActive,
  );

  if (!retailer) {
    throw new Error("That retailer is not available in this offline snapshot.");
  }

  const allocation = snapshot.retailerCreditAllocations.find(
    (candidate) =>
      candidate.retailer.id === retailer.id && candidate.isActive,
  );

  if (!allocation) {
    throw new Error(
      `${retailer.name} has no active credit allocation for this POS terminal.`,
    );
  }

  const queuedCredit =
    queuedCreditByRetailer(snapshot.terminal.id, input.queuedSales).get(
      retailer.id,
    ) ?? 0;
  const remainingCredit = Math.max(
    0,
    roundMoney(Number(allocation.remainingAmount) - queuedCredit),
  );

  if (balanceDue > remainingCredit) {
    throw new Error(
      `Only ₦${remainingCredit.toLocaleString("en", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })} of offline retailer credit remains for ${retailer.name}.`,
    );
  }

  const localOutstanding = roundMoney(
    Number(retailer.outstandingBalance) + queuedCredit,
  );
  const requiresApproval =
    retailer.requiresOrderApproval || localOutstanding > 0;
  let approvalId: string | null = null;

  if (requiresApproval) {
    if (!payload.retailerApprovalId) {
      throw new Error(
        "Admin approval is required because this retailer already has uncleared or locally queued credit.",
      );
    }

    const approval = retailer.orderApprovals.find(
      (candidate) => candidate.id === payload.retailerApprovalId,
    );

    if (
      !approval ||
      approval.status !== "APPROVED" ||
      approval.usedAt ||
      approval.terminal?.id !== snapshot.terminal.id
    ) {
      throw new Error(
        "Select an unused Admin approval assigned to this POS terminal.",
      );
    }

    const now = input.now ?? new Date();

    if (
      approval.expiresAt &&
      new Date(approval.expiresAt).getTime() <= now.getTime()
    ) {
      throw new Error("The selected Admin approval has expired.");
    }

    if (Number(approval.approvedAmount) < balanceDue) {
      throw new Error(
        `The selected Admin approval does not cover this ₦${balanceDue.toLocaleString(
          "en",
          { minimumFractionDigits: 2, maximumFractionDigits: 2 },
        )} credit sale.`,
      );
    }

    const queuedApprovalIds = new Set(
      unresolvedCreditSales(snapshot.terminal.id, input.queuedSales).flatMap(
        (sale) =>
          sale.payload.retailerApprovalId
            ? [sale.payload.retailerApprovalId]
            : [],
      ),
    );

    if (
      queuedApprovalIds.has(approval.id) ||
      input.reservedApprovalIds?.has(approval.id)
    ) {
      throw new Error(
        "The selected Admin approval is already reserved by another offline sale.",
      );
    }

    approvalId = approval.id;
  }

  return {
    terminalId: snapshot.terminal.id,
    retailerId: retailer.id,
    allocationId: allocation.id,
    amount: balanceDue,
    approvalId,
  };
}
