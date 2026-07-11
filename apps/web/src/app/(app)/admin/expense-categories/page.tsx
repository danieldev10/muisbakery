import { AdminFormModal } from "@/components/admin/form-modal";
import { Field, SelectField } from "@/components/admin/form-controls";
import {
  Card,
  EmptyState,
  StatusBadge,
  TableShell,
} from "@/components/admin/layout";
import { TablePagination } from "@/components/admin/pagination";
import { TableToolbar } from "@/components/admin/table-toolbar";
import type { ExpenseCategory } from "@/lib/admin/types";
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
  createExpenseCategory,
  updateExpenseCategory,
} from "./actions";

const secondaryButtonClass =
  "inline-flex h-8 items-center justify-center rounded-[5px] border border-[color:var(--border-strong)] bg-white px-3 text-xs font-semibold text-[var(--text-secondary)] shadow-[var(--shadow-whisper)] transition hover:border-[var(--brand-burgundy)] hover:text-[var(--brand-burgundy)]";

const statusOptions = [
  { value: "true", label: "Active" },
  { value: "false", label: "Inactive" },
];

export default async function ExpenseCategoriesPage({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}) {
  const params = await searchParams;
  const categories = await apiGet<ExpenseCategory[]>("/admin/expense-categories");
  const query = firstParam(params, "q");
  const statusFilter = firstParam(params, "status");
  const filteredCategories = categories.filter(
    (category) =>
      matchesSearch(query, [category.name, category.description]) &&
      matchesSelect(statusFilter, category.isActive),
  );
  const { pageItems, ...pagination } = paginate(
    filteredCategories,
    pageNumber(params.page),
  );

  return (
    <Card>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold leading-tight text-[var(--text-primary)]">
            Expense categories ({filteredCategories.length} of{" "}
            {categories.length})
          </h2>
          <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">
            Categories used to classify expenses in management reporting.
          </p>
        </div>
        <AdminFormModal
          action={createExpenseCategory}
          description="Create a category for classifying management expenses."
          submitLabel="Add category"
          title="Add category"
          triggerLabel="Add category"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Name"
              name="name"
              placeholder="e.g. Utilities"
              required
            />
            <Field label="Description" name="description" />
          </div>
        </AdminFormModal>
      </div>

      {categories.length > 0 ? (
        <TableToolbar
          basePath="/admin/expense-categories"
          searchParams={params}
          searchPlaceholder="Search category or description"
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

      {categories.length === 0 ? (
        <EmptyState>No expense categories yet.</EmptyState>
      ) : filteredCategories.length === 0 ? (
        <EmptyState>No expense categories match the current filters.</EmptyState>
      ) : (
        <TableShell
          head={
            <>
              <th className="py-2 pr-4">Name</th>
              <th className="py-2 pr-4">Description</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Actions</th>
            </>
          }
        >
          {pageItems.map((category) => (
            <tr key={category.id}>
              <td className="py-3 pr-4 font-medium text-stone-900">
                {category.name}
              </td>
              <td className="py-3 pr-4 text-stone-600">
                {category.description || "-"}
              </td>
              <td className="py-3 pr-4">
                <StatusBadge active={category.isActive} />
              </td>
              <td className="py-3 pr-4">
                <AdminFormModal
                  action={updateExpenseCategory}
                  description={category.name}
                  submitLabel="Save changes"
                  title="Edit expense category"
                  triggerClassName={secondaryButtonClass}
                  triggerIcon={null}
                  triggerLabel="Edit"
                >
                  <input name="id" type="hidden" value={category.id} />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      defaultValue={category.name}
                      label="Name"
                      name="name"
                      required
                    />
                    <Field
                      defaultValue={category.description ?? ""}
                      label="Description"
                      name="description"
                    />
                  </div>
                  <SelectField
                    defaultValue={category.isActive ? "true" : "false"}
                    hint="Inactive categories disappear from new expense entries but keep history."
                    label="Status"
                    name="isActive"
                    options={statusOptions}
                    required
                  />
                </AdminFormModal>
              </td>
            </tr>
          ))}
        </TableShell>
      )}

      <TablePagination
        basePath="/admin/expense-categories"
        searchParams={params}
        {...pagination}
      />
    </Card>
  );
}
