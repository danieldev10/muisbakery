import { ArrowRight, Boxes, Layers3 } from "lucide-react";
import Link from "next/link";

import { Card, EmptyState } from "@/components/admin/layout";
import { TablePagination } from "@/components/admin/pagination";
import { TableToolbar } from "@/components/admin/table-toolbar";
import type { ProductionMaterialInventoryItem } from "@/lib/operations/types";
import {
  pageNumber,
  paginate,
  type PageSearchParams,
} from "@/lib/paginate";
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

export default async function ProductionInventoryPage({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}) {
  const params = await searchParams;
  const inventory = await apiGet<ProductionMaterialInventoryItem[]>(
    "/production/inventory",
  );
  const stockedItems = inventory.filter((item) => item.batches.length > 0);
  const query = firstParam(params, "q");
  const filteredItems = stockedItems.filter((item) =>
    matchesSearch(query, [
      item.rawMaterial.name,
      item.rawMaterial.baseUnit.name,
      item.rawMaterial.baseUnit.abbreviation,
      item.totalRemaining,
      ...item.batches.flatMap((batch) => [
        batch.quantityReceived,
        batch.quantityRemaining,
        batch.storeBatch?.batchNumber,
        batch.storeBatch?.batchDate,
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
    <Card title={`Raw materials in Production (${filteredItems.length} of ${stockedItems.length})`}>
      {stockedItems.length > 0 ? (
        <TableToolbar
          basePath="/production/inventory"
          searchParams={params}
          searchPlaceholder="Search material, unit, Store batch, or user"
        />
      ) : null}
      {stockedItems.length === 0 ? (
        <EmptyState>No issued raw materials are available in Production.</EmptyState>
      ) : filteredItems.length === 0 ? (
        <EmptyState>No Production inventory matches the current filters.</EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {pageItems.map((item) => {
            const unit = item.rawMaterial.baseUnit.abbreviation;
            const latestBatch = item.batches[item.batches.length - 1];

            return (
              <Link
                className="group flex min-h-48 flex-col justify-between rounded-lg border border-[color:var(--border-muted)] bg-white p-4 shadow-[var(--shadow-whisper)] transition hover:-translate-y-0.5 hover:border-[var(--brand-burgundy)] hover:shadow-[var(--shadow-panel)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-burgundy)]"
                href={`/production/inventory/${item.rawMaterial.id}`}
                key={item.rawMaterial.id}
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="mt-1 text-lg font-semibold leading-tight text-[var(--text-primary)]">
                    {item.rawMaterial.name}
                  </h2>
                  <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-[5px] border border-[color:var(--border-muted)] bg-[var(--surface-warm)] text-[var(--brand-burgundy)] transition group-hover:border-[var(--brand-burgundy)] group-hover:bg-[var(--brand-tint)]">
                    <Boxes aria-hidden className="size-5" />
                  </span>
                </div>

                <div className="mt-6">
                  <p className="text-2xl font-semibold tracking-tight text-[var(--brand-burgundy)]">
                    {formatQuantity(item.totalRemaining, unit)}
                  </p>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    Available in Production
                  </p>
                </div>

                <div className="mt-5 grid gap-2 border-t border-[color:var(--border-muted)] pt-4 text-sm text-[var(--text-secondary)]">
                  <div className="flex items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-1.5 text-[var(--text-muted)]">
                      <Layers3 aria-hidden className="size-4" />
                      Issued batches
                    </span>
                    <span className="font-semibold text-[var(--text-primary)]">
                      {item.batches.length}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[var(--text-muted)]">Last issued</span>
                    <span className="font-medium text-[var(--text-primary)]">
                      {latestBatch ? formatDate(latestBatch.receivedAt) : "-"}
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
        basePath="/production/inventory"
        searchParams={params}
        {...pagination}
      />
    </Card>
  );
}
