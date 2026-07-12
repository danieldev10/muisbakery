import { NextResponse } from "next/server";

import { getApiBaseUrl } from "@/lib/api";
import { getAuthCookieHeader } from "@/lib/auth";
import { getInternalApiHeaders } from "@/lib/internal-api";

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

async function proxy(request: Request, context: RouteContext) {
  const { path } = await context.params;
  const url = new URL(request.url);
  const apiUrl = new URL(
    `/sales/pos/${path.join("/")}${url.search}`,
    getApiBaseUrl(),
  );
  const body =
    request.method === "GET" || request.method === "HEAD"
      ? undefined
      : await request.text();
  const apiResponse = await fetch(apiUrl, {
    method: request.method,
    cache: "no-store",
    headers: {
      "Content-Type": request.headers.get("content-type") ?? "application/json",
      cookie: await getAuthCookieHeader(),
      ...(request.headers.get("x-muisbakery-pos-terminal-secret")
        ? {
            "x-muisbakery-pos-terminal-secret": request.headers.get(
              "x-muisbakery-pos-terminal-secret",
            ) as string,
          }
        : {}),
      ...getInternalApiHeaders(),
    },
    body,
  });
  const contentType = apiResponse.headers.get("content-type") ?? "";

  if (contentType.includes("text/event-stream")) {
    return new Response(apiResponse.body, {
      status: apiResponse.status,
      headers: {
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Content-Type": "text/event-stream",
      },
    });
  }

  const data: unknown = await apiResponse.json().catch(() => ({}));

  return NextResponse.json(data, { status: apiResponse.status });
}

export async function GET(request: Request, context: RouteContext) {
  return proxy(request, context);
}

export async function POST(request: Request, context: RouteContext) {
  return proxy(request, context);
}

export async function PATCH(request: Request, context: RouteContext) {
  return proxy(request, context);
}
