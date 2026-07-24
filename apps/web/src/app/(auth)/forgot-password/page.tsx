import Image from "next/image";

import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <main className="min-h-screen bg-[var(--app-bg)] px-4 py-8 text-[var(--text-primary)] sm:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-lg items-center">
        <section className="w-full overflow-hidden rounded-xl border border-[color:var(--border-muted)] bg-white p-6 shadow-[var(--shadow-panel)] sm:p-8">
          <div className="mb-8 flex items-center gap-3">
            <Image
              alt="Muis Bakery"
              className="size-12 rounded-[5px] border border-[color:var(--border-muted)] object-cover shadow-[var(--shadow-whisper)]"
              height={48}
              priority
              src="/logo.JPG"
              width={48}
            />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[1.3px] text-[var(--brand-burgundy)]">
                Account recovery
              </p>
              <h1 className="mt-1 text-2xl font-semibold leading-tight text-[var(--text-primary)]">
                Reset password
              </h1>
              <p className="text-sm text-[var(--text-muted)]">
                Internet access is required.
              </p>
            </div>
          </div>

          <ForgotPasswordForm />
        </section>
      </div>
    </main>
  );
}
