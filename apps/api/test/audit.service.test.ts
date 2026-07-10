import assert from "node:assert/strict";
import { test } from "node:test";

import { AuditService } from "../src/audit/audit.service";

test("AuditService.record persists workflow audit entries with nullable optional fields", async () => {
  const writes: unknown[] = [];
  const service = new AuditService({
    auditLog: {
      create: async (entry: unknown) => {
        writes.push(entry);
      },
    },
  } as never);

  await service.record({
    action: "SALE_RECORDED",
    entityType: "Sale",
    entityId: "sale-1",
    actorId: "user-1",
    metadata: { saleNumber: 24 },
  });
  await service.record({
    action: "SYSTEM_EVENT",
    entityType: "System",
  });

  assert.deepEqual(writes, [
    {
      data: {
        action: "SALE_RECORDED",
        entityType: "Sale",
        entityId: "sale-1",
        actorId: "user-1",
        metadata: { saleNumber: 24 },
      },
    },
    {
      data: {
        action: "SYSTEM_EVENT",
        entityType: "System",
        entityId: null,
        actorId: null,
      },
    },
  ]);
});
