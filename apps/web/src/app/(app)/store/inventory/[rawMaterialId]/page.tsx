import { ArrowLeft, CheckCircle2, Layers3, PackageOpen } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  Card,
  EmptyState,
  PageHeader,
  TableShell,
} from "@/components/admin/layout";
import { TablePagination } from "@/components/admin/pagination";
import { TableToolbar } from "@/components/admin/table-toolbar";
import type { InventoryItem, MaterialRequest } from "@/lib/operations/types";
import {
  pageNumber,
  paginate,
  type PageSearchParams,
} from "@/lib/paginate";
import { apiGet } from "@/lib/server-api";
import {
  firstParam,
  matchesDateRange,
  matchesSearch,
  matchesSelect,
  optionLabel,
} from "@/lib/table-filters";

import {
  formatDate,
  formatDateTime,
  formatQuantity,
  isApprovedProductionRequest,
  statusClass,
  statusLabel,
} from "../inventory-utils";

function approvedAt(request: MaterialRequest) {
  return request.fulfilledAt ?? request.updatedAt;
}

export default async function StoreInventoryDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ rawMaterialId: string }>;
  searchParams: Promise<PageSearchParams>;
}) {
  const [{ rawMaterialId }, query, inventory, requests] = await Promise.all([
    params,
    searchParams,
    apiGet<InventoryItem[]>("/store/inventory"),
    apiGet<MaterialRequest[]>("/store/material-requests"),
  ]);

  const item = inventory.find(
    (entry) => entry.rawMaterial.id === rawMaterialId,
  );

  if (!item) {
    notFound();
  }

  const unit = item.rawMaterial.baseUnit.abbreviation;
  const batchQuery = firstParam(query, "batchQ");
  const batchSupplier = firstParam(query, "batchSupplier");
  const batchFrom = firstParam(query, "batchFrom");
  const batchTo = firstParam(query, "batchTo");
  const batchSupplierOptions = [
    ...new Map(
      item.batches
        .filter((batch) => batch.supplier)
        .map((batch) => [
          batch.supplier!.id,
          {
            label: batch.supplier!.name,
            value: batch.supplier!.id,
          },
        ]),
    ).values(),
  ];
  const filteredBatches = item.batches.filter(
    (batch) =>
      matchesSearch(batchQuery, [
        batch.batchNumber,
        batch.batchLabel,
        batch.reference,
        batch.supplier?.name,
        batch.quantityReceived,
        batch.quantityRemaining,
      ]) &&
      matchesSelect(batchSupplier, batch.supplier?.id ?? "") &&
      matchesDateRange(batch.receivedAt, batchFrom, batchTo),
  );
  const approvedRequests = requests
    .filter(
      (request) =>
        request.rawMaterial.id === rawMaterialId &&
        isApprovedProductionRequest(request),
    )
    .sort(
      (left, right) =>
        new Date(approvedAt(right)).getTime() -
        new Date(approvedAt(left)).getTime(),
    );
  const requestQuery = firstParam(query, "requestQ");
  const requestStatus = firstParam(query, "requestStatus");
  const requestFrom = firstParam(query, "requestFrom");
  const requestTo = firstParam(query, "requestTo");
  const requestStatusOptions = [
    ...new Set(approvedRequests.map((request) => request.status)),
  ].map((status) => ({ label: optionLabel(status), value: status }));
  const filteredApprovedRequests = approvedRequests.filter(
    (request) =>
      matchesSearch(requestQuery, [
        request.status,
        optionLabel(request.status),
        request.requestedQuantity,
        request.issuedQuantity,
        request.notes,
        request.responseNotes,
        request.requestedBy.name,
        request.requestedBy.email,
        ...request.issues.flatMap((issue) => [
          issue.batch.batchNumber,
          issue.batch.batchLabel,
          issue.batch.supplier?.name,
          issue.quantity,
        ]),
      ]) &&
      matchesSelect(requestStatus, request.status) &&
      matchesDateRange(approvedAt(request), requestFrom, requestTo),
  );
  const { pageItems: requestItems, ...requestPagination } = paginate(
    filteredApprovedRequests,
    pageNumber(query.requestPage),
    8,
  );

  return (
    <>
      <PageHeader
        title={item.rawMaterial.name}
        description="Current Store batches and approved Production material requests for this raw material."
        actions={
          <Link
            className="inline-flex h-10 items-center justify-center gap-2 rounded-[5px] border border-[color:var(--border-muted)] bg-white px-4 text-sm font-semibold text-[var(--text-secondary)] shadow-[var(--shadow-whisper)] transition hover:border-[var(--brand-burgundy)] hover:bg-[var(--surface-warm)] hover:text-[var(--brand-burgundy)]"
            href="/store/inventory"
          >
            <ArrowLeft aria-hidden className="size-4" />
            Inventory
          </Link>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <section className="rounded-xl border border-[color:var(--border-muted)] bg-white p-5 shadow-[var(--shadow-whisper)]">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[1.3px] text-[var(--text-muted)]">
              Available
            </p>
            <PackageOpen
              aria-hidden
              className="size-5 text-[var(--brand-burgundy)]"
            />
          </div>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-[var(--brand-burgundy)]">
            {formatQuantity(item.totalRemaining, unit)}
          </p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Remaining Store stock
          </p>
        </section>

        <section className="rounded-xl border border-[color:var(--border-muted)] bg-white p-5 shadow-[var(--shadow-whisper)]">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[1.3px] text-[var(--text-muted)]">
              FIFO batches
            </p>
            <Layers3
              aria-hidden
              className="size-5 text-[var(--brand-burgundy)]"
            />
          </div>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
            {item.batches.length.toLocaleString("en")}
          </p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Open batches with remaining stock
          </p>
        </section>

        <section className="rounded-xl border border-[color:var(--border-muted)] bg-white p-5 shadow-[var(--shadow-whisper)]">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[1.3px] text-[var(--text-muted)]">
              Approved requests
            </p>
            <CheckCircle2
              aria-hidden
              className="size-5 text-[var(--brand-burgundy)]"
            />
          </div>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
            {approvedRequests.length.toLocaleString("en")}
          </p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Production requests issued by Store
          </p>
        </section>
      </div>

      <Card title={`Current batches (${filteredBatches.length} of ${item.batches.length})`}>
        {item.batches.length > 0 ? (
          <TableToolbar
            basePath={`/store/inventory/${rawMaterialId}`}
            dateFilters={[
              { label: "Received from", name: "batchFrom" },
              { label: "Received to", name: "batchTo" },
            ]}
            searchParam="batchQ"
            searchParams={query}
            searchPlaceholder="Search batch, supplier, reference, or quantity"
            selectFilters={[
              {
                label: "Supplier",
                name: "batchSupplier",
                options: batchSupplierOptions,
              },
            ]}
          />
        ) : null}
        {item.batches.length === 0 ? (
          <EmptyState>No open batches currently have remaining stock.</EmptyState>
        ) : filteredBatches.length === 0 ? (
          <EmptyState>No batches match the current filters.</EmptyState>
        ) : (
          <TableShell
            head={
              <>
                <th className="py-2 pr-4">Batch</th>
                <th className="py-2 pr-4">Batch date</th>
                <th className="py-2 pr-4">Received</th>
                <th className="py-2 pr-4">Remaining</th>
                <th className="py-2 pr-4">Supplier</th>
                <th className="py-2 pr-4">Reference</th>
              </>
            }
          >
            {filteredBatches.map((batch) => (
              <tr className="align-top" key={batch.id}>
                <td className="py-3 pr-4 font-medium text-[var(--text-primary)]">
                  Batch {batch.batchNumber}
                </td>
                <td className="py-3 pr-4 text-[var(--text-secondary)]">
                  {formatDate(batch.batchDate)}
                </td>
                <td className="py-3 pr-4 text-[var(--text-secondary)]">
                  {formatQuantity(batch.quantityReceived, unit)}
                </td>
                <td className="py-3 pr-4 font-medium text-[var(--brand-burgundy)]">
                  {formatQuantity(batch.quantityRemaining, unit)}
                </td>
                <td className="py-3 pr-4 text-[var(--text-secondary)]">
                  {batch.supplier?.name ?? "-"}
                </td>
                <td className="py-3 pr-4 text-[var(--text-secondary)]">
                  {batch.reference ?? "-"}
                </td>
              </tr>
            ))}
          </TableShell>
        )}
      </Card>

      <Card title={`Approved Production requests (${filteredApprovedRequests.length} of ${approvedRequests.length})`}>
        {approvedRequests.length > 0 ? (
          <TableToolbar
            basePath={`/store/inventory/${rawMaterialId}`}
            dateFilters={[
              { label: "Approved from", name: "requestFrom" },
              { label: "Approved to", name: "requestTo" },
            ]}
            pageParams={["requestPage"]}
            searchParam="requestQ"
            searchParams={query}
            searchPlaceholder="Search requester, status, issued batch, or notes"
            selectFilters={[
              {
                label: "Status",
                name: "requestStatus",
                options: requestStatusOptions,
              },
            ]}
          />
        ) : null}
        {approvedRequests.length === 0 ? (
          <EmptyState>
            No approved Production requests have been issued for this material.
          </EmptyState>
        ) : filteredApprovedRequests.length === 0 ? (
          <EmptyState>
            No approved Production requests match the current filters.
          </EmptyState>
        ) : (
          <TableShell
            head={
              <>
                <th className="py-2 pr-4">Requested</th>
                <th className="py-2 pr-4">Issued</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Approved</th>
                <th className="py-2 pr-4">Requester</th>
                <th className="py-2 pr-4">Issued batches</th>
              </>
            }
          >
            {requestItems.map((request) => (
              <tr className="align-top" key={request.id}>
                <td className="py-3 pr-4 text-[var(--text-secondary)]">
                  <p>{formatQuantity(request.requestedQuantity, unit)}</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {formatDateTime(request.createdAt)}
                  </p>
                </td>
                <td className="py-3 pr-4 font-medium text-[var(--text-primary)]">
                  {formatQuantity(request.issuedQuantity, unit)}
                </td>
                <td className="py-3 pr-4">
                  <span
                    className={`inline-flex h-5 items-center justify-center rounded-full px-2.5 text-xs font-medium leading-none ${statusClass(
                      request.status,
                    )}`}
                  >
                    {statusLabel(request.status)}
                  </span>
                </td>
                <td className="py-3 pr-4 text-[var(--text-secondary)]">
                  {formatDateTime(approvedAt(request))}
                </td>
                <td className="py-3 pr-4 text-[var(--text-secondary)]">
                  {request.requestedBy.name ?? request.requestedBy.email}
                </td>
                <td className="py-3 pr-4 text-[var(--text-secondary)]">
                  {request.issues.length === 0 ? (
                    "-"
                  ) : (
                    <div className="grid gap-1">
                      {request.issues.map((issue) => (
                        <p key={issue.id}>
                          Batch {issue.batch.batchNumber} ·{" "}
                          {formatQuantity(issue.quantity, unit)}
                        </p>
                      ))}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </TableShell>
        )}
        <TablePagination
          basePath={`/store/inventory/${rawMaterialId}`}
          pageParam="requestPage"
          searchParams={query}
          {...requestPagination}
        />
      </Card>
    </>
  );
}
