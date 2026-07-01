import { AdminForm } from "@/components/admin/admin-form";
import { Field, TextareaField } from "@/components/admin/form-controls";
import { InlineActionForm } from "@/components/admin/inline-action-form";
import {
  Card,
  EmptyState,
  PageHeader,
  StatusBadge,
  TableShell,
} from "@/components/admin/layout";
import type { Supplier } from "@/lib/admin/types";
import { apiGet } from "@/lib/server-api";

import { createSupplier, setSupplierActive } from "./actions";

export default async function SuppliersPage() {
  const suppliers = await apiGet<Supplier[]>("/admin/suppliers");

  return (
    <>
      <PageHeader
        title="Suppliers"
        description="Maintain the suppliers the store buys raw materials from."
      />

      <Card title="Add supplier">
        <AdminForm action={createSupplier} submitLabel="Create supplier">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" name="name" required />
            <Field label="Contact person" name="contactName" />
            <Field label="Phone" name="phone" type="tel" />
            <Field label="Email" name="email" type="email" />
          </div>
          <Field label="Address" name="address" />
          <TextareaField label="Notes" name="notes" />
        </AdminForm>
      </Card>

      <Card title={`All suppliers (${suppliers.length})`}>
        {suppliers.length === 0 ? (
          <EmptyState>No suppliers yet.</EmptyState>
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
            {suppliers.map((supplier) => (
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
                  <InlineActionForm
                    action={setSupplierActive}
                    submitLabel={supplier.isActive ? "Deactivate" : "Activate"}
                  >
                    <input name="id" type="hidden" value={supplier.id} />
                    <input
                      name="isActive"
                      type="hidden"
                      value={supplier.isActive ? "false" : "true"}
                    />
                  </InlineActionForm>
                </td>
              </tr>
            ))}
          </TableShell>
        )}
      </Card>
    </>
  );
}
