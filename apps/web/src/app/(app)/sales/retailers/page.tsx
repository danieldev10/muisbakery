import { AdminFormModal } from "@/components/admin/form-modal";
import {
  Field,
  SelectField,
  TextareaField,
} from "@/components/admin/form-controls";
import {
  Card,
  EmptyState,
  StatusBadge,
  TableShell,
} from "@/components/admin/layout";
import { TablePagination } from "@/components/admin/pagination";
import { TableToolbar } from "@/components/admin/table-toolbar";
import type {
  PaymentMethod,
  Retailer,
  RetailerPayment,
} from "@/lib/operations/types";
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

import { recordRetailerPayment } from "./actions";

const paymentLabels: Record<PaymentMethod, string> = {
  CASH: "Cash",
  TRANSFER: "Transfer",
  POS: "POS",
  CREDIT: "Credit",
};

const retailerPaymentOptions = [
  { value: "CASH", label: paymentLabels.CASH },
  { value: "TRANSFER", label: paymentLabels.TRANSFER },
  { value: "POS", label: paymentLabels.POS },
];

const paymentButtonClass =
  "inline-flex h-7 items-center justify-center rounded-[5px] border border-[var(--brand-burgundy)] bg-[var(--brand-burgundy)] px-2.5 text-xs font-semibold leading-none text-white shadow-[var(--shadow-whisper)] transition hover:bg-[var(--brand-burgundy-dark)]";

