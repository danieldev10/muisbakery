import { PaymentMethod, SalesReturnDisposition } from "@prisma/client";
import { z } from "zod";

const optionalText = (max = 300) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().max(max).optional(),
  );

const nullableText = (max = 300) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    z.string().trim().max(max).nullable().optional(),
  );

const optionalDate = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z.coerce.date().optional(),
);

const quantitySchema = z.coerce
  .number()
  .positive("Quantity must be greater than zero.")
  .max(99_999_999)
  .refine(Number.isInteger, {
    message: "Quantity must be a whole number.",
  });

const moneySchema = z.coerce
  .number()
  .nonnegative("Amount cannot be negative.")
  .max(999_999_999);

const nonnegativeQuantitySchema = z.coerce
  .number()
  .nonnegative("Quantity cannot be negative.")
  .max(99_999_999)
  .refine(Number.isInteger, {
    message: "Quantity must be a whole number.",
  });

const optionalMoneySchema = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  moneySchema.optional(),
);

const nullableMoneySchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  moneySchema.nullable().optional(),
);

const saleItemSchema = z.object({
  productId: z.string().trim().min(1),
  quantity: quantitySchema,
  unitPrice: optionalMoneySchema,
});

export const createSaleSchema = z
  .object({
    paymentMethod: z.enum(PaymentMethod),
    customerName: optionalText(160),
    soldAt: optionalDate,
    discount: optionalMoneySchema,
    amountPaid: optionalMoneySchema,
    notes: optionalText(500),
    items: z.array(saleItemSchema).min(1, "Add at least one sale item."),
  })
  .superRefine((value, context) => {
    const productIds = new Set<string>();

    value.items.forEach((item, index) => {
      if (productIds.has(item.productId)) {
        context.addIssue({
          code: "custom",
          message: "Each product can only appear once on a sale.",
          path: ["items", index, "productId"],
        });
      }
      productIds.add(item.productId);
    });
  });

export const recordReturnSchema = z
  .object({
    saleItemId: z.preprocess(
      (value) =>
        typeof value === "string" && value.trim() === "" ? undefined : value,
      z.string().trim().min(1).optional(),
    ),
    productId: z.preprocess(
      (value) =>
        typeof value === "string" && value.trim() === "" ? undefined : value,
      z.string().trim().min(1).optional(),
    ),
    disposition: z.enum(SalesReturnDisposition),
    quantity: quantitySchema,
    reason: optionalText(500),
    recordedAt: optionalDate,
  })
  .superRefine((value, context) => {
    if (
      value.disposition === SalesReturnDisposition.RETURN_TO_STOCK &&
      !value.saleItemId
    ) {
      context.addIssue({
        code: "custom",
        message: "Select a sale item before returning goods to stock.",
        path: ["saleItemId"],
      });
    }

    if (!value.saleItemId && !value.productId) {
      context.addIssue({
        code: "custom",
        message: "Select a product or a sale item.",
        path: ["productId"],
      });
    }
  });

export const createPosTerminalSchema = z.object({
  name: optionalText(100),
});

export const createPosSessionSchema = z.object({
  customerName: optionalText(160),
  terminalId: optionalText(80),
});

export const updatePosSessionSchema = z.object({
  customerName: nullableText(160),
  paymentMethod: z.enum(PaymentMethod).optional(),
  discount: optionalMoneySchema,
  amountPaid: nullableMoneySchema,
  notes: nullableText(500),
});

export const upsertPosSessionItemSchema = z.object({
  productId: z.string().trim().min(1),
  quantity: nonnegativeQuantitySchema,
  unitPrice: optionalMoneySchema,
});

export type CreateSaleInput = z.infer<typeof createSaleSchema>;
