"use client";

import { useMemo, useState } from "react";

export type PosStockAllocationOption = {
  id: string;
  label: string;
  unit: string;
  centralAvailable: number;
  systemAvailable: number;
  currentAllocated: number;
  currentSold: number;
  currentRemaining: number;
};

const fieldClass =
  "h-10 rounded-[5px] border border-[color:var(--border-muted)] bg-white px-3 text-sm text-[var(--text-primary)] shadow-[var(--shadow-whisper)] outline-none transition focus:border-[var(--brand-burgundy)] focus:ring-4 focus:ring-[var(--focus-ring)]";

const labelClass =
  "text-xs font-semibold uppercase tracking-[1.3px] text-[var(--text-muted)]";

function formatQuantity(value: number, unit: string) {
  return `${value.toLocaleString("en", {
    maximumFractionDigits: 0,
  })} ${unit}`;
}

export function StockAllocationFields({
  options,
}: {
  options: PosStockAllocationOption[];
}) {
  const [productId, setProductId] = useState(options[0]?.id ?? "");
  const selected = useMemo(
    () => options.find((option) => option.id === productId) ?? options[0],
    [options, productId],
  );
  const [allocatedQuantity, setAllocatedQuantity] = useState(
    String(selected?.currentAllocated ?? 0),
  );

  function selectProduct(nextProductId: string) {
    const next = options.find((option) => option.id === nextProductId);

    setProductId(nextProductId);
    setAllocatedQuantity(String(next?.currentAllocated ?? 0));
  }

  if (!selected) {
    return (
      <p className="rounded-[5px] border border-dashed border-[color:var(--border-muted)] px-4 py-6 text-center text-sm text-[var(--text-muted)]">
        No finished products are available for terminal allocation.
      </p>
    );
  }

  const maximumCumulative =
    selected.currentAllocated + selected.centralAvailable;

  return (
    <>
      <div className="grid gap-1.5">
        <label className={labelClass} htmlFor="productId">
          Product <span className="text-[var(--brand-burgundy)]">*</span>
        </label>
        <select
          className={fieldClass}
          id="productId"
          name="productId"
          onChange={(event) => selectProduct(event.target.value)}
          required
          value={productId}
        >
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label} - {formatQuantity(option.centralAvailable, option.unit)} central
            </option>
          ))}
        </select>
      </div>

      <div
        aria-live="polite"
        className="grid gap-3 rounded-[5px] border border-[color:var(--border-muted)] bg-[var(--surface-muted)] p-3 sm:grid-cols-3"
      >
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
            Available to allocate
          </p>
          <p className="mt-1 text-lg font-semibold text-[var(--brand-burgundy)]">
            {formatQuantity(selected.centralAvailable, selected.unit)}
          </p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Unreserved central stock
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
            At this terminal
          </p>
          <p className="mt-1 text-lg font-semibold text-[var(--text-primary)]">
            {formatQuantity(selected.currentRemaining, selected.unit)}
          </p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            {formatQuantity(selected.currentSold, selected.unit)} sold from {formatQuantity(selected.currentAllocated, selected.unit)} cumulative
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
            Total in system
          </p>
          <p className="mt-1 text-lg font-semibold text-[var(--text-primary)]">
            {formatQuantity(selected.systemAvailable, selected.unit)}
          </p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Central plus all terminal custody
          </p>
        </div>
      </div>

      <div className="grid gap-1.5">
        <label className={labelClass} htmlFor="allocatedQuantity">
          Cumulative allocated quantity{" "}
          <span className="text-[var(--brand-burgundy)]">*</span>
        </label>
        <input
          className={fieldClass}
          id="allocatedQuantity"
          max={maximumCumulative}
          min={selected.currentSold}
          name="allocatedQuantity"
          onChange={(event) => setAllocatedQuantity(event.target.value)}
          required
          step="1"
          type="number"
          value={allocatedQuantity}
        />
        <p className="text-xs text-[var(--text-muted)]">
          Enter between {formatQuantity(selected.currentSold, selected.unit)} and{" "}
          {formatQuantity(maximumCumulative, selected.unit)}. Increasing transfers the difference from central stock FIFO; reducing releases only unsold custody.
        </p>
      </div>
    </>
  );
}
