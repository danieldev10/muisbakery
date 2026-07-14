import { Field, TextareaField } from "@/components/admin/form-controls";
import { AdminFormModal } from "@/components/admin/form-modal";
import {
  Card,
  EmptyState,
  TableShell,
} from "@/components/admin/layout";
import { TablePagination } from "@/components/admin/pagination";
import { TableToolbar } from "@/components/admin/table-toolbar";
import { ReportExportActions } from "@/components/reports/report-export-actions";
import type {
  CustomerType,
  DayClosePreview,
  PaymentMethod,
  SalesSummary,
} from "@/lib/operations/types";
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

import { prepareDayClose, submitDayClose } from "./actions";
import { SaleItemsSummary } from "./sale-items-summary";

const paymentLabels: Record<PaymentMethod, string> = {
  CASH: "Cash",
  TRANSFER: "Transfer",
  POS: "POS",
  CREDIT: "Credit",
};

const customerTypeLabels: Record<CustomerType, string> = {
  INDIVIDUAL: "Individual",
  RETAILER: "Retailer",
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
  const dayClose = await apiGet<DayClosePreview>(
    `/sales/day-close?date=${encodeURIComponent(date)}`,
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
  const customerTypeFilter = firstParam(query, "customerType");
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
        sale.customerType,
        customerTypeLabels[sale.customerType],
        sale.retailer?.name,
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
      matchesSelect(customerTypeFilter, sale.customerType) &&
      (!productFilter ||
        sale.items.some((item) => item.product.id === productFilter)),
  );
  const { pageItems, ...pagination } = paginate(
    filteredSales,
    pageNumber(query.page),
  );
  const reportSections = [
    {
      title: "Summary",
      rows: [
        {
          Date: formatDate(summary.date),
          Sales: summary.salesCount,
          Revenue: formatMoney(summary.totalRevenue),
          Paid: formatMoney(summary.amountPaid),
          "Balance due": formatMoney(summary.balanceDue),
          Damaged: summary.damagedQuantity,
          Returned: summary.returnedToStockQuantity,
        },
      ],
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
        Customer:
          sale.customerType === "RETAILER"
            ? sale.retailer?.name ?? sale.customerName ?? "Retailer"
            : "Individual",
        Payment: paymentLabels[sale.paymentMethod],
        Total: formatMoney(sale.totalAmount),
        Paid: formatMoney(sale.amountPaid),
        "Balance due": formatMoney(sale.balanceDue),
        Items: sale.items
          .map(
            (item) =>
              `${formatProductName(item.product)} x ${formatQuantity(
                item.quantity,
                item.product.unit.abbreviation,
              )}`,
          )
          .join("; "),
        Time: formatDateTime(sale.soldAt),
      })),
    },
    {
      title: "Returns",
      rows: summary.returns.map((entry) => ({
        Product: formatProductName(entry.product),
        Disposition:
          entry.disposition === "DAMAGED" ? "Damaged" : "Returned to stock",
        Quantity: formatQuantity(
          entry.quantity,
          entry.product.unit.abbreviation,
        ),
        Reason: entry.reason ?? "",
        "Recorded at": formatDateTime(entry.recordedAt),
      })),
    },
  ];
  const canPrepareClose =
    dayClose.businessDay.status === "OPEN" ||
    dayClose.businessDay.status === "STALE";
  const canSubmitClose =
    dayClose.businessDay.status === "CLOSING" &&
    dayClose.businessDay.terminalReadiness.pending === 0 &&
    dayClose.unresolvedOfflineSyncs === 0;
  const closeActionLabel = dayClose.close ? "Re-close this day" : "Close this day";

  return (
    <>
      <Card>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
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
          <ReportExportActions
            filename={`sales-daily-summary-${summary.date}`}
            sections={reportSections}
            subtitle={`Date: ${formatDate(summary.date)}`}
            title="Sales daily summary"
          />
        </div>
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

      <Card>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold leading-tight text-[var(--text-primary)]">
              Close of day — {formatDate(summary.date)}
            </h2>
            <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">
              Count the drawer against the system&apos;s expected takings, then
              submit for Management sign-off.
            </p>
          </div>
          {canPrepareClose ? (
            <AdminFormModal
              action={prepareDayClose}
              description={`Freeze ${formatDate(summary.date)} at a cutoff, then require every offline POS terminal to synchronize and confirm an empty queue.`}
              submitLabel="Start close"
              title="Start day close"
              triggerLabel="Start day close"
            >
              <input name="date" type="hidden" value={dayClose.date} />
              <p className="text-sm leading-6 text-stone-600">
                Checkout for this business date will pause until the close is
                submitted or Management reopens the day.
              </p>
            </AdminFormModal>
          ) : canSubmitClose ? (
            <AdminFormModal
              action={submitDayClose}
              description={`Record the counted drawer cash for ${formatDate(summary.date)}. Expected cash is ${formatMoney(dayClose.expected.expectedCash)}.`}
              submitLabel="Submit close"
              title={closeActionLabel}
              triggerLabel={closeActionLabel}
            >
              <input name="date" type="hidden" value={dayClose.date} />
              <Field
                label="Counted cash"
                min="0"
                name="countedCash"
                placeholder="0.00"
                required
                step="0.01"
                type="number"
                defaultValue={dayClose.close?.countedCash ?? ""}
              />
              <TextareaField
                defaultValue={dayClose.close?.notes ?? ""}
                label="Notes"
                name="notes"
                placeholder="Optional, e.g. reason for a cash difference"
              />
            </AdminFormModal>
          ) : dayClose.close ? (
            <span
              className={
                dayClose.businessDay.status === "APPROVED"
                  ? "inline-flex rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800"
                  : "inline-flex rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800"
              }
            >
              {dayClose.businessDay.status === "APPROVED"
                ? "Approved by Management"
                : dayClose.businessDay.status === "CLOSING"
                  ? "Waiting for POS terminals"
                : "Awaiting Management review"}
            </span>
          ) : (
            <span className="text-sm text-stone-500">No close submitted</span>
          )}
        </div>

        {dayClose.unresolvedOfflineSyncs > 0 ? (
          <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {dayClose.unresolvedOfflineSyncs} offline sale(s) have not synced
            cleanly. The day cannot be closed until they are resolved in
            Admin&apos;s POS sync review.
          </p>
        ) : null}

        {dayClose.businessDay.status === "CLOSING" ? (
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">
            <p className="font-semibold">
              POS readiness: {dayClose.businessDay.terminalReadiness.ready} of{" "}
              {dayClose.businessDay.terminalReadiness.required} terminal(s)
              ready
            </p>
            {dayClose.businessDay.terminalReadiness.pending > 0 ? (
              <p className="mt-1">
                Ask each pending terminal to connect and use Sync now. Sales
                submission remains blocked until its queue is empty or
                Management records an override.
              </p>
            ) : (
              <p className="mt-1">
                All required terminals have confirmed an empty queue. Submit
                the counted cash to Management.
              </p>
            )}
          </div>
        ) : null}

        {dayClose.close && dayClose.businessDay.status === "STALE" ? (
          <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Financial activity changed after this close was submitted. Recount
            the drawer and submit a fresh close for Management review.
          </p>
        ) : null}

        {dayClose.close && dayClose.businessDay.status === "OPEN" ? (
          <p className="mb-4 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
            Management reopened this business day
            {dayClose.close.businessDay.reopenReason
              ? `: ${dayClose.close.businessDay.reopenReason}`
              : "."} Recount and submit it again when corrections are complete.
          </p>
        ) : null}

        {dayClose.close &&
        dayClose.needsReclose &&
        dayClose.businessDay.status !== "OPEN" &&
        dayClose.businessDay.status !== "STALE" ? (
          <p
            className={`mb-4 rounded-md border px-3 py-2 text-sm ${
              dayClose.close.status === "APPROVED"
                ? "border-red-200 bg-red-50 text-red-800"
                : "border-amber-200 bg-amber-50 text-amber-900"
            }`}
          >
            New activity has changed the expected totals since this day was
            closed.
            {dayClose.close.status === "APPROVED"
              ? " Management has already approved this close, so review is required before changing it."
              : " Re-close the day before Management signs it off."}
          </p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
              Expected cash
            </p>
            <p className="mt-1 text-lg font-semibold text-stone-950">
              {formatMoney(dayClose.expected.expectedCash)}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
              Expected transfers
            </p>
            <p className="mt-1 text-lg font-semibold text-stone-950">
              {formatMoney(dayClose.expected.expectedTransfer)}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
              Expected POS
            </p>
            <p className="mt-1 text-lg font-semibold text-stone-950">
              {formatMoney(dayClose.expected.expectedPos)}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
              Credit extended
            </p>
            <p className="mt-1 text-lg font-semibold text-stone-950">
              {formatMoney(dayClose.expected.creditTotal)}
            </p>
          </div>
        </div>

        {dayClose.close ? (
          <div className="mt-4 rounded-lg border border-[color:var(--border-muted)] bg-[var(--surface-warm)] p-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  Counted cash
                </p>
                <p className="mt-1 text-lg font-semibold text-stone-950">
                  {formatMoney(dayClose.close.countedCash)}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  Cash variance
                </p>
                <p
                  className={`mt-1 text-lg font-semibold ${
                    Number(dayClose.close.cashVariance) < 0
                      ? "text-red-800"
                      : "text-emerald-700"
                  }`}
                >
                  {formatMoney(dayClose.close.cashVariance)}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  Submitted by
                </p>
                <p className="mt-1 text-sm text-stone-700">
                  {dayClose.close.submittedBy?.name ??
                    dayClose.close.submittedBy?.email ??
                    "-"}{" "}
                  · {formatDateTime(dayClose.close.submittedAt)}
                </p>
              </div>
            </div>
            {dayClose.close.notes ? (
              <p className="mt-3 text-sm text-stone-600">
                Notes: {dayClose.close.notes}
              </p>
            ) : null}
            {dayClose.close.status === "APPROVED" ? (
              <p className="mt-3 text-sm text-emerald-800">
                Approved by{" "}
                {dayClose.close.reviewedBy?.name ??
                  dayClose.close.reviewedBy?.email ??
                  "Management"}
                {dayClose.close.reviewedAt
                  ? ` on ${formatDateTime(dayClose.close.reviewedAt)}`
                  : ""}
                {dayClose.close.reviewNotes
                  ? ` — ${dayClose.close.reviewNotes}`
                  : ""}
              </p>
            ) : null}
          </div>
        ) : null}
      </Card>

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
                label: "Customer",
                name: "customerType",
                options: Object.entries(customerTypeLabels).map(
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
                  <p>#{sale.saleNumber}</p>
                  <p className="mt-1 text-xs font-normal text-stone-500">
                    {sale.customerType === "RETAILER"
                      ? sale.retailer?.name ?? sale.customerName ?? "Retailer"
                      : "Individual"}
                  </p>
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
