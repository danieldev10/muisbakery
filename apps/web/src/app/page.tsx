import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { getRoleHome } from "@/lib/roles";

export default async function Home() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  redirect(getRoleHome(user.role));
}
