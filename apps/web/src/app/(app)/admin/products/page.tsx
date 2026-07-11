import Link from "next/link";

import { AdminFormModal, AdminModal } from "@/components/admin/form-modal";
import { Field, SelectField } from "@/components/admin/form-controls";
import {
  Card,
  EmptyState,
  TableShell,
} from "@/components/admin/layout";
import { TablePagination } from "@/components/admin/pagination";
import { TableToolbar } from "@/components/admin/table-toolbar";
import type { Product, Unit } from "@/lib/admin/types";
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

import { createProduct } from "./actions";
import { EditProductButton } from "./edit-product-modal";
import { ProductStatsChart, type ProductStat } from "./product-stats-chart";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}) {
  const params = await searchParams;
  const [products, units, stats] = await Promise.all([
    apiGet<Product[]>("/admin/products"),
    apiGet<Unit[]>("/admin/units"),
    apiGet<ProductStat[]>("/admin/products/stats"),
  ]);
  const query = firstParam(params, "q");
  const unitFilter = firstParam(params, "unit");
  const statusFilter = firstParam(params, "status");
  const filteredProducts = products.filter(
    (product) =>
      matchesSearch(query, [
        product.name,
        product.size,
        product.description,
        product.unit.name,
        product.unit.abbreviation,
        product.unitPrice,
      ]) &&
      matchesSelect(unitFilter, product.unit.id) &&
      matchesSelect(statusFilter, product.isActive),
  );
  const { pageItems, ...pagination } = paginate(
    filteredProducts,
    pageNumber(params.page),
  );

  const unitOptions = units
    .filter((unit) => unit.isActive)
    .map((unit) => ({
      value: unit.id,
      label: `${unit.name} (${unit.abbreviation})`,
    }));

  return (
    <div className="grid items-start gap-4 xl:grid-cols-2">
      <Card>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-base font-semibold leading-tight text-[var(--text-primary)]">
            All products ({filteredProducts.length} of {products.length})
          </h2>
          {unitOptions.length === 0 ? (
            <AdminModal
              description="A unit is required before a finished product can be created."
              title="Add product"
              triggerLabel="Add product"
            >
              <EmptyState>
                Add at least one unit in{" "}
                <Link
                  className="font-medium text-red-800 underline"
                  href="/admin/units"
                >
                  Units
                </Link>{" "}
                before creating products.
              </EmptyState>
            </AdminModal>
          ) : (
            <AdminFormModal
              action={createProduct}
              description="Create a finished good with its production unit and optional selling price."
              submitLabel="Create product"
              title="Add product"
              triggerLabel="Add product"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Name"
                  name="name"
                  placeholder="e.g. Full loaf bread"
                  required
                />
                <Field
                  label="Size"
                  name="size"
                  placeholder="e.g. Small, 500g, Family"
                />
                <SelectField
                  label="Unit"
                  name="unitId"
                  options={unitOptions}
                  placeholder="Select unit"
                  required
                />
                <Field
                  hint="Selling price per unit. Optional."
                  label="Default price"
                  min="0"
                  name="unitPrice"
                  step="0.01"
                  type="number"
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
          {products.length > 0 ? (
            <TableToolbar
              basePath="/admin/products"
              searchParams={params}
              searchPlaceholder="Search product, size, unit, or price"
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
          {products.length === 0 ? (
            <EmptyState>No products yet.</EmptyState>
          ) : filteredProducts.length === 0 ? (
            <EmptyState>No products match the current filters.</EmptyState>
          ) : (
            <TableShell
              head={
                <>
                  <th className="py-2 pr-4">Product</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Actions</th>
                </>
              }
            >
              {pageItems.map((product) => (
                <tr
                  className={
                    product.isActive
                      ? "align-middle"
                      : "align-middle opacity-55"
                  }
                  key={product.id}
                >
                  <td className="py-3 pr-4">
                    <p className="font-medium text-stone-900">
                      {product.name}
                      {product.size ? (
                        <span className="text-stone-500"> — {product.size}</span>
                      ) : null}
                    </p>
                    {product.description ? (
                      <p className="truncate text-xs text-stone-500">
                        {product.description}
                      </p>
                    ) : null}
                  </td>
                  <td className="py-3 pr-4">
                    <span className="inline-flex items-center gap-1.5 text-sm text-stone-600">
                      <span
                        aria-hidden
                        className={`size-2 rounded-full ${
                          product.isActive ? "bg-emerald-500" : "bg-stone-300"
                        }`}
                      />
                      {product.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="py-3 pr-4">
                    <EditProductButton
                      product={product}
                      unitOptions={unitOptions}
                    />
                  </td>
                </tr>
              ))}
            </TableShell>
          )}
          <TablePagination
            basePath="/admin/products"
            searchParams={params}
            {...pagination}
          />
        </div>
      </Card>

      <Card
        description="All-time output from Production runs against quantities sold."
        title="Produced vs sold"
      >
        <ProductStatsChart stats={stats} />
      </Card>
    </div>
  );
}
