import { ArrowRight, BookOpen, Layers3 } from "lucide-react";
import Link from "next/link";

import { AdminModal } from "@/components/admin/form-modal";
import {
  Card,
  EmptyState,
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

import { RecipeFormModal } from "./recipe-form";
import {
  DeleteRecipeButton,
  EditRecipeButton,
} from "./recipe-detail-actions";

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
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {pageItems.map((recipe) => (
              <div
                className={`flex min-h-48 flex-col justify-between rounded-lg border border-[color:var(--border-muted)] bg-white p-4 shadow-[var(--shadow-whisper)] transition ${
                  recipe.isActive ? "" : "opacity-60"
                }`}
                key={recipe.id}
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="mt-1 text-lg font-semibold leading-tight text-[var(--text-primary)]">
                    {formatProductName(recipe.product)}
                  </h3>
                  <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-[5px] border border-[color:var(--border-muted)] bg-[var(--surface-warm)] text-[var(--brand-burgundy)]">
                    <BookOpen aria-hidden className="size-5" />
                  </span>
                </div>

                <div className="mt-6">
                  <p className="text-2xl font-semibold tracking-tight text-[var(--brand-burgundy)]">
                    {Number(recipe.yieldQuantity).toLocaleString("en")}
                  </p>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    Yield per batch
                  </p>
                </div>

                <div className="mt-5 grid gap-2 border-t border-[color:var(--border-muted)] pt-4 text-sm text-[var(--text-secondary)]">
                  <div className="flex items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-1.5 text-[var(--text-muted)]">
                      <Layers3 aria-hidden className="size-4" />
                      Ingredients
                    </span>
                    <span className="font-semibold text-[var(--text-primary)]">
                      {recipe.items.length}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[var(--text-muted)]">Status</span>
                    <span className="inline-flex items-center gap-1.5 font-medium text-[var(--text-primary)]">
                      <span
                        aria-hidden
                        className={`size-2 rounded-full ${
                          recipe.isActive ? "bg-emerald-500" : "bg-stone-300"
                        }`}
                      />
                      {recipe.isActive ? "Active" : "Inactive"}
                    </span>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
                  <Link
                    className="inline-flex h-9 items-center gap-1.5 rounded-[5px] border border-[color:var(--border-muted)] bg-white px-3 text-sm font-semibold text-[var(--brand-burgundy)] transition hover:border-[var(--brand-burgundy)] hover:bg-[var(--brand-tint)]"
                    href={`/admin/recipes/${recipe.id}`}
                  >
                    View recipe
                    <ArrowRight aria-hidden className="size-4" />
                  </Link>
                  <div className="flex items-center gap-2">
                    <EditRecipeButton
                      productLabel={formatProductName(recipe.product)}
                      rawMaterials={materialOptions}
                      recipe={recipe}
                    />
                    <DeleteRecipeButton
                      productLabel={formatProductName(recipe.product)}
                      redirectAfterDelete={false}
                      recipeId={recipe.id}
                    />
                  </div>
                </div>
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
