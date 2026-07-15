"use server";

import { revalidatePath } from "next/cache";

import { getString } from "@/lib/admin/form-data";
import type { FormState } from "@/lib/admin/types";
import { apiSend } from "@/lib/server-api";

export async function updateRawMaterialUnitCost(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const rawMaterialId = getString(formData, "id");
  const result = await apiSend(
    `/management/raw-materials/${rawMaterialId}/unit-cost`,
    "PATCH",
    {
      unitCost: getString(formData, "unitCost"),
    },
  );

  if (!result.ok) {
    return { ok: false, error: result.message };
  }

  revalidatePath("/management/inventory/raw-materials");
  revalidatePath(`/management/inventory/raw-materials/${rawMaterialId}`);
  revalidatePath("/management/dashboard");
  revalidatePath("/management/profit-loss");
  return { ok: true, error: null, token: Date.now() };
}
