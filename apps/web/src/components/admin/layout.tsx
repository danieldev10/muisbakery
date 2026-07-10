import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 border-b border-[color:var(--border-muted)] pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold leading-tight tracking-tight text-[var(--text-primary)]">
          {title}
        </h1>
        {description ? (
          <p className="mt-1.5 max-w-3xl text-sm leading-6 text-[var(--text-muted)]">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex gap-2">{actions}</div> : null}
    </div>
  );
}

export function Card({
  title,
  description,
  children,
}: {
  title?: ReactNode;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[color:var(--border-muted)] bg-[var(--surface)] p-5 shadow-[var(--shadow-whisper)]">
      {title ? (
        <div className="mb-4">
          <h2 className="text-base font-semibold leading-tight text-[var(--text-primary)]">
            {title}
          </h2>
          {description ? (
            <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">
              {description}
            </p>
          ) : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={
        active
          ? "inline-flex items-center rounded-[5px] border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800"
          : "inline-flex items-center rounded-[5px] border border-[color:var(--border-muted)] bg-[var(--surface-muted)] px-2.5 py-0.5 text-xs font-medium text-[var(--text-muted)]"
      }
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-[5px] border border-dashed border-[color:var(--border-muted)] bg-[var(--surface-warm)] px-4 py-8 text-center text-sm text-[var(--text-muted)]">
      {children}
    </p>
  );
}

export function TableShell({
  head,
  children,
}: {
  head: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-[color:var(--border-muted)]">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-[color:var(--border-muted)] bg-[var(--surface-muted)] text-left text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)] [&>th]:py-2.5 [&>th:first-child]:pl-4">
            {head}
          </tr>
        </thead>
        <tbody className="divide-y divide-[color:var(--border-muted)] bg-white [&>tr>td:first-child]:pl-4 [&>tr:hover]:bg-[var(--surface-warm)]">
          {children}
        </tbody>
      </table>
    </div>
  );
}
