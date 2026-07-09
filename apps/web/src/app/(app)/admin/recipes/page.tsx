import Link from "next/link";

import { AdminModal } from "@/components/admin/form-modal";
import { InlineActionForm } from "@/components/admin/inline-action-form";
import {
  Card,
  EmptyState,
  StatusBadge,
} from "@/components/admin/layout";
import { TablePagination } from "@/components/admin/pagination";
import { TableToolbar } from "@/components/admin/table-toolbar";
import type { Product, RawMaterial, Recipe } from "@/lib/admin/types";
import {
  pageNumber,
  paginate,
  type PageSearchParams,
} from "@/lib/paginate";
import { formatProductName } from "@/lib/product-label";
import { apiGet } from "@/lib/server-api";
import {
  firstParam,
  matchesSearch,
  matchesSelect,
} from "@/lib/table-filters";

import { deleteRecipe } from "./actions";
import { RecipeFormModal } from "./recipe-form";

export default async function RecipesPage({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}) {
  const params = await searchParams;
  const [recipes, products, rawMaterials] = await Promise.all([
    apiGet<Recipe[]>("/admin/recipes"),
    apiGet<Product[]>("/admin/products"),
    apiGet<RawMaterial[]>("/admin/raw-materials"),
  ]);
  const query = firstParam(params, "q");
  const productFilter = firstParam(params, "product");
  const materialFilter = firstParam(params, "material");
  const statusFilter = firstParam(params, "status");
  const filteredRecipes = recipes.filter(
    (recipe) =>
      matchesSearch(query, [
        formatProductName(recipe.product),
        recipe.yieldQuantity,
        recipe.notes,
        ...recipe.items.flatMap((item) => [
          item.rawMaterial.name,
          item.quantity,
          item.unit.abbreviation,
        ]),
      ]) &&
      matchesSelect(productFilter, recipe.productId) &&
      matchesSelect(statusFilter, recipe.isActive) &&
      (!materialFilter ||
        recipe.items.some((item) => item.rawMaterialId === materialFilter)),
  );

  const recipeProductIds = new Set(recipes.map((r) => r.productId));
  const productOptions = products
    .filter((product) => product.isActive && !recipeProductIds.has(product.id))
    .map((product) => ({
      value: product.id,
      label: formatProductName(product),
    }));

  const materialOptions = rawMaterials
    .filter((material) => material.isActive)
    .map((material) => ({
      value: material.id,
      label: material.name,
      unitId: material.baseUnit.id,
      unitLabel: material.baseUnit.abbreviation,
    }));

  const canBuild = productOptions.length > 0 && materialOptions.length > 0;
  const { pageItems, ...pagination } = paginate(
    filteredRecipes,
    pageNumber(params.page),
  );

  return (
    <Card>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-base font-semibold leading-tight text-[var(--text-primary)]">
          Recipes ({filteredRecipes.length} of {recipes.length})
        </h2>
        {canBuild ? (
          <RecipeFormModal
            products={productOptions}
            rawMaterials={materialOptions}
          />
        ) : (
          <AdminModal
            description="Recipes need one available product and one active raw material."
            title="Add recipe"
            triggerLabel="Add recipe"
          >
            <EmptyState>
              You need at least one product without a recipe and one raw
              material first. Manage them under{" "}
              <Link
                className="font-medium text-red-800 underline"
                href="/admin/products"
              >
                Products
              </Link>
              ,{" "}
              <Link
                className="font-medium text-red-800 underline"
                href="/admin/raw-materials"
              >
                Raw materials
              </Link>
              .
            </EmptyState>
          </AdminModal>
        )}
      </div>

      <div>
        {recipes.length > 0 ? (
          <TableToolbar
            basePath="/admin/recipes"
            searchParams={params}
            searchPlaceholder="Search product, material, quantity, or notes"
            selectFilters={[
              {
                label: "Product",
                name: "product",
                options: products.map((product) => ({
                  label: formatProductName(product),
                  value: product.id,
                })),
              },
              {
                label: "Material",
                name: "material",
                options: rawMaterials.map((material) => ({
                  label: material.name,
                  value: material.id,
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
        {recipes.length === 0 ? (
          <EmptyState>No recipes yet.</EmptyState>
        ) : filteredRecipes.length === 0 ? (
          <EmptyState>No recipes match the current filters.</EmptyState>
        ) : (
          <div className="grid gap-4">
            {pageItems.map((recipe) => (
              <div
                className="rounded-md border border-stone-200 p-4"
                key={recipe.id}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-stone-900">
                        {formatProductName(recipe.product)}
                      </h3>
                      <StatusBadge active={recipe.isActive} />
                    </div>
                    <p className="mt-0.5 text-xs text-stone-500">
                      Yields {recipe.yieldQuantity} per batch
                    </p>
                  </div>
                  <InlineActionForm
                    action={deleteRecipe}
                    buttonClassName="rounded-md border border-stone-300 px-2 py-1 text-xs font-medium text-stone-700 transition hover:bg-red-50 hover:text-red-800 disabled:cursor-not-allowed disabled:opacity-50"
                    submitLabel="Delete"
                  >
                    <input name="id" type="hidden" value={recipe.id} />
                  </InlineActionForm>
                </div>
                <ul className="mt-3 grid gap-1 text-sm text-stone-700">
                  {recipe.items.map((item) => (
                    <li
                      className="flex justify-between border-t border-stone-100 py-1"
                      key={item.id}
                    >
                      <span>{item.rawMaterial.name}</span>
                      <span className="text-stone-500">
                        {item.quantity} {item.unit.abbreviation}
                      </span>
                    </li>
                  ))}
                </ul>
                {recipe.notes ? (
                  <p className="mt-2 text-xs text-stone-500">{recipe.notes}</p>
                ) : null}
              </div>
            ))}
          </div>
        )}
        <TablePagination
          basePath="/admin/recipes"
          searchParams={params}
          {...pagination}
        />
      </div>
    </Card>
  );
}
