"use client";

import { X } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

import { Spinner } from "@/components/spinner";
import { initialFormState, type Product } from "@/lib/admin/types";

import { updateProduct } from "./actions";

const fieldClass =
  "h-10 rounded-[5px] border border-[color:var(--border-muted)] bg-white px-3 text-sm text-[var(--text-primary)] shadow-[var(--shadow-whisper)] outline-none transition focus:border-[var(--brand-burgundy)] focus:ring-4 focus:ring-[var(--focus-ring)]";

const labelClass =
  "text-xs font-semibold uppercase tracking-[1.3px] text-[var(--text-muted)]";

type UnitOption = { value: string; label: string };

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      className="inline-flex h-10 items-center justify-center rounded-[5px] border border-[var(--brand-burgundy-dark)] bg-[var(--brand-burgundy)] px-4 text-sm font-semibold text-white shadow-[var(--shadow-whisper)] transition hover:bg-[var(--brand-burgundy-dark)] disabled:cursor-not-allowed disabled:opacity-50"
      disabled={pending}
      type="submit"
    >
      {pending ? (
        <span className="inline-flex items-center gap-2">
          <Spinner />
          Saving
        </span>
      ) : (
        "Save changes"
      )}
    </button>
  );
}

function EditProductForm({
  onClose,
  product,
  unitOptions,
}: {
  onClose: () => void;
  product: Product;
  unitOptions: UnitOption[];
}) {
  const [state, formAction] = useActionState(updateProduct, initialFormState);

  useEffect(() => {
    if (state.ok) {
      onClose();
    }
  }, [onClose, state.ok]);

  return (
    <form action={formAction} className="grid gap-4">
      <input name="id" type="hidden" value={product.id} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <label className={labelClass} htmlFor={`edit-name-${product.id}`}>
            Name
          </label>
          <input
            className={fieldClass}
            defaultValue={product.name}
            id={`edit-name-${product.id}`}
            name="name"
            required
            type="text"
          />
        </div>

        <div className="grid gap-1.5">
          <label className={labelClass} htmlFor={`edit-size-${product.id}`}>
            Size
          </label>
          <input
            className={fieldClass}
            defaultValue={product.size}
            id={`edit-size-${product.id}`}
            name="size"
            placeholder="e.g. Small, 500g, Family"
            type="text"
          />
        </div>

        <div className="grid gap-1.5">
          <label className={labelClass} htmlFor={`edit-unit-${product.id}`}>
            Unit
          </label>
          <select
            className={fieldClass}
            defaultValue={product.unit.id}
            id={`edit-unit-${product.id}`}
            name="unitId"
          >
            {unitOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-1.5">
          <label className={labelClass} htmlFor={`edit-price-${product.id}`}>
            Default price (₦)
          </label>
          <input
            className={fieldClass}
            defaultValue={product.unitPrice ?? ""}
            id={`edit-price-${product.id}`}
            min="0"
            name="unitPrice"
            placeholder="0.00"
            step="0.01"
            type="number"
          />
        </div>
      </div>

      <div className="grid gap-1.5">
        <label className={labelClass} htmlFor={`edit-description-${product.id}`}>
          Description
        </label>
        <input
          className={fieldClass}
          defaultValue={product.description ?? ""}
          id={`edit-description-${product.id}`}
          name="description"
          placeholder="Optional notes"
          type="text"
        />
      </div>

      <div className="grid gap-1.5">
        <label className={labelClass} htmlFor={`edit-status-${product.id}`}>
          Status
        </label>
        <select
          className={fieldClass}
          defaultValue={product.isActive ? "true" : "false"}
          id={`edit-status-${product.id}`}
          name="isActive"
        >
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
        <p className="text-xs text-[var(--text-muted)]">
          Inactive products disappear from Production and Sales dropdowns but
          keep their history.
        </p>
      </div>

      {state.error ? (
        <p className="rounded-[5px] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.error}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <button
          className="inline-flex h-10 items-center justify-center rounded-[5px] border border-[color:var(--border-muted)] bg-white px-4 text-sm font-semibold text-[var(--text-secondary)] transition hover:bg-[var(--surface-warm)]"
          onClick={onClose}
          type="button"
        >
          Cancel
        </button>
        <SubmitButton />
      </div>
    </form>
  );
}

export function EditProductButton({
  product,
  unitOptions,
}: {
  product: Product;
  unitOptions: UnitOption[];
}) {
  const [open, setOpen] = useState(false);

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
        className="inline-flex h-8 items-center justify-center rounded-[5px] border border-[color:var(--border-strong)] bg-white px-3 text-xs font-semibold text-[var(--text-secondary)] shadow-[var(--shadow-whisper)] transition hover:border-[var(--brand-burgundy)] hover:text-[var(--brand-burgundy)]"
        onClick={() => setOpen(true)}
        type="button"
      >
        Edit
      </button>

      {open ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[var(--brand-near-black)]/60 px-4 py-6 backdrop-blur-sm"
          role="dialog"
        >
          <div className="flex max-h-[calc(100dvh-3rem)] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-white/10 bg-white shadow-[var(--shadow-panel)]">
            <div className="shrink-0 flex items-start justify-between gap-4 border-b border-[color:var(--border-muted)] px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[1.3px] text-[var(--brand-burgundy)]">
                  Admin
                </p>
                <h2 className="mt-1 text-xl font-semibold leading-tight text-[var(--text-primary)]">
                  Edit product
                </h2>
                <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">
                  {product.size ? `${product.name} — ${product.size}` : product.name}
                </p>
              </div>
              <button
                aria-label="Close modal"
                className="inline-flex size-9 items-center justify-center rounded-[5px] border border-[color:var(--border-muted)] bg-white text-[var(--text-secondary)] transition hover:border-[var(--brand-burgundy)] hover:text-[var(--brand-burgundy)]"
                onClick={() => setOpen(false)}
                type="button"
              >
                <X aria-hidden className="size-4" />
              </button>
            </div>
            <div className="min-h-0 overflow-y-auto overscroll-contain p-5">
              <EditProductForm
                onClose={() => setOpen(false)}
                product={product}
                unitOptions={unitOptions}
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
