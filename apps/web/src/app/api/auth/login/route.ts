import { NextResponse } from "next/server";

import { getApiBaseUrl } from "@/lib/api";
import { getInternalApiHeaders } from "@/lib/internal-api";

type HeadersWithSetCookie = Headers & {
  getSetCookie?: () => string[];
};

function copySetCookieHeader(from: Response, to: NextResponse) {
  const headers = from.headers as HeadersWithSetCookie;
  const setCookies = headers.getSetCookie?.() ?? [
    from.headers.get("set-cookie"),
  ];

  for (const cookie of setCookies) {
    if (cookie) {
      to.headers.append("set-cookie", cookie);
    }
  }
}

export async function POST(request: Request) {
  const apiResponse = await fetch(`${getApiBaseUrl()}/auth/login`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": request.headers.get("content-type") ?? "application/json",
      ...getInternalApiHeaders(),
    },
    body: await request.text(),
  });

  const data: unknown = await apiResponse.json().catch(() => ({}));
  const response = NextResponse.json(data, { status: apiResponse.status });

  copySetCookieHeader(apiResponse, response);

  return response;
}
