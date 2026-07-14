import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import type { PrismaClient } from "@prisma/client";

import { assertSafeTestDatabaseUrl } from "../../src/config/test-database";
import { createPrismaClient } from "../../src/database/prisma.client";

let prisma: PrismaClient;

before(() => {
  assertSafeTestDatabaseUrl(process.env.DATABASE_URL ?? "");
  prisma = createPrismaClient();
});

after(async () => {
  await prisma.$disconnect();
});

test("integration database is local, isolated, and fully migrated", async () => {
  const currentDatabase = await prisma.$queryRaw<Array<{ current_database: string }>>`
    SELECT current_database()
  `;
  const migrationStatus = await prisma.$queryRaw<
    Array<{ applied: bigint; failed: bigint }>
  >`
    SELECT
      COUNT(*) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) AS applied,
      COUNT(*) FILTER (WHERE finished_at IS NULL AND rolled_back_at IS NULL) AS failed
    FROM "_prisma_migrations"
  `;

  assert.match(currentDatabase[0]?.current_database ?? "", /_test$/);
  assert.ok(Number(migrationStatus[0]?.applied ?? 0) > 0);
  assert.equal(Number(migrationStatus[0]?.failed ?? 0), 0);
});

