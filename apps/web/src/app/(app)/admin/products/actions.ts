"use server";

import { revalidatePath } from "next/cache";

import { getOptionalString, getString } from "@/lib/admin/form-data";
import type { FormState } from "@/lib/admin/types";
import { apiSend } from "@/lib/server-api";

const PATH = "/admin/products";

export async function createProduct(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await apiSend(PATH, "POST", {
    name: getString(formData, "name"),
    size: getOptionalString(formData, "size"),
    description: getOptionalString(formData, "description"),
    unitId: getString(formData, "unitId"),
    unitPrice: getOptionalString(formData, "unitPrice"),
  });

  if (!result.ok) {
    return { ok: false, error: result.message };
  }

  revalidatePath(PATH);
  return { ok: true, error: null, token: Date.now() };
}

export async function updateProduct(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await apiSend(`${PATH}/${getString(formData, "id")}`, "PATCH", {
    name: getString(formData, "name"),
    size: getOptionalString(formData, "size") ?? "",
    description: getOptionalString(formData, "description") ?? null,
    unitId: getString(formData, "unitId"),
    unitPrice: getOptionalString(formData, "unitPrice") ?? null,
    isActive: getString(formData, "isActive") === "true",
  });

  if (!result.ok) {
    return { ok: false, error: result.message };
  }

  revalidatePath(PATH);
  return { ok: true, error: null, token: Date.now() };
}
