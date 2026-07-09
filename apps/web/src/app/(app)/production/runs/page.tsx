import {
  Card,
  EmptyState,
  PageHeader,
  TableShell,
} from "@/components/admin/layout";
import type { ProductionRun } from "@/lib/operations/types";
import { formatProductName } from "@/lib/product-label";
import { TablePagination } from "@/components/admin/pagination";
import {
  pageNumber,
  paginate,
  type PageSearchParams,
} from "@/lib/paginate";
import { apiGet } from "@/lib/server-api";

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
  const { pageItems, ...pagination } = paginate(runs, pageNumber(params.page));

  return (
    <>
      <PageHeader
        title="Production runs"
        description="Finished goods produced by Production and transferred to Sales."
      />

      <Card title={`Runs (${runs.length})`}>
        {runs.length === 0 ? (
          <EmptyState>No production runs yet.</EmptyState>
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
                className={`align-top ${
                  run.shortfallQuantity ? "border-l-4 border-l-red-700" : ""
                }`}
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
                  <p className={run.shortfallQuantity ? "font-semibold text-red-800" : undefined}>
                    {formatQuantity(
                      run.quantityProduced,
                      run.product.unit.abbreviation,
                    )}
                  </p>
                  {run.expectedQuantity ? (
                    <p
                      className={`text-xs ${
                        run.shortfallQuantity
                          ? "font-medium text-red-700"
                          : "text-stone-500"
                      }`}
                    >
                      expected ≥{" "}
                      {formatQuantity(
                        run.expectedQuantity,
                        run.product.unit.abbreviation,
                      )}
                      {run.shortfallQuantity
                        ? ` (${run.shortfallQuantity} short)`
                        : ""}
                    </p>
                  ) : null}
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
                  {run.materialUsages.length === 0 ? (
                    "-"
                  ) : (
                    <ul className="grid gap-1">
                      {run.materialUsages.map((usage) => (
                        <li key={usage.id}>
                          {usage.rawMaterial.name}: {usage.actualQuantity}{" "}
                          {usage.rawMaterial.baseUnit.abbreviation}
                          {usage.expectedQuantity ? (
                            <span className="text-stone-400">
                              {" "}
                              expected {usage.expectedQuantity}
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
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
