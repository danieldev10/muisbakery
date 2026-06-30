"use server";

import { revalidatePath } from "next/cache";

import { getOptionalString, getString } from "@/lib/admin/form-data";
import type { FormState } from "@/lib/admin/types";
import { apiSend } from "@/lib/server-api";

const PATH = "/admin/raw-materials";

export async function createRawMaterial(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await apiSend(PATH, "POST", {
    name: getString(formData, "name"),
    description: getOptionalString(formData, "description"),
    baseUnitId: getString(formData, "baseUnitId"),
  });

  if (!result.ok) {
    return { ok: false, error: result.message };
  }

  revalidatePath(PATH);
  return { ok: true, error: null, token: Date.now() };
}

export async function setRawMaterialActive(formData: FormData): Promise<void> {
  await apiSend(`${PATH}/${getString(formData, "id")}`, "PATCH", {
    isActive: formData.get("isActive") === "true",
  });
  revalidatePath(PATH);
}
