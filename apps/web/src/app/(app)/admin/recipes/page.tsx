import Link from "next/link";

import { InlineActionForm } from "@/components/admin/inline-action-form";
import {
  Card,
  EmptyState,
  PageHeader,
  StatusBadge,
} from "@/components/admin/layout";
import { TablePagination } from "@/components/admin/pagination";
import type { Product, RawMaterial, Recipe } from "@/lib/admin/types";
import {
  pageNumber,
  paginate,
  type PageSearchParams,
} from "@/lib/paginate";
import { formatProductName } from "@/lib/product-label";
import { apiGet } from "@/lib/server-api";

import { deleteRecipe } from "./actions";
import { RecipeForm } from "./recipe-form";

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
    recipes,
    pageNumber(params.page),
  );

  return (
    <>
      <PageHeader
        title="Recipes"
        description="Set the raw material formula used to make each product."
      />

      <Card title="Add recipe">
        {canBuild ? (
          <RecipeForm
            products={productOptions}
            rawMaterials={materialOptions}
          />
        ) : (
          <EmptyState>
            You need at least one product without a recipe and one raw
            material first. Manage them under{" "}
            <Link className="font-medium text-red-800 underline" href="/admin/products">
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
        )}
      </Card>

      <Card title={`Recipes (${recipes.length})`}>
        {recipes.length === 0 ? (
          <EmptyState>No recipes yet.</EmptyState>
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
      </Card>
    </>
  );
}
