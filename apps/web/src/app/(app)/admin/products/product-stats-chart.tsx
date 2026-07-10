import { EmptyState } from "@/components/admin/layout";

export type ProductStat = {
  product: { id: string; name: string; size: string };
  totalProduced: number;
  totalSold: number;
};

// Two-series categorical pair, validated on the light surface
// (#0d9488 ↔ #8f2636: worst CVD ΔE 31.3, contrast ≥ 3:1).
const PRODUCED_BAR = "bg-[var(--chart-bar)]";
const SOLD_BAR = "bg-[var(--brand-burgundy)]";

function productLabel(product: ProductStat["product"]) {
  return product.size ? `${product.name} — ${product.size}` : product.name;
}

function barWidth(value: number, max: number) {
  if (max <= 0 || value <= 0) {
    return "0%";
  }

  return `${Math.max((value / max) * 100, 2)}%`;
}

function LegendChip({ colorClass, label }: { colorClass: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)]">
      <span aria-hidden className={`size-2.5 rounded-[3px] ${colorClass}`} />
      {label}
    </span>
  );
}

function StatBar({
  colorClass,
  label,
  max,
  value,
}: {
  colorClass: string;
  label: string;
  max: number;
  value: number;
}) {
  return (
    <div
      className="flex items-center gap-3"
      title={`${label}: ${value.toLocaleString("en")}`}
    >
      <div className="h-2 flex-1 overflow-hidden rounded-[4px] bg-[var(--surface-muted)]">
        <div
          className={`h-full rounded-r-[4px] ${colorClass}`}
          style={{ width: barWidth(value, max) }}
        />
      </div>
      <span className="w-14 shrink-0 text-right text-xs font-semibold tabular-nums text-[var(--text-secondary)]">
        {value.toLocaleString("en")}
      </span>
    </div>
  );
}

export function ProductStatsChart({ stats }: { stats: ProductStat[] }) {
  const active = stats
    .filter((entry) => entry.totalProduced > 0 || entry.totalSold > 0)
    .sort((left, right) => right.totalProduced - left.totalProduced);
  const max = Math.max(
    ...active.flatMap((entry) => [entry.totalProduced, entry.totalSold]),
    1,
  );

  if (active.length === 0) {
    return (
      <EmptyState>
        No production or sales recorded yet. This chart fills in as runs and
        sales are logged.
      </EmptyState>
    );
  }

  return (
    <div className="grid gap-5">
      <div className="flex items-center gap-4">
        <LegendChip colorClass={PRODUCED_BAR} label="Produced" />
        <LegendChip colorClass={SOLD_BAR} label="Sold" />
      </div>

      {active.map((entry) => (
        <div className="grid gap-1.5" key={entry.product.id}>
          <p className="truncate text-sm font-medium text-[var(--text-primary)]">
            {productLabel(entry.product)}
          </p>
          <div className="grid gap-0.5">
            <StatBar
              colorClass={PRODUCED_BAR}
              label="Produced"
              max={max}
              value={entry.totalProduced}
            />
            <StatBar
              colorClass={SOLD_BAR}
              label="Sold"
              max={max}
              value={entry.totalSold}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
