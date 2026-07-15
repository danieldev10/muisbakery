import {
  Card,
  EmptyState,
  TableShell,
} from "@/components/admin/layout";
import { TablePagination } from "@/components/admin/pagination";
import { TableToolbar } from "@/components/admin/table-toolbar";
import { RunMaterialsButton } from "@/components/production-run-materials";
import type { ProductionRun } from "@/lib/operations/types";
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

export default async function ProductionRunsPage({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}) {
  const params = await searchParams;
  const runs = await apiGet<ProductionRun[]>("/production/runs");
  const query = firstParam(params, "q");
  const productFilter = firstParam(params, "product");
  const from = firstParam(params, "from");
  const to = firstParam(params, "to");
  const productOptions = [
    ...new Map(
      runs.map((run) => [
        run.product.id,
        {
          label: formatProductName(run.product),
          value: run.product.id,
        },
      ]),
    ).values(),
  ];
  const filteredRuns = runs.filter(
    (run) =>
      matchesSearch(query, [
        formatProductName(run.product),
        run.quantityProduced,
        run.quantityTransferred,
        run.wasteQuantity,
        run.notes,
        run.createdBy?.name,
        run.createdBy?.email,
        ...run.materialUsages.flatMap((usage) => [
          usage.rawMaterial.name,
          usage.actualQuantity,
        ]),
      ]) &&
      matchesSelect(productFilter, run.product.id) &&
      matchesDateRange(run.producedAt, from, to),
  );
  const { pageItems, ...pagination } = paginate(
    filteredRuns,
    pageNumber(params.page),
  );

  return (
    <>
      <Card title={`Runs (${filteredRuns.length} of ${runs.length})`}>
        {runs.length > 0 ? (
          <TableToolbar
            basePath="/production/runs"
            dateFilters={[
              { label: "Produced from", name: "from" },
              { label: "Produced to", name: "to" },
            ]}
            searchParams={params}
            searchPlaceholder="Search product, material, quantity, or notes"
            selectFilters={[
              {
                label: "Product",
                name: "product",
                options: productOptions,
              },
            ]}
          />
        ) : null}
        {runs.length === 0 ? (
          <EmptyState>No production runs yet.</EmptyState>
        ) : filteredRuns.length === 0 ? (
          <EmptyState>No production runs match the current filters.</EmptyState>
        ) : (
          <TableShell
            head={
              <>
                <th className="py-2 pr-4">Product</th>
                <th className="py-2 pr-4">Produced</th>
                <th className="py-2 pr-4">Sent to Sales</th>
                <th className="py-2 pr-4">Waste</th>
                <th className="py-2 pr-4">Materials used</th>
                <th className="py-2 pr-4">Produced at</th>
              </>
            }
          >
            {pageItems.map((run) => (
              <tr
                className="align-top"
                key={run.id}
              >
                <td className="py-3 pr-4">
                  <p className="font-medium text-stone-900">
                    {formatProductName(run.product)}
                  </p>
                  {run.notes ? (
                    <p className="mt-1 max-w-56 text-xs text-stone-500">
                      {run.notes}
                    </p>
                  ) : null}
                </td>
                <td className="py-3 pr-4 text-stone-600">
                  {formatQuantity(
                    run.quantityProduced,
                    run.product.unit.abbreviation,
                  )}
                </td>
                <td className="py-3 pr-4 text-stone-600">
                  {formatQuantity(
                    run.quantityTransferred,
                    run.product.unit.abbreviation,
                  )}
                </td>
                <td className="py-3 pr-4 text-stone-600">
                  {formatQuantity(
                    run.wasteQuantity,
                    run.product.unit.abbreviation,
                  )}
                </td>
                <td className="py-3 pr-4">
                  <RunMaterialsButton
                    materials={run.materialUsages}
                    producedAt={formatDate(run.producedAt)}
                    productLabel={formatProductName(run.product)}
                  />
                </td>
                <td className="py-3 pr-4 text-stone-600">
                  {formatDate(run.producedAt)}
                </td>
              </tr>
            ))}
          </TableShell>
        )}
        <TablePagination
          basePath="/production/runs"
          searchParams={params}
          {...pagination}
        />
      </Card>
    </>
  );
}
