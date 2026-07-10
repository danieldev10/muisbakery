import {
  Card,
  EmptyState,
  TableShell,
} from "@/components/admin/layout";
import { TablePagination } from "@/components/admin/pagination";
import { TableToolbar } from "@/components/admin/table-toolbar";
import type {
  ProductionWaste,
  ProductionWasteType,
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

const wasteTypeLabels: Record<ProductionWasteType, string> = {
  DAMAGED: "Damaged",
  RETURNED_TO_PRODUCTION: "Back to production",
};

function WasteTypeBadge({ type }: { type: ProductionWasteType }) {
  const className =
    type === "DAMAGED"
      ? "bg-red-50 text-red-800"
      : "bg-emerald-50 text-emerald-800";

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}
    >
      {wasteTypeLabels[type]}
    </span>
  );
}

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

export default async function ProductionWastePage({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}) {
  const params = await searchParams;
  const waste = await apiGet<ProductionWaste[]>("/production/waste");
  const query = firstParam(params, "q");
  const productFilter = firstParam(params, "product");
  const typeFilter = firstParam(params, "type");
  const from = firstParam(params, "from");
  const to = firstParam(params, "to");
  const productOptions = [
    ...new Map(
      waste.map((record) => [
        record.product.id,
        {
          label: formatProductName(record.product),
          value: record.product.id,
        },
      ]),
    ).values(),
  ];
  const filteredWaste = waste.filter(
    (record) =>
      matchesSearch(query, [
        formatProductName(record.product),
        record.type,
        wasteTypeLabels[record.type],
        record.quantity,
        record.reason,
        record.createdBy?.name,
        record.createdBy?.email,
      ]) &&
      matchesSelect(productFilter, record.product.id) &&
      matchesSelect(typeFilter, record.type) &&
      matchesDateRange(record.recordedAt, from, to),
  );
  const { pageItems, ...pagination } = paginate(
    filteredWaste,
    pageNumber(params.page),
  );

  return (
    <>
      <Card title={`Waste records (${filteredWaste.length} of ${waste.length})`}>
        {waste.length > 0 ? (
          <TableToolbar
            basePath="/production/waste"
            dateFilters={[
              { label: "Recorded from", name: "from" },
              { label: "Recorded to", name: "to" },
            ]}
            searchParams={params}
            searchPlaceholder="Search product, type, reason, or user"
            selectFilters={[
              {
                label: "Product",
                name: "product",
                options: productOptions,
              },
              {
                label: "Type",
                name: "type",
                options: Object.entries(wasteTypeLabels).map(
                  ([value, label]) => ({ label, value }),
                ),
              },
            ]}
          />
        ) : null}
        {waste.length === 0 ? (
          <EmptyState>No waste has been recorded yet.</EmptyState>
        ) : filteredWaste.length === 0 ? (
          <EmptyState>No waste records match the current filters.</EmptyState>
        ) : (
          <TableShell
            head={
              <>
                <th className="py-2 pr-4">Product</th>
                <th className="py-2 pr-4">Type</th>
                <th className="py-2 pr-4">Quantity</th>
                <th className="py-2 pr-4">Reason</th>
                <th className="py-2 pr-4">Recorded at</th>
                <th className="py-2 pr-4">Recorded by</th>
              </>
            }
          >
            {pageItems.map((record) => (
              <tr className="align-top" key={record.id}>
                <td className="py-3 pr-4 font-medium text-stone-900">
                  {formatProductName(record.product)}
                </td>
                <td className="py-3 pr-4">
                  <WasteTypeBadge type={record.type} />
                </td>
                <td className="py-3 pr-4 text-stone-600">
                  {formatQuantity(
                    record.quantity,
                    record.product.unit.abbreviation,
                  )}
                </td>
                <td className="py-3 pr-4 text-stone-600">
                  {record.reason ?? "-"}
                </td>
                <td className="py-3 pr-4 text-stone-600">
                  {formatDate(record.recordedAt)}
                </td>
                <td className="py-3 pr-4 text-stone-600">
                  {record.createdBy?.name ?? record.createdBy?.email ?? "-"}
                </td>
              </tr>
            ))}
          </TableShell>
        )}
        <TablePagination
          basePath="/production/waste"
          searchParams={params}
          {...pagination}
        />
      </Card>
    </>
  );
}
