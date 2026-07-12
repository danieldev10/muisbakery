"use client";

import { Plus, Trash2, X } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  initialFormState,
  type RawMaterialRecipeOption,
  type Recipe,
} from "@/lib/admin/types";

import { deleteRecipe, deleteRecipeFromDetail, updateRecipe } from "./actions";

const fieldClass =
  "h-10 rounded-[5px] border border-[color:var(--border-muted)] bg-white px-3 text-sm text-[var(--text-primary)] shadow-[var(--shadow-whisper)] outline-none transition focus:border-[var(--brand-burgundy)] focus:ring-4 focus:ring-[var(--focus-ring)]";

const labelClass =
  "text-xs font-semibold uppercase tracking-[1.3px] text-[var(--text-muted)]";

type Row = { key: number; rawMaterialId: string; quantity: string };

let nextKey = 1;

function Modal({
  children,
  onClose,
  subtitle,
  title,
}: {
  children: React.ReactNode;
  onClose: () => void;
  subtitle: string;
  title: string;
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[var(--brand-near-black)]/60 px-4 py-6 backdrop-blur-sm"
      role="dialog"
    >
      <div className="flex max-h-[calc(100dvh-3rem)] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-white/10 bg-white shadow-[var(--shadow-panel)]">
        <div className="shrink-0 flex items-start justify-between gap-4 border-b border-[color:var(--border-muted)] px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[1.3px] text-[var(--brand-burgundy)]">
              Admin
            </p>
            <h2 className="mt-1 text-xl font-semibold leading-tight text-[var(--text-primary)]">
              {title}
            </h2>
            <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">
              {subtitle}
            </p>
          </div>
          <button
            aria-label="Close modal"
            className="inline-flex size-9 items-center justify-center rounded-[5px] border border-[color:var(--border-muted)] bg-white text-[var(--text-secondary)] transition hover:border-[var(--brand-burgundy)] hover:text-[var(--brand-burgundy)]"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto overscroll-contain p-5">
          {children}
        </div>
      </div>
    </div>
  );
}

function SubmitButton({
  children,
  pendingLabel,
  tone = "primary",
}: {
  children: React.ReactNode;
  pendingLabel: string;
  tone?: "primary" | "danger";
}) {
  const { pending } = useFormStatus();
  const className =
    tone === "danger"
      ? "inline-flex h-10 items-center justify-center rounded-[5px] border border-red-300 bg-white px-4 text-sm font-semibold text-red-800 shadow-[var(--shadow-whisper)] transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
      : "inline-flex h-10 items-center justify-center rounded-[5px] border border-[var(--brand-burgundy-dark)] bg-[var(--brand-burgundy)] px-4 text-sm font-semibold text-white shadow-[var(--shadow-whisper)] transition hover:bg-[var(--brand-burgundy-dark)] disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <button className={className} disabled={pending} type="submit">
      {pending ? pendingLabel : children}
    </button>
  );
}

function CancelButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      className="inline-flex h-10 items-center justify-center rounded-[5px] border border-[color:var(--border-muted)] bg-white px-4 text-sm font-semibold text-[var(--text-secondary)] transition hover:bg-[var(--surface-warm)]"
      onClick={onClose}
      type="button"
    >
      Cancel
    </button>
  );
}

