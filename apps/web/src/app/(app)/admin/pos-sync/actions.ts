"use server";

import { revalidatePath } from "next/cache";

import { getString } from "@/lib/admin/form-data";
import type { FormState } from "@/lib/admin/types";
import { apiSend } from "@/lib/server-api";

const PATH = "/admin/pos-sync";

export async function retryOfflineSyncAttempt(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await apiSend(
    `/admin/pos-terminals/offline-sync/${getString(formData, "id")}/retry`,
    "POST",
    {},
  );

  if (!result.ok) {
    return { ok: false, error: result.message };
  }

  revalidatePath(PATH);
  return { ok: true, error: null, token: Date.now() };
}
