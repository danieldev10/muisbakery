import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import type { PageSearchParams } from "@/lib/paginate";

const pageLinkClass =
  "inline-flex h-8 min-w-8 items-center justify-center gap-1 rounded-md border border-[color:var(--border-muted)] bg-white px-2 text-xs font-medium text-[var(--text-secondary)] transition hover:border-[var(--brand-burgundy)] hover:text-[var(--brand-burgundy)]";

const currentPageClass =
  "inline-flex h-8 min-w-8 items-center justify-center rounded-md bg-[var(--brand-burgundy)] px-2 text-xs font-semibold text-white";

const disabledClass =
  "inline-flex h-8 min-w-8 items-center justify-center gap-1 rounded-md border border-[color:var(--border-muted)] bg-[var(--surface-muted)] px-2 text-xs font-medium text-[var(--text-muted)] opacity-60";

function buildHref(
  basePath: string,
  searchParams: PageSearchParams,
  pageParam: string,
  page: number,
) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (key === pageParam || value === undefined) {
      continue;
    }
    for (const entry of Array.isArray(value) ? value : [value]) {
      params.append(key, entry);
    }
  }

  if (page > 1) {
    params.set(pageParam, String(page));
  }

  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

/** Numbered window around the current page: 1 … 4 5 [6] 7 8 … 12 */
function pageWindow(page: number, pageCount: number) {
  const pages = new Set<number>([1, pageCount]);

  for (let n = page - 2; n <= page + 2; n += 1) {
    if (n >= 1 && n <= pageCount) {
      pages.add(n);
    }
  }

  return [...pages].sort((left, right) => left - right);
}

export function TablePagination({
  basePath,
  searchParams = {},
  pageParam = "page",
  page,
  pageCount,
  total,
  rangeStart,
  rangeEnd,
}: {
  basePath: string;
  searchParams?: PageSearchParams;
  pageParam?: string;
  page: number;
  pageCount: number;
  total: number;
  rangeStart: number;
  rangeEnd: number;
}) {
  if (pageCount <= 1) {
    return null;
  }

  const numbers = pageWindow(page, pageCount);
  const href = (n: number) => buildHref(basePath, searchParams, pageParam, n);

  return (
    <nav
      aria-label="Pagination"
      className="mt-3 flex flex-wrap items-center justify-between gap-3"
    >
      <p className="text-xs text-[var(--text-muted)]">
        Showing {rangeStart.toLocaleString("en")}–{rangeEnd.toLocaleString("en")}{" "}
        of {total.toLocaleString("en")}
      </p>

      <div className="flex items-center gap-1.5">
        {page > 1 ? (
          <Link
            aria-label="Previous page"
            className={pageLinkClass}
            href={href(page - 1)}
            prefetch
          >
            <ChevronLeft aria-hidden className="size-3.5" />
            Prev
          </Link>
        ) : (
          <span aria-disabled className={disabledClass}>
            <ChevronLeft aria-hidden className="size-3.5" />
            Prev
          </span>
        )}

        {numbers.map((n, index) => {
          const previous = numbers[index - 1];
          const gap = previous !== undefined && n - previous > 1;

          return (
            <span className="flex items-center gap-1.5" key={n}>
              {gap ? (
                <span className="px-0.5 text-xs text-[var(--text-muted)]">…</span>
              ) : null}
              {n === page ? (
                <span aria-current="page" className={currentPageClass}>
                  {n}
                </span>
              ) : (
                <Link className={pageLinkClass} href={href(n)} prefetch>
                  {n}
                </Link>
              )}
            </span>
          );
        })}

        {page < pageCount ? (
          <Link
            aria-label="Next page"
            className={pageLinkClass}
            href={href(page + 1)}
            prefetch
          >
            Next
            <ChevronRight aria-hidden className="size-3.5" />
          </Link>
        ) : (
          <span aria-disabled className={disabledClass}>
            Next
            <ChevronRight aria-hidden className="size-3.5" />
          </span>
        )}
      </div>
    </nav>
  );
}
