import { Prisma } from "@prisma/client";

export type QueryValue = string | string[] | undefined;
export type QueryParams = Record<string, QueryValue>;

export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 100;

export type PaginationMeta = {
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  rangeStart: number;
  rangeEnd: number;
};

export type PaginatedResult<T> = {
  items: T[];
  pagination: PaginationMeta;
};

export function firstQueryParam(query: QueryParams | undefined, key: string) {
  const value = query?.[key];
  return Array.isArray(value) ? value[0] : value;
}

export function hasPaginatedRequest(query: QueryParams | undefined) {
  const value = firstQueryParam(query, "paginated");
  return value === "1" || value === "true";
}

export function queryText(query: QueryParams | undefined, key: string) {
  const value = firstQueryParam(query, key)?.trim();
  return value ? value : undefined;
}

export function parsePagination(query: QueryParams | undefined) {
  const pageRaw = Number.parseInt(firstQueryParam(query, "page") ?? "", 10);
  const pageSizeRaw = Number.parseInt(
    firstQueryParam(query, "pageSize") ?? "",
    10,
  );
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const pageSize =
    Number.isFinite(pageSizeRaw) && pageSizeRaw > 0
      ? Math.min(pageSizeRaw, MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;

  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function paginatedResult<T>(
  items: T[],
  total: number,
  page: number,
  pageSize: number,
): PaginatedResult<T> {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;

  return {
    items,
    pagination: {
      page,
      pageCount,
      pageSize,
      total,
      rangeStart,
      rangeEnd: rangeStart === 0 ? 0 : rangeStart + items.length - 1,
    },
  };
}

export function dateRangeFilter(
  from: string | undefined,
  to: string | undefined,
): Prisma.DateTimeFilter | undefined {
  const filter: Prisma.DateTimeFilter = {};

  if (from) {
    const fromDate = new Date(from);

    if (!Number.isNaN(fromDate.getTime())) {
      filter.gte = fromDate;
    }
  }

  if (to) {
    const toDate = new Date(to);

    if (!Number.isNaN(toDate.getTime())) {
      toDate.setUTCHours(23, 59, 59, 999);
      filter.lte = toDate;
    }
  }

  return Object.keys(filter).length > 0 ? filter : undefined;
}

export function containsFilter(value: string) {
  return {
    contains: value,
    mode: Prisma.QueryMode.insensitive,
  };
}
