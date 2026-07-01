import { AdminForm } from "@/components/admin/admin-form";
import { Field } from "@/components/admin/form-controls";
import { InlineActionForm } from "@/components/admin/inline-action-form";
import {
  Card,
  EmptyState,
  PageHeader,
  StatusBadge,
  TableShell,
} from "@/components/admin/layout";
import type { AppSettings, ExpenseCategory, Unit } from "@/lib/admin/types";
import { apiGet } from "@/lib/server-api";

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

export default async function SettingsPage() {
  const [units, categories, settings] = await Promise.all([
    apiGet<Unit[]>("/admin/units"),
    apiGet<ExpenseCategory[]>("/admin/expense-categories"),
    apiGet<AppSettings>("/admin/settings"),
  ]);

  return (
    <>
      <PageHeader
        title="Settings"
        description="Measurement units, expense categories, and approval rules."
      />

      <Card
        title="Approval settings"
        description="Control which workflows need approval in later modules."
      >
        <SettingsForm settings={settings ?? DEFAULT_SETTINGS} />
      </Card>

      <Card
        title="Units"
        description="Units of measure used by raw materials, products, and recipes."
      >
        <AdminForm action={createUnit} submitLabel="Add unit">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" name="name" placeholder="e.g. Kilogram" required />
            <Field
              label="Abbreviation"
              name="abbreviation"
              placeholder="e.g. kg"
              required
            />
          </div>
        </AdminForm>

        <div className="mt-5">
          {units.length === 0 ? (
            <EmptyState>No units yet.</EmptyState>
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
              {units.map((unit) => (
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

      <Card
        title="Expense categories"
        description="Used to classify expenses in management reporting."
      >
        <AdminForm
          action={createExpenseCategory}
          submitLabel="Add category"
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
        </AdminForm>

        <div className="mt-5">
          {categories.length === 0 ? (
            <EmptyState>No expense categories yet.</EmptyState>
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
              {categories.map((category) => (
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
