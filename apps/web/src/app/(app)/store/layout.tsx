import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { getCurrentUser } from "@/lib/auth";

export default async function StoreLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "ADMIN" && user.role !== "STORE") {
    redirect("/unauthorized");
  }

  return <div className="grid gap-6">{children}</div>;
}
