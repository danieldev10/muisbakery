import { NextResponse } from "next/server";

import { getApiBaseUrl } from "@/lib/api";
import { getInternalApiHeaders } from "@/lib/internal-api";

export async function POST(request: Request) {
  try {
    const response = await fetch(
      `${getApiBaseUrl()}/auth/password-reset/request`,
      {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          ...getInternalApiHeaders(),
        },
        body: await request.text(),
      },
    );
    const data: unknown = await response.json().catch(() => ({}));

    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json(
      { message: "Password recovery service is currently unreachable." },
      { status: 503 },
    );
  }
}
