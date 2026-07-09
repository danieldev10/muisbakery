export type PageSearchParams = Record<string, string | string[] | undefined>;

export const DEFAULT_PAGE_SIZE = 10;

export function pageNumber(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(raw ?? "", 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export function paginate<T>(
  items: T[],
  requestedPage: number,
  pageSize = DEFAULT_PAGE_SIZE,
) {
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(requestedPage, 1), pageCount);
  const startIndex = (page - 1) * pageSize;
  const pageItems = items.slice(startIndex, startIndex + pageSize);

  return {
    pageItems,
    page,
    pageCount,
    total,
    rangeStart: total === 0 ? 0 : startIndex + 1,
    rangeEnd: startIndex + pageItems.length,
  };
}
