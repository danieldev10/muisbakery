"use server";

import { revalidatePath } from "next/cache";

import { getOptionalString, getString } from "@/lib/admin/form-data";
import type { FormState } from "@/lib/admin/types";
import { apiSend } from "@/lib/server-api";

const PATH = "/admin/retailers";

function revalidateRetailerViews() {
  revalidatePath(PATH);
  revalidatePath("/sales/retailers");
  revalidatePath("/sales/pos");
  revalidatePath("/sales/record-sale");
  revalidatePath("/sales/daily-summary");
  revalidatePath("/management/sales");
  revalidatePath("/management/profit-loss");
}

export async function createRetailer(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await apiSend(PATH, "POST", {
    name: getString(formData, "name"),
    contactPerson: getOptionalString(formData, "contactPerson"),
    phone: getOptionalString(formData, "phone"),
    email: getOptionalString(formData, "email"),
    address: getOptionalString(formData, "address"),
    creditLimit: getString(formData, "creditLimit"),
    notes: getOptionalString(formData, "notes"),
  });

  if (!result.ok) {
    return { ok: false, error: result.message };
  }

  revalidateRetailerViews();
  return { ok: true, error: null, token: Date.now() };
}

export async function updateRetailer(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await apiSend(`${PATH}/${getString(formData, "id")}`, "PATCH", {
    name: getString(formData, "name"),
    contactPerson: getOptionalString(formData, "contactPerson") ?? null,
    phone: getOptionalString(formData, "phone") ?? null,
    email: getOptionalString(formData, "email") ?? null,
    address: getOptionalString(formData, "address") ?? null,
    creditLimit: getString(formData, "creditLimit"),
    notes: getOptionalString(formData, "notes") ?? null,
    isActive: getString(formData, "isActive") === "true",
  });

  if (!result.ok) {
    return { ok: false, error: result.message };
  }

  revalidateRetailerViews();
  return { ok: true, error: null, token: Date.now() };
}