function formatMoney(value: string | number) {
  return `₦${Number(value).toLocaleString("en", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function SalesRetailersPage({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}) {
  const params = await searchParams;
  const [retailers, payments] = await Promise.all([
    apiGet<Retailer[]>("/sales/retailers"),
    apiGet<RetailerPayment[]>("/sales/retailer-payments"),
  ]);
  const query = firstParam(params, "q");
  const status = firstParam(params, "status");
  const paymentQuery = firstParam(params, "paymentQ");
  const paymentMethod = firstParam(params, "paymentMethod");
  const filteredRetailers = retailers.filter(
    (retailer) =>
      matchesSearch(query, [
        retailer.name,
        retailer.contactPerson,
        retailer.phone,
        retailer.email,
        retailer.address,
        retailer.outstandingBalance,
        retailer.notes,
      ]) && matchesSelect(status, retailer.isActive),
  );
  const { pageItems, ...pagination } = paginate(
    filteredRetailers,
    pageNumber(params.page),
  );
  const filteredPayments = payments.filter(
    (payment) =>
      matchesSearch(paymentQuery, [
        payment.retailer.name,
        payment.amount,
        payment.paymentMethod,
        paymentLabels[payment.paymentMethod],
        payment.reference,
        payment.notes,
        ...payment.allocations.map(
          (allocation) => `#${allocation.sale.saleNumber}`,
        ),
      ]) && matchesSelect(paymentMethod, payment.paymentMethod),
  );

  return (
    <>
    <Card>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold leading-tight text-[var(--text-primary)]">
            Retailers ({filteredRetailers.length} of {retailers.length})
          </h2>
          <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">
            Retail customer accounts and credit balances for payment follow-up.
          </p>
        </div>
      </div>

      {retailers.length > 0 ? (
        <TableToolbar
          basePath="/sales/retailers"
          pageParams={["page"]}
          searchParam="q"
          searchParams={params}
          searchPlaceholder="Search retailer, contact, phone, email, or balance"
          selectFilters={[
            {
              label: "Status",
              name: "status",
              options: [
                { label: "Active", value: "true" },
                { label: "Inactive", value: "false" },
              ],
            },
          ]}
        />
      ) : null}

      {retailers.length === 0 ? (
        <EmptyState>No retailer accounts have been created yet.</EmptyState>
      ) : filteredRetailers.length === 0 ? (
        <EmptyState>No retailers match the current filters.</EmptyState>
      ) : (
        <TableShell
          head={
            <>
              <th className="py-2 pr-4">Retailer</th>
              <th className="py-2 pr-4">Contact</th>
              <th className="py-2 pr-4">Outstanding</th>
              <th className="py-2 pr-4">Order status</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Actions</th>
            </>
          }
        >
          {pageItems.map((retailer) => (
            <tr className="align-top" key={retailer.id}>
              <td className="py-3 pr-4">
                <p className="font-medium text-stone-900">{retailer.name}</p>
                {retailer.address ? (
                  <p className="text-xs text-stone-500">{retailer.address}</p>
                ) : null}
              </td>
              <td className="py-3 pr-4 text-stone-600">
                <p>{retailer.contactPerson ?? "-"}</p>
                <p className="text-xs">{retailer.phone ?? retailer.email ?? ""}</p>
              </td>
              <td className="py-3 pr-4 text-red-800">
                {formatMoney(retailer.outstandingBalance)}
              </td>
              <td className="py-3 pr-4 text-stone-600">
                {retailer.requiresOrderApproval ? (
                  retailer.orderApprovals.length > 0 ? (
                    <span className="font-semibold text-emerald-700">
                      Admin approval available
                    </span>
                  ) : (
                    <span className="font-semibold text-red-800">
                      Admin approval required
                    </span>
                  )
                ) : (
                  <span className="font-semibold text-emerald-700">
                    Clear
                  </span>
                )}
              </td>
              <td className="py-3 pr-4">
                <StatusBadge active={retailer.isActive} />
              </td>
              <td className="py-3 pr-4">
                <div className="flex flex-wrap items-start gap-2">
                  {Number(retailer.outstandingBalance) > 0 ? (
                    <AdminFormModal
                      action={recordRetailerPayment}
                      description={`Outstanding balance: ${formatMoney(
                        retailer.outstandingBalance,
                      )}`}
                      eyebrow="Sales"
                      submitLabel="Record payment"
                      title={`Record payment - ${retailer.name}`}
                      triggerClassName={paymentButtonClass}
                      triggerIcon={null}
                      triggerLabel="Payment"
                    >
                      <input name="retailerId" type="hidden" value={retailer.id} />
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field
                          label="Amount"
                          max={retailer.outstandingBalance}
                          min="0.01"
                          name="amount"
                          required
                          step="0.01"
                          type="number"
                        />
                        <SelectField
                          defaultValue="TRANSFER"
                          label="Payment method"
                          name="paymentMethod"
                          options={retailerPaymentOptions}
                          required
                        />
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field
                          label="Paid at"
                          name="paidAt"
                          type="datetime-local"
                        />
                        <Field label="Reference" name="reference" />
                      </div>
                      <TextareaField label="Notes" name="notes" />
                    </AdminFormModal>
                  ) : (
                    <span className="text-sm text-[var(--text-muted)]">-</span>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </TableShell>
      )}

      <TablePagination
        basePath="/sales/retailers"
        searchParams={params}
        {...pagination}
      />
    </Card>
    <Card
      description="Recent retailer repayments and the credit sales they settled."
      title={`Recent payments (${filteredPayments.length} of ${payments.length})`}
    >
      {payments.length > 0 ? (
        <TableToolbar
          basePath="/sales/retailers"
          pageParams={[]}
          searchParam="paymentQ"
          searchParams={params}
          searchPlaceholder="Search retailer, reference, sale number, or amount"
          selectFilters={[
            {
              label: "Method",
              name: "paymentMethod",
              options: retailerPaymentOptions,
            },
          ]}
        />
      ) : null}
      {payments.length === 0 ? (
        <EmptyState>No retailer payments have been recorded yet.</EmptyState>
      ) : filteredPayments.length === 0 ? (
        <EmptyState>No retailer payments match the current filters.</EmptyState>
      ) : (
        <TableShell
          head={
            <>
              <th className="py-2 pr-4">Retailer</th>
              <th className="py-2 pr-4">Amount</th>
              <th className="py-2 pr-4">Method</th>
              <th className="py-2 pr-4">Settled sales</th>
              <th className="py-2 pr-4">Reference</th>
              <th className="py-2 pr-4">Paid at</th>
            </>
          }
        >
          {filteredPayments.map((payment) => (
            <tr className="align-top" key={payment.id}>
              <td className="py-3 pr-4 font-medium text-stone-900">
                {payment.retailer.name}
              </td>
              <td className="py-3 pr-4 font-semibold text-emerald-700">
                {formatMoney(payment.amount)}
              </td>
              <td className="py-3 pr-4 text-stone-600">
                {paymentLabels[payment.paymentMethod]}
              </td>
              <td className="py-3 pr-4 text-stone-600">
                {payment.allocations.length > 0
                  ? payment.allocations
                      .map((allocation) => `#${allocation.sale.saleNumber}`)
                      .join(", ")
                  : "-"}
              </td>
              <td className="py-3 pr-4 text-stone-600">
                {payment.reference ?? "-"}
              </td>
              <td className="py-3 pr-4 text-stone-600">
                {formatDateTime(payment.paidAt)}
              </td>
            </tr>
          ))}
        </TableShell>
      )}
    </Card>
    </>
  );
}
