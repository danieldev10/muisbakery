# Testing

## Local PostgreSQL integration database

Phase 8 integration tests use a dedicated local PostgreSQL database. Docker is
not required. PostgreSQL.app on port `5432` is supported.

The default connection is:

```text
postgresql://<macOS-user>@127.0.0.1:5432/muisbakery_test?schema=public
```

The scripts reject remote hosts and reject database names that do not end in
`_test`. This prevents test reset commands from running against Supabase,
Railway, or the normal development database.

1. Start PostgreSQL.app.
2. Create/check the isolated database:

   ```bash
   npm run test:db:start
   ```

3. Apply the real Prisma migration history:

   ```bash
   npm run test:db:migrate
   ```

4. Run the PostgreSQL integration suite:

   ```bash
   npm run test:integration
   ```

`test:integration` resets only `muisbakery_test`, reapplies all migrations
without seed data, and then runs each integration test file against a fresh
database. The concurrency suite exercises the real services and PostgreSQL
transactions. It verifies that concurrent online sales cannot oversell central
FIFO stock, retailer approvals cannot be reused, returns cannot exceed the sold
quantity, and duplicate day-close submissions or approvals produce one winner.

If the local role, password, port, or database name differs, set an explicit
safe URL for that command:

```bash
TEST_DATABASE_URL="postgresql://postgres:password@127.0.0.1:5432/muisbakery_test" npm run test:integration
```

## Playwright production browser tests

The browser suite runs Chromium against production API and Next.js builds with
the same local PostgreSQL test database. Install the browser once:

```bash
npx playwright install chromium
```

Run the complete browser suite:

```bash
npm run test:e2e
```

This command resets only `muisbakery_test`, applies every Prisma migration,
loads deterministic E2E fixtures, builds both applications, starts the API on
port `3101` and the web application on port `3100`, then runs the tests with one
worker. Failed tests retain a trace, screenshot, and video under
`test-results/`; the HTML report is written to `playwright-report/`.

The browser scenarios cover:

- online sales-counter selection and server-backed checkout;
- retailer credit tracking, paid-now exceptions, Admin approval use, and reuse prevention;
- CSV formula-injection protection on downloaded reports.

Useful focused commands:

```bash
npx playwright test apps/web/e2e/retailer-credit.spec.ts --headed
npx playwright test apps/web/e2e/report-export.spec.ts
npm run test:e2e:report
```

Run all Phase 8 unit, PostgreSQL concurrency, and browser checks together:

```bash
npm run test:phase8
```
