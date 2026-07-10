"use server";

import { revalidatePath } from "next/cache";

import { getString } from "@/lib/admin/form-data";
import type { FormState } from "@/lib/admin/types";
import { apiSend } from "@/lib/server-api";

function revalidateExpenseViews() {
  revalidatePath("/management/expenses");
  revalidatePath("/management/profit-loss");
  revalidatePath("/management/dashboard");
}

export async function createExpense(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await apiSend("/management/expenses", "POST", {
    categoryId: getString(formData, "categoryId"),
    amount: getString(formData, "amount"),
    incurredAt: getString(formData, "incurredAt"),
    vendor: getString(formData, "vendor") || undefined,
    paymentMethod: getString(formData, "paymentMethod"),
    notes: getString(formData, "notes") || undefined,
  });

  if (!result.ok) {
    return { ok: false, error: result.message };
  }

  revalidateExpenseViews();
  return { ok: true, error: null, token: Date.now() };
}

export async function voidExpense(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = getString(formData, "id");
  const result = await apiSend(`/management/expenses/${id}/void`, "POST", {
    reason: getString(formData, "reason"),
  });

  if (!result.ok) {
    return { ok: false, error: result.message };
  }

  revalidateExpenseViews();
  return { ok: true, error: null, token: Date.now() };
}
