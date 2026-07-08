"use server";

import { revalidatePath } from "next/cache";

import { getOptionalString, getString } from "@/lib/admin/form-data";
import type { FormState } from "@/lib/admin/types";
import { apiSend } from "@/lib/server-api";

export async function issueMaterialRequest(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = getString(formData, "id");
  const result = await apiSend(`/store/material-requests/${id}/issue`, "POST", {
    quantity: getOptionalString(formData, "quantity"),
    notes: getOptionalString(formData, "notes"),
  });

  if (!result.ok) {
    return { ok: false, error: result.message };
  }

  revalidatePath("/store/requests");
  revalidatePath("/store/inventory");
  revalidatePath("/production/requests");
  return { ok: true, error: null, token: Date.now() };
}

export async function rejectMaterialRequest(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = getString(formData, "id");
  const result = await apiSend(
    `/store/material-requests/${id}/reject`,
    "POST",
    {
      notes: getOptionalString(formData, "notes"),
    },
  );

  if (!result.ok) {
    return { ok: false, error: result.message };
  }

  revalidatePath("/store/requests");
  revalidatePath("/production/requests");
  return { ok: true, error: null, token: Date.now() };
}