function EditRecipeForm({
  onClose,
  rawMaterials,
  recipe,
}: {
  onClose: () => void;
  rawMaterials: RawMaterialRecipeOption[];
  recipe: Recipe;
}) {
  const [state, formAction] = useActionState(updateRecipe, initialFormState);
  const [rows, setRows] = useState<Row[]>(() =>
    recipe.items.map((item) => ({
      key: nextKey++,
      rawMaterialId: item.rawMaterialId,
      quantity: item.quantity,
    })),
  );

  // Include materials used by the recipe even if they were deactivated since.
  const optionsById = new Map(
    rawMaterials.map((material) => [material.value, material]),
  );
  for (const item of recipe.items) {
    if (!optionsById.has(item.rawMaterialId)) {
      optionsById.set(item.rawMaterialId, {
        value: item.rawMaterialId,
        label: `${item.rawMaterial.name} (inactive)`,
        unitId: item.unitId,
        unitLabel: item.unit.abbreviation,
      });
    }
  }
  const options = [...optionsById.values()];

  useEffect(() => {
    if (state.ok) {
      onClose();
    }
  }, [onClose, state.ok]);

  function updateRow(key: number, patch: Partial<Row>) {
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  }

  return (
    <form action={formAction} className="grid gap-4">
      <input name="id" type="hidden" value={recipe.id} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <label className={labelClass} htmlFor="edit-yield">
            Yield quantity
          </label>
          <input
            className={fieldClass}
            defaultValue={recipe.yieldQuantity}
            id="edit-yield"
            min="1"
            name="yieldQuantity"
            required
            step="1"
            type="number"
          />
          <p className="text-xs text-[var(--text-muted)]">
            Units of product one batch of this recipe makes.
          </p>
        </div>

        <div className="grid gap-1.5">
          <label className={labelClass} htmlFor="edit-status">
            Status
          </label>
          <select
            className={fieldClass}
            defaultValue={recipe.isActive ? "true" : "false"}
            id="edit-status"
            name="isActive"
          >
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </div>
      </div>

      <div className="grid gap-2">
        <p className={labelClass}>Ingredients</p>
        <div className="grid gap-2">
          {rows.map((row) => {
            const material = optionsById.get(row.rawMaterialId);

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
                  {options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
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
                <span className="rounded-[5px] border border-[color:var(--border-muted)] bg-[var(--surface-warm)] px-3 py-2 text-sm text-[var(--text-secondary)]">
                  {material?.unitLabel ?? "Unit"}
                </span>
                <button
                  aria-label="Remove ingredient"
                  className="grid size-10 place-items-center rounded-[5px] border border-[color:var(--border-muted)] text-[var(--text-muted)] transition hover:bg-[var(--surface-warm)] disabled:opacity-40"
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
            className="inline-flex items-center gap-1.5 rounded-[5px] border border-[color:var(--border-muted)] px-3 py-1.5 text-sm font-medium text-[var(--text-secondary)] transition hover:bg-[var(--surface-warm)]"
            onClick={() =>
              setRows((current) => [
                ...current,
                { key: nextKey++, rawMaterialId: "", quantity: "" },
              ])
            }
            type="button"
          >
            <Plus className="size-4" />
            Add ingredient
          </button>
        </div>
      </div>

      <div className="grid gap-1.5">
        <label className={labelClass} htmlFor="edit-notes">
          Notes
        </label>
        <input
          className={fieldClass}
          defaultValue={recipe.notes ?? ""}
          id="edit-notes"
          name="notes"
          placeholder="Optional"
          type="text"
        />
      </div>

      {state.error ? (
        <p className="rounded-[5px] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.error}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <CancelButton onClose={onClose} />
        <SubmitButton pendingLabel="Saving">Save changes</SubmitButton>
      </div>
    </form>
  );
}

export function EditRecipeButton({
  productLabel,
  rawMaterials,
  recipe,
}: {
  productLabel: string;
  rawMaterials: RawMaterialRecipeOption[];
  recipe: Recipe;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        className="inline-flex h-9 items-center justify-center rounded-[5px] border border-[color:var(--border-strong)] bg-white px-4 text-sm font-semibold text-[var(--text-secondary)] shadow-[var(--shadow-whisper)] transition hover:border-[var(--brand-burgundy)] hover:text-[var(--brand-burgundy)]"
        onClick={() => setOpen(true)}
        type="button"
      >
        Edit
      </button>

      {open ? (
        <Modal
          onClose={() => setOpen(false)}
          subtitle={productLabel}
          title="Edit recipe"
        >
          <EditRecipeForm
            onClose={() => setOpen(false)}
            rawMaterials={rawMaterials}
            recipe={recipe}
          />
        </Modal>
      ) : null}
    </>
  );
}

export function DeleteRecipeButton({
  productLabel,
  redirectAfterDelete = true,
  recipeId,
}: {
  productLabel: string;
  redirectAfterDelete?: boolean;
  recipeId: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(
    redirectAfterDelete ? deleteRecipeFromDetail : deleteRecipe,
    initialFormState,
  );

  return (
    <>
      <button
        className="inline-flex h-9 items-center justify-center rounded-[5px] border border-red-300 bg-white px-4 text-sm font-semibold text-red-800 shadow-[var(--shadow-whisper)] transition hover:bg-red-50"
        onClick={() => setOpen(true)}
        type="button"
      >
        Delete
      </button>

      {open ? (
        <Modal
          onClose={() => setOpen(false)}
          subtitle={productLabel}
          title="Delete recipe"
        >
          <p className="text-sm leading-6 text-[var(--text-secondary)]">
            This permanently removes the recipe. Production loses its expected
            material amounts and undercut checks for this product until a new
            recipe is created. Past runs keep their recorded history.
          </p>
          {state.error ? (
            <p className="mt-3 rounded-[5px] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {state.error}
            </p>
          ) : null}
          <form action={formAction} className="mt-4 flex justify-end gap-2">
            <input name="id" type="hidden" value={recipeId} />
            <CancelButton onClose={() => setOpen(false)} />
            <SubmitButton pendingLabel="Deleting" tone="danger">
              Delete recipe
            </SubmitButton>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
