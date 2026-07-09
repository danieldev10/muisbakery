"use client";

import { Plus, Trash2 } from "lucide-react";
import { useActionState, useEffect, useState } from "react";

import { AdminModal } from "@/components/admin/form-modal";
import { FormFeedback, SubmitButton } from "@/components/admin/form-controls";
import {
  type FormState,
  initialFormState,
  type RawMaterialRecipeOption,
} from "@/lib/admin/types";

import { createRecipe } from "./actions";

type Option = { value: string; label: string };

type Row = { key: number; rawMaterialId: string; quantity: string };

const fieldClass =
  "h-10 rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-red-700 focus:ring-4 focus:ring-red-100";

let nextKey = 1;
function emptyRow(): Row {
  return { key: nextKey++, rawMaterialId: "", quantity: "" };
}

type FieldsProps = {
  products: Option[];
  rawMaterials: RawMaterialRecipeOption[];
};

/**
 * Holds the editable fields. The parent gives it a fresh `key` after a
 * successful submit so it remounts with empty inputs and a single blank row.
 */
function RecipeFields({ products, rawMaterials }: FieldsProps) {
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const materialsById = new Map(
    rawMaterials.map((material) => [material.value, material]),
  );

  function updateRow(key: number, patch: Partial<Row>) {
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <label
            className="text-sm font-medium text-stone-700"
            htmlFor="productId"
          >
            Product <span className="text-red-700">*</span>
          </label>
          <select
            className={fieldClass}
            defaultValue=""
            id="productId"
            name="productId"
            required
          >
            <option disabled value="">
              Select product
            </option>
            {products.map((product) => (
              <option key={product.value} value={product.value}>
                {product.label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <label
            className="text-sm font-medium text-stone-700"
            htmlFor="yieldQuantity"
          >
            Yield quantity
          </label>
          <input
            className={fieldClass}
            defaultValue="1"
            id="yieldQuantity"
            min="1"
            name="yieldQuantity"
            step="1"
            type="number"
          />
          <p className="text-xs text-stone-500">
            Units of product one batch of this recipe makes.
          </p>
        </div>
      </div>

      <div className="grid gap-2">
        <p className="text-sm font-medium text-stone-700">
          Ingredients <span className="text-red-700">*</span>
        </p>
        <div className="grid gap-2">
          {rows.map((row) => {
            const material = materialsById.get(row.rawMaterialId);

            return (
              <div
                className="grid grid-cols-[1fr_110px_120px_auto] items-center gap-2"
                key={row.key}
              >
                <select
                  className={fieldClass}
                  name="rawMaterialId"
                  onChange={(event) =>
                    updateRow(row.key, { rawMaterialId: event.target.value })
                  }
                  value={row.rawMaterialId}
                >
                  <option disabled value="">
                    Raw material
                  </option>
                  {rawMaterials.map((material) => (
                    <option key={material.value} value={material.value}>
                      {material.label}
                    </option>
                  ))}
                </select>
                <input
                  className={fieldClass}
                  min="1"
                  name="quantity"
                  onChange={(event) =>
                    updateRow(row.key, { quantity: event.target.value })
                  }
                  placeholder="Qty"
                  step="1"
                  type="number"
                  value={row.quantity}
                />
                <input
                  name="unitId"
                  type="hidden"
                  value={material?.unitId ?? ""}
                />
                <span className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-600">
                  {material?.unitLabel ?? "Unit"}
                </span>
                <button
                  aria-label="Remove ingredient"
                  className="grid size-10 place-items-center rounded-md border border-stone-300 text-stone-500 transition hover:bg-stone-100 disabled:opacity-40"
                  disabled={rows.length === 1}
                  onClick={() =>
                    setRows((current) =>
                      current.filter((item) => item.key !== row.key),
                    )
                  }
                  type="button"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            );
          })}
        </div>
        <div>
          <button
            className="inline-flex items-center gap-1.5 rounded-md border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-700 transition hover:bg-stone-100"
            onClick={() => setRows((current) => [...current, emptyRow()])}
            type="button"
          >
            <Plus className="size-4" />
            Add ingredient
          </button>
        </div>
      </div>
    </>
  );
}

export function RecipeForm({
  onSuccess,
  ...props
}: FieldsProps & {
  onSuccess?: () => void;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(
    createRecipe,
    initialFormState,
  );

  useEffect(() => {
    if (state.ok) {
      onSuccess?.();
    }
  }, [onSuccess, state.ok, state.token]);

  return (
    <form action={formAction} className="grid gap-4">
      <RecipeFields key={state.token ?? "initial"} {...props} />
      {state.error ? <FormFeedback state={state} /> : null}
      <div className="flex justify-end gap-2">
        {onSuccess ? (
          <button
            className="inline-flex h-10 items-center justify-center rounded-[5px] border border-[color:var(--border-muted)] bg-white px-4 text-sm font-semibold text-[var(--text-secondary)] transition hover:bg-[var(--surface-warm)]"
            onClick={onSuccess}
            type="button"
          >
            Cancel
          </button>
        ) : null}
        <SubmitButton>Create recipe</SubmitButton>
      </div>
    </form>
  );
}

export function RecipeFormModal(props: FieldsProps) {
  return (
    <AdminModal
      description="Create the raw material formula Production will use for a finished product."
      title="Add recipe"
      triggerLabel="Add recipe"
      widthClassName="max-w-3xl"
    >
      {({ close }) => <RecipeForm {...props} onSuccess={close} />}
    </AdminModal>
  );
}
