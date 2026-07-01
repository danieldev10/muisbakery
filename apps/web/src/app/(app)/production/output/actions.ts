"use server";

import { revalidatePath } from "next/cache";

import { getOptionalString, getString } from "@/lib/admin/form-data";
import type { FormState } from "@/lib/admin/types";
import { apiSend } from "@/lib/server-api";

export async function createProductionRun(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const materialUsages = [...formData.entries()]
    .filter(
      (entry): entry is [string, string] =>
        entry[0].startsWith("usage:") &&
        typeof entry[1] === "string" &&
        entry[1].trim() !== "",
    )
    .map(([key, quantity]) => ({
      rawMaterialId: key.slice("usage:".length),
      quantity,
    }));

  const result = await apiSend("/production/runs", "POST", {
    productId: getString(formData, "productId"),
    quantityProduced: getString(formData, "quantityProduced"),
    quantityTransferred: getOptionalString(formData, "quantityTransferred"),
    wasteQuantity: getOptionalString(formData, "wasteQuantity"),
    wasteReason: getOptionalString(formData, "wasteReason"),
    producedAt: getOptionalString(formData, "producedAt"),
    notes: getOptionalString(formData, "notes"),
    materialUsages,
  });

  if (!result.ok) {
    return { ok: false, error: result.message };
  }

  revalidatePath("/production/output");
  revalidatePath("/production/inventory");
  revalidatePath("/production/runs");
  revalidatePath("/production/waste");
  revalidatePath("/sales/inventory");
  return { ok: true, error: null, token: Date.now() };
}
