"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";

import type { ProductionRun } from "@/lib/operations/types";

function formatQuantity(value: string, unit: string) {
  return `${Number(value).toLocaleString("en", {
    maximumFractionDigits: 3,
  })} ${unit}`;
}

export function RunMaterialsButton({
  producedAt,
  productLabel,
  run,
}: {
  producedAt: string;
  productLabel: string;
  run: ProductionRun;
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

  if (run.materialUsages.length === 0) {
    return <span className="text-sm text-[var(--text-muted)]">-</span>;
  }

  return (
    <>
      <button
        className="inline-flex h-8 items-center justify-center whitespace-nowrap rounded-[5px] border border-[color:var(--border-strong)] bg-white px-3 text-xs font-semibold text-[var(--text-secondary)] shadow-[var(--shadow-whisper)] transition hover:border-[var(--brand-burgundy)] hover:text-[var(--brand-burgundy)]"
        onClick={() => setOpen(true)}
        type="button"
      >
        View ({run.materialUsages.length})
      </button>

      {open ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 grid place-items-center bg-[var(--brand-near-black)]/60 px-4 py-6 backdrop-blur-sm"
          role="dialog"
        >
          <div className="max-h-full w-full max-w-lg overflow-y-auto rounded-lg border border-white/10 bg-white shadow-[var(--shadow-panel)]">
            <div className="flex items-start justify-between gap-4 border-b border-[color:var(--border-muted)] px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[1.3px] text-[var(--brand-burgundy)]">
                  Production run
                </p>
                <h2 className="mt-1 text-xl font-semibold leading-tight text-[var(--text-primary)]">
                  Materials used
                </h2>
                <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">
                  {productLabel} · {producedAt}
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
              <div className="overflow-x-auto rounded-lg border border-[color:var(--border-muted)]">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-[color:var(--border-muted)] bg-[var(--surface-muted)] text-left text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                      <th className="py-2.5 pl-4 pr-4">Raw material</th>
                      <th className="py-2.5 pr-4">Actual used</th>
                      <th className="py-2.5 pr-4">Expected</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[color:var(--border-muted)]">
                    {run.materialUsages.map((usage) => (
                      <tr key={usage.id}>
                        <td className="py-2.5 pl-4 pr-4 font-medium text-[var(--text-primary)]">
                          {usage.rawMaterial.name}
                        </td>
                        <td className="py-2.5 pr-4 text-[var(--text-secondary)]">
                          {formatQuantity(
                            usage.actualQuantity,
                            usage.rawMaterial.baseUnit.abbreviation,
                          )}
                        </td>
                        <td className="py-2.5 pr-4 text-[var(--text-muted)]">
                          {usage.expectedQuantity
                            ? formatQuantity(
                                usage.expectedQuantity,
                                usage.rawMaterial.baseUnit.abbreviation,
                              )
                            : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {run.expectedQuantity ? (
                <p
                  className={`mt-3 text-sm ${
                    run.shortfallQuantity
                      ? "font-medium text-red-700"
                      : "text-[var(--text-muted)]"
                  }`}
                >
                  These materials should yield at least{" "}
                  {Number(run.expectedQuantity).toLocaleString("en")}{" "}
                  {run.product.unit.abbreviation}
                  {run.shortfallQuantity
                    ? ` — recorded output was ${run.shortfallQuantity} short.`
                    : "."}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
