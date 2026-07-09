import { ArrowRight, Layers3, PackageOpen } from "lucide-react";
import Link from "next/link";

import {
  Card,
  EmptyState,
  PageHeader,
} from "@/components/admin/layout";
import { TablePagination } from "@/components/admin/pagination";
import type { InventoryItem } from "@/lib/operations/types";
import {
  pageNumber,
  paginate,
  type PageSearchParams,
} from "@/lib/paginate";
import { apiGet } from "@/lib/server-api";

import { formatDate, formatQuantity } from "./inventory-utils";

export default async function StoreInventoryPage({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}) {
  const params = await searchParams;
  const inventory = await apiGet<InventoryItem[]>("/store/inventory");
  const stockedItems = inventory.filter((item) => item.batches.length > 0);
  const { pageItems, ...pagination } = paginate(
    stockedItems,
    pageNumber(params.page),
    12,
  );

  return (
    <>
      <Card title={`Raw material stock (${stockedItems.length})`}>
        {stockedItems.length === 0 ? (
          <EmptyState>No raw material batches have stock yet.</EmptyState>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {pageItems.map((item) => {
              const unit = item.rawMaterial.baseUnit.abbreviation;
              const earliestBatch = item.batches[0];
              const latestBatch = item.batches[item.batches.length - 1];

              return (
                <Link
                  className="group flex min-h-48 flex-col justify-between rounded-lg border border-[color:var(--border-muted)] bg-white p-4 shadow-[var(--shadow-whisper)] transition hover:-translate-y-0.5 hover:border-[var(--brand-burgundy)] hover:shadow-[var(--shadow-panel)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-burgundy)]"
                  href={`/store/inventory/${item.rawMaterial.id}`}
                  key={item.rawMaterial.id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="mt-1 text-lg font-semibold leading-tight text-[var(--text-primary)]">
                        {item.rawMaterial.name}
                      </h2>
                    </div>
                    <span className="inline-flex size-10 items-center justify-center rounded-[5px] border border-[color:var(--border-muted)] bg-[var(--surface-warm)] text-[var(--brand-burgundy)] transition group-hover:border-[var(--brand-burgundy)] group-hover:bg-[var(--brand-tint)]">
                      <PackageOpen aria-hidden className="size-5" />
                    </span>
                  </div>

                  <div className="mt-6">
                    <p className="text-2xl font-semibold tracking-tight text-[var(--brand-burgundy)]">
                      {formatQuantity(item.totalRemaining, unit)}
                    </p>
                    <p className="mt-1 text-sm text-[var(--text-muted)]">
                      Available in Store
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
                        Latest intake
                      </span>
                      <span className="font-medium text-[var(--text-primary)]">
                        {formatDate(latestBatch.batchDate)}
                      </span>
                    </div>
                  </div>

                  <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--brand-burgundy)]">
                    View inventory
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
          basePath="/store/inventory"
          searchParams={params}
          {...pagination}
        />
      </Card>
    </>
  );
}
