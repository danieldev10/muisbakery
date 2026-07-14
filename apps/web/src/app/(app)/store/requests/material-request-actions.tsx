"use client";

import { X } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

import { Spinner } from "@/components/spinner";
import { initialFormState } from "@/lib/admin/types";
import type {
  MaterialRequest,
  MaterialRequestStatus,
} from "@/lib/operations/types";

import { issueMaterialRequest, rejectMaterialRequest } from "./actions";

type ActionMode = "issue" | "reject";

type MaterialRequestActionsProps = {
  canIssue: boolean;
  canReject: boolean;
  request: MaterialRequest;
  unit: string;
};

const triggerButtonClass =
  "inline-flex h-8 items-center justify-center whitespace-nowrap rounded-[5px] border px-3 text-xs font-semibold shadow-[var(--shadow-whisper)] transition disabled:cursor-not-allowed disabled:opacity-50";

const inputClass =
  "h-10 rounded-[5px] border border-[color:var(--border-muted)] bg-white px-3 text-sm text-[var(--text-primary)] shadow-[var(--shadow-whisper)] outline-none transition focus:border-[var(--brand-burgundy)] focus:ring-4 focus:ring-[var(--focus-ring)]";

const textareaClass =
  "min-h-24 rounded-[5px] border border-[color:var(--border-muted)] bg-white px-3 py-2 text-sm text-[var(--text-primary)] shadow-[var(--shadow-whisper)] outline-none transition focus:border-[var(--brand-burgundy)] focus:ring-4 focus:ring-[var(--focus-ring)]";

function wholeQuantity(value: string) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return value;
  }

  return String(Math.floor(numeric));
}

function formatQuantity(value: string, unit: string) {
  return `${Number(value).toLocaleString("en", {
    maximumFractionDigits: 0,
  })} ${unit}`;
}

function statusLabel(status: MaterialRequestStatus) {
  return status
    .split("_")
    .map((part) => part[0] + part.slice(1).toLowerCase())
    .join(" ");
}

function statusClass(status: MaterialRequestStatus) {
  if (status === "FULFILLED") {
    return "bg-emerald-50 text-emerald-800";
  }
  if (status === "PARTIALLY_ISSUED") {
    return "bg-amber-50 text-amber-800";
  }
  if (status === "CANCELLED") {
    return "bg-stone-100 text-stone-500";
  }
  if (status === "REJECTED") {
    return "bg-red-800 text-red-50";
  }
  return "bg-red-50 text-red-800";
}

function Modal({
  children,
  description,
  onClose,
  title,
}: {
  children: React.ReactNode;
  description: string;
  onClose: () => void;
  title: string;
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[var(--brand-near-black)]/60 px-4 py-6 backdrop-blur-sm"
      role="dialog"
    >
      <div className="flex max-h-[calc(100dvh-3rem)] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-white/10 bg-white shadow-[var(--shadow-panel)]">
        <div className="shrink-0 flex items-start justify-between gap-4 border-b border-[color:var(--border-muted)] px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[1.3px] text-[var(--brand-burgundy)]">
              Material request
            </p>
            <h2 className="mt-1 text-xl font-semibold leading-tight text-[var(--text-primary)]">
              {title}
            </h2>
            <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">
              {description}
            </p>
          </div>
          <button
            aria-label="Close modal"
            className="inline-flex size-9 items-center justify-center rounded-[5px] border border-[color:var(--border-muted)] bg-white text-[var(--text-secondary)] transition hover:border-[var(--brand-burgundy)] hover:bg-[var(--surface-warm)] hover:text-[var(--brand-burgundy)]"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto overscroll-contain p-5">
          {children}
        </div>
      </div>
    </div>
  );
}

