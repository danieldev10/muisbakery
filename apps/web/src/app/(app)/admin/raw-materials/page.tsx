import Link from "next/link";

import { AdminFormModal, AdminModal } from "@/components/admin/form-modal";
import { Field, SelectField } from "@/components/admin/form-controls";
import { InlineActionForm } from "@/components/admin/inline-action-form";
import {
  Card,
  EmptyState,
  StatusBadge,
  TableShell,
} from "@/components/admin/layout";
import { TablePagination } from "@/components/admin/pagination";
import { TableToolbar } from "@/components/admin/table-toolbar";
import type { RawMaterial, Unit } from "@/lib/admin/types";
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

import { createRawMaterial, setRawMaterialActive } from "./actions";

export default async function RawMaterialsPage({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}) {
  const params = await searchParams;
  const [materials, units] = await Promise.all([
    apiGet<RawMaterial[]>("/admin/raw-materials"),
    apiGet<Unit[]>("/admin/units"),
  ]);
  const query = firstParam(params, "q");
  const unitFilter = firstParam(params, "unit");
  const statusFilter = firstParam(params, "status");
  const filteredMaterials = materials.filter(
    (material) =>
      matchesSearch(query, [
        material.name,
        material.description,
        material.baseUnit.name,
        material.baseUnit.abbreviation,
      ]) &&
      matchesSelect(unitFilter, material.baseUnit.id) &&
      matchesSelect(statusFilter, material.isActive),
  );
  const { pageItems, ...pagination } = paginate(
    filteredMaterials,
    pageNumber(params.page),
  );

  const unitOptions = units
    .filter((unit) => unit.isActive)
    .map((unit) => ({
      value: unit.id,
      label: `${unit.name} (${unit.abbreviation})`,
    }));

  return (
    <Card>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-base font-semibold leading-tight text-[var(--text-primary)]">
          All raw materials ({filteredMaterials.length} of {materials.length})
        </h2>
        {unitOptions.length === 0 ? (
          <AdminModal
            description="A base unit is required before a raw material can be created."
            title="Add raw material"
            triggerLabel="Add raw material"
          >
            <EmptyState>
              Add at least one unit in{" "}
              <Link
                className="font-medium text-red-800 underline"
                href="/admin/settings"
              >
                Settings
              </Link>{" "}
              before creating raw materials.
            </EmptyState>
          </AdminModal>
        ) : (
          <AdminFormModal
            action={createRawMaterial}
            description="Create a raw material and assign its base tracking unit."
            submitLabel="Create material"
            title="Add raw material"
            triggerLabel="Add raw material"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Name"
                name="name"
                placeholder="e.g. Flour"
                required
              />
              <SelectField
                label="Base unit"
                name="baseUnitId"
                options={unitOptions}
                placeholder="Select unit"
                required
              />
            </div>
            <Field
              label="Description"
              name="description"
              placeholder="Optional notes"
            />
          </AdminFormModal>
        )}
      </div>

      <div>
        {materials.length > 0 ? (
          <TableToolbar
            basePath="/admin/raw-materials"
            searchParams={params}
            searchPlaceholder="Search material, description, or unit"
            selectFilters={[
              {
                label: "Unit",
                name: "unit",
                options: units.map((unit) => ({
                  label: `${unit.name} (${unit.abbreviation})`,
                  value: unit.id,
                })),
              },
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
        {materials.length === 0 ? (
          <EmptyState>No raw materials yet.</EmptyState>
        ) : filteredMaterials.length === 0 ? (
          <EmptyState>No raw materials match the current filters.</EmptyState>
        ) : (
          <TableShell
            head={
              <>
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Base unit</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Actions</th>
              </>
            }
          >
            {pageItems.map((material) => (
              <tr className="align-top" key={material.id}>
                <td className="py-3 pr-4">
                  <p className="font-medium text-stone-900">{material.name}</p>
                  {material.description ? (
                    <p className="text-xs text-stone-500">
                      {material.description}
                    </p>
                  ) : null}
                </td>
                <td className="py-3 pr-4 text-stone-600">
                  {material.baseUnit.name} ({material.baseUnit.abbreviation})
                </td>
                <td className="py-3 pr-4">
                  <StatusBadge active={material.isActive} />
                </td>
                <td className="py-3 pr-4">
                  <InlineActionForm
                    action={setRawMaterialActive}
                    submitLabel={material.isActive ? "Deactivate" : "Activate"}
                  >
                    <input name="id" type="hidden" value={material.id} />
                    <input
                      name="isActive"
                      type="hidden"
                      value={material.isActive ? "false" : "true"}
                    />
                  </InlineActionForm>
                </td>
              </tr>
            ))}
          </TableShell>
        )}
        <TablePagination
          basePath="/admin/raw-materials"
          searchParams={params}
          {...pagination}
        />
      </div>
    </Card>
  );
}
