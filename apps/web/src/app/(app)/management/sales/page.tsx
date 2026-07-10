import { Card, EmptyState, TableShell } from "@/components/admin/layout";
import { TablePagination } from "@/components/admin/pagination";
import { TableToolbar } from "@/components/admin/table-toolbar";
import type { ManagementSalesReport } from "@/lib/management/types";
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
  paymentLabels,
} from "../_components";

const returnLabels = {
  RETURN_TO_STOCK: "Returned to stock",
  DAMAGED: "Damaged",
};

export default async function ManagementSalesPage({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}) {
  const query = await searchParams;
  const month = getMonthParam(query);
  const report = await apiGet<ManagementSalesReport>(
    `/management/sales?month=${encodeURIComponent(month)}`,
  );
  const paymentQuery = firstParam(query, "paymentQ");
  const filteredPaymentSummary = report.paymentSummary.filter((entry) =>
    matchesSearch(paymentQuery, [
      entry.method,
      paymentLabels[entry.method],
      entry.count,
      entry.amount,
    ]),
  );
  const productSummaryQuery = firstParam(query, "productSummaryQ");
  const filteredProductSummary = report.productSummary.filter((entry) =>
    matchesSearch(productSummaryQuery, [
      formatProductName(entry.product),
      entry.quantitySold,
      entry.revenue,
    ]),
  );
  const salesQuery = firstParam(query, "salesQ");
  const salesPayment = firstParam(query, "salesPayment");
  const salesProduct = firstParam(query, "salesProduct");
  const salesProductOptions = [
    ...new Map(
      report.sales.flatMap((sale) =>
        sale.items.map((item) => [
          item.product.id,
          { label: formatProductName(item.product), value: item.product.id },
        ]),
      ),
    ).values(),
  ];
  const filteredSales = report.sales.filter(
    (sale) =>
      matchesSearch(salesQuery, [
        sale.saleNumber,
        sale.paymentMethod,
        paymentLabels[sale.paymentMethod],
        sale.totalAmount,
        sale.amountPaid,
        sale.balanceDue,
        sale.createdBy?.name,
        sale.createdBy?.email,
        ...sale.items.flatMap((item) => [
          formatProductName(item.product),
          item.quantity,
          item.lineTotal,
        ]),
      ]) &&
      matchesSelect(salesPayment, sale.paymentMethod) &&
      (!salesProduct ||
        sale.items.some((item) => item.product.id === salesProduct)),
  );
  const returnsQuery = firstParam(query, "returnsQ");
  const returnsDisposition = firstParam(query, "returnsDisposition");
  const returnsProduct = firstParam(query, "returnsProduct");
  const returnsProductOptions = [
    ...new Map(
      report.returns.map((entry) => [
        entry.product.id,
        { label: formatProductName(entry.product), value: entry.product.id },
      ]),
    ).values(),
  ];
  const filteredReturns = report.returns.filter(
    (entry) =>
      matchesSearch(returnsQuery, [
        formatProductName(entry.product),
        entry.disposition,
        returnLabels[entry.disposition],
        entry.quantity,
        entry.reason,
        entry.createdBy?.name,
        entry.createdBy?.email,
      ]) &&
      matchesSelect(returnsDisposition, entry.disposition) &&
      matchesSelect(returnsProduct, entry.product.id),
  );
  const { pageItems: salesItems, ...salesPagination } = paginate(
    filteredSales,
    pageNumber(query.salesPage),
  );
  const { pageItems: returnItems, ...returnsPagination } = paginate(
    filteredReturns,
    pageNumber(query.returnsPage),
  );

  return (
    <ManagementPageShell>
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
        <Card title={`Payment methods (${filteredPaymentSummary.length} of ${report.paymentSummary.length})`}>
          {report.paymentSummary.length > 0 ? (
            <TableToolbar
              basePath="/management/sales"
              pageParams={[]}
              searchParam="paymentQ"
              searchParams={query}
              searchPlaceholder="Search payment method, count, or amount"
            />
          ) : null}
          {filteredPaymentSummary.length === 0 ? (
            <EmptyState>No payment methods match the current filters.</EmptyState>
          ) : (
            <TableShell
              head={
                <>
                  <th className="py-2 pr-4">Method</th>
                  <th className="py-2 pr-4">Sales</th>
                  <th className="py-2 pr-4">Amount</th>
                </>
              }
            >
              {filteredPaymentSummary.map((entry) => (
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
          )}
        </Card>

        <Card title={`Product sales (${filteredProductSummary.length} of ${report.productSummary.length})`}>
          {report.productSummary.length > 0 ? (
            <TableToolbar
              basePath="/management/sales"
              pageParams={[]}
              searchParam="productSummaryQ"
              searchParams={query}
              searchPlaceholder="Search product, quantity, or revenue"
            />
          ) : null}
          {report.productSummary.length === 0 ? (
            <EmptyState>No product sales for this month.</EmptyState>
          ) : filteredProductSummary.length === 0 ? (
            <EmptyState>No product sales match the current filters.</EmptyState>
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
              {filteredProductSummary.map((entry) => (
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

      <Card title={`Sales (${filteredSales.length} of ${report.sales.length})`}>
        {report.sales.length > 0 ? (
          <TableToolbar
            basePath="/management/sales"
            pageParams={["salesPage"]}
            searchParam="salesQ"
            searchParams={query}
            searchPlaceholder="Search sale, product, cashier, or payment"
            selectFilters={[
              {
                label: "Payment",
                name: "salesPayment",
                options: Object.entries(paymentLabels).map(
                  ([value, label]) => ({ label, value }),
                ),
              },
              {
                label: "Product",
                name: "salesProduct",
                options: salesProductOptions,
              },
            ]}
          />
        ) : null}
        {report.sales.length === 0 ? (
          <EmptyState>No sales for this month.</EmptyState>
        ) : filteredSales.length === 0 ? (
          <EmptyState>No sales match the current filters.</EmptyState>
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
            {salesItems.map((sale) => (
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
        <TablePagination
          basePath="/management/sales"
          pageParam="salesPage"
          searchParams={query}
          {...salesPagination}
        />
      </Card>

      <Card title={`Returns (${filteredReturns.length} of ${report.returns.length})`}>
        {report.returns.length > 0 ? (
          <TableToolbar
            basePath="/management/sales"
            pageParams={["returnsPage"]}
            searchParam="returnsQ"
            searchParams={query}
            searchPlaceholder="Search product, disposition, reason, or user"
            selectFilters={[
              {
                label: "Disposition",
                name: "returnsDisposition",
                options: Object.entries(returnLabels).map(([value, label]) => ({
                  label,
                  value,
                })),
              },
              {
                label: "Product",
                name: "returnsProduct",
                options: returnsProductOptions,
              },
            ]}
          />
        ) : null}
        {report.returns.length === 0 ? (
          <EmptyState>No returns for this month.</EmptyState>
        ) : filteredReturns.length === 0 ? (
          <EmptyState>No returns match the current filters.</EmptyState>
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
            {returnItems.map((returnEntry) => (
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
        <TablePagination
          basePath="/management/sales"
          pageParam="returnsPage"
          searchParams={query}
          {...returnsPagination}
        />
      </Card>
    </ManagementPageShell>
  );
}
