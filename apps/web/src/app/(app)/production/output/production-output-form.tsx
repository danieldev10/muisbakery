"use client";

import { useMemo, useState } from "react";

import { AdminForm } from "@/components/admin/admin-form";
import { TextareaField } from "@/components/admin/form-controls";
import type {
  ProductionMaterialInventoryItem,
  ProductionProductOption,
} from "@/lib/operations/types";

import { createProductionRun } from "./actions";

const fieldClass =
  "h-10 rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-red-700 focus:ring-4 focus:ring-red-100 disabled:bg-stone-100";
const selectClass =
  "h-10 rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-red-700 focus:ring-4 focus:ring-red-100";
const labelClass = "text-sm font-medium text-stone-700";

function roundQuantity(value: number) {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

function formatQuantity(value: number | string, unit: string) {
  return `${Number(value).toLocaleString("en", {
    maximumFractionDigits: 3,
  })} ${unit}`;
}

export function ProductionOutputForm({
  products,
  inventory,
}: {
  products: ProductionProductOption[];
  inventory: ProductionMaterialInventoryItem[];
}) {
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [quantityProduced, setQuantityProduced] = useState("");
  const selectedProduct = products.find((product) => product.id === productId);

  const inventoryByMaterial = useMemo(
    () =>
      new Map(
        inventory.map((item) => [
          item.rawMaterial.id,
          Number(item.totalRemaining),
        ]),
      ),
    [inventory],
  );

  const expectedUsages = useMemo(() => {
    const recipe = selectedProduct?.recipe;
    const produced = Number(quantityProduced);

    if (!recipe || !Number.isFinite(produced) || produced <= 0) {
      return [];
    }

    const yieldQuantity = Number(recipe.yieldQuantity);

    if (!Number.isFinite(yieldQuantity) || yieldQuantity <= 0) {
      return [];
    }

    return recipe.items.map((item) => ({
      rawMaterial: item.rawMaterial,
      unit: item.unit,
      quantity: roundQuantity((Number(item.quantity) * produced) / yieldQuantity),
    }));
  }, [quantityProduced, selectedProduct]);

  return (
    <AdminForm
      action={createProductionRun}
      resetOnSuccess={false}
      submitLabel="Save output"
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <label className={labelClass} htmlFor="productId">
            Product <span className="text-red-700">*</span>
          </label>
          <select
            className={selectClass}
            id="productId"
            name="productId"
            onChange={(event) => setProductId(event.target.value)}
            required
            value={productId}
          >
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name} ({product.unit.abbreviation})
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-1.5">
          <label className={labelClass} htmlFor="quantityProduced">
            Quantity produced <span className="text-red-700">*</span>
          </label>
          <input
            className={fieldClass}
            id="quantityProduced"
            min="0"
            name="quantityProduced"
            onChange={(event) => setQuantityProduced(event.target.value)}
            placeholder="0.000"
            required
            step="0.001"
            type="number"
            value={quantityProduced}
          />
        </div>

        <div className="grid gap-1.5">
          <label className={labelClass} htmlFor="quantityTransferred">
            Sent to Sales
          </label>
          <input
            className={fieldClass}
            id="quantityTransferred"
            min="0"
            name="quantityTransferred"
            placeholder="All"
            step="0.001"
            type="number"
          />
        </div>

        <div className="grid gap-1.5">
          <label className={labelClass} htmlFor="wasteQuantity">
            Waste quantity
          </label>
          <input
            className={fieldClass}
            id="wasteQuantity"
            min="0"
            name="wasteQuantity"
            step="0.001"
            type="number"
          />
        </div>

        <div className="grid gap-1.5">
          <label className={labelClass} htmlFor="producedAt">
            Produced at
          </label>
          <input
            className={fieldClass}
            id="producedAt"
            name="producedAt"
            placeholder="2026-06-30T14:00"
            type="text"
          />
        </div>

        <div className="grid gap-1.5">
          <label className={labelClass} htmlFor="wasteReason">
            Waste reason
          </label>
          <input
            className={fieldClass}
            id="wasteReason"
            name="wasteReason"
            placeholder="Burnt, damaged, underweight"
            type="text"
          />
        </div>
      </div>

      {expectedUsages.length > 0 ? (
        <div className="overflow-x-auto rounded-md border border-stone-200">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-left text-xs font-medium uppercase tracking-wide text-stone-500">
                <th className="p-3">Raw material</th>
                <th className="p-3">Expected</th>
                <th className="p-3">Available</th>
                <th className="p-3">Actual used</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {expectedUsages.map((item) => {
                const available =
                  inventoryByMaterial.get(item.rawMaterial.id) ?? 0;

                return (
                  <tr key={item.rawMaterial.id}>
                    <td className="p-3 font-medium text-stone-900">
                      {item.rawMaterial.name}
                    </td>
                    <td className="p-3 text-stone-600">
                      {formatQuantity(item.quantity, item.unit.abbreviation)}
                    </td>
                    <td className="p-3 text-stone-600">
                      {formatQuantity(available, item.unit.abbreviation)}
                    </td>
                    <td className="p-3">
                      <input
                        className={fieldClass}
                        defaultValue={item.quantity.toFixed(3)}
                        key={`${productId}:${quantityProduced}:${item.rawMaterial.id}`}
                        min="0"
                        name={`usage:${item.rawMaterial.id}`}
                        step="0.001"
                        type="number"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      <TextareaField label="Notes" name="notes" placeholder="Optional" />
    </AdminForm>
  );
}
