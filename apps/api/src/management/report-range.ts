import { BadRequestException } from "@nestjs/common";

export type ReportRange = {
  from: string;
  to: string;
  label: string;
  start: Date;
  end: Date;
};

const MONTH_PATTERN = /^(\d{4})-(\d{2})$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function dateValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseDate(value: string, label: string) {
  const match = DATE_PATTERN.exec(value.trim());

  if (!match) {
    throw new BadRequestException(`${label} must use YYYY-MM-DD format.`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new BadRequestException(`${label} must be a valid date.`);
  }

  return date;
}

function subtractCalendarMonth(date: Date) {
  const targetMonth = date.getUTCMonth() - 1;
  const targetYear = date.getUTCFullYear() + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(
    Date.UTC(targetYear, normalizedMonth + 1, 0),
  ).getUTCDate();

  return new Date(
    Date.UTC(
      targetYear,
      normalizedMonth,
      Math.min(date.getUTCDate(), lastDay),
    ),
  );
}

function legacyMonthRange(month: string) {
  const match = MONTH_PATTERN.exec(month.trim());

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;

  if (monthIndex < 0 || monthIndex > 11) {
    throw new BadRequestException("Month must use a valid month number.");
  }

  const start = new Date(Date.UTC(year, monthIndex, 1));
  const to = new Date(Date.UTC(year, monthIndex + 1, 0));

  return { start, to };
}

export function getReportRange(from?: string, to?: string): ReportRange {
  const legacyRange = from && !to ? legacyMonthRange(from) : null;
  const today = new Date();
  const defaultTo = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );
  const toDate = legacyRange?.to ?? (to ? parseDate(to, "To date") : defaultTo);
  const fromDate =
    legacyRange?.start ??
    (from ? parseDate(from, "From date") : subtractCalendarMonth(toDate));

  if (fromDate.getTime() > toDate.getTime()) {
    throw new BadRequestException("From date cannot be after to date.");
  }

  const end = new Date(toDate);
  end.setUTCDate(end.getUTCDate() + 1);

  const formatter = new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeZone: "UTC",
  });

  return {
    from: dateValue(fromDate),
    to: dateValue(toDate),
    label: `${formatter.format(fromDate)} - ${formatter.format(toDate)}`,
    start: fromDate,
    end,
  };
}

export function serializeReportRange(range: ReportRange) {
  return {
    from: range.from,
    to: range.to,
    label: range.label,
    start: range.start.toISOString(),
    end: range.end.toISOString(),
  };
}
