import Image from "next/image";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/login-form";
import { getCurrentUser } from "@/lib/auth";
import { getRoleHome } from "@/lib/roles";

type LoginPageProps = {
  searchParams: Promise<{
    callbackUrl?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const user = await getCurrentUser();

  if (user) {
    redirect(getRoleHome(user.role));
  }

  const params = await searchParams;

  return (
    <main className="min-h-screen bg-[var(--app-bg)] px-4 py-8 text-[var(--text-primary)] sm:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md items-center">
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
                Staff workspace
              </p>
              <h1 className="mt-1 text-2xl font-semibold leading-tight text-[var(--text-primary)]">
                Muis Bakery
              </h1>
              <p className="text-sm text-[var(--text-muted)]">Sign in</p>
            </div>
          </div>

          <LoginForm callbackUrl={params.callbackUrl} />
        </section>
      </div>
    </main>
  );
}
