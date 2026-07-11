"use server";

import { revalidatePath } from "next/cache";

import { getOptionalString, getString } from "@/lib/admin/form-data";
import type { FormState } from "@/lib/admin/types";
import { apiSend } from "@/lib/server-api";

const PATH = "/admin/expense-categories";

function revalidateExpenseCategoryViews() {
  revalidatePath(PATH);
  revalidatePath("/management/expenses");
  revalidatePath("/management/profit-loss");
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

  revalidateExpenseCategoryViews();
  return { ok: true, error: null, token: Date.now() };
}

export async function updateExpenseCategory(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await apiSend(
    `/admin/expense-categories/${getString(formData, "id")}`,
    "PATCH",
    {
      name: getString(formData, "name"),
      description: getOptionalString(formData, "description") ?? null,
      isActive: getString(formData, "isActive") === "true",
    },
  );

  if (!result.ok) {
    return { ok: false, error: result.message };
  }

  revalidateExpenseCategoryViews();
  return { ok: true, error: null, token: Date.now() };
}
