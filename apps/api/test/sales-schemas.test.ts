import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CustomerType,
  PaymentMethod,
  SalesReturnDisposition,
} from "@prisma/client";

import {
  createSaleSchema,
  recordRetailerPaymentSchema,
  recordReturnSchema,
} from "../src/sales/sales.schemas";

test("createSaleSchema accepts valid whole-number sales", () => {
  const result = createSaleSchema.safeParse({
    paymentMethod: PaymentMethod.CASH,
    items: [{ productId: "product-1", quantity: "2", unitPrice: "1500" }],
  });

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.items[0]?.quantity, 2);
    assert.equal(result.data.items[0]?.unitPrice, 1500);
  }
});

test("createSaleSchema rejects duplicate products and decimal quantities", () => {
  const duplicate = createSaleSchema.safeParse({
    paymentMethod: PaymentMethod.CASH,
    items: [
      { productId: "product-1", quantity: "1", unitPrice: "1500" },
      { productId: "product-1", quantity: "1", unitPrice: "1500" },
    ],
  });
  const decimalQuantity = createSaleSchema.safeParse({
    paymentMethod: PaymentMethod.CASH,
    items: [{ productId: "product-1", quantity: "1.5", unitPrice: "1500" }],
  });

  assert.equal(duplicate.success, false);
  assert.match(
    duplicate.success ? "" : duplicate.error.issues[0]?.message ?? "",
    /only appear once/i,
  );
  assert.equal(decimalQuantity.success, false);
  assert.match(
    decimalQuantity.success
      ? ""
      : decimalQuantity.error.issues[0]?.message ?? "",
    /whole number/i,
  );
});

test("createSaleSchema requires a retailer account for retailer sales", () => {
  const missingRetailer = createSaleSchema.safeParse({
    customerType: CustomerType.RETAILER,
    paymentMethod: PaymentMethod.CREDIT,
    items: [{ productId: "product-1", quantity: "2", unitPrice: "1500" }],
  });
  const wrongPayment = createSaleSchema.safeParse({
    customerType: CustomerType.RETAILER,
    retailerId: "retailer-1",
    paymentMethod: PaymentMethod.CASH,
    items: [{ productId: "product-1", quantity: "2", unitPrice: "1500" }],
  });

  assert.equal(missingRetailer.success, false);
  assert.match(
    missingRetailer.success
      ? ""
      : missingRetailer.error.issues[0]?.message ?? "",
    /select a retailer/i,
  );
  assert.equal(wrongPayment.success, false);
  assert.match(
    wrongPayment.success ? "" : wrongPayment.error.issues[0]?.message ?? "",
    /must use credit/i,
  );
});

test("recordReturnSchema requires a sale item when returning goods to stock", () => {
  const result = recordReturnSchema.safeParse({
    productId: "product-1",
    disposition: SalesReturnDisposition.RETURN_TO_STOCK,
    quantity: "1",
  });

  assert.equal(result.success, false);
  assert.match(
    result.success ? "" : result.error.issues[0]?.message ?? "",
    /select a sale item/i,
  );
});

test("recordReturnSchema allows unsold damaged stock with a product", () => {
  const result = recordReturnSchema.safeParse({
    productId: "product-1",
    disposition: SalesReturnDisposition.DAMAGED,
    quantity: "1",
    reason: "Dropped tray",
  });

  assert.equal(result.success, true);
});

test("recordRetailerPaymentSchema rejects credit repayments", () => {
  const result = recordRetailerPaymentSchema.safeParse({
    amount: "5000",
    paymentMethod: PaymentMethod.CREDIT,
  });

  assert.equal(result.success, false);
  assert.match(
    result.success ? "" : result.error.issues[0]?.message ?? "",
    /cash, transfer, or pos/i,
  );
});
