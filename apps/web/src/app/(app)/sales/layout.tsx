import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { API_UNREACHABLE, getCurrentUser } from "@/lib/auth";

export default async function SalesLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getCurrentUser();

  if (user === API_UNREACHABLE) {
    redirect("/login?reason=api-unreachable");
  }

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "ADMIN" && user.role !== "SALES") {
    redirect("/unauthorized");
  }

  return <div className="grid gap-6">{children}</div>;
}
