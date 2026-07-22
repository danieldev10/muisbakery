"use server";

import { revalidatePath } from "next/cache";

import { getOptionalString, getString } from "@/lib/admin/form-data";
import type { FormState } from "@/lib/admin/types";
import { apiSend } from "@/lib/server-api";

export async function createSale(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const items = [...formData.entries()]
    .filter(
      (entry): entry is [string, string] =>
        entry[0].startsWith("quantity:") &&
        typeof entry[1] === "string" &&
        entry[1].trim() !== "" &&
        Number(entry[1]) > 0,
    )
    .map(([key, quantity]) => ({
      productId: key.slice("quantity:".length),
      quantity,
    }));

  const result = await apiSend("/sales/sales", "POST", {
    customerType: getString(formData, "customerType"),
    retailerId: getOptionalString(formData, "retailerId"),
    retailerApprovalId: getOptionalString(formData, "retailerApprovalId"),
    paymentMethod: getString(formData, "paymentMethod"),
    customerName: getOptionalString(formData, "customerName"),
    soldAt: getOptionalString(formData, "soldAt"),
    discount: getOptionalString(formData, "discount"),
    amountPaid: getOptionalString(formData, "amountPaid"),
    notes: getOptionalString(formData, "notes"),
    items,
  });

  if (!result.ok) {
    return { ok: false, error: result.message };
  }

  revalidatePath("/sales/record-sale");
  revalidatePath("/sales/retailers");
  revalidatePath("/sales/inventory");
  revalidatePath("/sales/daily-summary");
  revalidatePath("/sales/returns");

  return { ok: true, error: null, token: Date.now() };
}
