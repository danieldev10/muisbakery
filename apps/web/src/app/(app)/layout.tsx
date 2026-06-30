import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { getCurrentUser } from "@/lib/auth";
import { isAppRole } from "@/lib/roles";

type ProtectedLayoutProps = {
  children: ReactNode;
};

export default async function ProtectedLayout({
  children,
}: ProtectedLayoutProps) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (!isAppRole(user.role)) {
    redirect("/unauthorized");
  }

  return (
    <AppShell
      user={{
        email: user.email,
        name: user.name,
        role: user.role,
      }}
    >
      {children}
    </AppShell>
  );
}
