import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { getCurrentUser } from "@/lib/auth";

export default async function ProductionLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "ADMIN" && user.role !== "PRODUCTION") {
    redirect("/unauthorized");
  }

  return <div className="grid gap-6">{children}</div>;
}
