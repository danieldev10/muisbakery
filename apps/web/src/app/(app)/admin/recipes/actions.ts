"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getOptionalString, getString } from "@/lib/admin/form-data";
import type { FormState } from "@/lib/admin/types";
import { apiSend } from "@/lib/server-api";

const PATH = "/admin/recipes";

function collectItems(formData: FormData) {
  const rawMaterialIds = formData.getAll("rawMaterialId").map(String);
  const quantities = formData.getAll("quantity").map(String);
  const unitIds = formData.getAll("unitId").map(String);

  return rawMaterialIds
    .map((rawMaterialId, index) => ({
      rawMaterialId,
      quantity: quantities[index] ?? "",
      unitId: unitIds[index] ?? "",
    }))
    .filter((item) => item.rawMaterialId && item.unitId && item.quantity);
}

export async function createRecipe(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await apiSend(PATH, "POST", {
    productId: getString(formData, "productId"),
    yieldQuantity: getOptionalString(formData, "yieldQuantity"),
    notes: getOptionalString(formData, "notes"),
    items: collectItems(formData),
  });

  if (!result.ok) {
    return { ok: false, error: result.message };
  }

  revalidatePath(PATH);
  return { ok: true, error: null, token: Date.now() };
}

export async function updateRecipe(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = getString(formData, "id");
  const result = await apiSend(`${PATH}/${id}`, "PATCH", {
    yieldQuantity: getOptionalString(formData, "yieldQuantity"),
    notes: getOptionalString(formData, "notes") ?? null,
    isActive: getString(formData, "isActive") === "true",
    items: collectItems(formData),
  });

  if (!result.ok) {
    return { ok: false, error: result.message };
  }

  revalidatePath(PATH);
  revalidatePath(`${PATH}/${id}`);
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

/** Delete from the detail page, then land back on the recipes list. */
export async function deleteRecipeFromDetail(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await apiSend(`${PATH}/${getString(formData, "id")}`, "DELETE");

  if (!result.ok) {
    return { ok: false, error: result.message };
  }

  revalidatePath(PATH);
  redirect(PATH);
}
