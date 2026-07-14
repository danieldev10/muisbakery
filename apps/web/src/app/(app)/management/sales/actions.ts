"use server";

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

  return { ok: true, error: null, token: Date.now() };
}

export async function reopenDayClose(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = getString(formData, "id");
  const result = await apiSend(`/management/day-closes/${id}/reopen`, "POST", {
    reason: getString(formData, "reason"),
  });

  if (!result.ok) {
    return { ok: false, error: result.message };
  }

  return { ok: true, error: null, token: Date.now() };
}

export async function overrideDayCloseReadiness(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const terminalIds = formData
    .getAll("terminalIds")
    .filter((value): value is string => typeof value === "string" && Boolean(value));
  const result = await apiSend(
    "/management/day-close-readiness/override",
    "POST",
    {
      date: getString(formData, "date"),
      terminalIds,
      reason: getString(formData, "reason"),
    },
  );

  if (!result.ok) {
    return { ok: false, error: result.message };
  }

  return { ok: true, error: null, token: Date.now() };
}
