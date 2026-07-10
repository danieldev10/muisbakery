import assert from "node:assert/strict";
import { test } from "node:test";

import { AdminGuard } from "../src/auth/admin.guard";
import { ManagementGuard } from "../src/auth/management.guard";
import { ProductionGuard } from "../src/auth/production.guard";
import { SalesGuard } from "../src/auth/sales.guard";
import { StoreGuard } from "../src/auth/store.guard";
import { actor, httpContext } from "./helpers";

test("role guards request the expected roles and attach the authenticated user", async () => {
  const cases = [
    { Guard: AdminGuard, roles: ["ADMIN"] },
    { Guard: StoreGuard, roles: ["ADMIN", "STORE"] },
    { Guard: ProductionGuard, roles: ["ADMIN", "PRODUCTION"] },
    { Guard: SalesGuard, roles: ["ADMIN", "SALES"] },
    { Guard: ManagementGuard, roles: ["ADMIN", "MANAGEMENT"] },
  ];

  for (const { Guard, roles } of cases) {
    const request: Record<string, unknown> = {};
    const calls: string[][] = [];
    const auth = {
      requireRole: async (_request: unknown, ...allowedRoles: string[]) => {
        calls.push(allowedRoles);
        return actor;
      },
    };
    const guard = new Guard(auth as never);

    assert.equal(await guard.canActivate(httpContext(request)), true);
    assert.deepEqual(calls, [roles]);
    assert.equal(request.user, actor);
  }
});
