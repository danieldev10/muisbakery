import assert from "node:assert/strict";
import { test } from "node:test";

import { SalePriceType } from "@prisma/client";

import { productPriceForType } from "../src/sales/sales.utils";

const product = {
  unitPrice: 3000,
  retailerPrice: 2700,
  discountPercent: 10,
};

test("product pricing uses configured walk-in and retailer prices", () => {
  assert.equal(productPriceForType(product, SalePriceType.WALK_IN), 3000);
  assert.equal(productPriceForType(product, SalePriceType.RETAILER), 2700);
});

test("discounted pricing derives the amount from the walk-in price", () => {
  assert.equal(productPriceForType(product, SalePriceType.DISCOUNTED), 2700);
});
