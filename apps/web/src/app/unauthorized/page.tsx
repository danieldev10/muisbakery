import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-stone-100 px-4 py-8 text-stone-950">
      <section className="w-full max-w-md rounded-md border border-stone-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-medium text-red-800">Access blocked</p>
        <h1 className="mt-2 text-2xl font-semibold text-stone-950">
          This account cannot open that page.
        </h1>
        <Link
          className="mt-6 inline-flex h-10 items-center justify-center rounded-md bg-stone-900 px-4 text-sm font-semibold text-white transition hover:bg-stone-800"
          href="/dashboard"
        >
          Back to dashboard
        </Link>
      </section>
    </main>
  );
}
