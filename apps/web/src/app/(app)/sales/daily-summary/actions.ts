"use server";

import { revalidatePath } from "next/cache";

import { getString } from "@/lib/admin/form-data";
import type { FormState } from "@/lib/admin/types";
import { apiSend } from "@/lib/server-api";

export async function submitDayClose(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await apiSend("/sales/day-close", "POST", {
    date: getString(formData, "date"),
    countedCash: getString(formData, "countedCash"),
    notes: getString(formData, "notes") || undefined,
  });

  if (!result.ok) {
    return { ok: false, error: result.message };
  }

  revalidatePath("/sales/daily-summary");
  return { ok: true, error: null, token: Date.now() };
}
