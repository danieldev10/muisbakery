import {
  Card,
  EmptyState,
  PageHeader,
  TableShell,
} from "@/components/admin/layout";
import type { ManagementProductionReport } from "@/lib/management/types";
import { formatProductName } from "@/lib/product-label";
import { apiGet } from "@/lib/server-api";

import {
  formatDateTime,
  formatMoney,
  formatQuantity,
  getMonthParam,
  MetricCard,
  MonthFilter,
} from "../_components";

export default async function ManagementProductionPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string | string[] }>;
}) {
  const query = await searchParams;
  const month = getMonthParam(query);
  const report = await apiGet<ManagementProductionReport>(
    `/management/production?month=${encodeURIComponent(month)}`,
  );

  return (
    <>
      <PageHeader
        title="Production report"
        description={`Production output, raw material usage, and waste for ${report.month.label}.`}
      />

      <MonthFilter month={report.month.value} />

      <div className="grid gap-4 md:grid-cols-4">
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
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Output by product">
          {report.outputByProduct.length === 0 ? (
            <EmptyState>No production output for this month.</EmptyState>
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
              {report.outputByProduct.map((entry) => (
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

        <Card title="Waste by product">
          {report.wasteByProduct.length === 0 ? (
            <EmptyState>No waste recorded for this month.</EmptyState>
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
              {report.wasteByProduct.map((entry) => (
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

      <Card title="Raw material usage">
        {report.materialUsage.length === 0 ? (
          <EmptyState>No raw materials were consumed this month.</EmptyState>
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
            {report.materialUsage.map((entry) => (
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

      <Card title={`Production runs (${report.runs.length})`}>
        {report.runs.length === 0 ? (
          <EmptyState>No production runs for this month.</EmptyState>
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
            {report.runs.map((run) => (
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
      </Card>
    </>
  );
}
