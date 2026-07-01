"use server";

import { revalidatePath } from "next/cache";

import { getOptionalString, getString } from "@/lib/admin/form-data";
import type { FormState } from "@/lib/admin/types";
import { apiSend } from "@/lib/server-api";

const PATH = "/admin/recipes";

export async function createRecipe(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const rawMaterialIds = formData.getAll("rawMaterialId").map(String);
  const quantities = formData.getAll("quantity").map(String);
  const unitIds = formData.getAll("unitId").map(String);

  const items = rawMaterialIds
    .map((rawMaterialId, index) => ({
      rawMaterialId,
      quantity: quantities[index] ?? "",
      unitId: unitIds[index] ?? "",
    }))
    .filter((item) => item.rawMaterialId && item.unitId && item.quantity);

  const result = await apiSend(PATH, "POST", {
    productId: getString(formData, "productId"),
    yieldQuantity: getOptionalString(formData, "yieldQuantity"),
    notes: getOptionalString(formData, "notes"),
    items,
  });

  if (!result.ok) {
    return { ok: false, error: result.message };
  }

  revalidatePath(PATH);
  return { ok: true, error: null, token: Date.now() };
}

export async function deleteRecipe(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await apiSend(`${PATH}/${getString(formData, "id")}`, "DELETE");

  if (!result.ok) {
    return { ok: false, error: result.message };
  }

  revalidatePath(PATH);
  return { ok: true, error: null, token: Date.now() };
}
