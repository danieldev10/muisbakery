import {
  Card,
  EmptyState,
  PageHeader,
  TableShell,
} from "@/components/admin/layout";
import { TableToolbar } from "@/components/admin/table-toolbar";
import type {
  ProductionMaterialInventoryItem,
  ProductionOptions,
  ProductionRun,
} from "@/lib/operations/types";
import type { PageSearchParams } from "@/lib/paginate";
import { formatProductName } from "@/lib/product-label";
import { apiGet } from "@/lib/server-api";
import {
  firstParam,
  matchesDateRange,
  matchesSearch,
  matchesSelect,
} from "@/lib/table-filters";

import { ProductionOutputForm } from "./production-output-form";

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

export default async function ProductionOutputPage({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}) {
  const params = await searchParams;
  const [options, inventory, runs] = await Promise.all([
    apiGet<ProductionOptions>("/production/options"),
    apiGet<ProductionMaterialInventoryItem[]>("/production/inventory"),
    apiGet<ProductionRun[]>("/production/runs"),
  ]);

  const productsWithRecipes = options.products.filter(
    (product) => product.recipe,
  );
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
      ]) &&
      matchesSelect(productFilter, run.product.id) &&
      matchesDateRange(run.producedAt, from, to),
  );

  return (
    <>
      <PageHeader
        title="Production output"
        description="Record finished goods and send available output directly to Sales."
      />

      <Card title="New production run">
        {productsWithRecipes.length === 0 ? (
          <EmptyState>
            Active finished products with recipes are required before Production
            can record output.
          </EmptyState>
        ) : (
          <ProductionOutputForm
            inventory={inventory}
            products={productsWithRecipes}
          />
        )}
      </Card>

      <Card title={`Recent output (${filteredRuns.length} of ${runs.length})`}>
        {runs.length > 0 ? (
          <TableToolbar
            basePath="/production/output"
            dateFilters={[
              { label: "Produced from", name: "from" },
              { label: "Produced to", name: "to" },
            ]}
            searchParams={params}
            searchPlaceholder="Search product, quantity, or notes"
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
          <EmptyState>No production output has been recorded yet.</EmptyState>
        ) : filteredRuns.length === 0 ? (
          <EmptyState>No production output matches the current filters.</EmptyState>
        ) : (
          <TableShell
            head={
              <>
                <th className="py-2 pr-4">Product</th>
                <th className="py-2 pr-4">Produced</th>
                <th className="py-2 pr-4">Sent to Sales</th>
                <th className="py-2 pr-4">Waste</th>
                <th className="py-2 pr-4">Date</th>
              </>
            }
          >
            {filteredRuns.slice(0, 10).map((run) => (
              <tr className="align-top" key={run.id}>
                <td className="py-3 pr-4 font-medium text-stone-900">
                  {formatProductName(run.product)}
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
                <td className="py-3 pr-4 text-stone-600">
                  {formatDate(run.producedAt)}
                </td>
              </tr>
            ))}
          </TableShell>
        )}
      </Card>
    </>
  );
}
