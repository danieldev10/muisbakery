import Link from "next/link";

import { AdminForm } from "@/components/admin/admin-form";
import { Field, SelectField } from "@/components/admin/form-controls";
import { InlineActionForm } from "@/components/admin/inline-action-form";
import {
  Card,
  EmptyState,
  PageHeader,
  StatusBadge,
  TableShell,
} from "@/components/admin/layout";
import { TablePagination } from "@/components/admin/pagination";
import type { RawMaterial, Unit } from "@/lib/admin/types";
import {
  pageNumber,
  paginate,
  type PageSearchParams,
} from "@/lib/paginate";
import { apiGet } from "@/lib/server-api";

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
  const { pageItems, ...pagination } = paginate(
    materials,
    pageNumber(params.page),
  );

  const unitOptions = units
    .filter((unit) => unit.isActive)
    .map((unit) => ({
      value: unit.id,
      label: `${unit.name} (${unit.abbreviation})`,
    }));

  return (
    <>
      <PageHeader
        title="Raw materials"
        description="Define the materials the store receives, each with a base unit."
      />

      <Card title="Add raw material">
        {unitOptions.length === 0 ? (
          <EmptyState>
            Add at least one unit in{" "}
            <Link className="font-medium text-red-800 underline" href="/admin/settings">
              Settings
            </Link>{" "}
            before creating raw materials.
          </EmptyState>
        ) : (
          <AdminForm action={createRawMaterial} submitLabel="Create material">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name" name="name" placeholder="e.g. Flour" required />
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
          </AdminForm>
        )}
      </Card>

      <Card title={`All raw materials (${materials.length})`}>
        {materials.length === 0 ? (
          <EmptyState>No raw materials yet.</EmptyState>
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
      </Card>
    </>
  );
}
