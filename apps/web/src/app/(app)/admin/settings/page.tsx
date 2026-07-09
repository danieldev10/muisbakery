import { AdminFormModal } from "@/components/admin/form-modal";
import { Field } from "@/components/admin/form-controls";
import { InlineActionForm } from "@/components/admin/inline-action-form";
import {
  Card,
  EmptyState,
  StatusBadge,
  TableShell,
} from "@/components/admin/layout";
import { TableToolbar } from "@/components/admin/table-toolbar";
import type { AppSettings, ExpenseCategory, Unit } from "@/lib/admin/types";
import type { PageSearchParams } from "@/lib/paginate";
import { apiGet } from "@/lib/server-api";
import {
  firstParam,
  matchesSearch,
  matchesSelect,
} from "@/lib/table-filters";

import {
  createExpenseCategory,
  createUnit,
  setExpenseCategoryActive,
  setUnitActive,
} from "./actions";
import { SettingsForm } from "./settings-form";

const DEFAULT_SETTINGS: AppSettings = {
  requireMaterialRequestApproval: true,
  requireStockAdjustmentApproval: true,
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}) {
  const params = await searchParams;
  const [units, categories, settings] = await Promise.all([
    apiGet<Unit[]>("/admin/units"),
    apiGet<ExpenseCategory[]>("/admin/expense-categories"),
    apiGet<AppSettings>("/admin/settings"),
  ]);
  const unitQuery = firstParam(params, "unitQ");
  const unitStatus = firstParam(params, "unitStatus");
  const categoryQuery = firstParam(params, "categoryQ");
  const categoryStatus = firstParam(params, "categoryStatus");
  const filteredUnits = units.filter(
    (unit) =>
      matchesSearch(unitQuery, [unit.name, unit.abbreviation]) &&
      matchesSelect(unitStatus, unit.isActive),
  );
  const filteredCategories = categories.filter(
    (category) =>
      matchesSearch(categoryQuery, [category.name, category.description]) &&
      matchesSelect(categoryStatus, category.isActive),
  );

  return (
    <>
      <Card
        title="Approval settings"
        description="Control which workflows need approval in later modules."
      >
        <SettingsForm settings={settings ?? DEFAULT_SETTINGS} />
      </Card>

      <Card>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold leading-tight text-[var(--text-primary)]">
              Units ({filteredUnits.length} of {units.length})
            </h2>
            <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">
              Units of measure used by raw materials, products, and recipes.
            </p>
          </div>
          <AdminFormModal
            action={createUnit}
            description="Create a measurement unit for materials, products, and recipes."
            submitLabel="Add unit"
            title="Add unit"
            triggerLabel="Add unit"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Name"
                name="name"
                placeholder="e.g. Kilogram"
                required
              />
              <Field
                label="Abbreviation"
                name="abbreviation"
                placeholder="e.g. kg"
                required
              />
            </div>
          </AdminFormModal>
        </div>

        <div>
          {units.length > 0 ? (
            <TableToolbar
              basePath="/admin/settings"
              searchParam="unitQ"
              searchParams={params}
              searchPlaceholder="Search unit or abbreviation"
              selectFilters={[
                {
                  label: "Status",
                  name: "unitStatus",
                  options: [
                    { label: "Active", value: "true" },
                    { label: "Inactive", value: "false" },
                  ],
                },
              ]}
            />
          ) : null}
          {units.length === 0 ? (
            <EmptyState>No units yet.</EmptyState>
          ) : filteredUnits.length === 0 ? (
            <EmptyState>No units match the current filters.</EmptyState>
          ) : (
            <TableShell
              head={
                <>
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Abbreviation</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Actions</th>
                </>
              }
            >
              {filteredUnits.map((unit) => (
                <tr key={unit.id}>
                  <td className="py-3 pr-4 font-medium text-stone-900">
                    {unit.name}
                  </td>
                  <td className="py-3 pr-4 text-stone-600">
                    {unit.abbreviation}
                  </td>
                  <td className="py-3 pr-4">
                    <StatusBadge active={unit.isActive} />
                  </td>
                  <td className="py-3 pr-4">
                    <InlineActionForm
                      action={setUnitActive}
                      submitLabel={unit.isActive ? "Deactivate" : "Activate"}
                    >
                      <input name="id" type="hidden" value={unit.id} />
                      <input
                        name="isActive"
                        type="hidden"
                        value={unit.isActive ? "false" : "true"}
                      />
                    </InlineActionForm>
                  </td>
                </tr>
              ))}
            </TableShell>
          )}
        </div>
      </Card>

      <Card>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold leading-tight text-[var(--text-primary)]">
              Expense categories ({filteredCategories.length} of{" "}
              {categories.length})
            </h2>
            <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">
              Used to classify expenses in management reporting.
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

        <div>
          {categories.length > 0 ? (
            <TableToolbar
              basePath="/admin/settings"
              searchParam="categoryQ"
              searchParams={params}
              searchPlaceholder="Search category or description"
              selectFilters={[
                {
                  label: "Status",
                  name: "categoryStatus",
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
            <EmptyState>
              No expense categories match the current filters.
            </EmptyState>
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
              {filteredCategories.map((category) => (
                <tr key={category.id}>
                  <td className="py-3 pr-4 font-medium text-stone-900">
                    {category.name}
                  </td>
                  <td className="py-3 pr-4 text-stone-600">
                    {category.description || "—"}
                  </td>
                  <td className="py-3 pr-4">
                    <StatusBadge active={category.isActive} />
                  </td>
                  <td className="py-3 pr-4">
                    <InlineActionForm
                      action={setExpenseCategoryActive}
                      submitLabel={
                        category.isActive ? "Deactivate" : "Activate"
                      }
                    >
                      <input name="id" type="hidden" value={category.id} />
                      <input
                        name="isActive"
                        type="hidden"
                        value={category.isActive ? "false" : "true"}
                      />
                    </InlineActionForm>
                  </td>
                </tr>
              ))}
            </TableShell>
          )}
        </div>
      </Card>
    </>
  );
}
