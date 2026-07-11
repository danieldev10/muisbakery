"use server";

import { revalidatePath } from "next/cache";

import { getString } from "@/lib/admin/form-data";
import type { FormState } from "@/lib/admin/types";
import { apiSend } from "@/lib/server-api";

const PATH = "/admin/units";

function revalidateUnitViews() {
  revalidatePath(PATH);
  revalidatePath("/admin/raw-materials");
  revalidatePath("/admin/products");
  revalidatePath("/admin/recipes");
}

export async function createUnit(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await apiSend("/admin/units", "POST", {
    name: getString(formData, "name"),
    abbreviation: getString(formData, "abbreviation"),
  });

  if (!result.ok) {
    return { ok: false, error: result.message };
  }

  revalidateUnitViews();
  return { ok: true, error: null, token: Date.now() };
}

export async function updateUnit(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await apiSend(
    `/admin/units/${getString(formData, "id")}`,
    "PATCH",
    {
      name: getString(formData, "name"),
      abbreviation: getString(formData, "abbreviation"),
      isActive: getString(formData, "isActive") === "true",
    },
  );

  if (!result.ok) {
    return { ok: false, error: result.message };
  }

  revalidateUnitViews();
  return { ok: true, error: null, token: Date.now() };
}
