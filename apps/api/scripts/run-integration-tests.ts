import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

import {
  getTestDatabaseUrl,
  resetTestDatabase,
} from "./test-database";

const API_ROOT = resolve(__dirname, "..");
const INTEGRATION_TEST_ROOT = resolve(API_ROOT, "test", "integration");

function integrationTestFiles() {
  return readdirSync(INTEGRATION_TEST_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".test.ts"))
    .map((entry) => resolve(INTEGRATION_TEST_ROOT, entry.name))
    .sort();
}

async function main() {
  const testDatabaseUrl = getTestDatabaseUrl();
  const testFiles = integrationTestFiles();
  if (testFiles.length === 0) {
    throw new Error("No integration tests were found.");
  }

  for (const testFile of testFiles) {
    await resetTestDatabase(testDatabaseUrl);
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "--test", testFile],
      {
        cwd: API_ROOT,
        env: {
          ...process.env,
          NODE_ENV: "test",
          DATABASE_URL: testDatabaseUrl,
          DIRECT_URL: testDatabaseUrl,
          AUTH_JWT_SECRET: "phase-8-integration-test-secret",
          WEB_ORIGIN: "http://127.0.0.1:3100",
        },
        stdio: "inherit",
      },
    );

    if (result.error) {
      throw result.error;
    }

    if (result.status !== 0) {
      throw new Error(
        `Integration test ${testFile} failed with exit code ${result.status ?? "unknown"}.`,
      );
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
