"use client";

import { useActionState } from "react";

import { FormFeedback, SubmitButton } from "@/components/admin/form-controls";
import { type AppSettings, initialFormState } from "@/lib/admin/types";

import { updateApprovalSettings } from "./actions";

function Toggle({
  name,
  label,
  description,
  defaultChecked,
}: {
  name: string;
  label: string;
  description: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex items-start gap-3" htmlFor={name}>
      <input
        className="mt-1 size-4 rounded border-stone-300 text-red-800 focus:ring-red-700"
        defaultChecked={defaultChecked}
        id={name}
        name={name}
        type="checkbox"
      />
      <span>
        <span className="block text-sm font-medium text-stone-800">
          {label}
        </span>
        <span className="block text-xs text-stone-500">{description}</span>
      </span>
    </label>
  );
}

export function SettingsForm({ settings }: { settings: AppSettings }) {
  const [state, formAction] = useActionState(
    updateApprovalSettings,
    initialFormState,
  );

  return (
    <form action={formAction} className="grid gap-4">
      <Toggle
        defaultChecked={settings.requireMaterialRequestApproval}
        description="Production material requests must be approved before the store issues stock."
        label="Require approval for material requests"
        name="requireMaterialRequestApproval"
      />
      <Toggle
        defaultChecked={settings.requireStockAdjustmentApproval}
        description="Stock adjustments must be approved before they apply."
        label="Require approval for stock adjustments"
        name="requireStockAdjustmentApproval"
      />
      <FormFeedback state={state} />
      <div>
        <SubmitButton>Save settings</SubmitButton>
      </div>
    </form>
  );
}
