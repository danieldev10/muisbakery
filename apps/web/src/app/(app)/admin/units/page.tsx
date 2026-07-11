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
import type { Unit } from "@/lib/admin/types";
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

import { createUnit, updateUnit } from "./actions";

const secondaryButtonClass =
  "inline-flex h-8 items-center justify-center rounded-[5px] border border-[color:var(--border-strong)] bg-white px-3 text-xs font-semibold text-[var(--text-secondary)] shadow-[var(--shadow-whisper)] transition hover:border-[var(--brand-burgundy)] hover:text-[var(--brand-burgundy)]";

const statusOptions = [
  { value: "true", label: "Active" },
  { value: "false", label: "Inactive" },
];

export default async function UnitsPage({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}) {
  const params = await searchParams;
  const units = await apiGet<Unit[]>("/admin/units");
  const query = firstParam(params, "q");
  const statusFilter = firstParam(params, "status");
  const filteredUnits = units.filter(
    (unit) =>
      matchesSearch(query, [unit.name, unit.abbreviation]) &&
      matchesSelect(statusFilter, unit.isActive),
  );
  const { pageItems, ...pagination } = paginate(
    filteredUnits,
    pageNumber(params.page),
  );

  return (
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

      {units.length > 0 ? (
        <TableToolbar
          basePath="/admin/units"
          searchParams={params}
          searchPlaceholder="Search unit or abbreviation"
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
          {pageItems.map((unit) => (
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
                <AdminFormModal
                  action={updateUnit}
                  description={unit.abbreviation}
                  submitLabel="Save changes"
                  title="Edit unit"
                  triggerClassName={secondaryButtonClass}
                  triggerIcon={null}
                  triggerLabel="Edit"
                >
                  <input name="id" type="hidden" value={unit.id} />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      defaultValue={unit.name}
                      label="Name"
                      name="name"
                      required
                    />
                    <Field
                      defaultValue={unit.abbreviation}
                      label="Abbreviation"
                      name="abbreviation"
                      required
                    />
                  </div>
                  <SelectField
                    defaultValue={unit.isActive ? "true" : "false"}
                    hint="Inactive units disappear from new setup selections but keep history."
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
        basePath="/admin/units"
        searchParams={params}
        {...pagination}
      />
    </Card>
  );
}
