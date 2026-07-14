import type { ReactNode } from "react";

import { Card } from "@/components/admin/layout";
import type { ManagementReportRange } from "@/lib/management/types";

export function ManagementPageShell({ children }: { children: ReactNode }) {
  return <div className="grid gap-5 lg:gap-6">{children}</div>;
}

export function ReportRangeFilter({
  range,
  actions,
}: {
  range: ManagementReportRange;
  actions?: ReactNode;
}) {
  return (
    <Card>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <form className="flex flex-col gap-3 sm:flex-row sm:items-end" method="GET">
          <label className="grid gap-1.5 text-sm font-medium text-stone-700">
            From
            <input
              className="h-10 rounded-md border border-stone-300 bg-white px-3 text-sm font-normal text-stone-950 outline-none transition focus:border-red-700 focus:ring-4 focus:ring-red-100"
              defaultValue={range.from}
              name="from"
              required
              type="date"
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-stone-700">
            To
            <input
              className="h-10 rounded-md border border-stone-300 bg-white px-3 text-sm font-normal text-stone-950 outline-none transition focus:border-red-700 focus:ring-4 focus:ring-red-100"
              defaultValue={range.to}
              name="to"
              required
              type="date"
            />
          </label>
          <button
            className="h-10 rounded-md bg-red-800 px-4 text-sm font-semibold text-white transition hover:bg-red-900"
            type="submit"
          >
            View report
          </button>
        </form>
        {actions ? <div className="flex items-center lg:pb-0.5">{actions}</div> : null}
      </div>
    </Card>
  );
}

export function MetricCard({
  label,
  value,
  detail,
  tone = "default",
}: {
  label: string;
  value: string | number;
  detail?: string;
  tone?: "default" | "positive" | "warning";
}) {
  const valueClass =
    tone === "positive"
      ? "text-emerald-700"
      : tone === "warning"
        ? "text-red-800"
        : "text-stone-950";

  return (
    <Card title={label}>
      <p className={`text-2xl font-semibold ${valueClass}`}>{value}</p>
      {detail ? <p className="mt-1 text-sm text-stone-500">{detail}</p> : null}
    </Card>
  );
}
