# Muis Bakery

Inventory, production, sales, and management system for Muis Bakery.

## Structure

```txt
apps/
  api/   Nest backend, Prisma, auth, database access
  web/   Next frontend
docs/    Project reference material
```

## Development

Use Node `22.13.0`.

The app-specific env files live at:

- `apps/api/.env`
- `apps/web/.env`

```bash
npm install
npm run dev
```

`npm run dev` starts both:

- Web: `http://localhost:3000`
- API: `http://localhost:3001`

You can also run them separately:

```bash
npm run dev:web
npm run dev:api
```

## Checks

```bash
npm run lint
npm run typecheck
npm run build
```

## Prisma

Prisma belongs to the API app.

```bash
npm run prisma:generate
npm run prisma:migrate
npm run prisma:deploy
npm run db:seed
```
