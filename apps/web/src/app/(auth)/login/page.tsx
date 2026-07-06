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
    <main className="min-h-screen bg-stone-100 px-4 py-8 text-stone-950 sm:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md items-center">
        <section className="w-full rounded-md border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="mb-8 flex items-center gap-3">
            <Image
              alt="Muis Bakery"
              className="size-12 rounded-md object-cover"
              height={48}
              priority
              src="/logo.JPG"
              width={48}
            />
            <div>
              <h1 className="text-xl font-semibold text-stone-950">
                Muis Bakery
              </h1>
              <p className="text-sm text-stone-500">Staff sign in</p>
            </div>
          </div>

          <LoginForm callbackUrl={params.callbackUrl} />
        </section>
      </div>
    </main>
  );
}
