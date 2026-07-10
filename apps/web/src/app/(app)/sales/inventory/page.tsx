import { ArrowRight, Layers3, PackageOpen } from "lucide-react";
import Link from "next/link";

import { Card, EmptyState } from "@/components/admin/layout";
import { TablePagination } from "@/components/admin/pagination";
import { TableToolbar } from "@/components/admin/table-toolbar";
import type { SalesInventoryItem } from "@/lib/operations/types";
import {
  pageNumber,
  paginate,
  type PageSearchParams,
} from "@/lib/paginate";
import { formatProductName } from "@/lib/product-label";
import { apiGet } from "@/lib/server-api";
import { firstParam, matchesSearch } from "@/lib/table-filters";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function formatQuantity(value: string, unit: string) {
  return `${Number(value).toLocaleString("en", {
    maximumFractionDigits: 3,
  })} ${unit}`;
}

function formatMoney(value: string | null) {
  if (!value) {
    return "-";
  }

  return `₦${Number(value).toLocaleString("en", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default async function SalesInventoryPage({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}) {
  const params = await searchParams;
  const inventory = await apiGet<SalesInventoryItem[]>("/sales/inventory");
  const stockedItems = inventory.filter((item) => item.batches.length > 0);
  const query = firstParam(params, "q");
  const filteredItems = stockedItems.filter((item) =>
    matchesSearch(query, [
      formatProductName(item.product),
      item.product.unit.name,
      item.product.unit.abbreviation,
      item.totalRemaining,
      item.product.unitPrice,
      ...item.batches.flatMap((batch) => [
        batch.batchNumber,
        batch.batchDate,
        batch.quantityReceived,
        batch.quantityRemaining,
        batch.productionRun?.producedAt,
        batch.createdBy?.name,
        batch.createdBy?.email,
      ]),
    ]),
  );
  const { pageItems, ...pagination } = paginate(
    filteredItems,
    pageNumber(params.page),
    12,
  );

  return (
    <Card title={`Finished goods stock (${filteredItems.length} of ${stockedItems.length})`}>
      {stockedItems.length > 0 ? (
        <TableToolbar
          basePath="/sales/inventory"
          searchParams={params}
          searchPlaceholder="Search product, unit, batch, production run, or user"
        />
      ) : null}
      {stockedItems.length === 0 ? (
        <EmptyState>No finished goods have been sent to Sales yet.</EmptyState>
      ) : filteredItems.length === 0 ? (
        <EmptyState>No Sales inventory matches the current filters.</EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {pageItems.map((item) => {
            const unit = item.product.unit.abbreviation;
            const earliestBatch = item.batches[0];
            const latestBatch = item.batches[item.batches.length - 1];

            return (
              <Link
                className="group flex min-h-48 flex-col justify-between rounded-lg border border-[color:var(--border-muted)] bg-white p-4 shadow-[var(--shadow-whisper)] transition hover:-translate-y-0.5 hover:border-[var(--brand-burgundy)] hover:shadow-[var(--shadow-panel)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-burgundy)]"
                href={`/sales/inventory/${item.product.id}`}
                key={item.product.id}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="mt-1 text-lg font-semibold leading-tight text-[var(--text-primary)]">
                      {formatProductName(item.product)}
                    </h2>
                    <p className="mt-1 text-sm text-[var(--text-muted)]">
                      {formatMoney(item.product.unitPrice)} per {unit}
                    </p>
                  </div>
                  <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-[5px] border border-[color:var(--border-muted)] bg-[var(--surface-warm)] text-[var(--brand-burgundy)] transition group-hover:border-[var(--brand-burgundy)] group-hover:bg-[var(--brand-tint)]">
                    <PackageOpen aria-hidden className="size-5" />
                  </span>
                </div>

                <div className="mt-6">
                  <p className="text-2xl font-semibold tracking-tight text-[var(--brand-burgundy)]">
                    {formatQuantity(
                      item.totalRemaining,
                      item.product.unit.abbreviation,
                    )}
                  </p>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    Available in Sales
                  </p>
                </div>

                <div className="mt-5 grid gap-2 border-t border-[color:var(--border-muted)] pt-4 text-sm text-[var(--text-secondary)]">
                  <div className="flex items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-1.5 text-[var(--text-muted)]">
                      <Layers3 aria-hidden className="size-4" />
                      Batches
                    </span>
                    <span className="font-semibold text-[var(--text-primary)]">
                      {item.batches.length}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[var(--text-muted)]">
                      Current batch
                    </span>
                    <span className="font-medium text-[var(--text-primary)]">
                      Batch {earliestBatch.batchNumber}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[var(--text-muted)]">
                      Latest received
                    </span>
                    <span className="font-medium text-[var(--text-primary)]">
                      {formatDate(latestBatch.receivedAt)}
                    </span>
                  </div>
                </div>

                <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--brand-burgundy)]">
                  View batches
                  <ArrowRight
                    aria-hidden
                    className="size-4 transition group-hover:translate-x-0.5"
                  />
                </span>
              </Link>
            );
          })}
        </div>
      )}
      <TablePagination
        basePath="/sales/inventory"
        searchParams={params}
        {...pagination}
      />
    </Card>
  );
}
