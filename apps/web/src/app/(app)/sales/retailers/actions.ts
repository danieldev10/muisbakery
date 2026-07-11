"use server";

import { revalidatePath } from "next/cache";

import { getOptionalString, getString } from "@/lib/admin/form-data";
import type { FormState } from "@/lib/admin/types";
import { apiSend } from "@/lib/server-api";

const PATH = "/sales/retailers";

function revalidateRetailerViews() {
  revalidatePath(PATH);
  revalidatePath("/admin/retailers");
  revalidatePath("/sales/pos");
  revalidatePath("/sales/record-sale");
  revalidatePath("/sales/daily-summary");
  revalidatePath("/management/sales");
  revalidatePath("/management/profit-loss");
}

export async function recordRetailerPayment(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await apiSend(
    `/sales/retailers/${getString(formData, "retailerId")}/payments`,
    "POST",
    {
      amount: getString(formData, "amount"),
      paymentMethod: getString(formData, "paymentMethod"),
      paidAt: getOptionalString(formData, "paidAt"),
      reference: getOptionalString(formData, "reference"),
      notes: getOptionalString(formData, "notes"),
    },
  );

  if (!result.ok) {
    return { ok: false, error: result.message };
  }

  revalidateRetailerViews();
  return { ok: true, error: null, token: Date.now() };
}
