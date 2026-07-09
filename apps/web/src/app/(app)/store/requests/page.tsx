import { InlineActionForm } from "@/components/admin/inline-action-form";
import {
  Card,
  EmptyState,
  PageHeader,
  TableShell,
} from "@/components/admin/layout";
import type {
  MaterialRequest,
  MaterialRequestStatus,
} from "@/lib/operations/types";
import { TablePagination } from "@/components/admin/pagination";
import {
  pageNumber,
  paginate,
  type PageSearchParams,
} from "@/lib/paginate";
import { apiGet } from "@/lib/server-api";

import { issueMaterialRequest, rejectMaterialRequest } from "./actions";

const inputClass =
  "h-9 w-28 rounded-md border border-stone-300 bg-white px-2 text-sm text-stone-950 outline-none transition focus:border-red-700 focus:ring-4 focus:ring-red-100";

const noteClass =
  "min-h-9 w-44 rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm text-stone-950 outline-none transition focus:border-red-700 focus:ring-4 focus:ring-red-100";

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

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

function statusLabel(status: MaterialRequestStatus) {
  return status
    .split("_")
    .map((part) => part[0] + part.slice(1).toLowerCase())
    .join(" ");
}

function statusClass(status: MaterialRequestStatus) {
  if (status === "FULFILLED") {
    return "bg-emerald-50 text-emerald-800";
  }
  if (status === "PARTIALLY_ISSUED") {
    return "bg-amber-50 text-amber-800";
  }
  if (status === "CANCELLED") {
    return "bg-stone-100 text-stone-500";
  }
  if (status === "REJECTED") {
    return "bg-red-800 text-red-50";
  }
  return "bg-red-50 text-red-800";
}

function RequestStatusBadge({ status }: { status: MaterialRequestStatus }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusClass(
        status,
      )}`}
    >
      {statusLabel(status)}
    </span>
  );
}

export default async function StoreRequestsPage({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}) {
  const params = await searchParams;
  const requests = await apiGet<MaterialRequest[]>("/store/material-requests");
  const { pageItems, ...pagination } = paginate(
    requests,
    pageNumber(params.page),
  );

  return (
    <>
      <PageHeader
        title="Material requests"
        description="Review Production requests and issue raw materials from the earliest available batches."
      />

      <Card title={`Production requests (${requests.length})`}>
        {requests.length === 0 ? (
          <EmptyState>No material requests yet.</EmptyState>
        ) : (
          <TableShell
            head={
              <>
                <th className="py-2 pr-4">Material</th>
                <th className="py-2 pr-4">Requested</th>
                <th className="py-2 pr-4">Issued</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Needed by</th>
                <th className="py-2 pr-4">Requester</th>
                <th className="py-2 pr-4">Issue</th>
              </>
            }
          >
            {pageItems.map((request) => {
              const unit = request.rawMaterial.baseUnit.abbreviation;
              const canIssue =
                request.status === "PENDING" ||
                request.status === "PARTIALLY_ISSUED";

              return (
                <tr className="align-top" key={request.id}>
                  <td className="py-3 pr-4">
                    <p className="font-medium text-stone-900">
                      {request.rawMaterial.name}
                    </p>
                    {request.notes ? (
                      <p className="mt-1 max-w-56 text-xs text-stone-500">
                        {request.notes}
                      </p>
                    ) : null}
                  </td>
                  <td className="py-3 pr-4 text-stone-600">
                    {formatQuantity(request.requestedQuantity, unit)}
                  </td>
                  <td className="py-3 pr-4 text-stone-600">
                    <p>{formatQuantity(request.issuedQuantity, unit)}</p>
                    <p className="text-xs text-stone-500">
                      {formatQuantity(request.remainingQuantity, unit)} left
                    </p>
                  </td>
                  <td className="py-3 pr-4">
                    <RequestStatusBadge status={request.status} />
                    {request.status === "REJECTED" && request.responseNotes ? (
                      <p className="mt-1 max-w-48 text-xs text-stone-500">
                        {request.responseNotes}
                      </p>
                    ) : null}
                  </td>
                  <td className="py-3 pr-4 text-stone-600">
                    {formatDate(request.neededBy)}
                  </td>
                  <td className="py-3 pr-4 text-stone-600">
                    {request.requestedBy.name ?? request.requestedBy.email}
                  </td>
                  <td className="py-3 pr-4">
                    {canIssue ? (
                      <div className="grid gap-3">
                        <InlineActionForm
                          action={issueMaterialRequest}
                          className="grid gap-2"
                          pendingLabel="Issuing"
                          submitLabel="Issue"
                          successMessage="Issued."
                        >
                          <input name="id" type="hidden" value={request.id} />
                          <input
                            className={inputClass}
                            max={request.remainingQuantity}
                            min="1"
                            name="quantity"
                            placeholder={request.remainingQuantity}
                            step="1"
                            type="number"
                          />
                          <textarea
                            className={noteClass}
                            name="notes"
                            placeholder="Notes"
                          />
                        </InlineActionForm>
                        {request.status === "PENDING" ? (
                          <InlineActionForm
                            action={rejectMaterialRequest}
                            buttonClassName="rounded-md border border-red-300 px-2 py-1 text-xs font-medium text-red-800 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                            className="grid gap-2"
                            pendingLabel="Rejecting"
                            submitLabel="Reject"
                            successMessage="Rejected."
                          >
                            <input name="id" type="hidden" value={request.id} />
                            <textarea
                              className={noteClass}
                              name="notes"
                              placeholder="Reason for rejection"
                            />
                          </InlineActionForm>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-sm text-stone-500">-</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </TableShell>
        )}
        <TablePagination
          basePath="/store/requests"
          searchParams={params}
          {...pagination}
        />
      </Card>
    </>
  );
}
