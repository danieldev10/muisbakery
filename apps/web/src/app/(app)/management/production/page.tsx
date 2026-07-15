import { Card, EmptyState, TableShell } from "@/components/admin/layout";
import { TableToolbar } from "@/components/admin/table-toolbar";
import { ReportExportActions } from "@/components/reports/report-export-actions";
import type { ManagementProductionReport } from "@/lib/management/types";
import type { PageSearchParams } from "@/lib/paginate";
import { formatProductName } from "@/lib/product-label";
import { apiGet } from "@/lib/server-api";
import { firstParam, matchesSearch } from "@/lib/table-filters";

import {
  formatMoney,
  formatQuantity,
  ManagementPageShell,
  MetricCard,
  reportRangeApiPath,
  ReportRangeFilter,
} from "../_components";

const basePath = "/management/production";

export default async function ManagementProductionPage({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}) {
  const query = await searchParams;
  const report = await apiGet<ManagementProductionReport>(
    reportRangeApiPath("/management/production", query),
  );
  const outputQuery = firstParam(query, "outputQ");
  const filteredOutput = report.outputByProduct.filter((entry) =>
    matchesSearch(outputQuery, [
      formatProductName(entry.product),
      entry.runsCount,
      entry.quantityProduced,
      entry.quantityTransferred,
      entry.wasteQuantity,
    ]),
  );
  const wasteQuery = firstParam(query, "wasteQ");
  const filteredWaste = report.wasteByProduct.filter((entry) =>
    matchesSearch(wasteQuery, [
      formatProductName(entry.product),
      entry.count,
      entry.quantity,
      entry.estimatedRetailValue,
    ]),
  );
  const reportSections = [
    {
      title: "Summary",
      rows: [
        {
          Period: report.range.label,
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
      rows: filteredOutput.map((entry) => ({
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
      rows: filteredWaste.map((entry) => ({
        Product: formatProductName(entry.product),
        Entries: entry.count,
        Quantity: formatQuantity(
          entry.quantity,
          entry.product.unit.abbreviation,
        ),
        Value: formatMoney(entry.estimatedRetailValue),
      })),
    },
  ];

  return (
    <ManagementPageShell>
      <ReportRangeFilter
        actions={
          <ReportExportActions
            filename={`management-production-${report.range.from}-to-${report.range.to}`}
            sections={reportSections}
            subtitle={`Period: ${report.range.label}`}
            title="Management production overview"
          />
        }
        range={report.range}
      />

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
          detail="Runs below expected output"
          label="Undercut runs"
          tone={report.summary.undercutRuns > 0 ? "warning" : "positive"}
          value={report.summary.undercutRuns}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title={`Output by product (${filteredOutput.length} of ${report.outputByProduct.length})`}
        >
          {report.outputByProduct.length > 0 ? (
            <TableToolbar
              basePath={basePath}
              pageParams={[]}
              searchParam="outputQ"
              searchParams={query}
              searchPlaceholder="Search product, run count, output, sent, or waste"
            />
          ) : null}
          {report.outputByProduct.length === 0 ? (
            <EmptyState>No production output for this period.</EmptyState>
          ) : filteredOutput.length === 0 ? (
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
              {filteredOutput.map((entry) => (
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

        <Card
          title={`Waste by product (${filteredWaste.length} of ${report.wasteByProduct.length})`}
        >
          {report.wasteByProduct.length > 0 ? (
            <TableToolbar
              basePath={basePath}
              pageParams={[]}
              searchParam="wasteQ"
              searchParams={query}
              searchPlaceholder="Search product, entries, quantity, or value"
            />
          ) : null}
          {report.wasteByProduct.length === 0 ? (
            <EmptyState>No waste recorded for this period.</EmptyState>
          ) : filteredWaste.length === 0 ? (
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
              {filteredWaste.map((entry) => (
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
    </ManagementPageShell>
  );
}
