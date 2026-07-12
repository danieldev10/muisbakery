import {
  Field,
  SelectField,
  TextareaField,
} from "@/components/admin/form-controls";
import { AdminFormModal, AdminModal } from "@/components/admin/form-modal";
import { InlineActionForm } from "@/components/admin/inline-action-form";
import {
  Card,
  EmptyState,
  TableShell,
} from "@/components/admin/layout";
import { TablePagination } from "@/components/admin/pagination";
import { TableToolbar } from "@/components/admin/table-toolbar";
import type {
  MaterialRequestStatus,
  ProductionRequest,
  ProductionOptions,
} from "@/lib/operations/types";
import { formatProductName } from "@/lib/product-label";
import {
  paginatedApiPath,
  type PaginatedResponse,
  type PageSearchParams,
} from "@/lib/paginate";
import { apiGet } from "@/lib/server-api";

import { cancelMaterialRequest, createMaterialRequest } from "./actions";
import { RequestStatusBadge } from "./request-status-badge";

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

export default async function ProductionRequestsPage({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}) {
  const params = await searchParams;
  const [options, result] = await Promise.all([
    apiGet<ProductionOptions>("/production/options"),
    apiGet<PaginatedResponse<ProductionRequest>>(
      paginatedApiPath("/production/material-requests", params, [
        "q",
        "product",
        "status",
        "from",
        "to",
      ]),
    ),
  ]);
  const requests = result.items;
  const pagination = result.pagination;
  const productOptions = options.products
    .filter((product) => product.recipe)
    .map((product) => ({
      value: product.id,
      label: formatProductName(product),
    }));
  const statusOptions = [
    "PENDING",
    "PARTIALLY_ISSUED",
    "FULFILLED",
    "CANCELLED",
    "REJECTED",
  ].map((status) => ({
    label: statusLabel(status as MaterialRequestStatus),
    value: status,
  }));

  return (
    <>
      <Card>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-base font-semibold leading-tight text-[var(--text-primary)]">
            Production requests ({pagination.total})
          </h2>
          {productOptions.length === 0 ? (
            <AdminModal
              description="Active products with recipes are required before Production can create requests."
              title="New request"
              triggerLabel="New request"
            >
              <EmptyState>
                Ask an Admin to add product recipes before requesting stock.
              </EmptyState>
            </AdminModal>
          ) : (
            <AdminFormModal
              action={createMaterialRequest}
              description="Ask Store to issue the recipe materials needed for this product output."
              submitLabel="Request product"
              title="New production request"
              triggerLabel="New request"
            >
              <div className="grid gap-4 sm:grid-cols-3">
                <SelectField
                  label="Product"
                  name="productId"
                  options={productOptions}
                  placeholder="Select product"
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
            </AdminFormModal>
          )}
        </div>
        <TableToolbar
          basePath="/production/requests"
          dateFilters={[
            { label: "Created from", name: "from" },
            { label: "Created to", name: "to" },
          ]}
          searchParams={params}
          searchPlaceholder="Search product, requester, status, or notes"
          selectFilters={[
            {
              label: "Product",
              name: "product",
              options: productOptions,
            },
            {
              label: "Status",
              name: "status",
              options: statusOptions,
            },
          ]}
        />
        {pagination.total === 0 ? (
          <EmptyState>No production requests yet.</EmptyState>
        ) : (
          <TableShell
            head={
              <>
                <th className="py-2 pr-4">Product</th>
                <th className="py-2 pr-4">Requested</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Needed by</th>
                <th className="py-2 pr-4">Created</th>
                <th className="py-2 pr-4">Actions</th>
              </>
            }
          >
            {requests.map((request) => {
              const unit = request.product.unit.abbreviation;

              return (
                <tr className="align-top" key={request.id}>
                  <td className="py-3 pr-4">
                    <p className="font-medium text-stone-900">
                      {formatProductName(request.product)}
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
                  <td className="py-3 pr-4">
                    <RequestStatusBadge
                      reason={request.responseNotes}
                      status={request.status}
                    />
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
