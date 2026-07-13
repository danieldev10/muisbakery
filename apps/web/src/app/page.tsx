import { redirect } from "next/navigation";

import { API_UNREACHABLE, getCurrentUser } from "@/lib/auth";
import { getRoleHome } from "@/lib/roles";

export default async function Home() {
  const user = await getCurrentUser();

  if (user === API_UNREACHABLE) {
    redirect("/login?reason=api-unreachable");
  }

  if (!user) {
    redirect("/login");
  }

  redirect(getRoleHome(user.role));
}
