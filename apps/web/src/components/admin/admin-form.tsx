"use client";

import { type ReactNode, useActionState, useEffect, useRef } from "react";

import { FormFeedback, SubmitButton } from "./form-controls";
import { type FormState, initialFormState } from "@/lib/admin/types";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

export function AdminForm({
  action,
  submitLabel,
  children,
  resetOnSuccess = true,
}: {
  action: Action;
  submitLabel: string;
  children: ReactNode;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok && resetOnSuccess) {
      formRef.current?.reset();
    }
  }, [state.token, state.ok, resetOnSuccess]);

  return (
    <form action={formAction} className="grid gap-4" ref={formRef}>
      {children}
      <FormFeedback state={state} />
      <div>
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
