import { userInfo } from "node:os";

import { defineConfig, devices } from "@playwright/test";

import { assertSafeTestDatabaseUrl } from "./apps/api/src/config/test-database";

const WEB_PORT = 3100;
const API_PORT = 3101;
const WEB_ORIGIN = `http://127.0.0.1:${WEB_PORT}`;
const API_ORIGIN = `http://127.0.0.1:${API_PORT}`;
const TEST_DATABASE_URL = assertSafeTestDatabaseUrl(
  process.env.TEST_DATABASE_URL ??
    `postgresql://${encodeURIComponent(userInfo().username)}@127.0.0.1:5432/muisbakery_test?schema=public`,
).url;
const AUTH_JWT_SECRET = "phase-8-browser-test-jwt-secret";
const INTERNAL_API_SECRET = "phase-8-browser-test-internal-secret";

export default defineConfig({
  testDir: "./apps/web/e2e",
  outputDir: "./test-results",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 12_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [["line"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: WEB_ORIGIN,
    serviceWorkers: "allow",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: [
    {
      command: "node dist/src/main.js",
      cwd: "./apps/api",
      url: `${API_ORIGIN}/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        NODE_ENV: "test",
        DATABASE_URL: TEST_DATABASE_URL,
        DIRECT_URL: TEST_DATABASE_URL,
        AUTH_JWT_SECRET,
        INTERNAL_API_SECRET,
        WEB_ORIGIN,
        API_PORT: String(API_PORT),
      },
    },
    {
      command: `npm run start -- -p ${WEB_PORT}`,
      cwd: "./apps/web",
      url: `${WEB_ORIGIN}/login`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        API_URL: API_ORIGIN,
        NEXT_PUBLIC_API_URL: API_ORIGIN,
        INTERNAL_API_SECRET,
      },
    },
  ],
});
