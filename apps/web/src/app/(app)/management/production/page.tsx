import { Card, EmptyState, TableShell } from "@/components/admin/layout";
import { TablePagination } from "@/components/admin/pagination";
import { TableToolbar } from "@/components/admin/table-toolbar";
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
  formatMoney,
  formatQuantity,
  getMonthParam,
  ManagementPageShell,
  MetricCard,
  MonthFilter,
} from "../_components";

export default async function ManagementProductionPage({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}) {
  const query = await searchParams;
  const month = getMonthParam(query);
  const report = await apiGet<ManagementProductionReport>(
    `/management/production?month=${encodeURIComponent(month)}`,
  );
  const outputQuery = firstParam(query, "outputQ");
  const filteredOutputByProduct = report.outputByProduct.filter((entry) =>
    matchesSearch(outputQuery, [
      formatProductName(entry.product),
      entry.runsCount,
      entry.quantityProduced,
      entry.quantityTransferred,
      entry.wasteQuantity,
    ]),
  );
  const wasteQuery = firstParam(query, "wasteQ");
  const filteredWasteByProduct = report.wasteByProduct.filter((entry) =>
    matchesSearch(wasteQuery, [
      formatProductName(entry.product),
      entry.count,
      entry.quantity,
      entry.estimatedRetailValue,
    ]),
  );
  const usageQuery = firstParam(query, "usageQ");
  const filteredMaterialUsage = report.materialUsage.filter((entry) =>
    matchesSearch(usageQuery, [
      entry.rawMaterial.name,
      entry.rawMaterial.baseUnit.abbreviation,
      entry.expectedQuantity,
      entry.actualQuantity,
    ]),
  );
  const runsQuery = firstParam(query, "runsQ");
  const runsProduct = firstParam(query, "runsProduct");
  const runsVariance = firstParam(query, "runsVariance");
  const runsProductOptions = [
    ...new Map(
      report.runs.map((run) => [
        run.product.id,
        { label: formatProductName(run.product), value: run.product.id },
      ]),
    ).values(),
  ];
  const filteredRuns = report.runs.filter(
    (run) =>
      matchesSearch(runsQuery, [
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
      matchesSelect(runsProduct, run.product.id) &&
      matchesSelect(
        runsVariance,
        run.shortfallQuantity ? "shortfall" : "on-track",
      ),
  );
  const { pageItems: runItems, ...runsPagination } = paginate(
    filteredRuns,
    pageNumber(query.page),
  );
  const reportSections = [
    {
      title: "Summary",
      rows: [
        {
          Month: report.month.label,
          Runs: report.summary.runsCount,
          Produced: formatQuantity(report.summary.quantityProduced),
          "Sent to Sales": formatQuantity(report.summary.quantityTransferred),
          Waste: formatQuantity(report.summary.wasteQuantity),
          "Undercut runs": report.summary.undercutRuns,
        },
      ],
    },
    {
      title: "Output by product",
      rows: filteredOutputByProduct.map((entry) => ({
        Product: formatProductName(entry.product),
        Runs: entry.runsCount,
        Produced: formatQuantity(
          entry.quantityProduced,
          entry.product.unit.abbreviation,
        ),
        Sent: formatQuantity(
          entry.quantityTransferred,
          entry.product.unit.abbreviation,
        ),
        Waste: formatQuantity(
          entry.wasteQuantity,
          entry.product.unit.abbreviation,
        ),
      })),
    },
    {
      title: "Waste by product",
      rows: filteredWasteByProduct.map((entry) => ({
        Product: formatProductName(entry.product),
        Entries: entry.count,
        Quantity: formatQuantity(
          entry.quantity,
          entry.product.unit.abbreviation,
        ),
        Value: formatMoney(entry.estimatedRetailValue),
      })),
    },
    {
      title: "Raw material usage",
      rows: filteredMaterialUsage.map((entry) => ({
        "Raw material": entry.rawMaterial.name,
        Expected: formatQuantity(
          entry.expectedQuantity,
          entry.rawMaterial.baseUnit.abbreviation,
        ),
        "Actual used": formatQuantity(
          entry.actualQuantity,
          entry.rawMaterial.baseUnit.abbreviation,
        ),
      })),
    },
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
      <MonthFilter month={report.month.value} />
      <div className="flex justify-end">
        <ReportExportActions
          filename={`management-production-${report.month.value}`}
          sections={reportSections}
          subtitle={`Month: ${report.month.label}`}
          title="Management production report"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <MetricCard label="Runs" value={report.summary.runsCount} />
        <MetricCard
          label="Produced"
          value={formatQuantity(report.summary.quantityProduced)}
        />
        <MetricCard
          label="Sent to Sales"
          value={formatQuantity(report.summary.quantityTransferred)}
        />
        <MetricCard
          label="Waste"
          tone={Number(report.summary.wasteQuantity) > 0 ? "warning" : "default"}
          value={formatQuantity(report.summary.wasteQuantity)}
        />
        <MetricCard
          label="Undercut runs"
          tone={report.summary.undercutRuns > 0 ? "warning" : "positive"}
          value={report.summary.undercutRuns}
          detail="Runs below expected output"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={`Output by product (${filteredOutputByProduct.length} of ${report.outputByProduct.length})`}>
          {report.outputByProduct.length > 0 ? (
            <TableToolbar
              basePath="/management/production"
              pageParams={[]}
              searchParam="outputQ"
              searchParams={query}
              searchPlaceholder="Search product, run count, output, sent, or waste"
            />
          ) : null}
          {report.outputByProduct.length === 0 ? (
            <EmptyState>No production output for this month.</EmptyState>
          ) : filteredOutputByProduct.length === 0 ? (
            <EmptyState>No product output matches the current filters.</EmptyState>
          ) : (
            <TableShell
              head={
                <>
                  <th className="py-2 pr-4">Product</th>
                  <th className="py-2 pr-4">Runs</th>
                  <th className="py-2 pr-4">Produced</th>
                  <th className="py-2 pr-4">Sent</th>
                  <th className="py-2 pr-4">Waste</th>
                </>
              }
            >
              {filteredOutputByProduct.map((entry) => (
                <tr key={entry.product.id}>
                  <td className="py-3 pr-4 font-medium text-stone-900">
                    {formatProductName(entry.product)}
                  </td>
                  <td className="py-3 pr-4 text-stone-600">
                    {entry.runsCount}
                  </td>
                  <td className="py-3 pr-4 text-stone-600">
                    {formatQuantity(
                      entry.quantityProduced,
                      entry.product.unit.abbreviation,
                    )}
                  </td>
                  <td className="py-3 pr-4 text-stone-600">
                    {formatQuantity(
                      entry.quantityTransferred,
                      entry.product.unit.abbreviation,
                    )}
                  </td>
                  <td className="py-3 pr-4 text-stone-600">
                    {formatQuantity(
                      entry.wasteQuantity,
                      entry.product.unit.abbreviation,
                    )}
                  </td>
                </tr>
              ))}
            </TableShell>
          )}
        </Card>

        <Card title={`Waste by product (${filteredWasteByProduct.length} of ${report.wasteByProduct.length})`}>
          {report.wasteByProduct.length > 0 ? (
            <TableToolbar
              basePath="/management/production"
              pageParams={[]}
              searchParam="wasteQ"
              searchParams={query}
              searchPlaceholder="Search product, entries, quantity, or value"
            />
          ) : null}
          {report.wasteByProduct.length === 0 ? (
            <EmptyState>No waste recorded for this month.</EmptyState>
          ) : filteredWasteByProduct.length === 0 ? (
            <EmptyState>No product waste matches the current filters.</EmptyState>
          ) : (
            <TableShell
              head={
                <>
                  <th className="py-2 pr-4">Product</th>
                  <th className="py-2 pr-4">Entries</th>
                  <th className="py-2 pr-4">Quantity</th>
                  <th className="py-2 pr-4">Value</th>
                </>
              }
            >
              {filteredWasteByProduct.map((entry) => (
                <tr key={entry.product.id}>
                  <td className="py-3 pr-4 font-medium text-stone-900">
                    {formatProductName(entry.product)}
                  </td>
                  <td className="py-3 pr-4 text-stone-600">{entry.count}</td>
                  <td className="py-3 pr-4 text-stone-600">
                    {formatQuantity(
                      entry.quantity,
                      entry.product.unit.abbreviation,
                    )}
                  </td>
                  <td className="py-3 pr-4 text-stone-600">
                    {formatMoney(entry.estimatedRetailValue)}
                  </td>
                </tr>
              ))}
            </TableShell>
          )}
        </Card>
      </div>

      <Card title={`Raw material usage (${filteredMaterialUsage.length} of ${report.materialUsage.length})`}>
        {report.materialUsage.length > 0 ? (
          <TableToolbar
            basePath="/management/production"
            pageParams={[]}
            searchParam="usageQ"
            searchParams={query}
            searchPlaceholder="Search material, unit, expected, or actual"
          />
        ) : null}
        {report.materialUsage.length === 0 ? (
          <EmptyState>No raw materials were consumed this month.</EmptyState>
        ) : filteredMaterialUsage.length === 0 ? (
          <EmptyState>No material usage matches the current filters.</EmptyState>
        ) : (
          <TableShell
            head={
              <>
                <th className="py-2 pr-4">Raw material</th>
                <th className="py-2 pr-4">Expected</th>
                <th className="py-2 pr-4">Actual used</th>
              </>
            }
          >
            {filteredMaterialUsage.map((entry) => (
              <tr key={entry.rawMaterial.id}>
                <td className="py-3 pr-4 font-medium text-stone-900">
                  {entry.rawMaterial.name}
                </td>
                <td className="py-3 pr-4 text-stone-600">
                  {formatQuantity(
                    entry.expectedQuantity,
                    entry.rawMaterial.baseUnit.abbreviation,
                  )}
                </td>
                <td className="py-3 pr-4 text-stone-600">
                  {formatQuantity(
                    entry.actualQuantity,
                    entry.rawMaterial.baseUnit.abbreviation,
                  )}
                </td>
              </tr>
            ))}
          </TableShell>
        )}
      </Card>

      <Card title={`Production runs (${filteredRuns.length} of ${report.runs.length})`}>
        {report.runs.length > 0 ? (
          <TableToolbar
            basePath="/management/production"
            pageParams={["page"]}
            searchParam="runsQ"
            searchParams={query}
            searchPlaceholder="Search product, material, user, quantity, or notes"
            selectFilters={[
              {
                label: "Product",
                name: "runsProduct",
                options: runsProductOptions,
              },
              {
                label: "Variance",
                name: "runsVariance",
                options: [
                  { label: "On track", value: "on-track" },
                  { label: "Shortfall", value: "shortfall" },
                ],
              },
            ]}
          />
        ) : null}
        {report.runs.length === 0 ? (
          <EmptyState>No production runs for this month.</EmptyState>
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
            {runItems.map((run) => (
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
                          {usage.rawMaterial.name}:{" "}
                          {formatQuantity(
                            usage.actualQuantity,
                            usage.rawMaterial.baseUnit.abbreviation,
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td className="py-3 pr-4 text-stone-600">
                  {formatDateTime(run.producedAt)}
                </td>
              </tr>
            ))}
          </TableShell>
        )}
        <TablePagination
          basePath="/management/production"
          searchParams={query}
          {...runsPagination}
        />
      </Card>
    </ManagementPageShell>
  );
}
