import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { SignOutButton } from "@/components/layout/sign-out-button";
import { SideNav } from "@/components/layout/side-nav";
import { roleNav } from "@/lib/navigation";
import { type AppRole, roleLabels } from "@/lib/roles";

type AppShellProps = {
  children: ReactNode;
  user: {
    name?: string | null;
    email?: string | null;
    role: AppRole;
  };
};

export function AppShell({ children, user }: AppShellProps) {
  const displayName = user.name || user.email || "Staff user";
  const navItems = roleNav[user.role];

  return (
    <div className="min-h-screen bg-stone-100 text-stone-950">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex min-h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link className="flex items-center gap-3" href="/dashboard">
            <Image
              alt="Muis Bakery"
              className="size-10 rounded-md object-cover"
              height={40}
              priority
              src="/logo.JPG"
              width={40}
            />
            <div className="leading-tight">
              <p className="text-sm font-semibold text-red-800">
                Muis Bakery
              </p>
              <p className="text-sm text-stone-500">
                {roleLabels[user.role]} workspace
              </p>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-stone-900">{displayName}</p>
              <p className="text-xs text-stone-500">{user.email}</p>
            </div>
            <SignOutButton />
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[240px_1fr] lg:px-8">
        <aside className="h-fit rounded-md border border-stone-200 bg-white p-3">
          <SideNav items={navItems} />
        </aside>

        <main>{children}</main>
      </div>
    </div>
  );
}
