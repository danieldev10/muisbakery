import { Card, EmptyState, TableShell } from "@/components/admin/layout";
import { TableToolbar } from "@/components/admin/table-toolbar";
import { ReportExportActions } from "@/components/reports/report-export-actions";
import type { ManagementProductionReport } from "@/lib/management/types";
import type { PageSearchParams } from "@/lib/paginate";
import { apiGet } from "@/lib/server-api";
import { firstParam, matchesSearch } from "@/lib/table-filters";

import {
  formatQuantity,
  ManagementPageShell,
  reportRangeApiPath,
  ReportRangeFilter,
} from "../../_components";

const basePath = "/management/production/raw-material-usage";

export default async function ManagementRawMaterialUsagePage({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}) {
  const query = await searchParams;
  const report = await apiGet<ManagementProductionReport>(
    reportRangeApiPath("/management/production", query),
  );
  const search = firstParam(query, "q");
  const filteredItems = report.materialUsage.filter((entry) =>
    matchesSearch(search, [
      entry.rawMaterial.name,
      entry.rawMaterial.baseUnit.abbreviation,
      entry.expectedQuantity,
      entry.actualQuantity,
    ]),
  );
  const reportSections = [
    {
      title: "Raw material usage",
      rows: filteredItems.map((entry) => ({
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
  ];

  return (
    <ManagementPageShell>
      <ReportRangeFilter
        actions={
          <ReportExportActions
            filename={`management-production-material-usage-${report.range.from}-to-${report.range.to}`}
            sections={reportSections}
            subtitle={`Period: ${report.range.label}`}
            title="Management raw material usage report"
          />
        }
        range={report.range}
      />

      <Card
        title={`Raw material usage (${filteredItems.length} of ${report.materialUsage.length})`}
      >
        {report.materialUsage.length > 0 ? (
          <TableToolbar
            basePath={basePath}
            searchParams={query}
            searchPlaceholder="Search material, unit, expected, or actual"
          />
        ) : null}
        {report.materialUsage.length === 0 ? (
          <EmptyState>No raw materials were consumed in this period.</EmptyState>
        ) : filteredItems.length === 0 ? (
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
            {filteredItems.map((entry) => (
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
    </ManagementPageShell>
  );
}
