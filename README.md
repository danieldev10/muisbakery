# Muis Bakery

Inventory, production, sales, and management system for Muis Foods.

## Production environment

Set these before deploying:

- `DATABASE_URL`: PostgreSQL connection string.
- `AUTH_JWT_SECRET`: at least 32 characters in production.
- `WEB_ORIGIN`: HTTPS origin of the web app, for example `https://muisfoods.vercel.app`.
- `INTERNAL_API_SECRET`: at least 32 characters. Use the same value on the web app so Next server-side routes can call the API.
- `API_URL`: server-side URL the Next app uses to call the Nest API.
- `NEXT_PUBLIC_API_URL`: browser-visible API URL for public/client-side calls.

Optional:

- `TRUST_PROXY_HOPS`: proxy hop count for client IP detection. Defaults to `1` in production.

## Deployment checklist

Before deploying a production release:

1. Confirm the required environment variables above are set in the API and web hosting environments.
2. Take a database backup before applying migrations.
3. Apply migrations with `npm run prisma:deploy`.
4. Do not run demo seed data in production unless the project sponsor explicitly approves it. Production seeding should only create intentional live master data/users.
5. Smoke test login, Store receiving, Production request creation, POS checkout, customer return, retailer payment, and Management profit/loss.
6. Wire the API health endpoint into the hosting monitor: `GET /health` should return `{ "ok": true }`.
7. Keep the previous deployable build available until smoke tests pass.

Rollback plan:

1. Stop new writes if a release corrupts business data or stock balances.
2. Re-deploy the last known-good API and web build.
3. Restore the pre-migration database backup if the migration/data change is not safely reversible.
4. Re-run the smoke tests above and record the incident in the project handover notes.

Operational logging:

- API requests are logged with method, URL, status, duration, and IP.
- `4xx` responses are warnings; `5xx` responses are errors.
- Failed POS checkout attempts are logged with session and actor identifiers.
- Failed login spikes are logged when throttling is triggered.

## Accepted dependency-audit exceptions

`npm audit --omit=dev` reports moderate advisories for `postcss < 8.5.10`
(GHSA-qx2v-qp2m-jg93) via the copy of PostCSS that Next.js bundles internally.
The only "fix" npm offers is downgrading to `next@9`, which is not a real
remediation. The advisory concerns XSS through unescaped `</style>` in
stringified CSS output; this app never stringifies untrusted CSS — PostCSS
runs only at build time over our own stylesheets. Accepted until Next ships a
patched internal PostCSS; re-check with each Next upgrade.
