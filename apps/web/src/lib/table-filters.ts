import type { PageSearchParams } from "@/lib/paginate";

export function firstParam(
  params: PageSearchParams,
  key: string,
): string {
  const value = params[key];
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

export function normalizeSearch(value: string) {
  return value.trim().toLocaleLowerCase();
}

export function matchesSearch(
  query: string,
  values: Array<boolean | number | string | null | undefined>,
) {
  const normalized = normalizeSearch(query);

  if (!normalized) {
    return true;
  }

  return values.some((value) =>
    String(value ?? "")
      .toLocaleLowerCase()
      .includes(normalized),
  );
}

export function matchesSelect(value: string, candidate: string | boolean) {
  if (!value || value === "all") {
    return true;
  }

  return String(candidate) === value;
}

export function matchesDateRange(
  value: string | null | undefined,
  from: string,
  to: string,
) {
  if (!value) {
    return !from && !to;
  }

  const timestamp = new Date(value).getTime();

  if (Number.isNaN(timestamp)) {
    return false;
  }

  if (from) {
    const fromTime = new Date(`${from}T00:00:00`).getTime();
    if (!Number.isNaN(fromTime) && timestamp < fromTime) {
      return false;
    }
  }

  if (to) {
    const toTime = new Date(`${to}T23:59:59.999`).getTime();
    if (!Number.isNaN(toTime) && timestamp > toTime) {
      return false;
    }
  }

  return true;
}

export function optionLabel(value: string) {
  return value
    .toLocaleLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toLocaleUpperCase() + part.slice(1))
    .join(" ");
}
