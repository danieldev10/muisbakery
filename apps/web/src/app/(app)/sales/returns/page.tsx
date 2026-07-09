import { AdminForm } from "@/components/admin/admin-form";
import {
  Field,
  SelectField,
  TextareaField,
} from "@/components/admin/form-controls";
import {
  Card,
  EmptyState,
  PageHeader,
  TableShell,
} from "@/components/admin/layout";
import { TablePagination } from "@/components/admin/pagination";
import { TableToolbar } from "@/components/admin/table-toolbar";
import type {
  SalesOptions,
  SalesReturn,
  SalesReturnDisposition,
} from "@/lib/operations/types";
import { formatProductName } from "@/lib/product-label";
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

import { recordCustomerReturn, recordDamagedStock } from "./actions";

const dispositionLabels: Record<SalesReturnDisposition, string> = {
  RETURN_TO_STOCK: "Return to stock",
  DAMAGED: "Damaged",
};

function formatDate(value: string) {
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

function formatDisposition(value: SalesReturnDisposition) {
  return dispositionLabels[value];
}

export default async function SalesReturnsPage({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}) {
  const params = await searchParams;
  const [options, returns] = await Promise.all([
    apiGet<SalesOptions>("/sales/options"),
    apiGet<SalesReturn[]>("/sales/returns"),
  ]);
  const query = firstParam(params, "q");
  const productFilter = firstParam(params, "product");
  const dispositionFilter = firstParam(params, "disposition");
  const from = firstParam(params, "from");
  const to = firstParam(params, "to");
  const returnProductOptions = [
    ...new Map(
      returns.map((entry) => [
        entry.product.id,
        {
          label: formatProductName(entry.product),
          value: entry.product.id,
        },
      ]),
    ).values(),
  ];
  const filteredReturns = returns.filter(
    (entry) =>
      matchesSearch(query, [
        formatProductName(entry.product),
        entry.quantity,
        entry.reason,
        entry.disposition,
        formatDisposition(entry.disposition),
        entry.batch?.batchNumber,
        entry.saleItem?.sale.saleNumber,
        entry.createdBy?.name,
        entry.createdBy?.email,
      ]) &&
      matchesSelect(productFilter, entry.product.id) &&
      matchesSelect(dispositionFilter, entry.disposition) &&
      matchesDateRange(entry.recordedAt, from, to),
  );
  const { pageItems, ...pagination } = paginate(
    filteredReturns,
    pageNumber(params.page),
  );

  const productOptions = options.products
    .filter((item) => Number(item.totalRemaining) > 0)
    .map((item) => ({
      value: item.product.id,
      label: `${formatProductName(item.product)} (${formatQuantity(
        item.totalRemaining,
        item.product.unit.abbreviation,
      )})`,
    }));

  const saleItemOptions = options.saleItems.map((item) => ({
    value: item.id,
    label: `#${item.sale.saleNumber} - ${formatProductName(item.product)} (${formatQuantity(
      item.returnableQuantity,
      item.product.unit.abbreviation,
    )})`,
  }));

  return (
    <>
      <PageHeader
        title="Returns and damage"
        description="Record customer returns and remove damaged stock from Sales inventory."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Damaged stock">
          {productOptions.length === 0 ? (
            <EmptyState>No Sales stock is available to mark as damaged.</EmptyState>
          ) : (
            <AdminForm
              action={recordDamagedStock}
              submitLabel="Record damage"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField
                  label="Product"
                  name="productId"
                  options={productOptions}
                  placeholder="Select product"
                  required
                />
                <Field
                  label="Quantity"
                  min="0"
                  name="quantity"
                  required
                  step="1"
                  type="number"
                />
                <Field
                  label="Recorded at"
                  name="recordedAt"
                  type="datetime-local"
                />
              </div>
              <TextareaField
                label="Reason"
                name="reason"
                placeholder="Optional"
              />
            </AdminForm>
          )}
        </Card>

        <Card title="Customer return">
          {saleItemOptions.length === 0 ? (
            <EmptyState>No returnable sale items are available.</EmptyState>
          ) : (
            <AdminForm
              action={recordCustomerReturn}
              submitLabel="Record return"
            >
              <SelectField
                label="Sale item"
                name="saleItemId"
                options={saleItemOptions}
                placeholder="Select sale item"
                required
              />
              <div className="grid gap-4 sm:grid-cols-3">
                <SelectField
                  label="Outcome"
                  name="disposition"
                  options={[
                    {
                      value: "RETURN_TO_STOCK",
                      label: dispositionLabels.RETURN_TO_STOCK,
                    },
                    { value: "DAMAGED", label: dispositionLabels.DAMAGED },
                  ]}
                  required
                />
                <Field
                  label="Quantity"
                  min="0"
                  name="quantity"
                  required
                  step="1"
                  type="number"
                />
                <Field
                  label="Recorded at"
                  name="recordedAt"
                  type="datetime-local"
                />
              </div>
              <TextareaField
                label="Reason"
                name="reason"
                placeholder="Optional"
              />
            </AdminForm>
          )}
        </Card>
      </div>

      <Card title={`Recent returns and damage (${filteredReturns.length} of ${returns.length})`}>
        {returns.length > 0 ? (
          <TableToolbar
            basePath="/sales/returns"
            dateFilters={[
              { label: "Recorded from", name: "from" },
              { label: "Recorded to", name: "to" },
            ]}
            searchParams={params}
            searchPlaceholder="Search product, source, reason, or outcome"
            selectFilters={[
              {
                label: "Product",
                name: "product",
                options: returnProductOptions,
              },
              {
                label: "Outcome",
                name: "disposition",
                options: Object.entries(dispositionLabels).map(
                  ([value, label]) => ({ label, value }),
                ),
              },
            ]}
          />
        ) : null}
        {returns.length === 0 ? (
          <EmptyState>No returns or damaged stock have been recorded.</EmptyState>
        ) : filteredReturns.length === 0 ? (
          <EmptyState>No returns or damage records match the current filters.</EmptyState>
        ) : (
          <TableShell
            head={
              <>
                <th className="py-2 pr-4">Product</th>
                <th className="py-2 pr-4">Quantity</th>
                <th className="py-2 pr-4">Outcome</th>
                <th className="py-2 pr-4">Source</th>
                <th className="py-2 pr-4">Date</th>
              </>
            }
          >
            {pageItems.map((entry) => (
              <tr className="align-top" key={entry.id}>
                <td className="py-3 pr-4">
                  <p className="font-medium text-stone-900">
                    {formatProductName(entry.product)}
                  </p>
                  {entry.reason ? (
                    <p className="mt-1 max-w-56 text-xs text-stone-500">
                      {entry.reason}
                    </p>
                  ) : null}
                </td>
                <td className="py-3 pr-4 text-stone-600">
                  {formatQuantity(
                    entry.quantity,
                    entry.product.unit.abbreviation,
                  )}
                </td>
                <td className="py-3 pr-4 text-stone-600">
                  {formatDisposition(entry.disposition)}
                </td>
                <td className="py-3 pr-4 text-stone-600">
                  {entry.saleItem ? (
                    <span>Sale #{entry.saleItem.sale.saleNumber}</span>
                  ) : entry.batch ? (
                    <span>Batch {entry.batch.batchNumber}</span>
                  ) : (
                    "-"
                  )}
                </td>
                <td className="py-3 pr-4 text-stone-600">
                  {formatDate(entry.recordedAt)}
                </td>
              </tr>
            ))}
          </TableShell>
        )}
        <TablePagination
          basePath="/sales/returns"
          searchParams={params}
          {...pagination}
        />
      </Card>
    </>
  );
}
