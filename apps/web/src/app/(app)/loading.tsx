const skeletonClass =
  "animate-pulse rounded-[5px] bg-[linear-gradient(90deg,var(--surface-muted),var(--brand-tint),var(--surface-muted))]";

function SkeletonBlock({ className }: { className: string }) {
  return <div className={`${skeletonClass} ${className}`} />;
}

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading page" className="grid gap-5">
      <section className="rounded-xl border border-[color:var(--border-muted)] bg-[var(--surface)] p-5 shadow-[var(--shadow-whisper)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="grid gap-3">
            <SkeletonBlock className="h-4 w-28" />
            <SkeletonBlock className="h-8 w-64 max-w-full" />
            <SkeletonBlock className="h-4 w-80 max-w-full" />
          </div>
          <SkeletonBlock className="h-10 w-36" />
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            className="rounded-xl border border-[color:var(--border-muted)] bg-[var(--surface)] p-5 shadow-[var(--shadow-whisper)]"
            key={index}
          >
            <div className="flex items-start gap-4">
              <SkeletonBlock className="size-10 shrink-0" />
              <div className="grid flex-1 gap-3">
                <SkeletonBlock className="h-4 w-28" />
                <SkeletonBlock className="h-7 w-20" />
                <SkeletonBlock className="h-3 w-32" />
              </div>
            </div>
          </div>
        ))}
      </section>

      <section className="rounded-xl border border-[color:var(--border-muted)] bg-[var(--surface)] p-5 shadow-[var(--shadow-whisper)]">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SkeletonBlock className="h-6 w-48" />
          <div className="flex gap-2">
            <SkeletonBlock className="h-10 w-32" />
            <SkeletonBlock className="h-10 w-28" />
          </div>
        </div>
        <div className="rounded-lg border border-[color:var(--border-muted)]">
          <div className="grid grid-cols-5 gap-4 border-b border-[color:var(--border-muted)] bg-[var(--surface-muted)] px-4 py-3">
            {Array.from({ length: 5 }, (_, index) => (
              <SkeletonBlock className="h-3 w-full" key={index} />
            ))}
          </div>
          <div className="divide-y divide-[color:var(--border-muted)]">
            {Array.from({ length: 7 }, (_, index) => (
              <div className="grid grid-cols-5 gap-4 px-4 py-4" key={index}>
                <SkeletonBlock className="h-5 w-full" />
                <SkeletonBlock className="h-5 w-3/4" />
                <SkeletonBlock className="h-5 w-2/3" />
                <SkeletonBlock className="h-5 w-4/5" />
                <SkeletonBlock className="h-5 w-1/2" />
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
