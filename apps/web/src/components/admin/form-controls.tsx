"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

import type { FormState } from "@/lib/admin/types";

const fieldClass =
  "h-10 rounded-[5px] border border-[color:var(--border-muted)] bg-white px-3 text-sm text-[var(--text-primary)] shadow-[var(--shadow-whisper)] outline-none transition focus:border-[var(--brand-burgundy)] focus:ring-4 focus:ring-[var(--focus-ring)] disabled:bg-[var(--surface-muted)]";

const labelClass =
  "text-xs font-semibold uppercase tracking-[1.3px] text-[var(--text-muted)]";

type BaseFieldProps = {
  label: string;
  name: string;
  required?: boolean;
  defaultValue?: string | number;
  placeholder?: string;
  hint?: string;
};

export function Field({
  label,
  name,
  type = "text",
  required,
  defaultValue,
  placeholder,
  hint,
  step,
  min,
}: BaseFieldProps & {
  type?:
    | "date"
    | "datetime-local"
    | "email"
    | "number"
    | "password"
    | "tel"
    | "text";
  step?: string;
  min?: string;
}) {
  return (
    <div className="grid gap-1.5">
      <label className={labelClass} htmlFor={name}>
        {label}
        {required ? <span className="text-[var(--brand-burgundy)]"> *</span> : null}
      </label>
      <input
        className={fieldClass}
        defaultValue={defaultValue}
        id={name}
        min={min}
        name={name}
        placeholder={placeholder}
        required={required}
        step={step}
        type={type}
      />
      {hint ? <p className="text-xs text-[var(--text-muted)]">{hint}</p> : null}
    </div>
  );
}

export function SelectField({
  label,
  name,
  required,
  defaultValue,
  hint,
  options,
  placeholder,
}: BaseFieldProps & {
  options: { value: string; label: string }[];
}) {
  return (
    <div className="grid gap-1.5">
      <label className={labelClass} htmlFor={name}>
        {label}
        {required ? <span className="text-[var(--brand-burgundy)]"> *</span> : null}
      </label>
      <select
        className={fieldClass}
        defaultValue={defaultValue ?? ""}
        id={name}
        name={name}
        required={required}
      >
        {placeholder ? (
          <option disabled value="">
            {placeholder}
          </option>
        ) : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint ? <p className="text-xs text-[var(--text-muted)]">{hint}</p> : null}
    </div>
  );
}

export function TextareaField({
  label,
  name,
  required,
  defaultValue,
  placeholder,
  hint,
}: BaseFieldProps) {
  return (
    <div className="grid gap-1.5">
      <label className={labelClass} htmlFor={name}>
        {label}
        {required ? <span className="text-[var(--brand-burgundy)]"> *</span> : null}
      </label>
      <textarea
        className="min-h-20 rounded-[5px] border border-[color:var(--border-muted)] bg-white px-3 py-2 text-sm text-[var(--text-primary)] shadow-[var(--shadow-whisper)] outline-none transition focus:border-[var(--brand-burgundy)] focus:ring-4 focus:ring-[var(--focus-ring)]"
        defaultValue={defaultValue}
        id={name}
        name={name}
        placeholder={placeholder}
        required={required}
      />
      {hint ? <p className="text-xs text-[var(--text-muted)]">{hint}</p> : null}
    </div>
  );
}

export function SubmitButton({
  children,
  pendingLabel = "Saving",
}: {
  children: ReactNode;
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      className="inline-flex h-10 items-center justify-center gap-2 rounded-[5px] border border-[var(--brand-burgundy-dark)] bg-[var(--brand-burgundy)] px-4 text-sm font-semibold text-white shadow-[var(--shadow-whisper)] transition hover:bg-[var(--brand-burgundy-dark)] disabled:cursor-not-allowed disabled:border-[color:var(--border-muted)] disabled:bg-[#b2b6bd]"
      disabled={pending}
      type="submit"
    >
      {pending ? pendingLabel : children}
    </button>
  );
}

export function FormFeedback({ state }: { state: FormState }) {
  if (state.error) {
    return (
      <p className="rounded-[5px] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
        {state.error}
      </p>
    );
  }

  if (state.ok) {
    return (
      <p className="rounded-[5px] border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
        Saved.
      </p>
    );
  }

  return null;
}
