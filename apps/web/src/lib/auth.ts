import { cookies } from "next/headers";

import { getApiBaseUrl } from "@/lib/api";
import { type AppRole, isAppRole } from "@/lib/roles";

export type CurrentUser = {
  id: string;
  name: string | null;
  email: string;
  role: AppRole;
};

/**
 * Distinguishes "the API rejected this session" (null → send to login) from
 * "the API could not be reached at all" — the latter must not strand an
 * offline-capable POS device on the login page.
 */
export const API_UNREACHABLE = "unreachable" as const;

export type CurrentUserResult =
  | CurrentUser
  | null
  | typeof API_UNREACHABLE;

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

export async function getCurrentUser(): Promise<CurrentUserResult> {
  const cookieStore = await cookies();
  let response: Response;

  try {
    response = await fetch(`${getApiBaseUrl()}/auth/me`, {
      cache: "no-store",
      headers: {
        cookie: serializeCookies(cookieStore),
      },
    });
  } catch {
    return API_UNREACHABLE;
  }

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
