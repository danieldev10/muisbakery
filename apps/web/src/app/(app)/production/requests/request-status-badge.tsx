"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";

import type { MaterialRequestStatus } from "@/lib/operations/types";

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

function StatusReasonModal({
  label,
  onClose,
  reason,
}: {
  label: string;
  onClose: () => void;
  reason: string;
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
              {label} reason
            </h2>
            <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">
              Store response note for this request.
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
          <div className="rounded-[5px] border border-[color:var(--border-muted)] bg-[var(--surface-warm)] px-4 py-3 text-sm leading-6 text-[var(--text-secondary)]">
            {reason}
          </div>
          <div className="mt-4 flex justify-end">
            <button
              className="inline-flex h-10 items-center justify-center rounded-[5px] border border-[color:var(--border-muted)] bg-white px-4 text-sm font-semibold text-[var(--text-secondary)] transition hover:bg-[var(--surface-warm)]"
              onClick={onClose}
              type="button"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function RequestStatusBadge({
  reason,
  status,
}: {
  reason: string | null;
  status: MaterialRequestStatus;
}) {
  const [open, setOpen] = useState(false);
  const label = statusLabel(status);
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
        <StatusReasonModal
          label={label}
          onClose={() => setOpen(false)}
          reason={reason}
        />
      ) : null}
    </>
  );
}
