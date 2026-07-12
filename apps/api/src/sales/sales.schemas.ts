import {
  CustomerType,
  PaymentMethod,
  RetailerOrderApprovalStatus,
  SalesReturnDisposition,
} from "@prisma/client";
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

const optionalId = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().min(1).optional(),
);

const nullableId = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  z.string().trim().min(1).nullable().optional(),
);

const pairingCodeSchema = z
  .string()
  .trim()
  .min(6, "Pairing code must be at least 6 characters.")
  .max(64, "Pairing code is too long.");

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
    customerType: z.enum(CustomerType).default(CustomerType.INDIVIDUAL),
    retailerId: optionalId,
    retailerApprovalId: optionalId,
    terminalId: optionalId,
    clientRequestId: optionalText(120),
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

    if (value.customerType === CustomerType.RETAILER) {
      if (!value.retailerId) {
        context.addIssue({
          code: "custom",
          message: "Select a retailer for retailer sales.",
          path: ["retailerId"],
        });
      }
    }

    if (value.customerType === CustomerType.INDIVIDUAL && value.retailerId) {
      context.addIssue({
        code: "custom",
        message: "Retailer can only be selected for retailer sales.",
        path: ["retailerId"],
      });
    }

    if (
      value.customerType === CustomerType.INDIVIDUAL &&
      value.retailerApprovalId
    ) {
      context.addIssue({
        code: "custom",
        message: "Retailer approval can only be selected for retailer sales.",
        path: ["retailerApprovalId"],
      });
    }

    if (
      value.customerType === CustomerType.RETAILER &&
      value.paymentMethod !== PaymentMethod.CREDIT &&
      value.retailerApprovalId
    ) {
      context.addIssue({
        code: "custom",
        message: "Retailer approval is only needed for credit sales.",
        path: ["retailerApprovalId"],
      });
    }
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
  pairingCode: pairingCodeSchema,
  offlineEnabled: z.coerce.boolean().optional(),
});

export const updatePosTerminalSchema = z
  .object({
    name: nullableText(100),
    pairingCode: z.preprocess(
      (value) =>
        typeof value === "string" && value.trim() === "" ? undefined : value,
      pairingCodeSchema.optional(),
    ),
    isActive: z.coerce.boolean().optional(),
    offlineEnabled: z.coerce.boolean().optional(),
    rotateDisplayToken: z.coerce.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "No changes provided.",
  });

export const pairPosTerminalSchema = z.object({
  terminalId: z.string().trim().min(1),
  pairingCode: pairingCodeSchema,
});

export const setTerminalStockAllocationSchema = z.object({
  productId: z.string().trim().min(1),
  allocatedQuantity: nonnegativeQuantitySchema,
});

export const setTerminalRetailerCreditAllocationSchema = z.object({
  retailerId: z.string().trim().min(1),
  allocatedAmount: moneySchema.refine((value) => value > 0, {
    message: "Allocated amount must be greater than zero.",
  }),
  isActive: z.coerce.boolean().default(true),
});

export const createPosSessionSchema = z.object({
  customerType: z.enum(CustomerType).default(CustomerType.INDIVIDUAL),
  retailerId: optionalId,
  retailerApprovalId: optionalId,
  customerName: optionalText(160),
  terminalId: optionalText(80),
});

export const updatePosSessionSchema = z.object({
  customerType: z.enum(CustomerType).optional(),
  retailerId: nullableId,
  retailerApprovalId: nullableId,
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

export const createRetailerSchema = z.object({
  name: z.string().trim().min(1, "Retailer name is required.").max(160),
  contactPerson: optionalText(120),
  phone: optionalText(40),
  email: optionalText(160),
  address: optionalText(300),
  notes: optionalText(500),
});

export const updateRetailerSchema = z.object({
  name: optionalText(160),
  contactPerson: nullableText(120),
  phone: nullableText(40),
  email: nullableText(160),
  address: nullableText(300),
  notes: nullableText(500),
  isActive: z.coerce.boolean().optional(),
});

export const createRetailerOrderApprovalSchema = z.object({
  approvedAmount: moneySchema.positive("Approved amount must be greater than zero."),
  terminalId: optionalId,
  reason: optionalText(500),
  expiresAt: optionalDate,
});

export const requestRetailerOrderApprovalSchema = z.object({
  requestedAmount: moneySchema.positive("Requested amount must be greater than zero."),
  terminalId: optionalId,
  reason: optionalText(500),
});

export const updateRetailerOrderApprovalSchema = z.object({
  status: z.enum(RetailerOrderApprovalStatus),
});

export const recordRetailerPaymentSchema = z.object({
  amount: moneySchema.positive("Payment amount must be greater than zero."),
  paymentMethod: z.enum(PaymentMethod).refine(
    (method) => method !== PaymentMethod.CREDIT,
    "Retailer repayments must be received by cash, transfer, or POS.",
  ),
  paidAt: optionalDate,
  reference: optionalText(120),
  notes: optionalText(500),
});

export type CreateSaleInput = z.infer<typeof createSaleSchema>;
