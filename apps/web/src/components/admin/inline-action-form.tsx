"use client";

import type { ReactNode } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { initialFormState, type FormState } from "@/lib/admin/types";

type InlineAction = (
  state: FormState,
  formData: FormData,
) => Promise<FormState>;

const defaultButtonClassName =
  "rounded-md border border-stone-300 px-2 py-1 text-xs font-medium text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50";

function InlineSubmitButton({
  children,
  className,
  pendingLabel,
}: {
  children: ReactNode;
  className?: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      className={className ?? defaultButtonClassName}
      disabled={pending}
      type="submit"
    >
      {pending ? pendingLabel : children}
    </button>
  );
}

export function InlineActionForm({
  action,
  buttonClassName,
  children,
  className = "grid gap-1",
  pendingLabel = "Saving",
  submitLabel,
  successMessage,
}: {
  action: InlineAction;
  buttonClassName?: string;
  children?: ReactNode;
  className?: string;
  pendingLabel?: string;
  submitLabel: ReactNode;
  successMessage?: string;
}) {
  const [state, formAction] = useActionState(action, initialFormState);

  return (
    <form action={formAction} className={className}>
      {children}
      <InlineSubmitButton
        className={buttonClassName}
        pendingLabel={pendingLabel}
      >
        {submitLabel}
      </InlineSubmitButton>
      {state.error ? (
        <p className="max-w-56 text-xs text-red-700">{state.error}</p>
      ) : null}
      {successMessage && state.ok ? (
        <p className="text-xs text-emerald-700">{successMessage}</p>
      ) : null}
    </form>
  );
}
