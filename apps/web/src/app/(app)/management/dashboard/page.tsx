import { ReportExportActions } from "@/components/reports/report-export-actions";
import type { ManagementDashboardReport } from "@/lib/management/types";
import { apiGet } from "@/lib/server-api";

import {
  DashboardChartCard,
  getMonthParam,
  formatMoney,
  formatQuantity,
  ManagementPageShell,
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
  const reportSections = [
    {
      title: "Summary",
      rows: [
        {
          Month: report.month.label,
          Revenue: formatMoney(report.summary.totalRevenue),
          "Gross profit": formatMoney(report.summary.estimatedGrossProfit),
          "Net profit": formatMoney(report.summary.estimatedNetProfit),
          Expenses: formatMoney(report.summary.operatingExpenses),
          "Raw material stock": formatMoney(report.summary.rawMaterialStockValue),
          "Finished goods stock": formatMoney(report.summary.finishedGoodsStockValue),
          "Production runs": report.summary.productionRuns,
          "Products sold": formatQuantity(report.summary.productsSold),
          "Low stock alerts": report.summary.lowStockAlerts,
        },
      ],
    },
    {
      title: "Profitability",
      rows: report.charts.profitability.map((entry) => ({
        Metric: entry.label,
        Value: formatMoney(entry.value),
        Detail: entry.detail,
      })),
    },
    {
      title: "Stock value mix",
      rows: report.charts.stockValue.map((entry) => ({
        Metric: entry.label,
        Value: formatMoney(entry.value),
        Detail: entry.detail,
      })),
    },
    {
      title: "Production output",
      rows: report.charts.productionOutput.map((entry) => ({
        Product: entry.label,
        Quantity: formatQuantity(entry.value),
        Detail: entry.detail,
      })),
    },
    {
      title: "Sales by product",
      rows: report.charts.salesRevenue.map((entry) => ({
        Product: entry.label,
        Revenue: formatMoney(entry.value),
        Detail: entry.detail,
      })),
    },
  ];

  return (
    <ManagementPageShell>
      <MonthFilter month={report.month.value} />
      <div className="flex justify-end">
        <ReportExportActions
          filename={`management-dashboard-${report.month.value}`}
          sections={reportSections}
          subtitle={`Month: ${report.month.label}`}
          title="Management dashboard"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Revenue"
          value={formatMoney(report.summary.totalRevenue)}
          detail={`${report.summary.productionRuns} production runs`}
        />
        <MetricCard
          label="Estimated net profit"
          tone={
            Number(report.summary.estimatedNetProfit) < 0
              ? "warning"
              : "positive"
          }
          value={formatMoney(report.summary.estimatedNetProfit)}
          detail={`Gross ${formatMoney(report.summary.estimatedGrossProfit)} | Expenses ${formatMoney(report.summary.operatingExpenses)}`}
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
        <DashboardChartCard
          title="Profitability"
          description="Revenue through net profit for the selected month."
          data={report.charts.profitability}
          mode="money"
          emptyText="No profit/loss data for this month."
        />
        <DashboardChartCard
          title="Stock value mix"
          description="Current inventory value split by stock category."
          data={report.charts.stockValue}
          mode="money"
          emptyText="No stock valuation data available."
        />
        <DashboardChartCard
          title="Production output"
          description="Top products produced in the selected month."
          data={report.charts.productionOutput}
          mode="quantity"
          emptyText="No production output for this month."
        />
        <DashboardChartCard
          title="Sales by product"
          description="Top product revenue in the selected month."
          data={report.charts.salesRevenue}
          mode="money"
          emptyText="No product sales for this month."
        />
      </div>
    </ManagementPageShell>
  );
}
