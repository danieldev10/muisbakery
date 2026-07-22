import { AdminForm } from "@/components/admin/admin-form";
import { Field, TextareaField } from "@/components/admin/form-controls";
import {
  Card,
  EmptyState,
  TableShell,
} from "@/components/admin/layout";
import { TablePagination } from "@/components/admin/pagination";
import { TableToolbar } from "@/components/admin/table-toolbar";
import type {
  PaymentMethod,
  Sale,
  SalesOptions,
} from "@/lib/operations/types";
import { formatProductName } from "@/lib/product-label";
import {
  paginatedApiPath,
  type PaginatedResponse,
  type PageSearchParams,
} from "@/lib/paginate";
import { apiGet } from "@/lib/server-api";

import { createSale } from "./actions";

const inputClass =
  "h-10 w-28 rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-red-700 focus:ring-4 focus:ring-red-100";

const selectClass =
  "h-10 rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-red-700 focus:ring-4 focus:ring-red-100";

const paymentLabels: Record<PaymentMethod, string> = {
  CASH: "Cash",
  TRANSFER: "Transfer",
  POS: "POS",
  CREDIT: "Credit",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatMoney(value: string | number | null) {
  if (value === null) {
    return "-";
  }

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

export default async function RecordSalePage({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}) {
  const params = await searchParams;
  const [options, result] = await Promise.all([
    apiGet<SalesOptions>("/sales/options"),
    apiGet<PaginatedResponse<Sale>>(
      paginatedApiPath("/sales/sales", params, [
        "q",
        "payment",
        "product",
        "from",
        "to",
      ]),
    ),
  ]);
  const sales = result.items;
  const pagination = result.pagination;
  const stockedProducts = options.products.filter(
    (item) => Number(item.totalRemaining) > 0,
  );
  const productOptions = options.products.map((item) => ({
    label: formatProductName(item.product),
    value: item.product.id,
  }));

  return (
    <>
      <Card title="New sale">
        {stockedProducts.length === 0 ? (
          <EmptyState>No finished goods are available for sale.</EmptyState>
        ) : (
          <AdminForm action={createSale} submitLabel="Record sale">
            <div className="grid gap-4 sm:grid-cols-4">
              <div className="grid gap-1.5">
                <label
                  className="text-sm font-medium text-stone-700"
                  htmlFor="customerType"
                >
                  Customer type <span className="text-red-700">*</span>
                </label>
                <select
                  className={selectClass}
                  defaultValue="INDIVIDUAL"
                  id="customerType"
                  name="customerType"
                  required
                >
                  <option value="INDIVIDUAL">Individual</option>
                  <option value="RETAILER">Retailer</option>
                </select>
              </div>
              <div className="grid gap-1.5">
                <label
                  className="text-sm font-medium text-stone-700"
                  htmlFor="retailerId"
                >
                  Retailer account
                </label>
                <select className={selectClass} id="retailerId" name="retailerId">
                  <option value="">No retailer selected</option>
                  {options.retailers.map((retailer) => (
                    <option key={retailer.id} value={retailer.id}>
                      {retailer.name}
                      {retailer.requiresOrderApproval
                        ? ` - approval required, outstanding ${formatMoney(
                            retailer.outstandingBalance,
                          )}`
                        : ""}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-stone-500">
                  Retailers can pay now by cash, transfer, or POS. Repeat
                  credit sales need Admin approval.
                </p>
              </div>
              <div className="grid gap-1.5">
                <label
                  className="text-sm font-medium text-stone-700"
                  htmlFor="retailerApprovalId"
                >
                  Admin approval
                </label>
                <select
                  className={selectClass}
                  id="retailerApprovalId"
                  name="retailerApprovalId"
                >
                  <option value="">No approval selected</option>
                  {options.retailers.flatMap((retailer) =>
                    retailer.orderApprovals.map((approval) => (
                      <option key={approval.id} value={approval.id}>
                        {retailer.name} - {formatMoney(approval.approvedAmount)}
                      </option>
                    )),
                  )}
                </select>
                <p className="text-xs text-stone-500">
                  Required only when the retailer has uncleared credit.
                </p>
              </div>
              <div className="grid gap-1.5">
                <label
                  className="text-sm font-medium text-stone-700"
                  htmlFor="paymentMethod"
                >
                  Payment method <span className="text-red-700">*</span>
                </label>
                <select
                  className={selectClass}
                  defaultValue="CASH"
                  id="paymentMethod"
                  name="paymentMethod"
                  required
                >
                  {options.paymentMethods.map((method) => (
                    <option key={method} value={method}>
                      {paymentLabels[method]}
                    </option>
                  ))}
                </select>
              </div>
              <Field label="Customer" name="customerName" />
              <Field
                label="Sold at"
                name="soldAt"
                type="datetime-local"
              />
              <Field
                label="Discount"
                min="0"
                name="discount"
                step="0.01"
                type="number"
              />
              <Field
                label="Amount paid"
                min="0"
                name="amountPaid"
                step="0.01"
                type="number"
              />
            </div>

            <div className="overflow-x-auto rounded-md border border-stone-200">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-stone-200 text-left text-xs font-medium uppercase tracking-wide text-stone-500">
                    <th className="p-3">Product</th>
                    <th className="p-3">Available</th>
                    <th className="p-3">Quantity</th>
                    <th className="p-3">Configured prices</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {stockedProducts.map((item) => (
                    <tr key={item.product.id}>
                      <td className="p-3">
                        <p className="font-medium text-stone-900">
                          {formatProductName(item.product)}
                        </p>
                        <p className="text-xs text-stone-500">
                          {item.batches.length} batch
                          {item.batches.length === 1 ? "" : "es"}
                        </p>
                      </td>
                      <td className="p-3 text-stone-600">
                        {formatQuantity(
                          item.totalRemaining,
                          item.product.unit.abbreviation,
                        )}
                      </td>
                      <td className="p-3">
                        <input
                          className={inputClass}
                          max={String(Math.floor(Number(item.totalRemaining)))}
                          min="0"
                          name={`quantity:${item.product.id}`}
                          step="1"
                          type="number"
                        />
                      </td>
                      <td className="p-3 text-sm text-stone-600">
                        <p>Walk-in: {formatMoney(item.product.unitPrice ?? 0)}</p>
                        <p>Retailer: {formatMoney(item.product.retailerPrice ?? 0)}</p>
                        <p>Discount: {Number(item.product.discountPercent)}%</p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <TextareaField label="Notes" name="notes" placeholder="Optional" />
          </AdminForm>
        )}
      </Card>

      <Card title={`Recent sales (${pagination.total})`}>
        <TableToolbar
          basePath="/sales/record-sale"
          dateFilters={[
            { label: "Sold from", name: "from" },
            { label: "Sold to", name: "to" },
          ]}
          searchParams={params}
          searchPlaceholder="Search sale number, customer, product, or payment"
          selectFilters={[
            {
              label: "Payment",
              name: "payment",
              options: options.paymentMethods.map((method) => ({
                label: paymentLabels[method],
                value: method,
              })),
            },
            {
              label: "Product",
              name: "product",
              options: productOptions,
            },
          ]}
        />
        {pagination.total === 0 ? (
          <EmptyState>No sales have been recorded yet.</EmptyState>
        ) : (
          <TableShell
            head={
              <>
                <th className="py-2 pr-4">Sale</th>
                <th className="py-2 pr-4">Items</th>
                <th className="py-2 pr-4">Payment</th>
                <th className="py-2 pr-4">Total</th>
                <th className="py-2 pr-4">Paid</th>
                <th className="py-2 pr-4">Date</th>
              </>
            }
          >
            {sales.map((sale) => (
              <tr className="align-top" key={sale.id}>
                <td className="py-3 pr-4">
                  <p className="font-medium text-stone-900">
                    #{sale.saleNumber}
                  </p>
                  {sale.customerType === "RETAILER" && sale.retailer ? (
                    <p className="text-xs text-stone-500">
                      {sale.retailer.name}
                    </p>
                  ) : sale.customerName ? (
                    <p className="text-xs text-stone-500">
                      {sale.customerName}
                    </p>
                  ) : null}
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
                  <p>{formatMoney(sale.amountPaid)}</p>
                  {Number(sale.balanceDue) > 0 ? (
                    <p className="text-xs text-red-700">
                      Due {formatMoney(sale.balanceDue)}
                    </p>
                  ) : null}
                </td>
                <td className="py-3 pr-4 text-stone-600">
                  {formatDate(sale.soldAt)}
                </td>
              </tr>
            ))}
          </TableShell>
        )}
        <TablePagination
          basePath="/sales/record-sale"
          searchParams={params}
          {...pagination}
        />
      </Card>
    </>
  );
}
