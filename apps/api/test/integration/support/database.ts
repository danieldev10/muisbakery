import { setTimeout as delay } from "node:timers/promises";

import { Client } from "pg";

import { assertSafeTestDatabaseUrl } from "../../../src/config/test-database";
import type { PrismaService } from "../../../src/database/prisma.service";

const ROW_LOCK_STATEMENTS = {
  BusinessDayState:
    'SELECT "businessDate" FROM "BusinessDayState" WHERE "businessDate" = $1 FOR UPDATE',
  PosTerminal: 'SELECT "id" FROM "PosTerminal" WHERE "id" = $1 FOR UPDATE',
  Product: 'SELECT "id" FROM "Product" WHERE "id" = $1 FOR UPDATE',
  RetailerOrderApproval:
    'SELECT "id" FROM "RetailerOrderApproval" WHERE "id" = $1 FOR UPDATE',
  SaleItem: 'SELECT "id" FROM "SaleItem" WHERE "id" = $1 FOR UPDATE',
} as const;

type LockableTable = keyof typeof ROW_LOCK_STATEMENTS;

function pgConnectionString() {
  const safe = assertSafeTestDatabaseUrl(process.env.DATABASE_URL ?? "");
  const url = new URL(safe.url);
  url.searchParams.delete("schema");
  return url.toString();
}

async function pgClient(applicationName: string) {
  const client = new Client({
    connectionString: pgConnectionString(),
    application_name: applicationName,
    ssl: false,
  });
  await client.connect();
  return client;
}

export async function resetApplicationData(prisma: PrismaService) {
  assertSafeTestDatabaseUrl(process.env.DATABASE_URL ?? "");
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename <> '_prisma_migrations'
    ORDER BY tablename
  `;

  if (tables.length === 0) {
    throw new Error("The integration database has no application tables.");
  }

  const tableList = tables
    .map(({ tablename }) => `"${tablename.replaceAll('"', '""')}"`)
    .join(", ");
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`,
  );
}

export async function holdRowLock(table: LockableTable, value: unknown) {
  const holder = await pgClient(`phase8-lock-holder-${table}`);
  const observer = await pgClient(`phase8-lock-observer-${table}`);
  let released = false;

  await holder.query("BEGIN");
  const locked = await holder.query(ROW_LOCK_STATEMENTS[table], [value]);

  if (locked.rowCount !== 1) {
    await holder.query("ROLLBACK");
    await Promise.all([holder.end(), observer.end()]);
    throw new Error(`Could not lock ${table}; the target row does not exist.`);
  }

  return {
    async waitForBlockedTransactions(minimum: number, timeoutMs = 10_000) {
      const deadline = Date.now() + timeoutMs;

      while (Date.now() < deadline) {
        const result = await observer.query<{ count: number }>(`
          SELECT COUNT(*)::int AS count
          FROM pg_stat_activity
          WHERE datname = current_database()
            AND pid <> pg_backend_pid()
            AND wait_event_type = 'Lock'
            AND state = 'active'
        `);

        if ((result.rows[0]?.count ?? 0) >= minimum) {
          return;
        }

        await delay(10);
      }

      const activity = await observer.query<{
        application_name: string;
        state: string;
        wait_event_type: string | null;
        wait_event: string | null;
        query: string;
      }>(`
        SELECT application_name, state, wait_event_type, wait_event, query
        FROM pg_stat_activity
        WHERE datname = current_database()
          AND pid <> pg_backend_pid()
        ORDER BY pid
      `);
      throw new Error(
        `Expected ${minimum} blocked transaction(s) on ${table}. Activity: ${JSON.stringify(activity.rows)}`,
      );
    },
    async release() {
      if (released) {
        return;
      }

      released = true;
      await holder.query("COMMIT");
      await Promise.all([holder.end(), observer.end()]);
    },
    async rollback() {
      if (released) {
        return;
      }

      released = true;
      await holder.query("ROLLBACK");
      await Promise.all([holder.end(), observer.end()]);
    },
  };
}

