"use client";

import { ListChecks, X } from "lucide-react";
import { useEffect, useState } from "react";

import type { SaleItem } from "@/lib/operations/types";
import { formatProductName } from "@/lib/product-label";

function formatMoney(value: string | number) {
  return `₦${Number(value).toLocaleString("en", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatQuantity(value: string, unit: string) {
  return `${Number(value).toLocaleString("en", {
    maximumFractionDigits: 3,
  })} ${unit}`;
}

export function SaleItemsSummary({
  items,
  saleNumber,
}: {
  items: SaleItem[];
  saleNumber: number;
}) {
  const [open, setOpen] = useState(false);
  const firstItem = items[0];
  const remainingCount = Math.max(items.length - 1, 0);

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
      <div className="grid max-w-72 gap-2">
        {firstItem ? (
          <div>
            <p className="truncate font-medium text-stone-900">
              {formatProductName(firstItem.product)}
            </p>
            <p className="text-xs text-stone-500">
              {formatQuantity(
                firstItem.quantity,
                firstItem.product.unit.abbreviation,
              )}
              {remainingCount > 0
                ? ` + ${remainingCount} more line${
                    remainingCount === 1 ? "" : "s"
                  }`
                : ""}
            </p>
          </div>
        ) : (
          <span className="text-stone-500">No items</span>
        )}

        {items.length > 0 ? (
          <button
            className="inline-flex h-8 w-fit items-center justify-center gap-1.5 rounded-[5px] border border-[color:var(--border-muted)] bg-white px-3 text-xs font-semibold text-[var(--brand-burgundy)] transition hover:border-[var(--brand-burgundy)] hover:bg-[var(--brand-tint)]"
            onClick={() => setOpen(true)}
            type="button"
          >
            <ListChecks aria-hidden className="size-3.5" />
            View items
          </button>
        ) : null}
      </div>

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
                  Sale #{saleNumber}
                </p>
                <h2 className="mt-1 text-xl font-semibold leading-tight text-[var(--text-primary)]">
                  Sold items
                </h2>
                <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">
                  {items.length} line item{items.length === 1 ? "" : "s"} on
                  this sale.
                </p>
              </div>
              <button
                aria-label="Close item details"
                className="inline-flex size-9 items-center justify-center rounded-[5px] border border-[color:var(--border-muted)] bg-white text-[var(--text-secondary)] transition hover:border-[var(--brand-burgundy)] hover:bg-[var(--surface-warm)] hover:text-[var(--brand-burgundy)]"
                onClick={() => setOpen(false)}
                type="button"
              >
                <X aria-hidden className="size-4" />
              </button>
            </div>

            <div className="min-h-0 overflow-y-auto overscroll-contain p-5">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[color:var(--border-muted)] text-left text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                    <th className="py-2 pr-4">Product</th>
                    <th className="py-2 pr-4">Quantity</th>
                    <th className="py-2 pr-4">Unit price</th>
                    <th className="py-2 pr-4">Line total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--border-muted)]">
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td className="py-3 pr-4 font-medium text-stone-900">
                        {formatProductName(item.product)}
                      </td>
                      <td className="py-3 pr-4 text-stone-600">
                        {formatQuantity(
                          item.quantity,
                          item.product.unit.abbreviation,
                        )}
                      </td>
                      <td className="py-3 pr-4 text-stone-600">
                        {formatMoney(item.unitPrice)}
                      </td>
                      <td className="py-3 pr-4 text-stone-600">
                        {formatMoney(item.lineTotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
