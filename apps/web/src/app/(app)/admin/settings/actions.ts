"use server";

import { revalidatePath } from "next/cache";

import { getOptionalString, getString } from "@/lib/admin/form-data";
import type { FormState } from "@/lib/admin/types";
import { apiSend } from "@/lib/server-api";

const PATH = "/admin/settings";

export async function createUnit(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await apiSend("/admin/units", "POST", {
    name: getString(formData, "name"),
    abbreviation: getString(formData, "abbreviation"),
  });

  if (!result.ok) {
    return { ok: false, error: result.message };
  }

  revalidatePath(PATH);
  return { ok: true, error: null, token: Date.now() };
}

export async function setUnitActive(formData: FormData): Promise<void> {
  await apiSend(`/admin/units/${getString(formData, "id")}`, "PATCH", {
    isActive: formData.get("isActive") === "true",
  });
  revalidatePath(PATH);
}

export async function createExpenseCategory(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await apiSend("/admin/expense-categories", "POST", {
    name: getString(formData, "name"),
    description: getOptionalString(formData, "description"),
  });

  if (!result.ok) {
    return { ok: false, error: result.message };
  }

  revalidatePath(PATH);
  return { ok: true, error: null, token: Date.now() };
}

export async function setExpenseCategoryActive(
  formData: FormData,
): Promise<void> {
  await apiSend(
    `/admin/expense-categories/${getString(formData, "id")}`,
    "PATCH",
    { isActive: formData.get("isActive") === "true" },
  );
  revalidatePath(PATH);
}

export async function updateApprovalSettings(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await apiSend(PATH, "PATCH", {
    requireMaterialRequestApproval:
      formData.get("requireMaterialRequestApproval") === "on",
    requireStockAdjustmentApproval:
      formData.get("requireStockAdjustmentApproval") === "on",
  });

  if (!result.ok) {
    return { ok: false, error: result.message };
  }

  revalidatePath(PATH);
  return { ok: true, error: null, token: Date.now() };
}
