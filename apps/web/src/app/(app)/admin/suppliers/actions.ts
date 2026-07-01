"use server";

import { revalidatePath } from "next/cache";

import { getOptionalString, getString } from "@/lib/admin/form-data";
import type { FormState } from "@/lib/admin/types";
import { apiSend } from "@/lib/server-api";

const PATH = "/admin/suppliers";

export async function createSupplier(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await apiSend(PATH, "POST", {
    name: getString(formData, "name"),
    contactName: getOptionalString(formData, "contactName"),
    phone: getOptionalString(formData, "phone"),
    email: getOptionalString(formData, "email"),
    address: getOptionalString(formData, "address"),
    notes: getOptionalString(formData, "notes"),
  });

  if (!result.ok) {
    return { ok: false, error: result.message };
  }

  revalidatePath(PATH);
  return { ok: true, error: null, token: Date.now() };
}

export async function setSupplierActive(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await apiSend(`${PATH}/${getString(formData, "id")}`, "PATCH", {
    isActive: formData.get("isActive") === "true",
  });

  if (!result.ok) {
    return { ok: false, error: result.message };
  }

  revalidatePath(PATH);
  return { ok: true, error: null, token: Date.now() };
}
