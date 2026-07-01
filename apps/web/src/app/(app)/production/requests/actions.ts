"use server";

import { revalidatePath } from "next/cache";

import { getOptionalString, getString } from "@/lib/admin/form-data";
import type { FormState } from "@/lib/admin/types";
import { apiSend } from "@/lib/server-api";

export async function createMaterialRequest(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await apiSend("/production/material-requests", "POST", {
    rawMaterialId: getString(formData, "rawMaterialId"),
    requestedQuantity: getString(formData, "requestedQuantity"),
    neededBy: getOptionalString(formData, "neededBy"),
    notes: getOptionalString(formData, "notes"),
  });

  if (!result.ok) {
    return { ok: false, error: result.message };
  }

  revalidatePath("/production/requests");
  revalidatePath("/store/requests");
  return { ok: true, error: null, token: Date.now() };
}

export async function cancelMaterialRequest(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = getString(formData, "id");
  const result = await apiSend(
    `/production/material-requests/${id}/cancel`,
    "POST",
  );

  if (!result.ok) {
    return { ok: false, error: result.message };
  }

  revalidatePath("/production/requests");
  revalidatePath("/store/requests");
  return { ok: true, error: null, token: Date.now() };
}
