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
    password: getString(formData, "password"),
    role: getString(formData, "role"),
  });

  if (!result.ok) {
    return { ok: false, error: result.message };
  }

  revalidatePath(PATH);
  return { ok: true, error: null, token: Date.now() };
}

export async function setUserActive(formData: FormData): Promise<void> {
  await apiSend(`${PATH}/${getString(formData, "id")}`, "PATCH", {
    isActive: formData.get("isActive") === "true",
  });
  revalidatePath(PATH);
}

export async function setUserRole(formData: FormData): Promise<void> {
  await apiSend(`${PATH}/${getString(formData, "id")}`, "PATCH", {
    role: getString(formData, "role"),
  });
  revalidatePath(PATH);
}
