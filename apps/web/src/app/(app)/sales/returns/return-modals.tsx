"use client";

import { PackageX, RotateCcw, Search, X } from "lucide-react";
import {
  type ReactNode,
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useFormStatus } from "react-dom";

import { Field, FormFeedback, SelectField, TextareaField } from "@/components/admin/form-controls";
import { EmptyState } from "@/components/admin/layout";
import { type FormState, initialFormState } from "@/lib/admin/types";
import type {
  SaleItemOption,
  SalesReturnDisposition,
} from "@/lib/operations/types";
import { formatProductName } from "@/lib/product-label";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

type ProductOption = {
  label: string;
  value: string;
};

type DispositionOption = {
  label: string;
  value: SalesReturnDisposition;
};

const triggerClass =
  "inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-[5px] border border-[var(--brand-burgundy-dark)] bg-[var(--brand-burgundy)] px-4 text-sm font-semibold text-white shadow-[var(--shadow-whisper)] transition hover:bg-[var(--brand-burgundy-dark)]";

const secondaryTriggerClass =
  "inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-[5px] border border-[color:var(--border-muted)] bg-white px-4 text-sm font-semibold text-[var(--brand-burgundy)] shadow-[var(--shadow-whisper)] transition hover:border-[var(--brand-burgundy)] hover:bg-[var(--brand-tint)]";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatQuantity(value: string, unit: string) {
  return `${Number(value).toLocaleString("en", {
    maximumFractionDigits: 3,
  })} ${unit}`;
}

function ModalShell({
  children,
  description,
  onClose,
  title,
}: {
  children: ReactNode;
  description?: string;
  onClose: () => void;
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
      <div className="flex max-h-[calc(100dvh-3rem)] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-white/10 bg-white shadow-[var(--shadow-panel)]">
        <div className="shrink-0 flex items-start justify-between gap-4 border-b border-[color:var(--border-muted)] px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[1.3px] text-[var(--brand-burgundy)]">
              Sales
            </p>
            <h2 className="mt-1 text-xl font-semibold leading-tight text-[var(--text-primary)]">
              {title}
            </h2>
            {description ? (
              <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">
                {description}
              </p>
            ) : null}
          </div>
          <button
            aria-label="Close modal"
            className="inline-flex size-9 items-center justify-center rounded-[5px] border border-[color:var(--border-muted)] bg-white text-[var(--text-secondary)] transition hover:border-[var(--brand-burgundy)] hover:bg-[var(--surface-warm)] hover:text-[var(--brand-burgundy)]"
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
  disabled = false,
  pendingLabel = "Saving",
}: {
  children: ReactNode;
  disabled?: boolean;
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      className="inline-flex h-10 items-center justify-center gap-2 rounded-[5px] border border-[var(--brand-burgundy-dark)] bg-[var(--brand-burgundy)] px-4 text-sm font-semibold text-white shadow-[var(--shadow-whisper)] transition hover:bg-[var(--brand-burgundy-dark)] disabled:cursor-not-allowed disabled:border-[color:var(--border-muted)] disabled:bg-[#b2b6bd]"
      disabled={disabled || pending}
      type="submit"
    >
      {pending ? pendingLabel : children}
    </button>
  );
}

function ModalForm({
  action,
  children,
  close,
  submitDisabled,
  submitLabel,
}: {
  action: Action;
  children: ReactNode;
  close: () => void;
  submitDisabled?: boolean;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      close();
    }
  }, [close, state.ok, state.token]);

  return (
    <form action={formAction} className="grid gap-4" ref={formRef}>
      {children}
      {state.error ? <FormFeedback state={state} /> : null}
      <div className="flex justify-end gap-2">
        <button
          className="inline-flex h-10 items-center justify-center rounded-[5px] border border-[color:var(--border-muted)] bg-white px-4 text-sm font-semibold text-[var(--text-secondary)] transition hover:bg-[var(--surface-warm)]"
          onClick={close}
          type="button"
        >
          Cancel
        </button>
        <SubmitButton disabled={submitDisabled}>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}

