import { ArrowLeft, Boxes } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Card, EmptyState, TableShell } from "@/components/admin/layout";
import { TablePagination } from "@/components/admin/pagination";
import type { ProductionMaterialInventoryItem } from "@/lib/operations/types";
import {
  pageNumber,
  paginate,
  type PageSearchParams,
} from "@/lib/paginate";
import { apiGet } from "@/lib/server-api";

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatQuantity(value: string, unit: string) {
  return `${Number(value).toLocaleString("en", {
    maximumFractionDigits: 3,
  })} ${unit}`;
}

export default async function ProductionInventoryDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ rawMaterialId: string }>;
  searchParams: Promise<PageSearchParams>;
}) {
  const [{ rawMaterialId }, query, inventory] = await Promise.all([
    params,
    searchParams,
    apiGet<ProductionMaterialInventoryItem[]>("/production/inventory"),
  ]);

  const item = inventory.find(
    (entry) => entry.rawMaterial.id === rawMaterialId,
  );

  if (!item) {
    notFound();
  }

  const unit = item.rawMaterial.baseUnit.abbreviation;
  const { pageItems, ...pagination } = paginate(
    item.batches,
    pageNumber(query.page),
  );

  return (
    <>
      <div>
        <Link
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--text-muted)] transition hover:text-[var(--brand-burgundy)]"
          href="/production/inventory"
        >
          <ArrowLeft aria-hidden className="size-4" />
          Production inventory
        </Link>
      </div>

      <Card>
        <div className="flex items-start gap-3">
          <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-[5px] border border-[color:var(--border-muted)] bg-[var(--surface-warm)] text-[var(--brand-burgundy)]">
            <Boxes aria-hidden className="size-5" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold leading-tight tracking-tight text-[var(--text-primary)]">
              {item.rawMaterial.name}
            </h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {formatQuantity(item.totalRemaining, unit)} available across{" "}
              {item.batches.length} issued batch
              {item.batches.length === 1 ? "" : "es"}. Oldest stock is consumed
              first.
            </p>
          </div>
        </div>
      </Card>

      <Card title={`Issued batches (${item.batches.length})`}>
        {item.batches.length === 0 ? (
          <EmptyState>No batches with remaining stock.</EmptyState>
        ) : (
          <TableShell
            head={
              <>
                <th className="py-2 pr-4">Issued</th>
                <th className="py-2 pr-4">Store batch</th>
                <th className="py-2 pr-4">Received qty</th>
                <th className="py-2 pr-4">Remaining</th>
                <th className="py-2 pr-4">Issued by</th>
              </>
            }
          >
            {pageItems.map((batch) => (
              <tr className="align-top" key={batch.id}>
                <td className="py-3 pr-4 text-stone-600">
                  {formatDateTime(batch.receivedAt)}
                </td>
                <td className="py-3 pr-4 text-stone-600">
                  {batch.storeBatch
                    ? `Batch ${batch.storeBatch.batchNumber}`
                    : "-"}
                </td>
                <td className="py-3 pr-4 text-stone-600">
                  {formatQuantity(batch.quantityReceived, unit)}
                </td>
                <td className="py-3 pr-4 font-medium text-stone-900">
                  {formatQuantity(batch.quantityRemaining, unit)}
                </td>
                <td className="py-3 pr-4 text-stone-600">
                  {batch.createdBy?.name ?? batch.createdBy?.email ?? "-"}
                </td>
              </tr>
            ))}
          </TableShell>
        )}
        <TablePagination
          basePath={`/production/inventory/${rawMaterialId}`}
          searchParams={query}
          {...pagination}
        />
      </Card>
    </>
  );
}
