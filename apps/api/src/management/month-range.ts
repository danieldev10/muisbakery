import { BadRequestException } from "@nestjs/common";

export type MonthRange = {
  month: string;
  label: string;
  start: Date;
  end: Date;
};

export function getMonthRange(month?: string): MonthRange {
  const target = month?.trim();
  let year: number;
  let monthIndex: number;

  if (!target) {
    const today = new Date();
    year = today.getFullYear();
    monthIndex = today.getMonth();
  } else {
    const match = /^(\d{4})-(\d{2})$/.exec(target);

    if (!match) {
      throw new BadRequestException("Month must use YYYY-MM format.");
    }

    year = Number(match[1]);
    monthIndex = Number(match[2]) - 1;

    if (monthIndex < 0 || monthIndex > 11) {
      throw new BadRequestException("Month must use a valid month number.");
    }
  }

  const start = new Date(Date.UTC(year, monthIndex, 1));
  const end = new Date(Date.UTC(year, monthIndex + 1, 1));
  const normalizedMonth = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
  const label = new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(start);

  return { month: normalizedMonth, label, start, end };
}

export function serializeMonth(range: MonthRange) {
  return {
    value: range.month,
    label: range.label,
    start: range.start.toISOString(),
    end: range.end.toISOString(),
  };
}