export function DamagedStockModal({
  action,
  productOptions,
}: {
  action: Action;
  productOptions: ProductOption[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        className={secondaryTriggerClass}
        onClick={() => setOpen(true)}
        type="button"
      >
        <PackageX aria-hidden className="size-4" />
        Damaged stock
      </button>

      {open ? (
        <ModalShell
          description="Record damaged items already in Sales stock."
          onClose={() => setOpen(false)}
          title="Damaged stock"
        >
          {productOptions.length === 0 ? (
            <EmptyState>No Sales stock is available to mark as damaged.</EmptyState>
          ) : (
            <ModalForm
              action={action}
              close={() => setOpen(false)}
              submitLabel="Record damage"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField
                  label="Product"
                  name="productId"
                  options={productOptions}
                  placeholder="Select product"
                  required
                />
                <Field
                  label="Quantity"
                  min="0"
                  name="quantity"
                  required
                  step="1"
                  type="number"
                />
                <Field
                  label="Recorded at"
                  name="recordedAt"
                  type="datetime-local"
                />
              </div>
              <TextareaField
                label="Reason"
                name="reason"
                placeholder="Optional"
              />
            </ModalForm>
          )}
        </ModalShell>
      ) : null}
    </>
  );
}

function SaleItemSearch({
  items,
  selectedId,
  setSelectedId,
}: {
  items: SaleItemOption[];
  selectedId: string;
  setSelectedId: (value: string) => void;
}) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredItems = useMemo(() => {
    if (!normalizedQuery) {
      return items;
    }

    return items.filter((item) =>
      [
        `#${item.sale.saleNumber}`,
        String(item.sale.saleNumber),
        formatProductName(item.product),
        item.product.unit.abbreviation,
        item.returnableQuantity,
        formatDate(item.sale.soldAt),
      ]
        .join(" ")
        .toLocaleLowerCase()
        .includes(normalizedQuery),
    );
  }, [items, normalizedQuery]);
  const selectedItem = items.find((item) => item.id === selectedId);

  return (
    <div className="grid gap-2">
      <label
        className="text-xs font-semibold uppercase tracking-[1.3px] text-[var(--text-muted)]"
        htmlFor="sale-item-search"
      >
        Sale item <span className="text-[var(--brand-burgundy)]">*</span>
      </label>
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--text-muted)]"
        />
        <input
          className="h-10 w-full rounded-[5px] border border-[color:var(--border-muted)] bg-white pl-9 pr-3 text-sm text-[var(--text-primary)] shadow-[var(--shadow-whisper)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--brand-burgundy)] focus:ring-4 focus:ring-[var(--focus-ring)]"
          id="sale-item-search"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search sale number, product, date, or quantity"
          type="search"
          value={query}
        />
      </div>

      <input name="saleItemId" type="hidden" value={selectedId} />

      <div className="max-h-72 overflow-auto rounded-[5px] border border-[color:var(--border-muted)]">
        {filteredItems.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-[var(--text-muted)]">
            No matching sale items.
          </p>
        ) : (
          <div className="divide-y divide-[color:var(--border-muted)]">
            {filteredItems.map((item) => {
              const selected = item.id === selectedId;

              return (
                <button
                  className={
                    selected
                      ? "grid w-full gap-1 bg-[var(--brand-tint)] px-4 py-3 text-left"
                      : "grid w-full gap-1 bg-white px-4 py-3 text-left transition hover:bg-[var(--surface-warm)]"
                  }
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  type="button"
                >
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-[var(--text-primary)]">
                      Sale #{item.sale.saleNumber}
                    </span>
                    <span className="text-xs text-[var(--text-muted)]">
                      {formatDate(item.sale.soldAt)}
                    </span>
                  </span>
                  <span className="text-sm text-[var(--text-secondary)]">
                    {formatProductName(item.product)}
                  </span>
                  <span className="text-xs text-[var(--text-muted)]">
                    Returnable:{" "}
                    {formatQuantity(
                      item.returnableQuantity,
                      item.product.unit.abbreviation,
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selectedItem ? (
        <p className="rounded-[5px] border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Selected sale #{selectedItem.sale.saleNumber}:{" "}
          {formatProductName(selectedItem.product)}
        </p>
      ) : (
        <p className="text-xs text-[var(--text-muted)]">
          Search by the sale number the customer presents, then select the
          matching product line.
        </p>
      )}
    </div>
  );
}

function normalizeQuantityValue(value: string) {
  const quantity = Number(value);

  if (!Number.isFinite(quantity)) {
    return "";
  }

  return String(quantity);
}

function ReturnQuantityField({
  selectedItem,
}: {
  selectedItem?: SaleItemOption;
}) {
  const maxValue = selectedItem
    ? normalizeQuantityValue(selectedItem.returnableQuantity)
    : "";
  const maxQuantity = Number(maxValue);
  const [value, setValue] = useState(maxValue);

  return (
    <div className="grid gap-1.5">
      <label
        className="text-xs font-semibold uppercase tracking-[1.3px] text-[var(--text-muted)]"
        htmlFor="quantity"
      >
        Quantity <span className="text-[var(--brand-burgundy)]">*</span>
      </label>
      <input
        className="h-10 rounded-[5px] border border-[color:var(--border-muted)] bg-white px-3 text-sm text-[var(--text-primary)] shadow-[var(--shadow-whisper)] outline-none transition focus:border-[var(--brand-burgundy)] focus:ring-4 focus:ring-[var(--focus-ring)] disabled:bg-[var(--surface-muted)]"
        disabled={!selectedItem}
        id="quantity"
        inputMode="numeric"
        max={maxValue}
        min="1"
        name="quantity"
        onChange={(event) => {
          const nextValue = event.target.value;

          if (nextValue === "") {
            setValue("");
            return;
          }

          const nextQuantity = Number(nextValue);

          if (!Number.isFinite(nextQuantity)) {
            return;
          }

          if (nextQuantity > maxQuantity) {
            setValue(maxValue);
            return;
          }

          if (nextQuantity < 1) {
            setValue("1");
            return;
          }

          setValue(String(Math.trunc(nextQuantity)));
        }}
        required
        step="1"
        type="number"
        value={value}
      />
      {selectedItem ? (
        <p className="text-xs text-[var(--text-muted)]">
          Maximum returnable:{" "}
          {formatQuantity(
            selectedItem.returnableQuantity,
            selectedItem.product.unit.abbreviation,
          )}
        </p>
      ) : null}
    </div>
  );
}

export function CustomerReturnModal({
  action,
  dispositionOptions,
  saleItems,
}: {
  action: Action;
  dispositionOptions: DispositionOption[];
  saleItems: SaleItemOption[];
}) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const selectedItem = saleItems.find((item) => item.id === selectedId);

  return (
    <>
      <button className={triggerClass} onClick={() => setOpen(true)} type="button">
        <RotateCcw aria-hidden className="size-4" />
        Customer return
      </button>

      {open ? (
        <ModalShell
          description="Search the customer's sale number, select the product line, then record the return outcome."
          onClose={() => setOpen(false)}
          title="Customer return"
        >
          {saleItems.length === 0 ? (
            <EmptyState>No returnable sale items are available.</EmptyState>
          ) : (
            <ModalForm
              action={action}
              close={() => {
                setSelectedId("");
                setOpen(false);
              }}
              submitDisabled={!selectedId}
              submitLabel="Record return"
            >
              <SaleItemSearch
                items={saleItems}
                selectedId={selectedId}
                setSelectedId={setSelectedId}
              />
              <div className="grid gap-4 sm:grid-cols-3">
                <SelectField
                  label="Outcome"
                  name="disposition"
                  options={dispositionOptions}
                  required
                />
                <ReturnQuantityField
                  key={selectedItem?.id ?? "quantity"}
                  selectedItem={selectedItem}
                />
                <Field
                  label="Recorded at"
                  name="recordedAt"
                  type="datetime-local"
                />
              </div>
              <TextareaField
                label="Reason"
                name="reason"
                placeholder="Optional"
              />
            </ModalForm>
          )}
        </ModalShell>
      ) : null}
    </>
  );
}
