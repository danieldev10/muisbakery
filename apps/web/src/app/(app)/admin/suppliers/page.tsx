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
import type { Supplier } from "@/lib/admin/types";
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

import { createSupplier, updateSupplier } from "./actions";

const secondaryButtonClass =
  "inline-flex h-8 items-center justify-center rounded-[5px] border border-[color:var(--border-strong)] bg-white px-3 text-xs font-semibold text-[var(--text-secondary)] shadow-[var(--shadow-whisper)] transition hover:border-[var(--brand-burgundy)] hover:text-[var(--brand-burgundy)]";

const statusOptions = [
  { value: "true", label: "Active" },
  { value: "false", label: "Inactive" },
];

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}) {
  const params = await searchParams;
  const suppliers = await apiGet<Supplier[]>("/admin/suppliers");
  const query = firstParam(params, "q");
  const statusFilter = firstParam(params, "status");
  const filteredSuppliers = suppliers.filter(
    (supplier) =>
      matchesSearch(query, [
        supplier.name,
        supplier.contactName,
        supplier.phone,
        supplier.email,
        supplier.address,
        supplier.notes,
      ]) && matchesSelect(statusFilter, supplier.isActive),
  );
  const { pageItems, ...pagination } = paginate(
    filteredSuppliers,
    pageNumber(params.page),
  );

  return (
    <Card>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-base font-semibold leading-tight text-[var(--text-primary)]">
          All suppliers ({filteredSuppliers.length} of {suppliers.length})
        </h2>
        <AdminFormModal
          action={createSupplier}
          description="Create a supplier profile for Store receiving."
          submitLabel="Create supplier"
          title="Add supplier"
          triggerLabel="Add supplier"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" name="name" required />
            <Field label="Contact person" name="contactName" />
            <Field label="Phone" name="phone" type="tel" />
            <Field label="Email" name="email" type="email" />
          </div>
          <Field label="Address" name="address" />
          <TextareaField label="Notes" name="notes" />
        </AdminFormModal>
      </div>

      <div>
        {suppliers.length > 0 ? (
          <TableToolbar
            basePath="/admin/suppliers"
            searchParams={params}
            searchPlaceholder="Search supplier, contact, phone, or email"
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
        {suppliers.length === 0 ? (
          <EmptyState>No suppliers yet.</EmptyState>
        ) : filteredSuppliers.length === 0 ? (
          <EmptyState>No suppliers match the current filters.</EmptyState>
        ) : (
          <TableShell
            head={
              <>
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Contact</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Actions</th>
              </>
            }
          >
            {pageItems.map((supplier) => (
              <tr className="align-top" key={supplier.id}>
                <td className="py-3 pr-4">
                  <p className="font-medium text-stone-900">{supplier.name}</p>
                  {supplier.address ? (
                    <p className="text-xs text-stone-500">{supplier.address}</p>
                  ) : null}
                </td>
                <td className="py-3 pr-4 text-stone-600">
                  <p>{supplier.contactName || "—"}</p>
                  <p className="text-xs text-stone-500">
                    {[supplier.phone, supplier.email]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </p>
                </td>
                <td className="py-3 pr-4">
                  <StatusBadge active={supplier.isActive} />
                </td>
                <td className="py-3 pr-4">
                  <div className="flex flex-wrap items-start gap-2">
                    <AdminFormModal
                      action={updateSupplier}
                      description={supplier.name}
                      submitLabel="Save changes"
                      title="Edit supplier"
                      triggerClassName={secondaryButtonClass}
                      triggerIcon={null}
                      triggerLabel="Edit"
                    >
                      <input name="id" type="hidden" value={supplier.id} />
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field
                          defaultValue={supplier.name}
                          label="Name"
                          name="name"
                          required
                        />
                        <Field
                          defaultValue={supplier.contactName ?? ""}
                          label="Contact person"
                          name="contactName"
                        />
                        <Field
                          defaultValue={supplier.phone ?? ""}
                          label="Phone"
                          name="phone"
                          type="tel"
                        />
                        <Field
                          defaultValue={supplier.email ?? ""}
                          label="Email"
                          name="email"
                          type="email"
                        />
                      </div>
                      <Field
                        defaultValue={supplier.address ?? ""}
                        label="Address"
                        name="address"
                      />
                      <TextareaField
                        defaultValue={supplier.notes ?? ""}
                        label="Notes"
                        name="notes"
                      />
                      <SelectField
                        defaultValue={supplier.isActive ? "true" : "false"}
                        hint="Inactive suppliers disappear from new receiving selections but keep history."
                        label="Status"
                        name="isActive"
                        options={statusOptions}
                        required
                      />
                    </AdminFormModal>
                  </div>
                </td>
              </tr>
            ))}
          </TableShell>
        )}
        <TablePagination
          basePath="/admin/suppliers"
          searchParams={params}
          {...pagination}
        />
      </div>
    </Card>
  );
}
