import {
  Card,
  EmptyState,
  TableShell,
} from "@/components/admin/layout";
import type { MaterialRequest } from "@/lib/operations/types";
import { TablePagination } from "@/components/admin/pagination";
import {
  pageNumber,
  paginate,
  type PageSearchParams,
} from "@/lib/paginate";
import { apiGet } from "@/lib/server-api";

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
  const { pageItems, ...pagination } = paginate(
    requests,
    pageNumber(params.page),
  );

  return (
    <>


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
    </>
  );
}
