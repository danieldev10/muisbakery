import { ArrowLeft, PackageOpen } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Card, EmptyState, TableShell } from "@/components/admin/layout";
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
import {
  firstParam,
  matchesDateRange,
  matchesSearch,
} from "@/lib/table-filters";

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
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

function formatQuantity(value: string, unit: string) {
  return `${Number(value).toLocaleString("en", {
    maximumFractionDigits: 3,
  })} ${unit}`;
}

export default async function SalesInventoryDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ productId: string }>;
  searchParams: Promise<PageSearchParams>;
}) {
  const [{ productId }, query, inventory] = await Promise.all([
    params,
    searchParams,
    apiGet<SalesInventoryItem[]>("/sales/inventory"),
  ]);

  const item = inventory.find((entry) => entry.product.id === productId);

  if (!item) {
    notFound();
  }

  const unit = item.product.unit.abbreviation;
  const batchQuery = firstParam(query, "q");
  const from = firstParam(query, "from");
  const to = firstParam(query, "to");
  const filteredBatches = item.batches.filter(
    (batch) =>
      matchesSearch(batchQuery, [
        batch.batchNumber,
        batch.batchDate,
        batch.quantityReceived,
        batch.quantityRemaining,
        batch.productionRun?.producedAt,
        batch.createdBy?.name,
        batch.createdBy?.email,
      ]) && matchesDateRange(batch.receivedAt, from, to),
  );
  const { pageItems, ...pagination } = paginate(
    filteredBatches,
    pageNumber(query.page),
  );

  return (
    <>
      <div>
        <Link
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--text-muted)] transition hover:text-[var(--brand-burgundy)]"
          href="/sales/inventory"
        >
          <ArrowLeft aria-hidden className="size-4" />
          Sales inventory
        </Link>
      </div>

      <Card>
        <div className="flex items-start gap-3">
          <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-[5px] border border-[color:var(--border-muted)] bg-[var(--surface-warm)] text-[var(--brand-burgundy)]">
            <PackageOpen aria-hidden className="size-5" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold leading-tight tracking-tight text-[var(--text-primary)]">
              {formatProductName(item.product)}
            </h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {formatQuantity(item.totalRemaining, unit)} available across{" "}
              {item.batches.length} batch
              {item.batches.length === 1 ? "" : "es"} at{" "}
              {formatMoney(item.product.unitPrice)} per {unit}.
            </p>
          </div>
        </div>
      </Card>

      <Card title={`Sales batches (${filteredBatches.length} of ${item.batches.length})`}>
        {item.batches.length > 0 ? (
          <TableToolbar
            basePath={`/sales/inventory/${productId}`}
            dateFilters={[
              { label: "Received from", name: "from" },
              { label: "Received to", name: "to" },
            ]}
            searchParams={query}
            searchPlaceholder="Search batch, production run, quantity, or user"
          />
        ) : null}
        {item.batches.length === 0 ? (
          <EmptyState>No batches with remaining stock.</EmptyState>
        ) : filteredBatches.length === 0 ? (
          <EmptyState>No Sales batches match the current filters.</EmptyState>
        ) : (
          <TableShell
            head={
              <>
                <th className="py-2 pr-4">Batch</th>
                <th className="py-2 pr-4">Received</th>
                <th className="py-2 pr-4">Quantity</th>
                <th className="py-2 pr-4">Remaining</th>
                <th className="py-2 pr-4">Production run</th>
                <th className="py-2 pr-4">Received by</th>
              </>
            }
          >
            {pageItems.map((batch) => (
              <tr className="align-top" key={batch.id}>
                <td className="py-3 pr-4 font-medium text-stone-900">
                  Batch {batch.batchNumber}
                </td>
                <td className="py-3 pr-4 text-stone-600">
                  {formatDateTime(batch.receivedAt)}
                </td>
                <td className="py-3 pr-4 text-stone-600">
                  {formatQuantity(batch.quantityReceived, unit)}
                </td>
                <td className="py-3 pr-4 font-medium text-stone-900">
                  {formatQuantity(batch.quantityRemaining, unit)}
                </td>
                <td className="py-3 pr-4 text-stone-600">
                  {batch.productionRun
                    ? formatDateTime(batch.productionRun.producedAt)
                    : "-"}
                </td>
                <td className="py-3 pr-4 text-stone-600">
                  {batch.createdBy?.name ?? batch.createdBy?.email ?? "-"}
                </td>
              </tr>
            ))}
          </TableShell>
        )}
        <TablePagination
          basePath={`/sales/inventory/${productId}`}
          searchParams={query}
          {...pagination}
        />
      </Card>
    </>
  );
}
