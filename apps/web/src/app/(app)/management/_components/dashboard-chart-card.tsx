import { Card, EmptyState } from "@/components/admin/layout";
import type { ManagementChartDatum } from "@/lib/management/types";

import { formatMoney, formatQuantity } from "./formatters";

// One measure per card, so the bars share one hue; red is reserved for
// genuinely negative values (the minus sign carries the same signal for
// color-blind readers). Pair validated: #0d9488 / #b91c1c on white.
const barClass = "bg-[var(--chart-bar)]";
const negativeBarClass = "bg-[var(--negative)]";

function numericValue(value: string) {
  return Number(value);
}

function barWidth(value: number, max: number) {
  if (max <= 0 || value === 0) {
    return "0%";
  }

  return `${Math.max((Math.abs(value) / max) * 100, 4)}%`;
}

function formatChartValue(value: string, mode: "money" | "quantity") {
  return mode === "money" ? formatMoney(value) : formatQuantity(value);
}

export function DashboardChartCard({
  title,
  description,
  data,
  mode,
  emptyText,
}: {
  title: string;
  description: string;
  data: ManagementChartDatum[];
  mode: "money" | "quantity";
  emptyText: string;
}) {
  const max = Math.max(
    ...data.map((item) => Math.abs(numericValue(item.value))),
    0,
  );

  return (
    <Card title={title} description={description}>
      {data.length === 0 || max === 0 ? (
        <EmptyState>{emptyText}</EmptyState>
      ) : (
        <div className="grid gap-4">
          {data.map((item, index) => {
            const value = numericValue(item.value);
            const color = value < 0 ? negativeBarClass : barClass;

            return (
              <div className="grid gap-1.5" key={`${item.label}:${index}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                      {item.label}
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {item.detail}
                    </p>
                  </div>
                  <p
                    className={`shrink-0 text-sm font-semibold ${
                      value < 0
                        ? "text-[var(--negative)]"
                        : "text-[var(--text-primary)]"
                    }`}
                  >
                    {formatChartValue(item.value, mode)}
                  </p>
                </div>
                <div
                  className="h-2 overflow-hidden rounded-[4px] bg-[var(--surface-muted)]"
                  title={`${item.label}: ${formatChartValue(item.value, mode)} (${item.detail})`}
                >
                  <div
                    className={`h-full rounded-r-[4px] ${color}`}
                    style={{ width: barWidth(value, max) }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
