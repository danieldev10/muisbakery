"use server";

import { revalidatePath } from "next/cache";

import { getOptionalString, getString } from "@/lib/admin/form-data";
import type { FormState } from "@/lib/admin/types";
import { apiSend } from "@/lib/server-api";

const PATH = "/admin/users";

export async function createUser(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await apiSend(PATH, "POST", {
    name: getOptionalString(formData, "name"),
    email: getString(formData, "email"),
    recoveryEmail: getOptionalString(formData, "recoveryEmail"),
    password: getString(formData, "password"),
    role: getString(formData, "role"),
  });

  if (!result.ok) {
    return { ok: false, error: result.message };
  }

  revalidatePath(PATH);
  return { ok: true, error: null, token: Date.now() };
}

export async function updateUser(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const password = getOptionalString(formData, "password");
  const recoveryEmail = getOptionalString(formData, "recoveryEmail");
  const result = await apiSend(`${PATH}/${getString(formData, "id")}`, "PATCH", {
    name: getOptionalString(formData, "name"),
    email: getString(formData, "email"),
    recoveryEmail: recoveryEmail ?? null,
    role: getString(formData, "role"),
    isActive: getString(formData, "isActive") === "true",
    ...(password ? { password } : {}),
  });

  if (!result.ok) {
    return { ok: false, error: result.message };
  }

  revalidatePath(PATH);
  return { ok: true, error: null, token: Date.now() };
}
