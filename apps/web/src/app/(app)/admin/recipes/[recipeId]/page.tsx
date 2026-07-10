import { ArrowLeft, BookOpen, Layers3 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Card, TableShell } from "@/components/admin/layout";
import type { RawMaterial, Recipe } from "@/lib/admin/types";
import { formatProductName } from "@/lib/product-label";
import { apiGet } from "@/lib/server-api";

import {
  DeleteRecipeButton,
  EditRecipeButton,
} from "../recipe-detail-actions";

function perUnit(quantity: string, yieldQuantity: string) {
  const perBatch = Number(quantity);
  const yieldCount = Number(yieldQuantity);

  if (!Number.isFinite(perBatch) || !Number.isFinite(yieldCount) || yieldCount <= 0) {
    return "-";
  }

  return (perBatch / yieldCount).toLocaleString("en", {
    maximumFractionDigits: 3,
  });
}

export default async function RecipeDetailPage({
  params,
}: {
  params: Promise<{ recipeId: string }>;
}) {
  const [{ recipeId }, recipes, rawMaterials] = await Promise.all([
    params,
    apiGet<Recipe[]>("/admin/recipes"),
    apiGet<RawMaterial[]>("/admin/raw-materials"),
  ]);

  const recipe = recipes.find((entry) => entry.id === recipeId);

  if (!recipe) {
    notFound();
  }

  const productLabel = formatProductName(recipe.product);
  const materialOptions = rawMaterials
    .filter((material) => material.isActive)
    .map((material) => ({
      value: material.id,
      label: material.name,
      unitId: material.baseUnit.id,
      unitLabel: material.baseUnit.abbreviation,
    }));

  return (
    <>
      <div>
        <Link
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--text-muted)] transition hover:text-[var(--brand-burgundy)]"
          href="/admin/recipes"
        >
          <ArrowLeft aria-hidden className="size-4" />
          All recipes
        </Link>
      </div>

      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-[5px] border border-[color:var(--border-muted)] bg-[var(--surface-warm)] text-[var(--brand-burgundy)]">
              <BookOpen aria-hidden className="size-5" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold leading-tight tracking-tight text-[var(--text-primary)]">
                  {productLabel}
                </h1>
                <span className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
                  <span
                    aria-hidden
                    className={`size-2 rounded-full ${
                      recipe.isActive ? "bg-emerald-500" : "bg-stone-300"
                    }`}
                  />
                  {recipe.isActive ? "Active" : "Inactive"}
                </span>
              </div>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                One batch yields {Number(recipe.yieldQuantity).toLocaleString("en")}{" "}
                and uses {recipe.items.length} ingredient
                {recipe.items.length === 1 ? "" : "s"}.
              </p>
              {recipe.notes ? (
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
                  {recipe.notes}
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex shrink-0 gap-2">
            <EditRecipeButton
              productLabel={productLabel}
              rawMaterials={materialOptions}
              recipe={recipe}
            />
            <DeleteRecipeButton
              productLabel={productLabel}
              recipeId={recipe.id}
            />
          </div>
        </div>
      </Card>

      <Card
        description="Quantities Production is expected to use for one batch, and per unit produced."
        title={
          <span className="inline-flex items-center gap-2">
            <Layers3 aria-hidden className="size-4 text-[var(--brand-burgundy)]" />
            Ingredients
          </span>
        }
      >
        <TableShell
          head={
            <>
              <th className="py-2 pr-4">Raw material</th>
              <th className="py-2 pr-4">Per batch</th>
              <th className="py-2 pr-4">Per unit produced</th>
            </>
          }
        >
          {recipe.items.map((item) => (
            <tr key={item.id}>
              <td className="py-3 pr-4 font-medium text-stone-900">
                {item.rawMaterial.name}
              </td>
              <td className="py-3 pr-4 text-stone-600">
                {Number(item.quantity).toLocaleString("en", {
                  maximumFractionDigits: 3,
                })}{" "}
                {item.unit.abbreviation}
              </td>
              <td className="py-3 pr-4 text-stone-600">
                {perUnit(item.quantity, recipe.yieldQuantity)}{" "}
                {item.unit.abbreviation}
              </td>
            </tr>
          ))}
        </TableShell>
      </Card>
    </>
  );
}
