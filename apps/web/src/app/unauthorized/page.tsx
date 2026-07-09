import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-[var(--app-bg)] px-4 py-8 text-[var(--text-primary)]">
      <section className="w-full max-w-md rounded-xl border border-[color:var(--border-muted)] bg-white p-6 shadow-[var(--shadow-panel)]">
        <p className="text-xs font-semibold uppercase tracking-[1.3px] text-[var(--brand-burgundy)]">
          Access blocked
        </p>
        <h1 className="mt-2 text-2xl font-semibold leading-tight text-[var(--text-primary)]">
          This account cannot open that page.
        </h1>
        <Link
          className="mt-6 inline-flex h-10 items-center justify-center rounded-[5px] border border-[var(--brand-burgundy-dark)] bg-[var(--brand-burgundy)] px-4 text-sm font-semibold text-white shadow-[var(--shadow-whisper)] transition hover:bg-[var(--brand-burgundy-dark)]"
          href="/"
        >
          Back to workspace
        </Link>
      </section>
    </main>
  );
}
