import { Search, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";

import type { PageSearchParams } from "@/lib/paginate";
import { firstParam } from "@/lib/table-filters";

type FilterOption = {
  label: string;
  value: string;
};

type SelectFilter = {
  label: string;
  name: string;
  options: FilterOption[];
  value?: string;
};

type DateFilter = {
  label: string;
  name: string;
  value?: string;
};

function paramEntries(params: PageSearchParams) {
  return Object.entries(params).flatMap(([key, value]) => {
    if (value === undefined) {
      return [];
    }
    return (Array.isArray(value) ? value : [value]).map((entry) => ({
      key,
      value: entry,
    }));
  });
}

function resetHref(
  basePath: string,
  params: PageSearchParams,
  controlledNames: Set<string>,
) {
  const resetParams = new URLSearchParams();

  for (const { key, value } of paramEntries(params)) {
    if (!controlledNames.has(key)) {
      resetParams.append(key, value);
    }
  }

  const query = resetParams.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export function TableToolbar({
  basePath,
  searchParams,
  searchParam = "q",
  searchPlaceholder = "Search records",
  selectFilters = [],
  dateFilters = [],
  pageParams = ["page"],
}: {
  basePath: string;
  searchParams: PageSearchParams;
  searchParam?: string;
  searchPlaceholder?: string;
  selectFilters?: SelectFilter[];
  dateFilters?: DateFilter[];
  pageParams?: string[];
}) {
  const searchValue = firstParam(searchParams, searchParam);
  const controlledNames = new Set([
    searchParam,
    ...selectFilters.map((filter) => filter.name),
    ...dateFilters.map((filter) => filter.name),
    ...pageParams,
  ]);
  const hasActiveFilters = [...controlledNames].some((name) => {
    if (pageParams.includes(name)) {
      return false;
    }
    return Boolean(firstParam(searchParams, name));
  });

  return (
    <form
      action={basePath}
      className="mb-4 rounded-lg border border-[color:var(--border-muted)] bg-[var(--surface-warm)] p-3"
      method="get"
    >
      {paramEntries(searchParams).map(({ key, value }, index) =>
        controlledNames.has(key) ? null : (
          <input
            key={`${key}-${value}-${index}`}
            name={key}
            type="hidden"
            value={value}
          />
        ),
      )}
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid min-w-56 flex-1 basis-64 gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
          Search
          <span className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--text-muted)]"
            />
            <input
              className="h-10 w-full rounded-md border border-[color:var(--border-muted)] bg-white pl-9 pr-3 text-sm font-normal tracking-normal text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--brand-burgundy)] focus:ring-4 focus:ring-red-100"
              defaultValue={searchValue}
              name={searchParam}
              placeholder={searchPlaceholder}
              type="search"
            />
          </span>
        </label>

        {selectFilters.map((filter) => (
          <label
            className="grid gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]"
            key={filter.name}
          >
            {filter.label}
            <select
              className="h-10 min-w-36 rounded-md border border-[color:var(--border-muted)] bg-white px-3 text-sm font-normal normal-case tracking-normal text-[var(--text-primary)] outline-none transition focus:border-[var(--brand-burgundy)] focus:ring-4 focus:ring-red-100"
              defaultValue={filter.value ?? firstParam(searchParams, filter.name)}
              name={filter.name}
            >
              <option value="">All</option>
              {filter.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ))}

        {dateFilters.map((filter) => (
          <label
            className="grid gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]"
            key={filter.name}
          >
            {filter.label}
            <input
              className="h-10 min-w-36 rounded-md border border-[color:var(--border-muted)] bg-white px-3 text-sm font-normal normal-case tracking-normal text-[var(--text-primary)] outline-none transition focus:border-[var(--brand-burgundy)] focus:ring-4 focus:ring-red-100"
              defaultValue={filter.value ?? firstParam(searchParams, filter.name)}
              name={filter.name}
              type="date"
            />
          </label>
        ))}

        <div className="flex items-center gap-2">
          <button
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[var(--brand-burgundy)] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--brand-burgundy-dark)]"
            type="submit"
          >
            <SlidersHorizontal aria-hidden className="size-4" />
            Apply
          </button>
          {hasActiveFilters ? (
            <Link
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-[color:var(--border-muted)] bg-white px-4 text-sm font-semibold text-[var(--text-secondary)] transition hover:border-[var(--brand-burgundy)] hover:text-[var(--brand-burgundy)]"
              href={resetHref(basePath, searchParams, controlledNames)}
            >
              <X aria-hidden className="size-4" />
              Reset
            </Link>
          ) : null}
        </div>
      </div>
    </form>
  );
}
