import {
  Card,
  EmptyState,
  PageHeader,
  TableShell,
} from "@/components/admin/layout";
import type {
  ProductionMaterialInventoryItem,
  ProductionOptions,
  ProductionRun,
} from "@/lib/operations/types";
import { formatProductName } from "@/lib/product-label";
import { apiGet } from "@/lib/server-api";

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

export default async function ProductionOutputPage() {
  const [options, inventory, runs] = await Promise.all([
    apiGet<ProductionOptions>("/production/options"),
    apiGet<ProductionMaterialInventoryItem[]>("/production/inventory"),
    apiGet<ProductionRun[]>("/production/runs"),
  ]);

  const productsWithRecipes = options.products.filter(
    (product) => product.recipe,
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

      <Card title="Recent output">
        {runs.length === 0 ? (
          <EmptyState>No production output has been recorded yet.</EmptyState>
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
            {runs.slice(0, 10).map((run) => (
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
