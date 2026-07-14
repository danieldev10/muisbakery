import type { PaymentMethod } from "@/lib/operations/types";

export const paymentLabels: Record<PaymentMethod, string> = {
  CASH: "Cash",
  TRANSFER: "Transfer",
  POS: "POS",
  CREDIT: "Credit",
};

type ReportRangeSearchParams = {
  from?: string | string[];
  to?: string | string[];
  month?: string | string[];
};

function stringParam(value: string | string[] | undefined) {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function dateValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function defaultReportRange() {
  const now = new Date();
  const to = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const targetMonth = to.getUTCMonth() - 1;
  const targetYear = to.getUTCFullYear() + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(
    Date.UTC(targetYear, normalizedMonth + 1, 0),
  ).getUTCDate();
  const from = new Date(
    Date.UTC(
      targetYear,
      normalizedMonth,
      Math.min(to.getUTCDate(), lastDay),
    ),
  );

  return { from: dateValue(from), to: dateValue(to) };
}

export function reportRangeApiPath(
  basePath: string,
  query: ReportRangeSearchParams,
) {
  const params = new URLSearchParams();
  const from = stringParam(query.from);
  const to = stringParam(query.to);
  const legacyMonth = stringParam(query.month);

  if (from) {
    params.set("from", from);
  }
  if (to) {
    params.set("to", to);
  }
  if (!from && !to && legacyMonth) {
    params.set("month", legacyMonth);
  }

  const search = params.toString();
  return search ? `${basePath}?${search}` : basePath;
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
