import type { ExecutionContext } from "@nestjs/common";

export const actor = {
  id: "user-1",
  name: "Test User",
  email: "test@muisbakery.local",
  role: "ADMIN",
} as const;

export function httpContext(request: Record<string, unknown> = {}) {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

export function createAuditMock() {
  const records: unknown[] = [];

  return {
    records,
    audit: {
      record: async (entry: unknown) => {
        records.push(entry);
      },
    },
  };
}
