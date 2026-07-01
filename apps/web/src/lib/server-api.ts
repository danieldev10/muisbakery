import { getApiBaseUrl } from "@/lib/api";
import { getAuthCookieHeader } from "@/lib/auth";

export type ApiResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string };

export class ApiRequestError extends Error {
  constructor(
    readonly path: string,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

function extractMessage(data: unknown): string {
  if (data && typeof data === "object" && "message" in data) {
    const message = (data as { message: unknown }).message;
    if (Array.isArray(message)) {
      return String(message[0] ?? "Request failed.");
    }
    if (typeof message === "string") {
      return message;
    }
  }
  return "Request failed.";
}

/**
 * Server-side helpers for talking to the Nest API with the caller's session
 * cookie forwarded. Use from Server Components and Server Actions only.
 */

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    cache: "no-store",
    headers: {
      cookie: await getAuthCookieHeader(),
    },
  });

  const data: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiRequestError(path, response.status, extractMessage(data));
  }

  return data as T;
}

export async function apiSend<T = unknown>(
  path: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: unknown,
): Promise<ApiResult<T>> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      cookie: await getAuthCookieHeader(),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const data: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      message: extractMessage(data),
    };
  }

  return { ok: true, data: data as T };
}
