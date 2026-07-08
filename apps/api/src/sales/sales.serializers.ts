import { PaymentMethod } from "@prisma/client";

import type {
  PosSessionWithIncludes,
  PosTerminalWithIncludes,
  ProductInventory,
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
    },
    totalRemaining: formatQuantity(totalRemaining),
    batches: product.salesBatches.map(serializeBatch),
  };
}

export function serializeSale(sale: SaleWithIncludes) {
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
    createdAt: terminal.createdAt.toISOString(),
    updatedAt: terminal.updatedAt.toISOString(),
    currentSession: terminal.currentSession
      ? serializePosSession(terminal.currentSession)
      : null,
  };
}
