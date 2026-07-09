import { AdminForm } from "@/components/admin/admin-form";
import {
  Field,
  SelectField,
  TextareaField,
} from "@/components/admin/form-controls";
import { InlineActionForm } from "@/components/admin/inline-action-form";
import {
  Card,
  EmptyState,
  PageHeader,
  TableShell,
} from "@/components/admin/layout";
import { TablePagination } from "@/components/admin/pagination";
import { TableToolbar } from "@/components/admin/table-toolbar";
import type {
  MaterialRequest,
  MaterialRequestStatus,
  ProductionOptions,
} from "@/lib/operations/types";
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
} from "@/lib/table-filters";

import { cancelMaterialRequest, createMaterialRequest } from "./actions";

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

export default async function ProductionRequestsPage({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}) {
  const params = await searchParams;
  const [options, requests] = await Promise.all([
    apiGet<ProductionOptions>("/production/options"),
    apiGet<MaterialRequest[]>("/production/material-requests"),
  ]);
  const materialOptions = options.rawMaterials.map((material) => ({
    value: material.id,
    label: `${material.name} (${material.baseUnit.abbreviation})`,
  }));
  const query = firstParam(params, "q");
  const materialFilter = firstParam(params, "material");
  const statusFilter = firstParam(params, "status");
  const from = firstParam(params, "from");
  const to = firstParam(params, "to");
  const statusOptions = [
    ...new Set(requests.map((request) => request.status)),
  ].map((status) => ({ label: statusLabel(status), value: status }));
  const filteredRequests = requests.filter(
    (request) =>
      matchesSearch(query, [
        request.rawMaterial.name,
        request.rawMaterial.baseUnit.abbreviation,
        request.status,
        statusLabel(request.status),
        request.notes,
        request.responseNotes,
        request.requestedBy.name,
        request.requestedBy.email,
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
    <>
      <PageHeader
        title="Material requests"
        description="Request raw materials from Store and track issued quantities."
      />

      <Card title="New material request">
        {materialOptions.length === 0 ? (
          <EmptyState>
            Active raw materials are required before Production can create
            requests.
          </EmptyState>
        ) : (
          <AdminForm
            action={createMaterialRequest}
            submitLabel="Request material"
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <SelectField
                label="Raw material"
                name="rawMaterialId"
                options={materialOptions}
                placeholder="Select material"
                required
              />
              <Field
                label="Quantity"
                min="1"
                name="requestedQuantity"
                placeholder="0"
                required
                step="1"
                type="number"
              />
              <Field
                label="Needed by"
                name="neededBy"
                type="datetime-local"
              />
            </div>
            <TextareaField
              label="Notes"
              name="notes"
              placeholder="Optional context for Store"
            />
          </AdminForm>
        )}
      </Card>

      <Card title={`Requests (${filteredRequests.length} of ${requests.length})`}>
        {requests.length > 0 ? (
          <TableToolbar
            basePath="/production/requests"
            dateFilters={[
              { label: "Created from", name: "from" },
              { label: "Created to", name: "to" },
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
                <th className="py-2 pr-4">Created</th>
                <th className="py-2 pr-4">Actions</th>
              </>
            }
          >
            {pageItems.map((request) => {
              const unit = request.rawMaterial.baseUnit.abbreviation;

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
                    {request.responseNotes ? (
                      <p className="mt-1 max-w-48 text-xs text-stone-500">
                        Store: {request.responseNotes}
                      </p>
                    ) : null}
                  </td>
                  <td className="py-3 pr-4 text-stone-600">
                    {formatDate(request.neededBy)}
                  </td>
                  <td className="py-3 pr-4 text-stone-600">
                    {formatDate(request.createdAt)}
                  </td>
                  <td className="py-3 pr-4">
                    {request.status === "PENDING" ? (
                      <InlineActionForm
                        action={cancelMaterialRequest}
                        pendingLabel="Cancelling"
                        submitLabel="Cancel"
                      >
                        <input name="id" type="hidden" value={request.id} />
                      </InlineActionForm>
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
          basePath="/production/requests"
          searchParams={params}
          {...pagination}
        />
      </Card>
    </>
  );
}
