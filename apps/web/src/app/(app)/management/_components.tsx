import { Card } from "@/components/admin/layout";
import type { PaymentMethod } from "@/lib/operations/types";

export const paymentLabels: Record<PaymentMethod, string> = {
  CASH: "Cash",
  TRANSFER: "Transfer",
  POS: "POS",
  CREDIT: "Credit",
};

export function currentMonthValue() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
}

export function getMonthParam(query: { month?: string | string[] }) {
  return typeof query.month === "string" && query.month.trim() !== ""
    ? query.month
    : currentMonthValue();
}

export function formatMoney(value: string | number) {
  return `₦${Number(value).toLocaleString("en", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatPercent(value: string | number) {
  return `${Number(value).toLocaleString("en", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

export function formatQuantity(value: string | number, unit?: string) {
  const formatted = Number(value).toLocaleString("en", {
    maximumFractionDigits: 3,
  });

  return unit ? `${formatted} ${unit}` : formatted;
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
  }).format(new Date(value));
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatAction(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

export function MonthFilter({ month }: { month: string }) {
  return (
    <Card>
      <form className="flex flex-col gap-3 sm:flex-row sm:items-end" method="GET">
        <div className="grid gap-1.5">
          <label className="text-sm font-medium text-stone-700" htmlFor="month">
            Month
          </label>
          <input
            className="h-10 rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-red-700 focus:ring-4 focus:ring-red-100"
            defaultValue={month}
            id="month"
            name="month"
            type="month"
          />
        </div>
        <button
          className="h-10 rounded-md bg-red-800 px-4 text-sm font-semibold text-white transition hover:bg-red-900"
          type="submit"
        >
          View report
        </button>
      </form>
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
