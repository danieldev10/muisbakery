import { Card, EmptyState } from "@/components/admin/layout";
import type { ManagementChartDatum } from "@/lib/management/types";

import { formatMoney, formatQuantity } from "./formatters";

const chartColors = [
  "bg-red-800",
  "bg-stone-700",
  "bg-emerald-700",
  "bg-amber-700",
  "bg-sky-800",
];

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
            const color =
              value < 0 ? "bg-red-800" : chartColors[index % chartColors.length];

            return (
              <div className="grid gap-2" key={`${item.label}:${index}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-stone-900">
                      {item.label}
                    </p>
                    <p className="text-xs text-stone-500">{item.detail}</p>
                  </div>
                  <p
                    className={`shrink-0 text-sm font-semibold ${
                      value < 0 ? "text-red-800" : "text-stone-900"
                    }`}
                  >
                    {formatChartValue(item.value, mode)}
                  </p>
                </div>
                <div className="h-2.5 overflow-hidden rounded-sm bg-stone-100">
                  <div
                    className={`h-full rounded-sm ${color}`}
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
