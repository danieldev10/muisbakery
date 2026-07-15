import { Card, EmptyState, TableShell } from "@/components/admin/layout";
import { TablePagination } from "@/components/admin/pagination";
import { TableToolbar } from "@/components/admin/table-toolbar";
import { RunMaterialsButton } from "@/components/production-run-materials";
import { ReportExportActions } from "@/components/reports/report-export-actions";
import type { ManagementProductionReport } from "@/lib/management/types";
import {
  pageNumber,
  paginate,
  type PageSearchParams,
} from "@/lib/paginate";
import { formatProductName } from "@/lib/product-label";
import { apiGet } from "@/lib/server-api";
import {
  firstParam,
  matchesSearch,
  matchesSelect,
} from "@/lib/table-filters";

import {
  formatDateTime,
  formatQuantity,
  ManagementPageShell,
  reportRangeApiPath,
  ReportRangeFilter,
} from "../../_components";

const basePath = "/management/production/runs";

export default async function ManagementProductionRunsPage({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}) {
  const query = await searchParams;
  const report = await apiGet<ManagementProductionReport>(
    reportRangeApiPath("/management/production", query),
  );
  const search = firstParam(query, "q");
  const product = firstParam(query, "product");
  const variance = firstParam(query, "variance");
  const productOptions = [
    ...new Map(
      report.runs.map((run) => [
        run.product.id,
        { label: formatProductName(run.product), value: run.product.id },
      ]),
    ).values(),
  ];
  const filteredRuns = report.runs.filter(
    (run) =>
      matchesSearch(search, [
        formatProductName(run.product),
        run.quantityProduced,
        run.expectedQuantity,
        run.shortfallQuantity,
        run.quantityTransferred,
        run.wasteQuantity,
        run.notes,
        run.createdBy?.name,
        run.createdBy?.email,
        ...run.materialUsages.flatMap((usage) => [
          usage.rawMaterial.name,
          usage.actualQuantity,
          usage.expectedQuantity,
        ]),
      ]) &&
      matchesSelect(product, run.product.id) &&
      matchesSelect(
        variance,
        run.shortfallQuantity ? "shortfall" : "on-track",
      ),
  );
  const { pageItems, ...pagination } = paginate(
    filteredRuns,
    pageNumber(query.page),
  );
  const reportSections = [
    {
      title: "Production runs",
      rows: filteredRuns.map((run) => ({
        Product: formatProductName(run.product),
        Produced: formatQuantity(
          run.quantityProduced,
          run.product.unit.abbreviation,
        ),
        Expected: run.expectedQuantity
          ? formatQuantity(run.expectedQuantity, run.product.unit.abbreviation)
          : "",
        Shortfall: run.shortfallQuantity
          ? formatQuantity(run.shortfallQuantity, run.product.unit.abbreviation)
          : "",
        Sent: formatQuantity(
          run.quantityTransferred,
          run.product.unit.abbreviation,
        ),
        Waste: formatQuantity(run.wasteQuantity, run.product.unit.abbreviation),
        Materials: run.materialUsages
          .map(
            (usage) =>
              `${usage.rawMaterial.name}: ${formatQuantity(
                usage.actualQuantity,
                usage.rawMaterial.baseUnit.abbreviation,
              )}`,
          )
          .join("; "),
        "Produced at": formatDateTime(run.producedAt),
        "Created by": run.createdBy?.name ?? run.createdBy?.email ?? "",
      })),
    },
  ];

  return (
    <ManagementPageShell>
      <ReportRangeFilter
        actions={
          <ReportExportActions
            filename={`management-production-runs-${report.range.from}-to-${report.range.to}`}
            sections={reportSections}
            subtitle={`Period: ${report.range.label}`}
            title="Management production runs report"
          />
        }
        range={report.range}
      />

      <Card
        title={`Production runs (${filteredRuns.length} of ${report.runs.length})`}
      >
        {report.runs.length > 0 ? (
          <TableToolbar
            basePath={basePath}
            searchParams={query}
            searchPlaceholder="Search product, material, user, quantity, or notes"
            selectFilters={[
              {
                label: "Product",
                name: "product",
                options: productOptions,
              },
              {
                label: "Variance",
                name: "variance",
                options: [
                  { label: "On track", value: "on-track" },
                  { label: "Shortfall", value: "shortfall" },
                ],
              },
            ]}
          />
        ) : null}
        {report.runs.length === 0 ? (
          <EmptyState>No production runs for this period.</EmptyState>
        ) : filteredRuns.length === 0 ? (
          <EmptyState>No production runs match the current filters.</EmptyState>
        ) : (
          <TableShell
            head={
              <>
                <th className="py-2 pr-4">Product</th>
                <th className="py-2 pr-4">Produced</th>
                <th className="py-2 pr-4">Sent</th>
                <th className="py-2 pr-4">Waste</th>
                <th className="py-2 pr-4">Materials</th>
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
                <td className="py-3 pr-4 font-medium text-stone-900">
                  {formatProductName(run.product)}
                </td>
                <td className="py-3 pr-4 text-stone-600">
                  <p
                    className={
                      run.shortfallQuantity
                        ? "font-semibold text-red-800"
                        : undefined
                    }
                  >
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
                      expected at least{" "}
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
                <td className="py-3 pr-4">
                  <RunMaterialsButton
                    materials={run.materialUsages}
                    producedAt={formatDateTime(run.producedAt)}
                    productLabel={formatProductName(run.product)}
                  />
                </td>
                <td className="py-3 pr-4 text-stone-600">
                  {formatDateTime(run.producedAt)}
                </td>
              </tr>
            ))}
          </TableShell>
        )}
        <TablePagination
          basePath={basePath}
          searchParams={query}
          {...pagination}
        />
      </Card>
    </ManagementPageShell>
  );
}
