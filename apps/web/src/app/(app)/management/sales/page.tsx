import {
  Card,
  EmptyState,
  PageHeader,
  TableShell,
} from "@/components/admin/layout";
import type { ManagementSalesReport } from "@/lib/management/types";
import { formatProductName } from "@/lib/product-label";
import { apiGet } from "@/lib/server-api";

import {
  formatDateTime,
  formatMoney,
  formatQuantity,
  getMonthParam,
  MetricCard,
  MonthFilter,
  paymentLabels,
} from "../_components";

const returnLabels = {
  RETURN_TO_STOCK: "Returned to stock",
  DAMAGED: "Damaged",
};

export default async function ManagementSalesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string | string[] }>;
}) {
  const query = await searchParams;
  const month = getMonthParam(query);
  const report = await apiGet<ManagementSalesReport>(
    `/management/sales?month=${encodeURIComponent(month)}`,
  );

  return (
    <>
      <PageHeader
        title="Sales report"
        description={`Sales revenue, product movement, and returns for ${report.month.label}.`}
      />

      <MonthFilter month={report.month.value} />

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard
          label="Revenue"
          value={formatMoney(report.summary.totalRevenue)}
          detail={`${report.summary.salesCount} sales`}
        />
        <MetricCard
          label="Paid"
          value={formatMoney(report.summary.amountPaid)}
          detail={`Due ${formatMoney(report.summary.balanceDue)}`}
        />
        <MetricCard
          label="Products sold"
          value={formatQuantity(report.summary.quantitySold)}
        />
        <MetricCard
          label="Damaged returns"
          tone={Number(report.summary.damagedQuantity) > 0 ? "warning" : "default"}
          value={formatQuantity(report.summary.damagedQuantity)}
          detail={`${formatQuantity(report.summary.returnedToStockQuantity)} returned to stock`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Payment methods">
          <TableShell
            head={
              <>
                <th className="py-2 pr-4">Method</th>
                <th className="py-2 pr-4">Sales</th>
                <th className="py-2 pr-4">Amount</th>
              </>
            }
          >
            {report.paymentSummary.map((entry) => (
              <tr key={entry.method}>
                <td className="py-3 pr-4 font-medium text-stone-900">
                  {paymentLabels[entry.method]}
                </td>
                <td className="py-3 pr-4 text-stone-600">{entry.count}</td>
                <td className="py-3 pr-4 text-stone-600">
                  {formatMoney(entry.amount)}
                </td>
              </tr>
            ))}
          </TableShell>
        </Card>

        <Card title="Product sales">
          {report.productSummary.length === 0 ? (
            <EmptyState>No product sales for this month.</EmptyState>
          ) : (
            <TableShell
              head={
                <>
                  <th className="py-2 pr-4">Product</th>
                  <th className="py-2 pr-4">Quantity</th>
                  <th className="py-2 pr-4">Revenue</th>
                </>
              }
            >
              {report.productSummary.map((entry) => (
                <tr key={entry.product.id}>
                  <td className="py-3 pr-4 font-medium text-stone-900">
                    {formatProductName(entry.product)}
                  </td>
                  <td className="py-3 pr-4 text-stone-600">
                    {formatQuantity(
                      entry.quantitySold,
                      entry.product.unit.abbreviation,
                    )}
                  </td>
                  <td className="py-3 pr-4 text-stone-600">
                    {formatMoney(entry.revenue)}
                  </td>
                </tr>
              ))}
            </TableShell>
          )}
        </Card>
      </div>

      <Card title={`Sales (${report.sales.length})`}>
        {report.sales.length === 0 ? (
          <EmptyState>No sales for this month.</EmptyState>
        ) : (
          <TableShell
            head={
              <>
                <th className="py-2 pr-4">Sale</th>
                <th className="py-2 pr-4">Items</th>
                <th className="py-2 pr-4">Payment</th>
                <th className="py-2 pr-4">Total</th>
                <th className="py-2 pr-4">Cashier</th>
                <th className="py-2 pr-4">Time</th>
              </>
            }
          >
            {report.sales.map((sale) => (
              <tr className="align-top" key={sale.id}>
                <td className="py-3 pr-4 font-medium text-stone-900">
                  #{sale.saleNumber}
                </td>
                <td className="py-3 pr-4 text-stone-600">
                  <ul className="grid gap-1">
                    {sale.items.map((item) => (
                      <li key={item.id}>
                        {formatProductName(item.product)}:{" "}
                        {formatQuantity(
                          item.quantity,
                          item.product.unit.abbreviation,
                        )}
                      </li>
                    ))}
                  </ul>
                </td>
                <td className="py-3 pr-4 text-stone-600">
                  {paymentLabels[sale.paymentMethod]}
                </td>
                <td className="py-3 pr-4 text-stone-600">
                  {formatMoney(sale.totalAmount)}
                </td>
                <td className="py-3 pr-4 text-stone-600">
                  {sale.createdBy?.name ?? sale.createdBy?.email ?? "-"}
                </td>
                <td className="py-3 pr-4 text-stone-600">
                  {formatDateTime(sale.soldAt)}
                </td>
              </tr>
            ))}
          </TableShell>
        )}
      </Card>

      <Card title={`Returns (${report.returns.length})`}>
        {report.returns.length === 0 ? (
          <EmptyState>No returns for this month.</EmptyState>
        ) : (
          <TableShell
            head={
              <>
                <th className="py-2 pr-4">Product</th>
                <th className="py-2 pr-4">Disposition</th>
                <th className="py-2 pr-4">Quantity</th>
                <th className="py-2 pr-4">Reason</th>
                <th className="py-2 pr-4">Time</th>
              </>
            }
          >
            {report.returns.map((returnEntry) => (
              <tr key={returnEntry.id}>
                <td className="py-3 pr-4 font-medium text-stone-900">
                  {formatProductName(returnEntry.product)}
                </td>
                <td className="py-3 pr-4 text-stone-600">
                  {returnLabels[returnEntry.disposition]}
                </td>
                <td className="py-3 pr-4 text-stone-600">
                  {formatQuantity(
                    returnEntry.quantity,
                    returnEntry.product.unit.abbreviation,
                  )}
                </td>
                <td className="py-3 pr-4 text-stone-600">
                  {returnEntry.reason ?? "-"}
                </td>
                <td className="py-3 pr-4 text-stone-600">
                  {formatDateTime(returnEntry.recordedAt)}
                </td>
              </tr>
            ))}
          </TableShell>
        )}
      </Card>
    </>
  );
}
