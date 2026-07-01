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
import type { Product, Unit } from "@/lib/admin/types";
import { apiGet } from "@/lib/server-api";

import { createProduct, setProductActive } from "./actions";

function formatPrice(value: string | null) {
  if (!value) {
    return "—";
  }
  return `₦${Number(value).toLocaleString("en", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default async function ProductsPage() {
  const [products, units] = await Promise.all([
    apiGet<Product[]>("/admin/products"),
    apiGet<Unit[]>("/admin/units"),
  ]);

  const unitOptions = units
    .filter((unit) => unit.isActive)
    .map((unit) => ({
      value: unit.id,
      label: `${unit.name} (${unit.abbreviation})`,
    }));

  return (
    <>
      <PageHeader
        title="Products"
        description="Define the finished goods production makes and sales sells."
      />

      <Card title="Add product">
        {unitOptions.length === 0 ? (
          <EmptyState>
            Add at least one unit in{" "}
            <Link className="font-medium text-red-800 underline" href="/admin/settings">
              Settings
            </Link>{" "}
            before creating products.
          </EmptyState>
        ) : (
          <AdminForm action={createProduct} submitLabel="Create product">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Name"
                name="name"
                placeholder="e.g. Full loaf bread"
                required
              />
              <SelectField
                label="Unit"
                name="unitId"
                options={unitOptions}
                placeholder="Select unit"
                required
              />
              <Field
                label="Default price"
                name="unitPrice"
                hint="Selling price per unit. Optional."
                min="0"
                step="0.01"
                type="number"
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

      <Card title={`All products (${products.length})`}>
        {products.length === 0 ? (
          <EmptyState>No products yet.</EmptyState>
        ) : (
          <TableShell
            head={
              <>
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Unit</th>
                <th className="py-2 pr-4">Price</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Actions</th>
              </>
            }
          >
            {products.map((product) => (
              <tr className="align-top" key={product.id}>
                <td className="py-3 pr-4">
                  <p className="font-medium text-stone-900">{product.name}</p>
                  {product.description ? (
                    <p className="text-xs text-stone-500">
                      {product.description}
                    </p>
                  ) : null}
                </td>
                <td className="py-3 pr-4 text-stone-600">
                  {product.unit.name} ({product.unit.abbreviation})
                </td>
                <td className="py-3 pr-4 text-stone-600">
                  {formatPrice(product.unitPrice)}
                </td>
                <td className="py-3 pr-4">
                  <StatusBadge active={product.isActive} />
                </td>
                <td className="py-3 pr-4">
                  <InlineActionForm
                    action={setProductActive}
                    submitLabel={product.isActive ? "Deactivate" : "Activate"}
                  >
                    <input name="id" type="hidden" value={product.id} />
                    <input
                      name="isActive"
                      type="hidden"
                      value={product.isActive ? "false" : "true"}
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
