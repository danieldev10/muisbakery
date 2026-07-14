"use client";

import { X } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

import { Spinner } from "@/components/spinner";
import { initialFormState } from "@/lib/admin/types";
import type { SalesDayClose } from "@/lib/operations/types";

import { approveDayClose } from "./actions";

const labelClass =
  "text-xs font-semibold uppercase tracking-[1.3px] text-[var(--text-muted)]";

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
          Approving
        </span>
      ) : (
        "Approve close"
      )}
    </button>
  );
}

function ApproveForm({
  close,
  onClose,
}: {
  close: SalesDayClose;
  onClose: () => void;
}) {
  const [state, formAction] = useActionState(
    approveDayClose,
    initialFormState,
  );

  useEffect(() => {
    if (state.ok) {
      onClose();
    }
  }, [onClose, state.ok]);

  return (
    <form action={formAction} className="grid gap-4">
      <input name="id" type="hidden" value={close.id} />

      <div className="grid gap-1.5">
        <label className={labelClass} htmlFor={`review-notes-${close.id}`}>
          Review notes
        </label>
        <textarea
          className="rounded-[5px] border border-[color:var(--border-muted)] bg-white px-3 py-2 text-sm text-[var(--text-primary)] shadow-[var(--shadow-whisper)] outline-none transition focus:border-[var(--brand-burgundy)] focus:ring-4 focus:ring-[var(--focus-ring)]"
          id={`review-notes-${close.id}`}
          name="notes"
          placeholder="Optional, e.g. variance explained by till float"
          rows={3}
        />
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

export function ApproveDayCloseButton({
  close,
  detail,
}: {
  close: SalesDayClose;
  detail: string;
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
        Review
      </button>

      {open ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 grid place-items-center bg-[var(--brand-near-black)]/60 px-4 py-6 backdrop-blur-sm"
          role="dialog"
        >
          <div className="w-full max-w-lg overflow-hidden rounded-lg border border-white/10 bg-white shadow-[var(--shadow-panel)]">
            <div className="flex items-start justify-between gap-4 border-b border-[color:var(--border-muted)] px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[1.3px] text-[var(--brand-burgundy)]">
                  Management
                </p>
                <h2 className="mt-1 text-xl font-semibold leading-tight text-[var(--text-primary)]">
                  Approve day close
                </h2>
                <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">
                  {detail}
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
            <div className="p-5">
              <ApproveForm close={close} onClose={() => setOpen(false)} />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
