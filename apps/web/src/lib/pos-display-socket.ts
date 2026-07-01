import { getApiBaseUrl } from "@/lib/api";

function appendDisplayNamespace(apiUrl: string) {
  return `${apiUrl.replace(/\/$/, "")}/sales/pos/display`;
}

function isLoopbackHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

export function getPosDisplaySocketUrl() {
  const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL;

  if (configuredApiUrl) {
    if (typeof window !== "undefined") {
      try {
        const apiUrl = new URL(configuredApiUrl);

        if (
          isLoopbackHost(apiUrl.hostname) &&
          !isLoopbackHost(window.location.hostname)
        ) {
          apiUrl.hostname = window.location.hostname;
          return appendDisplayNamespace(apiUrl.toString());
        }
      } catch {
        return appendDisplayNamespace(configuredApiUrl);
      }
    }

    return appendDisplayNamespace(configuredApiUrl);
  }

  if (typeof window !== "undefined") {
    return appendDisplayNamespace(
      `${window.location.protocol}//${window.location.hostname}:3001`,
    );
  }

  return appendDisplayNamespace(getApiBaseUrl());
}
