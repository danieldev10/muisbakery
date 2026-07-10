"use client";

import { PackagePlus, X } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";

import {
  Field,
  FormFeedback,
  SelectField,
  SubmitButton,
} from "@/components/admin/form-controls";
import { EmptyState } from "@/components/admin/layout";
import { initialFormState, type FormState } from "@/lib/admin/types";

type FormAction = (
  state: FormState,
  formData: FormData,
) => Promise<FormState>;

type SelectOption = {
  value: string;
  label: string;
};

export function ReceiveMaterialModal({
  action,
  materialOptions,
  supplierOptions,
}: {
  action: FormAction;
  materialOptions: SelectOption[];
  supplierOptions: SelectOption[];
}) {
  const [open, setOpen] = useState(false);
  const hasMaterials = materialOptions.length > 0;

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  return (
    <>
      <button
        className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-[5px] border border-[var(--brand-burgundy-dark)] bg-[var(--brand-burgundy)] px-4 text-sm font-semibold text-white shadow-[var(--shadow-whisper)] transition hover:bg-[var(--brand-burgundy-dark)] disabled:cursor-not-allowed disabled:border-[color:var(--border-muted)] disabled:bg-[#b2b6bd]"
        onClick={() => setOpen(true)}
        title={
          hasMaterials
            ? "Receive stock"
            : "Active raw materials are required before Store can receive stock."
        }
        type="button"
      >
        <PackagePlus aria-hidden className="size-4" />
        Receive stock
      </button>

      {open ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[var(--brand-near-black)]/60 px-4 py-6 backdrop-blur-sm"
          role="dialog"
        >
          <div className="flex max-h-[calc(100dvh-3rem)] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-white/10 bg-white shadow-[var(--shadow-panel)]">
            <div className="shrink-0 flex items-start justify-between gap-4 border-b border-[color:var(--border-muted)] px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[1.3px] text-[var(--brand-burgundy)]">
                  Store receiving
                </p>
                <h2 className="mt-1 text-xl font-semibold leading-tight text-[var(--text-primary)]">
                  Receive stock
                </h2>
                <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">
                  Record a raw material receipt and create or update the daily
                  FIFO batch.
                </p>
              </div>
              <button
                aria-label="Close modal"
                className="inline-flex size-9 items-center justify-center rounded-[5px] border border-[color:var(--border-muted)] bg-white text-[var(--text-secondary)] transition hover:border-[var(--brand-burgundy)] hover:bg-[var(--surface-warm)] hover:text-[var(--brand-burgundy)]"
                onClick={() => setOpen(false)}
                type="button"
              >
                <X aria-hidden className="size-4" />
              </button>
            </div>

            <div className="min-h-0 overflow-y-auto overscroll-contain p-5">
              {hasMaterials ? (
                <ReceiveMaterialForm
                  action={action}
                  materialOptions={materialOptions}
                  onClose={() => setOpen(false)}
                  supplierOptions={supplierOptions}
                />
              ) : (
                <EmptyState>
                  Active raw materials are required before Store can receive
                  stock.
                </EmptyState>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function ReceiveMaterialForm({
  action,
  materialOptions,
  onClose,
  supplierOptions,
}: {
  action: FormAction;
  materialOptions: SelectOption[];
  onClose: () => void;
  supplierOptions: SelectOption[];
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      onClose();
    }
  }, [onClose, state.ok, state.token]);

  return (
    <form action={formAction} className="grid gap-4" ref={formRef}>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Raw material"
          name="rawMaterialId"
          options={materialOptions}
          placeholder="Select material"
          required
        />
        <SelectField
          label="Supplier"
          name="supplierId"
          options={supplierOptions}
          placeholder="No supplier selected"
        />
        <Field
          label="Quantity"
          min="1"
          name="quantity"
          placeholder="0"
          required
          step="1"
          type="number"
        />
        <Field
          label="Reference"
          name="reference"
          placeholder="Invoice or delivery note"
        />
        <Field
          hint="Optional. Leave blank to use the current date and time."
          label="Received at"
          name="receivedAt"
          type="datetime-local"
        />

      </div>
      {state.error ? <FormFeedback state={state} /> : null}
      <div className="flex justify-end gap-2">
        <button
          className="inline-flex h-10 items-center justify-center rounded-[5px] border border-[color:var(--border-muted)] bg-white px-4 text-sm font-semibold text-[var(--text-secondary)] transition hover:bg-[var(--surface-warm)]"
          onClick={onClose}
          type="button"
        >
          Cancel
        </button>
        <SubmitButton>Receive stock</SubmitButton>
      </div>
    </form>
  );
}
