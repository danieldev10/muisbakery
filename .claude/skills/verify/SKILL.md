---
name: verify
description: Build, run, and drive the Muis Bakery stack (NestJS API + Next.js web) to verify changes end-to-end.
---

# Verifying changes in this repo

Monorepo: `apps/api` (NestJS + Prisma, port 3001) and `apps/web` (Next.js SSR, port 3000).

## Launch

```bash
npm run dev > /tmp/muisbakery-dev.log 2>&1 &   # starts both via concurrently
# ready when: curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/auth/me → 401
#             curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/login   → 200
```

Postgres is remote (Supabase); check it's reachable with `nc -z localhost 5432` is NOT it —
the API connects via `DATABASE_URL` in `apps/api/.env`. Migrations:
`cd apps/api && npx prisma migrate deploy && npx prisma generate`.

## Auth handle

Login as the seeded admin (credentials in `apps/api/.env`, `SEED_ADMIN_*`):

```bash
curl -s -c /tmp/mb-cookies.txt -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@muisbakery.local","password":"<from .env>"}'
```

The cookie (`muisbakery_session`) works against **both** the API (3001) and the
Next.js SSR pages (3000) — server components forward it, so `curl -b` on a page
URL returns fully rendered HTML/RSC payload. Grep that for UI assertions
(badges, indicators). Note: RSC flight payload splits adjacent JSX text nodes —
match on the distinctive substring, not the full concatenated sentence.

## Useful flows

- Material request lifecycle: POST `/production/material-requests` →
  POST `/store/material-requests/:id/issue` or `/reject` (ADMIN passes all role guards).
- Production run: POST `/production/runs` with `materialUsages` (needs production
  stock — issue a request first). Recipes/yields visible at `/production/options`.
- POS: POST `/sales/pos/sessions` → PATCH `.../items` → POST `.../checkout`.
- Direct DB checks (movement ledgers aren't exposed via API): run `psql "$DIRECT_URL"`
  **from `apps/api/`** — the SSL cert path in the URL is relative (`./certs/...`).
  The pooled `DATABASE_URL` has a `pgbouncer` param psql rejects; use `DIRECT_URL`.

## Gotchas

- Dev servers run `tsx watch` / `next dev` — code changes hot-reload, no rebuild needed.
- Seeded demo data exists; verification writes (requests, runs, sales) blend in,
  but cancel/clean what you can (requests have a `/cancel` endpoint).
