export function getApiBaseUrl() {
  if (typeof window === "undefined") {
    return (
      process.env.API_URL ??
      process.env.NEXT_PUBLIC_API_URL ??
      "http://127.0.0.1:3001"
    );
  }

  return (
    process.env.NEXT_PUBLIC_API_URL ??
    process.env.API_URL ??
    "http://127.0.0.1:3001"
  );
}
