"use server";

import { revalidatePath } from "next/cache";

import { getOptionalString, getString } from "@/lib/admin/form-data";
import type { FormState } from "@/lib/admin/types";
import { apiSend } from "@/lib/server-api";

function revalidateSales() {
  revalidatePath("/sales/returns");
  revalidatePath("/sales/inventory");
  revalidatePath("/sales/record-sale");
  revalidatePath("/sales/daily-summary");
}

export async function recordDamagedStock(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await apiSend("/sales/returns", "POST", {
    productId: getString(formData, "productId"),
    disposition: "DAMAGED",
    quantity: getString(formData, "quantity"),
    reason: getOptionalString(formData, "reason"),
    recordedAt: getOptionalString(formData, "recordedAt"),
  });

  if (!result.ok) {
    return { ok: false, error: result.message };
  }

  revalidateSales();
  return { ok: true, error: null, token: Date.now() };
}

export async function recordCustomerReturn(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await apiSend("/sales/returns", "POST", {
    saleItemId: getString(formData, "saleItemId"),
    disposition: getString(formData, "disposition"),
    quantity: getString(formData, "quantity"),
    reason: getOptionalString(formData, "reason"),
    recordedAt: getOptionalString(formData, "recordedAt"),
  });

  if (!result.ok) {
    return { ok: false, error: result.message };
  }

  revalidateSales();
  return { ok: true, error: null, token: Date.now() };
}
