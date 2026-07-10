import {
  Card,
  EmptyState,
  TableShell,
} from "@/components/admin/layout";
import { TablePagination } from "@/components/admin/pagination";
import { TableToolbar } from "@/components/admin/table-toolbar";
import type { PaymentMethod, SalesSummary } from "@/lib/operations/types";
import { formatProductName } from "@/lib/product-label";
import {
  pageNumber,
  paginate,
  type PageSearchParams,
} from "@/lib/paginate";
import { apiGet } from "@/lib/server-api";
import {
  firstParam,
  matchesSearch,
  matchesSelect,
} from "@/lib/table-filters";

import { SaleItemsSummary } from "./sale-items-summary";

const paymentLabels: Record<PaymentMethod, string> = {
  CASH: "Cash",
  TRANSFER: "Transfer",
  POS: "POS",
  CREDIT: "Credit",
};

function todayInputValue() {
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${today.getFullYear()}-${month}-${day}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatMoney(value: string | number) {
  return `₦${Number(value).toLocaleString("en", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatQuantity(value: string, unit: string) {
  return `${Number(value).toLocaleString("en", {
    maximumFractionDigits: 3,
  })} ${unit}`;
}

export default async function SalesDailySummaryPage({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}) {
  const query = await searchParams;
  const date =
    typeof query.date === "string" && query.date.trim() !== ""
      ? query.date
      : todayInputValue();
  const summary = await apiGet<SalesSummary>(
    `/sales/summary?date=${encodeURIComponent(date)}`,
  );
  const paymentSummaryQuery = firstParam(query, "paymentSummaryQ");
  const filteredPaymentSummary = summary.paymentSummary.filter((entry) =>
    matchesSearch(paymentSummaryQuery, [
      entry.method,
      paymentLabels[entry.method],
      entry.count,
      entry.amount,
    ]),
  );
  const productSummaryQuery = firstParam(query, "productSummaryQ");
  const filteredProductSummary = summary.productSummary.filter((entry) =>
    matchesSearch(productSummaryQuery, [
      formatProductName(entry.product),
      entry.quantitySold,
      entry.revenue,
    ]),
  );
  const salesQuery = firstParam(query, "q");
  const paymentFilter = firstParam(query, "payment");
  const productFilter = firstParam(query, "product");
  const productOptions = [
    ...new Map(
      summary.sales.flatMap((sale) =>
        sale.items.map((item) => [
          item.product.id,
          {
            label: formatProductName(item.product),
            value: item.product.id,
          },
        ]),
      ),
    ).values(),
  ];
  const filteredSales = summary.sales.filter(
    (sale) =>
      matchesSearch(salesQuery, [
        sale.saleNumber,
        sale.customerName,
        sale.paymentMethod,
        paymentLabels[sale.paymentMethod],
        sale.totalAmount,
        sale.amountPaid,
        sale.balanceDue,
        ...sale.items.flatMap((item) => [
          formatProductName(item.product),
          item.quantity,
          item.unitPrice,
          item.lineTotal,
        ]),
      ]) &&
      matchesSelect(paymentFilter, sale.paymentMethod) &&
      (!productFilter ||
        sale.items.some((item) => item.product.id === productFilter)),
  );
  const { pageItems, ...pagination } = paginate(
    filteredSales,
    pageNumber(query.page),
  );

  return (
    <>
      <Card>
        <form className="flex flex-col gap-3 sm:flex-row sm:items-end" method="GET">
          <div className="grid gap-1.5">
            <label className="text-sm font-medium text-stone-700" htmlFor="date">
              Date
            </label>
            <input
              className="h-10 rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-red-700 focus:ring-4 focus:ring-red-100"
              defaultValue={date}
              id="date"
              name="date"
              type="date"
            />
          </div>
          <button
            className="h-10 rounded-md bg-red-800 px-4 text-sm font-semibold text-white transition hover:bg-red-900"
            type="submit"
          >
            View summary
          </button>
        </form>
      </Card>

      <div className="grid gap-4 md:grid-cols-4">
        <Card title="Revenue">
          <p className="text-2xl font-semibold text-stone-950">
            {formatMoney(summary.totalRevenue)}
          </p>
          <p className="mt-1 text-sm text-stone-500">
            {summary.salesCount} sale{summary.salesCount === 1 ? "" : "s"} on{" "}
            {formatDate(summary.date)}
          </p>
        </Card>
        <Card title="Paid">
          <p className="text-2xl font-semibold text-stone-950">
            {formatMoney(summary.amountPaid)}
          </p>
          <p className="mt-1 text-sm text-stone-500">
            Due {formatMoney(summary.balanceDue)}
          </p>
        </Card>
        <Card title="Damaged">
          <p className="text-2xl font-semibold text-stone-950">
            {Number(summary.damagedQuantity).toLocaleString("en", {
              maximumFractionDigits: 3,
            })}
          </p>
          <p className="mt-1 text-sm text-stone-500">Units recorded</p>
        </Card>
        <Card title="Returned">
          <p className="text-2xl font-semibold text-stone-950">
            {Number(summary.returnedToStockQuantity).toLocaleString("en", {
              maximumFractionDigits: 3,
            })}
          </p>
          <p className="mt-1 text-sm text-stone-500">Units back to stock</p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={`Payment methods (${filteredPaymentSummary.length} of ${summary.paymentSummary.length})`}>
          {summary.paymentSummary.length > 0 ? (
            <TableToolbar
              basePath="/sales/daily-summary"
              pageParams={[]}
              searchParam="paymentSummaryQ"
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

        <Card title={`Product sales (${filteredProductSummary.length} of ${summary.productSummary.length})`}>
          {summary.productSummary.length > 0 ? (
            <TableToolbar
              basePath="/sales/daily-summary"
              pageParams={[]}
              searchParam="productSummaryQ"
              searchParams={query}
              searchPlaceholder="Search product, quantity, or revenue"
            />
          ) : null}
          {summary.productSummary.length === 0 ? (
            <EmptyState>No product sales for this date.</EmptyState>
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

      <Card title={`Sales (${filteredSales.length} of ${summary.sales.length})`}>
        {summary.sales.length > 0 ? (
          <TableToolbar
            basePath="/sales/daily-summary"
            searchParams={query}
            searchPlaceholder="Search sale number, customer, product, or payment"
            selectFilters={[
              {
                label: "Payment",
                name: "payment",
                options: Object.entries(paymentLabels).map(
                  ([value, label]) => ({ label, value }),
                ),
              },
              {
                label: "Product",
                name: "product",
                options: productOptions,
              },
            ]}
          />
        ) : null}
        {summary.sales.length === 0 ? (
          <EmptyState>No sales for this date.</EmptyState>
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
                <th className="py-2 pr-4">Time</th>
              </>
            }
          >
            {pageItems.map((sale) => (
              <tr className="align-top" key={sale.id}>
                <td className="py-3 pr-4 font-medium text-stone-900">
                  #{sale.saleNumber}
                </td>
                <td className="py-3 pr-4 text-stone-600">
                  <SaleItemsSummary
                    items={sale.items}
                    saleNumber={sale.saleNumber}
                  />
                </td>
                <td className="py-3 pr-4 text-stone-600">
                  {paymentLabels[sale.paymentMethod]}
                </td>
                <td className="py-3 pr-4 text-stone-600">
                  {formatMoney(sale.totalAmount)}
                </td>
                <td className="py-3 pr-4 text-stone-600">
                  {formatDateTime(sale.soldAt)}
                </td>
              </tr>
            ))}
          </TableShell>
        )}
        <TablePagination
          basePath="/sales/daily-summary"
          searchParams={query}
          {...pagination}
        />
      </Card>
    </>
  );
}
