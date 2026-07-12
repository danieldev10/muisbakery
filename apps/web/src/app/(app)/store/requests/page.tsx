import {
  Card,
  EmptyState,
  TableShell,
} from "@/components/admin/layout";
import type { MaterialRequest, StoreOptions } from "@/lib/operations/types";
import { TablePagination } from "@/components/admin/pagination";
import { TableToolbar } from "@/components/admin/table-toolbar";
import {
  paginatedApiPath,
  type PaginatedResponse,
  type PageSearchParams,
} from "@/lib/paginate";
import { apiGet } from "@/lib/server-api";
import { formatProductName } from "@/lib/product-label";
import {
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
  const [options, result] = await Promise.all([
    apiGet<StoreOptions>("/store/options"),
    apiGet<PaginatedResponse<MaterialRequest>>(
      paginatedApiPath("/store/material-requests", params, [
        "q",
        "material",
        "status",
        "from",
        "to",
      ]),
    ),
  ]);
  const requests = result.items;
  const pagination = result.pagination;
  const materialOptions = options.rawMaterials.map((material) => ({
    label: `${material.name} (${material.baseUnit.abbreviation})`,
    value: material.id,
  }));
  const statusOptions = [
    "PENDING",
    "PARTIALLY_ISSUED",
    "FULFILLED",
    "CANCELLED",
    "REJECTED",
  ].map((status) => ({ label: optionLabel(status), value: status }));

  return (
    <Card title={`Production requests (${pagination.total})`}>
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
        {pagination.total === 0 ? (
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
            {requests.map((request) => {
              const unit = request.rawMaterial.baseUnit.abbreviation;
              const canIssue =
                request.status === "PENDING" ||
                request.status === "PARTIALLY_ISSUED";

              return (
                <tr className="align-top" key={request.id}>
                  <td className="py-3 pr-4">
                    {request.productionRequest ? (
                      <p className="mb-1 text-xs font-semibold uppercase tracking-[1.1px] text-[var(--brand-burgundy)]">
                        {formatProductName(request.productionRequest.product)} ·{" "}
                        {formatQuantity(
                          request.productionRequest.requestedQuantity,
                          request.productionRequest.product.unit.abbreviation,
                        )}
                      </p>
                    ) : null}
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
                      canReject={
                        request.status === "PENDING" ||
                        request.status === "PARTIALLY_ISSUED"
                      }
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
