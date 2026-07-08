"use client";

import { useMemo, useState } from "react";

import { AdminForm } from "@/components/admin/admin-form";
import { TextareaField } from "@/components/admin/form-controls";
import type {
  ProductionMaterialInventoryItem,
  ProductionProductOption,
} from "@/lib/operations/types";
import { formatProductName } from "@/lib/product-label";

import { createProductionRun } from "./actions";

const fieldClass =
  "h-10 rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-red-700 focus:ring-4 focus:ring-red-100 disabled:bg-stone-100";
const selectClass =
  "h-10 rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-red-700 focus:ring-4 focus:ring-red-100";
const labelClass = "text-sm font-medium text-stone-700";

function wholeQuantity(value: number) {
  return Math.max(1, Math.ceil(value - Number.EPSILON));
}

function formatQuantity(value: number | string, unit: string) {
  return `${Number(value).toLocaleString("en", {
    maximumFractionDigits: 0,
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
  const [usageOverrides, setUsageOverrides] = useState<Record<string, string>>(
    {},
  );
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
      quantity: wholeQuantity((Number(item.quantity) * produced) / yieldQuantity),
    }));
  }, [quantityProduced, selectedProduct]);

  // Lower-bound output implied by the recipe and the actual quantities typed
  // in: the limiting ingredient determines how many recipe batches the
  // materials could have produced.
  const expectedOutput = useMemo(() => {
    const recipe = selectedProduct?.recipe;

    if (!recipe || expectedUsages.length === 0) {
      return null;
    }

    const yieldQuantity = Number(recipe.yieldQuantity);

    if (!Number.isFinite(yieldQuantity) || yieldQuantity <= 0) {
      return null;
    }

    let limitingBatches: number | null = null;

    for (const item of recipe.items) {
      const perBatch = Number(item.quantity);

      if (!Number.isFinite(perBatch) || perBatch <= 0) {
        continue;
      }

      const fallback = expectedUsages.find(
        (usage) => usage.rawMaterial.id === item.rawMaterial.id,
      );
      const raw = usageOverrides[item.rawMaterial.id];
      const used =
        raw !== undefined && raw.trim() !== ""
          ? Number(raw)
          : (fallback?.quantity ?? 0);

      if (!Number.isFinite(used)) {
        continue;
      }

      const batches = used / perBatch;
      limitingBatches =
        limitingBatches === null ? batches : Math.min(limitingBatches, batches);
    }

    if (limitingBatches === null) {
      return null;
    }

    return Math.floor(limitingBatches * yieldQuantity + 1e-9);
  }, [expectedUsages, selectedProduct, usageOverrides]);

  const produced = Number(quantityProduced);
  const shortfall =
    expectedOutput !== null && Number.isFinite(produced) && produced > 0
      ? expectedOutput - produced
      : 0;

  function resetUsages() {
    setUsageOverrides({});
  }

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
            onChange={(event) => {
              setProductId(event.target.value);
              resetUsages();
            }}
            required
            value={productId}
          >
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {formatProductName(product)} ({product.unit.abbreviation})
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
            min="1"
            name="quantityProduced"
            onChange={(event) => {
              setQuantityProduced(event.target.value);
              resetUsages();
            }}
            placeholder="0"
            required
            step="1"
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
            step="1"
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
            step="1"
            type="number"
          />
        </div>

        <div className="grid gap-1.5">
          <label className={labelClass} htmlFor="wasteType">
            Waste type
          </label>
          <select className={selectClass} id="wasteType" name="wasteType">
            <option value="DAMAGED">Damaged (loss)</option>
            <option value="RETURNED_TO_PRODUCTION">
              Back to production (reusable)
            </option>
          </select>
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

        <div className="grid gap-1.5">
          <label className={labelClass} htmlFor="producedAt">
            Produced at
          </label>
          <input
            className={fieldClass}
            id="producedAt"
            name="producedAt"
            type="datetime-local"
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
                        min="1"
                        name={`usage:${item.rawMaterial.id}`}
                        onChange={(event) =>
                          setUsageOverrides((overrides) => ({
                            ...overrides,
                            [item.rawMaterial.id]: event.target.value,
                          }))
                        }
                        step="1"
                        type="number"
                        value={
                          usageOverrides[item.rawMaterial.id] ??
                          String(item.quantity)
                        }
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {expectedOutput !== null ? (
        shortfall > 0 ? (
          <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
            <p className="font-semibold">
              Production shortfall: {shortfall.toLocaleString("en")}{" "}
              {selectedProduct?.unit.abbreviation} below expected.
            </p>
            <p className="mt-1">
              The materials used should produce at least{" "}
              {expectedOutput.toLocaleString("en")}{" "}
              {selectedProduct?.unit.abbreviation}, but only{" "}
              {produced.toLocaleString("en")} recorded. Management will see this
              run flagged.
            </p>
          </div>
        ) : (
          <p className="rounded-md border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-600">
            Expected output from materials used: at least{" "}
            <span className="font-semibold text-stone-900">
              {expectedOutput.toLocaleString("en")}{" "}
              {selectedProduct?.unit.abbreviation}
            </span>
            .
          </p>
        )
      ) : null}

      <TextareaField label="Notes" name="notes" placeholder="Optional" />
    </AdminForm>
  );
}
