import {
  Card,
  EmptyState,
  TableShell,
} from "@/components/admin/layout";
import type { MaterialRequest } from "@/lib/operations/types";
import { TablePagination } from "@/components/admin/pagination";
import { TableToolbar } from "@/components/admin/table-toolbar";
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
  MaterialRequestActions,
  MaterialRequestStatusBadge,
} from "./material-request-actions";

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

export default async function StoreRequestsPage({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}) {
  const params = await searchParams;
  const requests = await apiGet<MaterialRequest[]>("/store/material-requests");
  const query = firstParam(params, "q");
  const materialFilter = firstParam(params, "material");
  const statusFilter = firstParam(params, "status");
  const from = firstParam(params, "from");
  const to = firstParam(params, "to");
  const materialOptions = [
    ...new Map(
      requests.map((request) => [
        request.rawMaterial.id,
        {
          label: `${request.rawMaterial.name} (${request.rawMaterial.baseUnit.abbreviation})`,
          value: request.rawMaterial.id,
        },
      ]),
    ).values(),
  ];
  const statusOptions = [
    ...new Set(requests.map((request) => request.status)),
  ].map((status) => ({ label: optionLabel(status), value: status }));
  const filteredRequests = requests.filter(
    (request) =>
      matchesSearch(query, [
        request.rawMaterial.name,
        request.rawMaterial.baseUnit.abbreviation,
        request.status,
        optionLabel(request.status),
        request.notes,
        request.responseNotes,
        request.requestedBy.name,
        request.requestedBy.email,
        request.issuedBy?.name,
        request.issuedBy?.email,
      ]) &&
      matchesSelect(materialFilter, request.rawMaterial.id) &&
      matchesSelect(statusFilter, request.status) &&
      matchesDateRange(request.createdAt, from, to),
  );
  const { pageItems, ...pagination } = paginate(
    filteredRequests,
    pageNumber(params.page),
  );

  return (
    <Card title={`Production requests (${filteredRequests.length} of ${requests.length})`}>
        {requests.length > 0 ? (
          <TableToolbar
            basePath="/store/requests"
            dateFilters={[
              { label: "From", name: "from" },
              { label: "To", name: "to" },
            ]}
            searchParams={params}
            searchPlaceholder="Search material, requester, status, or notes"
            selectFilters={[
              {
                label: "Material",
                name: "material",
                options: materialOptions,
              },
              {
                label: "Status",
                name: "status",
                options: statusOptions,
              },
            ]}
          />
        ) : null}
        {requests.length === 0 ? (
          <EmptyState>No material requests yet.</EmptyState>
        ) : filteredRequests.length === 0 ? (
          <EmptyState>No material requests match the current filters.</EmptyState>
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
                <th className="py-2 pr-4 whitespace-nowrap">Actions</th>
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
                    <MaterialRequestStatusBadge
                      reason={request.responseNotes}
                      status={request.status}
                    />
                  </td>
                  <td className="py-3 pr-4 text-stone-600">
                    {formatDate(request.neededBy)}
                  </td>
                  <td className="py-3 pr-4 text-stone-600">
                    {request.requestedBy.name ?? request.requestedBy.email}
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap">
                    <MaterialRequestActions
                      canIssue={canIssue}
                      canReject={request.status === "PENDING"}
                      request={request}
                      unit={unit}
                    />
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
  );
}
