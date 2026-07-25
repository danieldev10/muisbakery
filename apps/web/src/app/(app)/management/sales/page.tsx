import { TextareaField } from "@/components/admin/form-controls";
import { AdminFormModal } from "@/components/admin/form-modal";
import { Card, EmptyState, TableShell } from "@/components/admin/layout";
import { TablePagination } from "@/components/admin/pagination";
import { TableToolbar } from "@/components/admin/table-toolbar";
import { ReportExportActions } from "@/components/reports/report-export-actions";
import type { ManagementSalesReport } from "@/lib/management/types";
import type { DayCloseListReport } from "@/lib/operations/types";
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
  ManagementPageShell,
  MetricCard,
  paymentLabels,
  reportRangeApiPath,
  ReportRangeFilter,
} from "../_components";

import { ApproveDayCloseButton } from "./approve-day-close-modal";
import { reopenDayClose } from "./actions";

const returnLabels = {
  RETURN_TO_STOCK: "Returned to stock",
  DAMAGED: "Damaged",
};

function formatBusinessDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
}

export default async function ManagementSalesPage({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}) {
  const query = await searchParams;
  const [report, dayCloses] = await Promise.all([
    apiGet<ManagementSalesReport>(
      reportRangeApiPath("/management/sales", query),
    ),
    apiGet<DayCloseListReport>(
      reportRangeApiPath("/management/day-closes", query),
    ),
  ]);
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
  const reportSections = [
    {
      title: "Summary",
      rows: [
        {
          Period: report.range.label,
          Sales: report.summary.salesCount,
          Revenue: formatMoney(report.summary.totalRevenue),
          Paid: formatMoney(report.summary.amountPaid),
          "Balance due": formatMoney(report.summary.balanceDue),
          "Products sold": formatQuantity(report.summary.quantitySold),
          "Damaged quantity": formatQuantity(report.summary.damagedQuantity),
          "Returned to stock": formatQuantity(
            report.summary.returnedToStockQuantity,
          ),
        },
      ],
    },
    {
      title: "Daily close-outs",
      rows: dayCloses.closes.map((close) => ({
        Date: formatBusinessDate(close.businessDate),
        Sales: close.salesCount,
        "Expected cash": formatMoney(close.expectedCash),
        "Counted cash": formatMoney(close.countedCash),
        Variance: formatMoney(close.cashVariance),
        Credit: formatMoney(close.creditTotal),
        Damaged: close.damagedQuantity,
        Returned: close.returnedQuantity,
        Status: close.status,
        "Business day state": close.businessDay.status,
        "Submitted by":
          close.submittedBy?.name ?? close.submittedBy?.email ?? "",
      })),
    },
    {
      title: "Payment methods",
      rows: filteredPaymentSummary.map((entry) => ({
        Method: paymentLabels[entry.method],
        Sales: entry.count,
        Amount: formatMoney(entry.amount),
      })),
    },
    {
      title: "Product sales",
      rows: filteredProductSummary.map((entry) => ({
        Product: formatProductName(entry.product),
        Quantity: formatQuantity(
          entry.quantitySold,
          entry.product.unit.abbreviation,
        ),
        Revenue: formatMoney(entry.revenue),
      })),
    },
    {
      title: "Sales",
      rows: filteredSales.map((sale) => ({
        Sale: `#${sale.saleNumber}`,
        Payment: paymentLabels[sale.paymentMethod],
        Total: formatMoney(sale.totalAmount),
        Paid: formatMoney(sale.amountPaid),
        "Balance due": formatMoney(sale.balanceDue),
        Cashier: sale.createdBy?.name ?? sale.createdBy?.email ?? "",
        Items: sale.items
          .map(
            (item) =>
              `${formatProductName(item.product)} x ${formatQuantity(
                item.quantity,
                item.product.unit.abbreviation,
              )}`,
          )
          .join("; "),
        "Sold at": formatDateTime(sale.soldAt),
      })),
    },
    {
      title: "Returns",
      rows: filteredReturns.map((entry) => ({
        Product: formatProductName(entry.product),
        Disposition: returnLabels[entry.disposition],
        Quantity: formatQuantity(
          entry.quantity,
          entry.product.unit.abbreviation,
        ),
        Reason: entry.reason ?? "",
        "Recorded by": entry.createdBy?.name ?? entry.createdBy?.email ?? "",
        "Recorded at": formatDateTime(entry.recordedAt),
      })),
    },
  ];

  return (
    <ManagementPageShell>
      <ReportRangeFilter
        range={report.range}
        actions={
          <ReportExportActions
            filename={`management-sales-${report.range.from}-to-${report.range.to}`}
            sections={reportSections}
            subtitle={`Period: ${report.range.label}`}
            title="Management sales report"
          />
        }
      />

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

      <Card
        title={`Daily close-outs (${dayCloses.closes.length})`}
        description="Drawer counts submitted by Sales for each business day. Review and approve to sign the day off."
      >
        {dayCloses.closes.length === 0 ? (
          <EmptyState>
            No days have been closed for this period yet. Sales closes a day
            from the Daily summary page.
          </EmptyState>
        ) : (
          <TableShell
            head={
              <>
                <th className="py-2 pr-4">Date</th>
                <th className="py-2 pr-4">Sales</th>
                <th className="py-2 pr-4">Expected cash</th>
                <th className="py-2 pr-4">Counted cash</th>
                <th className="py-2 pr-4">Variance</th>
                <th className="py-2 pr-4">Credit</th>
                <th className="py-2 pr-4">Damaged / returned</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Actions</th>
              </>
            }
          >
            {dayCloses.closes.map((close) => (
              <tr key={close.id}>
                <td className="py-3 pr-4 font-medium text-stone-900">
                  {formatBusinessDate(close.businessDate)}
                  <span className="block text-xs font-normal text-stone-500">
                    by{" "}
                    {close.submittedBy?.name ??
                      close.submittedBy?.email ??
                      "-"}
                  </span>
                </td>
                <td className="py-3 pr-4 text-stone-600">{close.salesCount}</td>
                <td className="py-3 pr-4 text-stone-600">
                  {formatMoney(close.expectedCash)}
                </td>
                <td className="py-3 pr-4 text-stone-600">
                  {formatMoney(close.countedCash)}
                </td>
                <td
                  className={`py-3 pr-4 font-semibold ${
                    Number(close.cashVariance) < 0
                      ? "text-red-800"
                      : "text-emerald-700"
                  }`}
                >
                  {formatMoney(close.cashVariance)}
                </td>
                <td className="py-3 pr-4 text-stone-600">
                  {formatMoney(close.creditTotal)}
                </td>
                <td className="py-3 pr-4 text-stone-600">
                  {close.damagedQuantity} / {close.returnedQuantity}
                </td>
                <td className="py-3 pr-4">
                  <span
                    className={
                      close.businessDay.status === "APPROVED"
                        ? "inline-flex rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800"
                        : close.businessDay.status === "STALE"
                          ? "inline-flex rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-800"
                          : close.businessDay.status === "OPEN"
                            ? "inline-flex rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-800"
                            : "inline-flex rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800"
                    }
                    title={
                      close.businessDay.reopenReason ??
                      close.reviewNotes ??
                      undefined
                    }
                  >
                    {close.businessDay.status === "APPROVED"
                      ? "Approved"
                      : close.businessDay.status === "STALE"
                        ? "Stale"
                        : close.businessDay.status === "OPEN"
                          ? "Reopened"
                          : "Submitted"}
                  </span>
                </td>
                <td className="py-3 pr-4">
                  {close.businessDay.status === "SUBMITTED" ? (
                    <ApproveDayCloseButton
                      close={close}
                      detail={`${formatBusinessDate(close.businessDate)} · counted ${formatMoney(close.countedCash)} vs expected ${formatMoney(close.expectedCash)}`}
                    />
                  ) : close.businessDay.status === "APPROVED" ? (
                    <AdminFormModal
                      action={reopenDayClose}
                      description={`Reopen ${formatBusinessDate(close.businessDate)} so Sales can post corrections and submit a fresh close.`}
                      submitLabel="Reopen day"
                      title="Reopen business day"
                      triggerLabel="Reopen"
                      triggerClassName="inline-flex h-8 items-center justify-center rounded-[5px] border border-[color:var(--border-strong)] bg-white px-3 text-xs font-semibold text-[var(--text-secondary)] shadow-[var(--shadow-whisper)] transition hover:border-[var(--brand-burgundy)] hover:text-[var(--brand-burgundy)]"
                    >
                      <input name="id" type="hidden" value={close.id} />
                      <TextareaField
                        label="Reason"
                        name="reason"
                        placeholder="Explain why this approved day must be reopened"
                        required
                      />
                    </AdminFormModal>
                  ) : (
                    <span className="text-xs text-stone-500">
                      Sales must resubmit
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </TableShell>
        )}
      </Card>

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
            <EmptyState>No product sales for this period.</EmptyState>
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
          <EmptyState>No sales for this period.</EmptyState>
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
          <EmptyState>No returns for this period.</EmptyState>
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
