import { cookies } from "next/headers";

import { getApiBaseUrl } from "@/lib/api";
import { type AppRole, isAppRole } from "@/lib/roles";

export type CurrentUser = {
  id: string;
  name: string | null;
  email: string;
  role: AppRole;
};

function serializeCookies(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  return cookieStore
    .getAll()
    .map((cookie) => `${cookie.name}=${encodeURIComponent(cookie.value)}`)
    .join("; ");
}

function isCurrentUser(value: unknown): value is CurrentUser {
  if (!value || typeof value !== "object") {
    return false;
  }

  const user = value as Partial<CurrentUser>;
  return (
    typeof user.id === "string" &&
    typeof user.email === "string" &&
    isAppRole(user.role) &&
    (typeof user.name === "string" || user.name === null)
  );
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const response = await fetch(`${getApiBaseUrl()}/auth/me`, {
    cache: "no-store",
    headers: {
      cookie: serializeCookies(cookieStore),
    },
  });

  if (!response.ok) {
    return null;
  }

  const data: unknown = await response.json();
  return isCurrentUser(data) ? data : null;
}

export async function getAuthCookieHeader() {
  const cookieStore = await cookies();
  return serializeCookies(cookieStore);
}
