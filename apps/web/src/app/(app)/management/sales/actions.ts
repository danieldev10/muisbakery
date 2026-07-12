"use server";

import { revalidatePath } from "next/cache";

import { getString } from "@/lib/admin/form-data";
import type { FormState } from "@/lib/admin/types";
import { apiSend } from "@/lib/server-api";

export async function approveDayClose(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = getString(formData, "id");
  const result = await apiSend(`/management/day-closes/${id}/approve`, "POST", {
    notes: getString(formData, "notes") || undefined,
  });

  if (!result.ok) {
    return { ok: false, error: result.message };
  }

  revalidatePath("/management/sales");
  revalidatePath("/sales/daily-summary");
  return { ok: true, error: null, token: Date.now() };
}
