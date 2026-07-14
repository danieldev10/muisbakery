import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { Client } from "pg";

import {
  assertSafeTestDatabaseUrl,
  defaultLocalTestDatabaseUrl,
} from "../src/config/test-database";

type DatabaseCommand = "check" | "ensure" | "migrate" | "reset";

const API_ROOT = resolve(__dirname, "..");

export function getTestDatabaseUrl() {
  return assertSafeTestDatabaseUrl(
    process.env.TEST_DATABASE_URL?.trim() || defaultLocalTestDatabaseUrl(),
  ).url;
}

function getPrismaEnvironment(testDatabaseUrl: string) {
  return {
    ...process.env,
    NODE_ENV: "test",
    DATABASE_URL: testDatabaseUrl,
    DIRECT_URL: testDatabaseUrl,
  };
}

function getMaintenanceDatabaseUrl(testDatabaseUrl: string) {
  const maintenanceUrl = new URL(testDatabaseUrl);
  maintenanceUrl.pathname = "/postgres";
  maintenanceUrl.searchParams.delete("schema");
  return maintenanceUrl.toString();
}

async function connectToMaintenanceDatabase(testDatabaseUrl: string) {
  const client = new Client({
    connectionString: getMaintenanceDatabaseUrl(testDatabaseUrl),
    connectionTimeoutMillis: 3_000,
  });

  try {
    await client.connect();
    return client;
  } catch (error) {
    await client.end().catch(() => undefined);
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Local PostgreSQL is unavailable (${message}). Start PostgreSQL.app and try again.`,
    );
  }
}

export async function checkTestDatabaseServer(testDatabaseUrl = getTestDatabaseUrl()) {
  const safeDatabase = assertSafeTestDatabaseUrl(testDatabaseUrl);
  const client = await connectToMaintenanceDatabase(safeDatabase.url);

  try {
    const result = await client.query<{ exists: boolean }>(
      "SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = $1) AS exists",
      [safeDatabase.databaseName],
    );
    return Boolean(result.rows[0]?.exists);
  } finally {
    await client.end();
  }
}

export async function ensureTestDatabase(testDatabaseUrl = getTestDatabaseUrl()) {
  const safeDatabase = assertSafeTestDatabaseUrl(testDatabaseUrl);
  const client = await connectToMaintenanceDatabase(safeDatabase.url);

  try {
    const result = await client.query<{ exists: boolean }>(
      "SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = $1) AS exists",
      [safeDatabase.databaseName],
    );

    if (result.rows[0]?.exists) {
      console.log(`Test database \"${safeDatabase.databaseName}\" is ready.`);
      return;
    }

    const quotedName = `"${safeDatabase.databaseName.replaceAll('"', '""')}"`;
    await client.query(`CREATE DATABASE ${quotedName}`);
    console.log(`Created test database \"${safeDatabase.databaseName}\".`);
  } finally {
    await client.end();
  }
}

function runPrisma(
  args: string[],
  testDatabaseUrl: string,
  label: string,
) {
  assertSafeTestDatabaseUrl(testDatabaseUrl);
  const prismaCli = require.resolve("prisma/build/index.js");
  const result = spawnSync(process.execPath, [prismaCli, ...args], {
    cwd: API_ROOT,
    env: getPrismaEnvironment(testDatabaseUrl),
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? "unknown"}.`);
  }
}

export async function migrateTestDatabase(testDatabaseUrl = getTestDatabaseUrl()) {
  await ensureTestDatabase(testDatabaseUrl);
  runPrisma(["migrate", "deploy"], testDatabaseUrl, "Test database migration");
}

export async function resetTestDatabase(testDatabaseUrl = getTestDatabaseUrl()) {
  await ensureTestDatabase(testDatabaseUrl);
  runPrisma(
    ["migrate", "reset", "--force"],
    testDatabaseUrl,
    "Test database reset",
  );
}

async function main() {
  const command = (process.argv[2] ?? "check") as DatabaseCommand;
  const testDatabaseUrl = getTestDatabaseUrl();
  const safeDatabase = assertSafeTestDatabaseUrl(testDatabaseUrl);

  console.log(
    `Using local test database \"${safeDatabase.databaseName}\" on ${new URL(testDatabaseUrl).host}.`,
  );

  if (command === "check") {
    const exists = await checkTestDatabaseServer(testDatabaseUrl);
    console.log(exists ? "Test database exists." : "PostgreSQL is ready; test database has not been created yet.");
    return;
  }

  if (command === "ensure") {
    await ensureTestDatabase(testDatabaseUrl);
    return;
  }

  if (command === "migrate") {
    await migrateTestDatabase(testDatabaseUrl);
    return;
  }

  if (command === "reset") {
    await resetTestDatabase(testDatabaseUrl);
    return;
  }

  throw new Error(`Unknown test database command: ${command}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
