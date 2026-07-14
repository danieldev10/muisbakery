"use client";

import type { ReactNode } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Spinner } from "@/components/spinner";
import { initialFormState, type FormState } from "@/lib/admin/types";

type InlineAction = (
  state: FormState,
  formData: FormData,
) => Promise<FormState>;

const defaultButtonClassName =
  "rounded-[5px] border border-[color:var(--border-muted)] bg-white px-2 py-1 text-xs font-medium text-[var(--text-secondary)] shadow-[var(--shadow-whisper)] transition hover:border-[var(--brand-burgundy)] hover:bg-[var(--surface-warm)] disabled:cursor-not-allowed disabled:opacity-50";

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
      {pending ? (
        <span className="inline-flex items-center gap-1.5">
          <Spinner className="size-3" />
          {pendingLabel}
        </span>
      ) : (
        children
      )}
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
        <p className="max-w-56 text-xs text-[var(--brand-burgundy)]">
          {state.error}
        </p>
      ) : null}
      {successMessage && state.ok ? (
        <p className="text-xs text-emerald-700">{successMessage}</p>
      ) : null}
    </form>
  );
}
