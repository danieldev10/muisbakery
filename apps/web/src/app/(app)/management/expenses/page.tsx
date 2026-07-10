import {
  Field,
  SelectField,
  TextareaField,
} from "@/components/admin/form-controls";
import { AdminFormModal } from "@/components/admin/form-modal";
import { Card, EmptyState, TableShell } from "@/components/admin/layout";
import { TablePagination } from "@/components/admin/pagination";
import { TableToolbar } from "@/components/admin/table-toolbar";
import type { ManagementExpensesReport } from "@/lib/management/types";
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

import {
  formatDate,
  formatMoney,
  getMonthParam,
  ManagementPageShell,
  MetricCard,
  MonthFilter,
  paymentLabels,
} from "../_components";
import { createExpense } from "./actions";
import { VoidExpenseButton } from "./void-expense-modal";

function todayValue() {
  return new Date().toISOString().slice(0, 10);
}

export default async function ManagementExpensesPage({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}) {
  const query = await searchParams;
  const month = getMonthParam(query);
  const report = await apiGet<ManagementExpensesReport>(
    `/management/expenses?month=${encodeURIComponent(month)}`,
  );

  const search = firstParam(query, "q");
  const categoryFilter = firstParam(query, "category");
  const paymentFilter = firstParam(query, "payment");
  const filteredExpenses = report.expenses.filter(
    (expense) =>
      matchesSearch(search, [
        expense.category.name,
        expense.vendor,
        expense.amount,
        expense.notes,
        expense.paymentMethod,
        paymentLabels[expense.paymentMethod],
        expense.createdBy?.name,
        expense.createdBy?.email,
      ]) &&
      matchesSelect(categoryFilter, expense.category.id) &&
      matchesSelect(paymentFilter, expense.paymentMethod),
  );
  const { pageItems: expenseItems, ...expensesPagination } = paginate(
    filteredExpenses,
    pageNumber(query.page),
  );

  const topCategory = report.summary.byCategory[0];
  const categoryOptions = report.categories.map((category) => ({
    label: category.name,
    value: category.id,
  }));

  return (
    <ManagementPageShell>
      <MonthFilter month={report.month.value} />

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          label="Total operating expenses"
          tone={Number(report.summary.totalAmount) > 0 ? "warning" : "default"}
          value={formatMoney(report.summary.totalAmount)}
          detail={`${report.summary.count} expenses this month`}
        />
        <MetricCard
          label="Largest category"
          value={topCategory ? topCategory.category.name : "-"}
          detail={
            topCategory
              ? `${formatMoney(topCategory.amount)} across ${topCategory.count} expenses`
              : "No expenses recorded yet"
          }
        />
        <MetricCard
          label="Voided this month"
          value={report.summary.voidedCount}
          detail="Kept on record, excluded from totals"
        />
      </div>

      {report.summary.byCategory.length > 0 ? (
        <Card title="By category">
          <TableShell
            head={
              <>
                <th className="py-2 pr-4">Category</th>
                <th className="py-2 pr-4">Expenses</th>
                <th className="py-2 pr-4">Amount</th>
              </>
            }
          >
            {report.summary.byCategory.map((entry) => (
              <tr key={entry.category.id}>
                <td className="py-3 pr-4 font-medium text-stone-900">
                  {entry.category.name}
                </td>
                <td className="py-3 pr-4 text-stone-600">{entry.count}</td>
                <td className="py-3 pr-4 text-stone-600">
                  {formatMoney(entry.amount)}
                </td>
              </tr>
            ))}
          </TableShell>
        </Card>
      ) : null}

      <Card>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-base font-semibold leading-tight text-[var(--text-primary)]">
            Expenses ({filteredExpenses.length} of {report.expenses.length})
          </h2>
          {report.categories.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">
              Ask an admin to create expense categories before recording
              expenses.
            </p>
          ) : (
            <AdminFormModal
              action={createExpense}
              description="Record an operating expense for the business books."
              submitLabel="Record expense"
              title="Record expense"
              triggerLabel="Record expense"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField
                  label="Category"
                  name="categoryId"
                  options={categoryOptions}
                  placeholder="Select category"
                  required
                />
                <Field
                  label="Amount"
                  min="0.01"
                  name="amount"
                  placeholder="0.00"
                  required
                  step="0.01"
                  type="number"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field
                  defaultValue={todayValue()}
                  label="Incurred on"
                  name="incurredAt"
                  required
                  type="date"
                />
                <SelectField
                  defaultValue="CASH"
                  label="Payment method"
                  name="paymentMethod"
                  options={Object.entries(paymentLabels).map(
                    ([value, label]) => ({ label, value }),
                  )}
                  required
                />
                <Field
                  label="Vendor / payee"
                  name="vendor"
                  placeholder="Who was paid?"
                  type="text"
                />
              </div>
              <TextareaField
                label="Notes"
                name="notes"
                placeholder="Optional details, e.g. what the payment covered"
              />
            </AdminFormModal>
          )}
        </div>

        {report.expenses.length > 0 ? (
          <TableToolbar
            basePath="/management/expenses"
            pageParams={["page"]}
            searchParam="q"
            searchParams={query}
            searchPlaceholder="Search category, vendor, amount, or notes"
            selectFilters={[
              {
                label: "Category",
                name: "category",
                options: categoryOptions,
              },
              {
                label: "Payment",
                name: "payment",
                options: Object.entries(paymentLabels).map(
                  ([value, label]) => ({ label, value }),
                ),
              },
            ]}
          />
        ) : null}

        {report.expenses.length === 0 ? (
          <EmptyState>
            No expenses recorded for this month yet. Record rent, salaries,
            utilities, and other overheads so profit/loss reflects the real
            books.
          </EmptyState>
        ) : filteredExpenses.length === 0 ? (
          <EmptyState>No expenses match the current filters.</EmptyState>
        ) : (
          <TableShell
            head={
              <>
                <th className="py-2 pr-4">Date</th>
                <th className="py-2 pr-4">Category</th>
                <th className="py-2 pr-4">Amount</th>
                <th className="py-2 pr-4">Vendor</th>
                <th className="py-2 pr-4">Payment</th>
                <th className="py-2 pr-4">Recorded by</th>
                <th className="py-2 pr-4">Notes</th>
                <th className="py-2 pr-4">Actions</th>
              </>
            }
          >
            {expenseItems.map((expense) => {
              const voided = Boolean(expense.voidedAt);

              return (
                <tr
                  className={voided ? "text-stone-400" : undefined}
                  key={expense.id}
                >
                  <td className="py-3 pr-4 text-stone-600">
                    {formatDate(expense.incurredAt)}
                  </td>
                  <td
                    className={`py-3 pr-4 font-medium ${voided ? "text-stone-400 line-through" : "text-stone-900"}`}
                  >
                    {expense.category.name}
                  </td>
                  <td
                    className={`py-3 pr-4 ${voided ? "line-through" : "text-stone-600"}`}
                  >
                    {formatMoney(expense.amount)}
                  </td>
                  <td className="py-3 pr-4 text-stone-600">
                    {expense.vendor ?? "-"}
                  </td>
                  <td className="py-3 pr-4 text-stone-600">
                    {paymentLabels[expense.paymentMethod]}
                  </td>
                  <td className="py-3 pr-4 text-stone-600">
                    {expense.createdBy?.name ?? expense.createdBy?.email ?? "-"}
                  </td>
                  <td className="max-w-56 py-3 pr-4 text-stone-600">
                    {voided ? (
                      <span
                        className="inline-flex rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-medium text-stone-500"
                        title={expense.voidReason ?? undefined}
                      >
                        Voided{expense.voidReason ? `: ${expense.voidReason}` : ""}
                      </span>
                    ) : (
                      (expense.notes ?? "-")
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    {voided ? (
                      <span className="text-sm text-[var(--text-muted)]">-</span>
                    ) : (
                      <VoidExpenseButton
                        detail={`${expense.category.name} · ${formatMoney(expense.amount)} on ${formatDate(expense.incurredAt)}`}
                        expense={expense}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </TableShell>
        )}
        <TablePagination
          basePath="/management/expenses"
          pageParam="page"
          searchParams={query}
          {...expensesPagination}
        />
      </Card>
    </ManagementPageShell>
  );
}
