import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { NavigationProgress } from "@/components/layout/navigation-progress";
import { NotificationsBell } from "@/components/layout/notifications-bell";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { SideNav } from "@/components/layout/side-nav";
import { roleNav } from "@/lib/navigation";
import { getRoleHome, type AppRole, roleLabels } from "@/lib/roles";
import { apiGet } from "@/lib/server-api";

type AppShellProps = {
  children: ReactNode;
  user: {
    name?: string | null;
    email?: string | null;
    role: AppRole;
  };
};

type NotificationsPayload = {
  count: number;
  items: Array<{
    id: string;
    label: string;
    detail: string;
    meta: string;
    href: string;
  }>;
};

export async function AppShell({ children, user }: AppShellProps) {
  const displayName = user.name || user.email || "Staff user";
  const navItems = roleNav[user.role];
  const notifications = await apiGet<NotificationsPayload>(
    "/dashboard/notifications",
  ).catch(() => ({ count: 0, items: [] }));

  return (
    <div className="min-h-screen bg-[var(--app-bg)] text-[var(--text-primary)]">
      <NavigationProgress />
      <header className="sticky top-0 z-30 border-b border-[color:var(--border-muted)] bg-[var(--surface)] shadow-[var(--shadow-whisper)]">
        <div className="flex min-h-16 w-full items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link className="flex items-center gap-3" href={getRoleHome(user.role)}>
            <Image
              alt="Muis Bakery"
              className="size-10 rounded-md border border-[color:var(--border-muted)] object-cover"
              height={40}
              priority
              src="/logo.JPG"
              width={40}
            />
            <div className="leading-tight">
              <p className="text-sm font-semibold text-[var(--brand-burgundy)]">
                Muis Bakery
              </p>
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--text-muted)]">
                {roleLabels[user.role]} workspace
              </p>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            <NotificationsBell initialNotifications={notifications} />
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-[var(--text-primary)]">
                {displayName}
              </p>
              <p className="text-xs text-[var(--text-muted)]">{user.email}</p>
            </div>
            <SignOutButton />
          </div>
        </div>
      </header>

      <div className="flex min-h-[calc(100vh-4rem)] w-full items-start">
        <SideNav items={navItems} />

        <main className="min-w-0 flex-1 px-4 py-7 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
