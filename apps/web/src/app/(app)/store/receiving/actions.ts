"use server";

import { revalidatePath } from "next/cache";

import { getOptionalString, getString } from "@/lib/admin/form-data";
import type { FormState } from "@/lib/admin/types";
import { apiSend } from "@/lib/server-api";

export async function receiveRawMaterial(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await apiSend("/store/receipts", "POST", {
    rawMaterialId: getString(formData, "rawMaterialId"),
    supplierId: getOptionalString(formData, "supplierId"),
    quantity: getString(formData, "quantity"),
    receivedAt: getOptionalString(formData, "receivedAt"),
    reference: getOptionalString(formData, "reference"),
    notes: getOptionalString(formData, "notes"),
  });

  if (!result.ok) {
    return { ok: false, error: result.message };
  }

  revalidatePath("/store/receiving");
  revalidatePath("/store/inventory");
  return { ok: true, error: null, token: Date.now() };
}
