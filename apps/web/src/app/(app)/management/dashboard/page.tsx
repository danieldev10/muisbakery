import {
  Card,
  EmptyState,
  PageHeader,
  TableShell,
} from "@/components/admin/layout";
import type { ManagementDashboardReport } from "@/lib/management/types";
import { apiGet } from "@/lib/server-api";

import {
  formatAction,
  formatDateTime,
  formatMoney,
  formatQuantity,
  getMonthParam,
  MetricCard,
  MonthFilter,
} from "../_components";

export default async function ManagementDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string | string[] }>;
}) {
  const query = await searchParams;
  const month = getMonthParam(query);
  const report = await apiGet<ManagementDashboardReport>(
    `/management/dashboard?month=${encodeURIComponent(month)}`,
  );

  return (
    <>
      <PageHeader
        title="Management dashboard"
        description={`Business overview for ${report.month.label}.`}
      />

      <MonthFilter month={report.month.value} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Revenue"
          value={formatMoney(report.summary.totalRevenue)}
          detail={`${report.summary.productionRuns} production runs`}
        />
        <MetricCard
          label="Estimated gross profit"
          tone="positive"
          value={formatMoney(report.summary.estimatedGrossProfit)}
          detail={`Materials issued ${formatMoney(report.summary.estimatedMaterialCost)}`}
        />
        <MetricCard
          label="Stock value"
          value={formatMoney(
            Number(report.summary.rawMaterialStockValue) +
              Number(report.summary.finishedGoodsStockValue),
          )}
          detail={`Raw ${formatMoney(report.summary.rawMaterialStockValue)} | Finished ${formatMoney(report.summary.finishedGoodsStockValue)}`}
        />
        <MetricCard
          label="Low stock alerts"
          tone={report.summary.lowStockAlerts > 0 ? "warning" : "default"}
          value={report.summary.lowStockAlerts}
          detail={`${formatQuantity(report.summary.productsSold)} products sold`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Raw material alerts">
          {report.lowStock.rawMaterials.length === 0 ? (
            <EmptyState>No low raw material alerts.</EmptyState>
          ) : (
            <TableShell
              head={
                <>
                  <th className="py-2 pr-4">Material</th>
                  <th className="py-2 pr-4">Remaining</th>
                  <th className="py-2 pr-4">Value</th>
                </>
              }
            >
              {report.lowStock.rawMaterials.map((item) => (
                <tr key={item.rawMaterial.id}>
                  <td className="py-3 pr-4 font-medium text-stone-900">
                    {item.rawMaterial.name}
                  </td>
                  <td className="py-3 pr-4 text-stone-600">
                    {formatQuantity(
                      item.totalRemaining,
                      item.rawMaterial.baseUnit.abbreviation,
                    )}
                  </td>
                  <td className="py-3 pr-4 text-stone-600">
                    {formatMoney(item.estimatedValue)}
                  </td>
                </tr>
              ))}
            </TableShell>
          )}
        </Card>

        <Card title="Finished product alerts">
          {report.lowStock.finishedProducts.length === 0 ? (
            <EmptyState>No low finished product alerts.</EmptyState>
          ) : (
            <TableShell
              head={
                <>
                  <th className="py-2 pr-4">Product</th>
                  <th className="py-2 pr-4">Remaining</th>
                  <th className="py-2 pr-4">Retail value</th>
                </>
              }
            >
              {report.lowStock.finishedProducts.map((item) => (
                <tr key={item.product.id}>
                  <td className="py-3 pr-4 font-medium text-stone-900">
                    {item.product.name}
                  </td>
                  <td className="py-3 pr-4 text-stone-600">
                    {formatQuantity(
                      item.totalRemaining,
                      item.product.unit.abbreviation,
                    )}
                  </td>
                  <td className="py-3 pr-4 text-stone-600">
                    {formatMoney(item.estimatedRetailValue)}
                  </td>
                </tr>
              ))}
            </TableShell>
          )}
        </Card>
      </div>

      <Card title="Latest activity">
        {report.latestActivity.length === 0 ? (
          <EmptyState>No activity has been recorded yet.</EmptyState>
        ) : (
          <TableShell
            head={
              <>
                <th className="py-2 pr-4">Action</th>
                <th className="py-2 pr-4">Area</th>
                <th className="py-2 pr-4">Actor</th>
                <th className="py-2 pr-4">Time</th>
              </>
            }
          >
            {report.latestActivity.map((entry) => (
              <tr key={entry.id}>
                <td className="py-3 pr-4 font-medium text-stone-900">
                  {formatAction(entry.action)}
                </td>
                <td className="py-3 pr-4 text-stone-600">
                  {entry.entityType}
                </td>
                <td className="py-3 pr-4 text-stone-600">
                  {entry.actor?.name ?? entry.actor?.email ?? "System"}
                </td>
                <td className="py-3 pr-4 text-stone-600">
                  {formatDateTime(entry.createdAt)}
                </td>
              </tr>
            ))}
          </TableShell>
        )}
      </Card>
    </>
  );
}
