"use server";

import { revalidatePath } from "next/cache";

import { getBoolean, getOptionalString, getString } from "@/lib/admin/form-data";
import type { FormState } from "@/lib/admin/types";
import { apiSend } from "@/lib/server-api";

const PATH = "/admin/pos-terminals";

function revalidateTerminalViews() {
  revalidatePath(PATH);
  revalidatePath("/sales/pos");
}

export async function createPosTerminal(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await apiSend("/admin/pos-terminals", "POST", {
    name: getOptionalString(formData, "name"),
    offlineEnabled: getBoolean(formData, "offlineEnabled"),
  });

  if (!result.ok) {
    return { ok: false, error: result.message };
  }

  revalidateTerminalViews();
  return { ok: true, error: null, token: Date.now() };
}

export async function updatePosTerminal(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await apiSend(
    `/admin/pos-terminals/${getString(formData, "id")}`,
    "PATCH",
    {
      name: getOptionalString(formData, "name") ?? null,
      isActive: getBoolean(formData, "isActive"),
      offlineEnabled: getBoolean(formData, "offlineEnabled"),
      rotateDisplayToken: getBoolean(formData, "rotateDisplayToken"),
    },
  );

  if (!result.ok) {
    return { ok: false, error: result.message };
  }

  revalidateTerminalViews();
  return { ok: true, error: null, token: Date.now() };
}
