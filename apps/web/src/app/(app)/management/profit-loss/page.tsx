import Link from "next/link";

import { Card, EmptyState, TableShell } from "@/components/admin/layout";
import type { ManagementProfitLossReport } from "@/lib/management/types";
import { apiGet } from "@/lib/server-api";

import {
  formatMoney,
  formatPercent,
  formatQuantity,
  getMonthParam,
  ManagementPageShell,
  MetricCard,
  MonthFilter,
} from "../_components";

function gainLossTone(value: string) {
  return Number(value) < 0 ? "warning" : "positive";
}

const gainClass = "font-semibold text-emerald-700";
const lossClass = "font-semibold text-red-800";

function StatementRow({
  label,
  detail,
  amount,
  amountClass,
  emphasize,
}: {
  label: string;
  detail?: string;
  amount: string;
  amountClass: string;
  emphasize?: boolean;
}) {
  return (
    <tr className={emphasize ? "bg-[var(--surface-warm)]" : undefined}>
      <td
        className={`py-3 pr-4 ${emphasize ? "font-semibold text-stone-950" : "font-medium text-stone-900"}`}
      >
        {label}
        {detail ? (
          <span className="block text-xs font-normal text-stone-500">
            {detail}
          </span>
        ) : null}
      </td>
      <td className={`py-3 pr-4 text-right ${amountClass}`}>{amount}</td>
    </tr>
  );
}

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
    <ManagementPageShell>
      <MonthFilter month={report.month.value} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Revenue"
          tone="positive"
          value={formatMoney(report.revenue.totalRevenue)}
          detail={`${report.revenue.salesCount} sales`}
        />
        <MetricCard
          label="Gross profit"
          tone={gainLossTone(report.profit.estimatedGrossProfit)}
          value={formatMoney(report.profit.estimatedGrossProfit)}
          detail={`${formatPercent(report.profit.grossMarginPercent)} gross margin`}
        />
        <MetricCard
          label="Operating expenses"
          tone={
            Number(report.expenses.totalOperatingExpenses) > 0
              ? "warning"
              : "default"
          }
          value={formatMoney(report.expenses.totalOperatingExpenses)}
          detail={`${report.expenses.count} expenses recorded`}
        />
        <MetricCard
          label="Net profit"
          tone={gainLossTone(report.profit.estimatedNetProfit)}
          value={formatMoney(report.profit.estimatedNetProfit)}
          detail={`${formatPercent(report.profit.netMarginPercent)} net margin`}
        />
      </div>

      <Card
        title="Operational profit & loss statement"
        description="Calculated from recorded sales, sold-batch production cost, expenses, and losses. This is an operational report for day-to-day decisions, not a final accounting statement — there is no cash/bank ledger or period close yet."
      >
        <TableShell
          head={
            <>
              <th className="py-2 pr-4">Line</th>
              <th className="py-2 pr-4 text-right">Amount</th>
            </>
          }
        >
          <StatementRow
            label="Sales revenue"
            detail={`${report.revenue.salesCount} sales, net of ${formatMoney(report.revenue.discount)} discounts`}
            amount={formatMoney(report.revenue.totalRevenue)}
            amountClass={gainClass}
          />
          <StatementRow
            label="Cost of goods sold"
            detail="Finished-good batches sold this month, at captured production cost"
            amount={`- ${formatMoney(report.costs.costOfGoodsSold)}`}
            amountClass={lossClass}
          />
          <StatementRow
            label="Materials issued to production"
            detail="Operational movement, shown for comparison; unsold goods remain inventory"
            amount={formatMoney(report.costs.materialIssuedCost)}
            amountClass="text-stone-600"
          />
          <StatementRow
            label="Gross profit"
            detail={`${formatPercent(report.profit.grossMarginPercent)} of revenue`}
            amount={formatMoney(report.profit.estimatedGrossProfit)}
            amountClass={
              Number(report.profit.estimatedGrossProfit) < 0
                ? lossClass
                : gainClass
            }
            emphasize
          />
          <StatementRow
            label="Operating expenses"
            detail={`${report.expenses.count} recorded expenses`}
            amount={`- ${formatMoney(report.expenses.totalOperatingExpenses)}`}
            amountClass={lossClass}
          />
          <StatementRow
            label="Recorded losses"
            detail="Damaged production waste and damaged returns, at retail value"
            amount={`- ${formatMoney(report.losses.totalEstimatedLoss)}`}
            amountClass={lossClass}
          />
          <StatementRow
            label="Net profit"
            detail={`${formatPercent(report.profit.netMarginPercent)} of revenue`}
            amount={formatMoney(report.profit.estimatedNetProfit)}
            amountClass={
              Number(report.profit.estimatedNetProfit) < 0
                ? lossClass
                : gainClass
            }
            emphasize
          />
        </TableShell>
      </Card>

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

        <Card title="Operating expenses by category">
          {report.expenses.byCategory.length === 0 ? (
            <EmptyState>
              No expenses recorded for this month.{" "}
              <Link
                className="font-medium text-[var(--brand-burgundy)] underline-offset-2 hover:underline"
                href="/management/expenses"
              >
                Record expenses
              </Link>{" "}
              so net profit reflects the real books.
            </EmptyState>
          ) : (
            <>
              <TableShell
                head={
                  <>
                    <th className="py-2 pr-4">Category</th>
                    <th className="py-2 pr-4">Expenses</th>
                    <th className="py-2 pr-4">Amount</th>
                  </>
                }
              >
                {report.expenses.byCategory.map((entry) => (
                  <tr key={entry.category.id}>
                    <td className="py-3 pr-4 font-medium text-stone-900">
                      {entry.category.name}
                    </td>
                    <td className="py-3 pr-4 text-stone-600">{entry.count}</td>
                    <td className={`py-3 pr-4 ${lossClass}`}>
                      {formatMoney(entry.amount)}
                    </td>
                  </tr>
                ))}
              </TableShell>
              <p className="mt-3 text-sm text-stone-500">
                Manage entries on the{" "}
                <Link
                  className="font-medium text-[var(--brand-burgundy)] underline-offset-2 hover:underline"
                  href="/management/expenses"
                >
                  Expenses page
                </Link>
                .
              </p>
            </>
          )}
        </Card>
      </div>

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

      <Card title="Calculation notes">
        <ul className="grid gap-2 text-sm text-stone-600">
          {report.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </Card>
    </ManagementPageShell>
  );
}