export function MaterialRequestStatusBadge({
  reason,
  status,
}: {
  reason: string | null;
  status: MaterialRequestStatus;
}) {
  const [open, setOpen] = useState(false);
  const label = statusLabel(status);
  // Identical box metrics for the static and clickable variants so the
  // pills line up pixel-for-pixel across rows.
  const badgeClass = `inline-flex h-5 items-center justify-center rounded-full px-2.5 text-xs font-medium leading-none align-middle ${statusClass(
    status,
  )}`;

  if (!reason) {
    return <span className={badgeClass}>{label}</span>;
  }

  return (
    <>
      <button
        className={`${badgeClass} cursor-pointer appearance-none border-0 transition hover:opacity-85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-burgundy)]`}
        onClick={() => setOpen(true)}
        title="View status reason"
        type="button"
      >
        {label}
      </button>

      {open ? (
        <Modal
          description="Recorded response note for this material request."
          onClose={() => setOpen(false)}
          title={`${label} reason`}
        >
          <div className="rounded-[5px] border border-[color:var(--border-muted)] bg-[var(--surface-warm)] px-4 py-3 text-sm leading-6 text-[var(--text-secondary)]">
            {reason}
          </div>
          <div className="mt-4 flex justify-end">
            <button
              className="inline-flex h-10 items-center justify-center rounded-[5px] border border-[color:var(--border-muted)] bg-white px-4 text-sm font-semibold text-[var(--text-secondary)] transition hover:bg-[var(--surface-warm)]"
              onClick={() => setOpen(false)}
              type="button"
            >
              Close
            </button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}

function SubmitButton({
  children,
  pendingLabel,
  tone = "primary",
}: {
  children: React.ReactNode;
  pendingLabel: string;
  tone?: "primary" | "danger";
}) {
  const { pending } = useFormStatus();
  const className =
    tone === "danger"
      ? "inline-flex h-10 items-center justify-center rounded-[5px] border border-red-300 bg-white px-4 text-sm font-semibold text-red-800 shadow-[var(--shadow-whisper)] transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
      : "inline-flex h-10 items-center justify-center rounded-[5px] border border-[var(--brand-burgundy-dark)] bg-[var(--brand-burgundy)] px-4 text-sm font-semibold text-white shadow-[var(--shadow-whisper)] transition hover:bg-[var(--brand-burgundy-dark)] disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <button className={className} disabled={pending} type="submit">
      {pending ? (
        <span className="inline-flex items-center gap-2">
          <Spinner />
          {pendingLabel}
        </span>
      ) : (
        children
      )}
    </button>
  );
}

function IssueForm({
  onClose,
  request,
  unit,
}: {
  onClose: () => void;
  request: MaterialRequest;
  unit: string;
}) {
  const [state, formAction] = useActionState(
    issueMaterialRequest,
    initialFormState,
  );
  const remainingQuantity = wholeQuantity(request.remainingQuantity);

  useEffect(() => {
    if (state.ok) {
      onClose();
    }
  }, [onClose, state.ok]);

  return (
    <form action={formAction} className="grid gap-4">
      <input name="id" type="hidden" value={request.id} />
      <div className="rounded-[5px] border border-[color:var(--border-muted)] bg-[var(--surface-warm)] px-3 py-2 text-sm text-[var(--text-secondary)]">
        <p className="font-semibold text-[var(--text-primary)]">
          {request.rawMaterial.name}
        </p>
        <p>
          Requested {formatQuantity(request.requestedQuantity, unit)}. Remaining{" "}
          {formatQuantity(request.remainingQuantity, unit)}.
        </p>
      </div>
      <div className="grid gap-1.5">
        <label
          className="text-xs font-semibold uppercase tracking-[1.3px] text-[var(--text-muted)]"
          htmlFor={`issue-quantity-${request.id}`}
        >
          Quantity to issue
        </label>
        <input
          className={inputClass}
          defaultValue={remainingQuantity}
          id={`issue-quantity-${request.id}`}
          max={remainingQuantity}
          min="1"
          name="quantity"
          required
          step="1"
          type="number"
        />
      </div>
      <div className="grid gap-1.5">
        <label
          className="text-xs font-semibold uppercase tracking-[1.3px] text-[var(--text-muted)]"
          htmlFor={`issue-notes-${request.id}`}
        >
          Notes
        </label>
        <textarea
          className={textareaClass}
          id={`issue-notes-${request.id}`}
          name="notes"
          placeholder="Optional issue notes"
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
        <SubmitButton pendingLabel="Issuing">Issue material</SubmitButton>
      </div>
    </form>
  );
}

function RejectForm({
  onClose,
  request,
  unit,
}: {
  onClose: () => void;
  request: MaterialRequest;
  unit: string;
}) {
  const [state, formAction] = useActionState(
    rejectMaterialRequest,
    initialFormState,
  );

  useEffect(() => {
    if (state.ok) {
      onClose();
    }
  }, [onClose, state.ok]);

  return (
    <form action={formAction} className="grid gap-4">
      <input name="id" type="hidden" value={request.id} />
      <div className="rounded-[5px] border border-[color:var(--border-muted)] bg-[var(--surface-warm)] px-3 py-2 text-sm text-[var(--text-secondary)]">
        <p className="font-semibold text-[var(--text-primary)]">
          {request.rawMaterial.name}
        </p>
        <p>
          Requested {formatQuantity(request.requestedQuantity, unit)}. Remaining{" "}
          {formatQuantity(request.remainingQuantity, unit)}.
        </p>
      </div>
      <div className="grid gap-1.5">
        <label
          className="text-xs font-semibold uppercase tracking-[1.3px] text-[var(--text-muted)]"
          htmlFor={`reject-notes-${request.id}`}
        >
          Reason for rejection
        </label>
        <textarea
          className={textareaClass}
          id={`reject-notes-${request.id}`}
          name="notes"
          placeholder="Explain why this request is being rejected"
          required
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
        <SubmitButton pendingLabel="Rejecting" tone="danger">
          Reject request
        </SubmitButton>
      </div>
    </form>
  );
}

export function MaterialRequestActions({
  canIssue,
  canReject,
  request,
  unit,
}: MaterialRequestActionsProps) {
  const [mode, setMode] = useState<ActionMode | null>(null);

  if (!canIssue && !canReject) {
    return <span className="text-sm text-[var(--text-muted)]">-</span>;
  }

  return (
    <>
      <div className="inline-flex flex-nowrap items-center gap-2 whitespace-nowrap">
        {canIssue ? (
          <button
            className={`${triggerButtonClass} border-[var(--brand-burgundy)] bg-[var(--brand-burgundy)] text-white hover:bg-[var(--brand-burgundy-dark)]`}
            onClick={() => setMode("issue")}
            type="button"
          >
            Issue
          </button>
        ) : null}
        {canReject ? (
          <button
            className={`${triggerButtonClass} border-red-300 bg-white text-red-800 hover:bg-red-50`}
            onClick={() => setMode("reject")}
            type="button"
          >
            Reject
          </button>
        ) : null}
      </div>

      {mode === "issue" ? (
        <Modal
          description="Confirm the quantity to issue from available store stock."
          onClose={() => setMode(null)}
          title="Issue material"
        >
          <IssueForm
            key={`issue:${request.id}`}
            onClose={() => setMode(null)}
            request={request}
            unit={unit}
          />
        </Modal>
      ) : null}

      {mode === "reject" ? (
        <Modal
          description="Reject the remaining unissued quantity with a reason."
          onClose={() => setMode(null)}
          title="Reject request"
        >
          <RejectForm
            key={`reject:${request.id}`}
            onClose={() => setMode(null)}
            request={request}
            unit={unit}
          />
        </Modal>
      ) : null}
    </>
  );
}
