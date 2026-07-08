import {
  Card,
  PageHeader,
  TableShell,
} from "@/components/admin/layout";
import type { ManagementProfitLossReport } from "@/lib/management/types";
import { apiGet } from "@/lib/server-api";

import {
  formatMoney,
  formatPercent,
  formatQuantity,
  getMonthParam,
  MetricCard,
  MonthFilter,
} from "../_components";

function gainLossTone(value: string) {
  return Number(value) < 0 ? "warning" : "positive";
}

const gainClass = "font-semibold text-emerald-700";
const lossClass = "font-semibold text-red-800";

export default async function ManagementProfitLossPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string | string[] }>;
}) {
  const query = await searchParams;
  const month = getMonthParam(query);
  const report = await apiGet<ManagementProfitLossReport>(
    `/management/profit-loss?month=${encodeURIComponent(month)}`,
  );

  return (
    <>
      <PageHeader
        title="Profit/loss"
        description={`Estimated profit and recorded losses for ${report.month.label}.`}
      />

      <MonthFilter month={report.month.value} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Revenue"
          tone="positive"
          value={formatMoney(report.revenue.totalRevenue)}
          detail={`${report.revenue.salesCount} sales`}
        />
        <MetricCard
          label="Material cost"
          tone="warning"
          value={formatMoney(report.costs.materialIssuedCost)}
          detail={`Purchased ${formatMoney(report.costs.materialPurchasedCost)}`}
        />
        <MetricCard
          label="Gross profit"
          tone={gainLossTone(report.profit.estimatedGrossProfit)}
          value={formatMoney(report.profit.estimatedGrossProfit)}
          detail={`${formatPercent(report.profit.grossMarginPercent)} gross margin`}
        />
        <MetricCard
          label="Net after losses"
          tone={gainLossTone(report.profit.estimatedNetAfterRecordedLosses)}
          value={formatMoney(report.profit.estimatedNetAfterRecordedLosses)}
          detail={`Recorded losses ${formatMoney(report.losses.totalEstimatedLoss)}`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Revenue">
          <TableShell
            head={
              <>
                <th className="py-2 pr-4">Metric</th>
                <th className="py-2 pr-4">Amount</th>
              </>
            }
          >
            <tr>
              <td className="py-3 pr-4 font-medium text-stone-900">
                Subtotal
              </td>
              <td className={`py-3 pr-4 ${gainClass}`}>
                {formatMoney(report.revenue.subtotal)}
              </td>
            </tr>
            <tr>
              <td className="py-3 pr-4 font-medium text-stone-900">
                Discount
              </td>
              <td className={`py-3 pr-4 ${lossClass}`}>
                {formatMoney(report.revenue.discount)}
              </td>
            </tr>
            <tr>
              <td className="py-3 pr-4 font-medium text-stone-900">
                Amount paid
              </td>
              <td className={`py-3 pr-4 ${gainClass}`}>
                {formatMoney(report.revenue.amountPaid)}
              </td>
            </tr>
            <tr>
              <td className="py-3 pr-4 font-medium text-stone-900">
                Balance due
              </td>
              <td className={`py-3 pr-4 ${lossClass}`}>
                {formatMoney(report.revenue.balanceDue)}
              </td>
            </tr>
          </TableShell>
        </Card>

        <Card title="Recorded losses">
          <TableShell
            head={
              <>
                <th className="py-2 pr-4">Loss</th>
                <th className="py-2 pr-4">Quantity</th>
                <th className="py-2 pr-4">Estimated value</th>
              </>
            }
          >
            <tr>
              <td className="py-3 pr-4 font-medium text-stone-900">
                Production waste
              </td>
              <td className="py-3 pr-4 text-stone-600">
                {formatQuantity(report.losses.productionWasteQuantity)}
              </td>
              <td className={`py-3 pr-4 ${lossClass}`}>
                {formatMoney(report.losses.productionWasteEstimatedValue)}
              </td>
            </tr>
            <tr>
              <td className="py-3 pr-4 font-medium text-stone-900">
                Damaged returns
              </td>
              <td className="py-3 pr-4 text-stone-600">
                {formatQuantity(report.losses.damagedReturnsQuantity)}
              </td>
              <td className={`py-3 pr-4 ${lossClass}`}>
                {formatMoney(report.losses.damagedReturnsEstimatedValue)}
              </td>
            </tr>
            <tr>
              <td className="py-3 pr-4 font-medium text-stone-900">
                Waste returned to production
              </td>
              <td className="py-3 pr-4 text-stone-600">
                {formatQuantity(
                  report.losses.wasteReturnedToProductionQuantity,
                )}
              </td>
              <td className={`py-3 pr-4 ${gainClass}`}>
                Reused — no loss
              </td>
            </tr>
          </TableShell>
        </Card>
      </div>

      <Card title="Calculation notes">
        <ul className="grid gap-2 text-sm text-stone-600">
          {report.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </Card>
    </>
  );
}
