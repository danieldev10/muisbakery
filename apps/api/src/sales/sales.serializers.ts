import { PaymentMethod } from "@prisma/client";

import type {
  PosSessionWithIncludes,
  PosOfflineSyncAttemptWithIncludes,
  PosTerminalWithIncludes,
  ProductInventory,
  RetailerOrderApprovalWithIncludes,
  RetailerPaymentWithIncludes,
  RetailerWithCreatedBy,
  SaleItemOption,
  SalesReturnWithIncludes,
  SaleWithIncludes,
} from "./sales.queries";
import {
  decimalToNumber,
  formatQuantity,
  roundMoney,
  roundQuantity,
} from "./sales.utils";

export function serializeBatch(batch: ProductInventory["salesBatches"][number]) {
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

export function serializeInventoryItem(product: ProductInventory) {
  const totalRemaining = product.salesBatches.reduce(
    (sum, batch) => sum + decimalToNumber(batch.quantityRemaining),
    0,
  );

  return {
    product: {
      id: product.id,
      name: product.name,
      size: product.size,
      unit: product.unit,
      unitPrice: product.unitPrice?.toString() ?? null,
      retailerPrice: product.retailerPrice?.toString() ?? null,
      discountPercent: product.discountPercent.toString(),
    },
    totalRemaining: formatQuantity(totalRemaining),
    batches: product.salesBatches.map(serializeBatch),
  };
}

export function serializeRetailer(
  retailer: RetailerWithCreatedBy,
  credit: { outstandingBalance?: number } = {},
) {
  const outstandingBalance = credit.outstandingBalance ?? 0;
  const now = Date.now();

  return {
    id: retailer.id,
    name: retailer.name,
    contactPerson: retailer.contactPerson,
    phone: retailer.phone,
    email: retailer.email,
    address: retailer.address,
    creditLimit: retailer.creditLimit.toString(),
    outstandingBalance: outstandingBalance.toFixed(2),
    availableCredit: "0.00",
    requiresOrderApproval: outstandingBalance > 0,
    orderApprovals: (retailer.orderApprovals ?? [])
      .filter(
        (approval) =>
          approval.status === "APPROVED" &&
          !approval.usedAt &&
          (!approval.expiresAt || approval.expiresAt.getTime() > now),
      )
      .map(serializeRetailerOrderApproval),
    orderApprovalRequests: (retailer.orderApprovals ?? []).map(
      serializeRetailerOrderApproval,
    ),
    notes: retailer.notes,
    isActive: retailer.isActive,
    createdAt: retailer.createdAt.toISOString(),
    updatedAt: retailer.updatedAt.toISOString(),
    createdBy: retailer.createdBy,
  };
}

export function serializeRetailerOrderApproval(
  approval: RetailerOrderApprovalWithIncludes,
) {
  return {
    id: approval.id,
    approvedAmount: approval.approvedAmount.toString(),
    status: approval.status,
    terminal: approval.terminal,
    reason: approval.reason,
    expiresAt: approval.expiresAt?.toISOString() ?? null,
    usedAt: approval.usedAt?.toISOString() ?? null,
    createdAt: approval.createdAt.toISOString(),
    reviewedAt: approval.reviewedAt?.toISOString() ?? null,
    requestedBy: approval.requestedBy,
    approvedBy: approval.approvedBy,
  };
}

export function serializeRetailerPayment(payment: RetailerPaymentWithIncludes) {
  return {
    id: payment.id,
    amount: payment.amount.toString(),
    paymentMethod: payment.paymentMethod,
    paidAt: payment.paidAt.toISOString(),
    reference: payment.reference,
    notes: payment.notes,
    createdAt: payment.createdAt.toISOString(),
    retailer: {
      id: payment.retailer.id,
      name: payment.retailer.name,
    },
    createdBy: payment.createdBy,
    allocations: payment.allocations.map((allocation) => ({
      id: allocation.id,
      amount: allocation.amount.toString(),
      sale: {
        id: allocation.sale.id,
        saleNumber: allocation.sale.saleNumber,
        soldAt: allocation.sale.soldAt.toISOString(),
        totalAmount: allocation.sale.totalAmount.toString(),
        balanceDue: allocation.sale.balanceDue.toString(),
      },
    })),
  };
}

export function serializeSale(sale: SaleWithIncludes) {
  return {
    id: sale.id,
    saleNumber: sale.saleNumber,
    customerType: sale.customerType,
    priceType: sale.priceType,
    retailer: sale.retailer ? serializeRetailer(sale.retailer) : null,
    retailerApproval: sale.retailerApproval
      ? serializeRetailerOrderApproval(sale.retailerApproval)
      : null,
    terminal: sale.terminal,
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

export function serializeSaleItemOption(item: SaleItemOption) {
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
    returnableQuantity: formatQuantity(returnableQuantity),
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

export function serializeReturn(entry: SalesReturnWithIncludes) {
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

export function serializePosSession(session: PosSessionWithIncludes) {
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
    customerType: session.customerType,
    priceType: session.priceType,
    retailer: session.retailer ? serializeRetailer(session.retailer) : null,
    retailerApprovalId: session.retailerApprovalId,
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

export function serializePosTerminal(terminal: PosTerminalWithIncludes) {
  return {
    id: terminal.id,
    name: terminal.name,
    displayToken: terminal.displayToken,
    pairable: Boolean(
      !terminal.pairedAt &&
        !terminal.deviceSecretHash &&
        terminal.pairingCodeHash &&
        (!terminal.pairingCodeExpiresAt ||
          terminal.pairingCodeExpiresAt.getTime() > Date.now()),
    ),
    pairingCodeExpiresAt: terminal.pairingCodeExpiresAt?.toISOString() ?? null,
    pairedAt: terminal.pairedAt?.toISOString() ?? null,
    pairedBy: terminal.pairedBy,
    deviceSecretIssuedAt:
      terminal.deviceSecretIssuedAt?.toISOString() ?? null,
    isActive: terminal.isActive,
    offlineEnabled: terminal.offlineEnabled,
    lastSeenAt: terminal.lastSeenAt?.toISOString() ?? null,
    lastSyncedAt: terminal.lastSyncedAt?.toISOString() ?? null,
    createdAt: terminal.createdAt.toISOString(),
    updatedAt: terminal.updatedAt.toISOString(),
    currentSession: terminal.currentSession
      ? serializePosSession(terminal.currentSession)
      : null,
    stockAllocations: terminal.stockAllocations.map((allocation) => ({
      id: allocation.id,
      allocatedQuantity: allocation.allocatedQuantity.toString(),
      soldQuantity: allocation.soldQuantity.toString(),
      remainingQuantity: Math.max(
        0,
        allocation.allocatedQuantity - allocation.soldQuantity,
      ).toString(),
      product: allocation.product,
      batches: allocation.batches.map((batch) => ({
        id: batch.id,
        quantityAllocated: batch.quantityAllocated.toString(),
        quantityRemaining: batch.quantityRemaining.toString(),
        allocatedAt: batch.allocatedAt.toISOString(),
        updatedAt: batch.updatedAt.toISOString(),
        sourceBatch: {
          id: batch.sourceBatch.id,
          batchNumber: batch.sourceBatch.batchNumber,
          batchDate: batch.sourceBatch.batchDate.toISOString(),
          receivedAt: batch.sourceBatch.receivedAt.toISOString(),
        },
      })),
      createdAt: allocation.createdAt.toISOString(),
      updatedAt: allocation.updatedAt.toISOString(),
    })),
    retailerCreditAllocations: terminal.retailerCreditAllocations.map(
      (allocation) => {
        const allocatedAmount = Number(allocation.allocatedAmount);
        const usedAmount = Number(allocation.usedAmount);

        return {
          id: allocation.id,
          allocatedAmount: allocation.allocatedAmount.toString(),
          usedAmount: allocation.usedAmount.toString(),
          remainingAmount: Math.max(0, allocatedAmount - usedAmount).toFixed(2),
          isActive: allocation.isActive,
          retailer: allocation.retailer,
          createdAt: allocation.createdAt.toISOString(),
          updatedAt: allocation.updatedAt.toISOString(),
        };
      },
    ),
  };
}

export function serializePairedPosTerminal(
  terminal: PosTerminalWithIncludes,
  deviceSecret: string,
) {
  return {
    ...serializePosTerminal(terminal),
    deviceSecret,
  };
}

export function serializePosOfflineSyncAttempt(
  attempt: PosOfflineSyncAttemptWithIncludes,
) {
  return {
    id: attempt.id,
    terminal: attempt.terminal,
    clientRequestId: attempt.clientRequestId,
    status: attempt.status,
    sale: attempt.sale ? serializeSale(attempt.sale) : null,
    payload: attempt.payload,
    errorMessage: attempt.errorMessage,
    conflictCode: attempt.conflictCode,
    attemptedAt: attempt.attemptedAt.toISOString(),
    syncedAt: attempt.syncedAt?.toISOString() ?? null,
    createdAt: attempt.createdAt.toISOString(),
    updatedAt: attempt.updatedAt.toISOString(),
  };
}
