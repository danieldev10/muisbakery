# Local Docker Setup

This setup runs the complete application locally:

- PostgreSQL 16
- Nest API
- Next.js web application
- Prisma migrations
- First-run demo data

It is intended for local development, demonstrations, and acceptance testing.
It is not the Railway/Vercel production deployment configuration.

## Requirements

- Docker Desktop, or Docker Engine with Docker Compose v2
- Ports `3000`, `3001`, and `5433` available

## Start The System

From the repository root:

```bash
docker compose up --build
```

The first startup takes longer because Docker builds both applications,
creates the database, applies all Prisma migrations, and loads demo data.

Open:

- Web application: <http://localhost:3000>
- API health check: <http://localhost:3001/health>
- PostgreSQL from the host: `localhost:5433`

## Local Login Accounts

The default password for all seeded accounts is:

```text
MuisBakeryDemo123!
```

| Role | Email |
| --- | --- |
| Admin | `admin@muisbakery.local` |
| Store | `store@muisbakery.local` |
| Production | `production@muisbakery.local` |
| Sales | `sales@muisbakery.local` |
| Management | `management@muisbakery.local` |

These credentials are local demo defaults and must not be reused in a live
deployment.

## Stop Or Restart

Stop the running containers:

```bash
docker compose down
```

Restart with the existing database:

```bash
docker compose up
```

Migrations are checked on every startup. Demo seeding only runs the first time,
so normal restarts do not top up stock or reset the demo database.

Follow application logs:

```bash
docker compose logs -f api web
```

## Reset The Local Database

This permanently deletes the Docker database and setup marker:

```bash
docker compose down -v
docker compose up --build
```

## Configuration

The stack has working local defaults. To override them:

```bash
cp .env.docker.example .env
```

Then edit `.env`. It is ignored by Git.

Common overrides:

- `WEB_HOST_PORT`: browser port for the Next application.
- `API_HOST_PORT`: browser-visible API port.
- `POSTGRES_HOST_PORT`: PostgreSQL port exposed to the host.
- `BIND_ADDRESS`: use `0.0.0.0` when another device must connect.
- `PUBLIC_HOST`: hostname or LAN IP used by browsers.
- `SKIP_SEED=1`: apply migrations without loading demo data.

If `PUBLIC_HOST` or `API_HOST_PORT` changes, rebuild the web image because
`NEXT_PUBLIC_API_URL` is embedded during the Next.js build:

```bash
docker compose up --build
```

Use a URL-safe PostgreSQL password. The Compose file embeds it directly into
the PostgreSQL connection URL.

## Database Access

Default host connection:

```text
postgresql://muisbakery:muisbakery_local@localhost:5433/muisbakery
```

Connect with `psql`:

```bash
psql postgresql://muisbakery:muisbakery_local@localhost:5433/muisbakery
```

Inside the Compose network, the API uses `db:5432`; only host tools use port
`5433`.

The API treats the Compose hostname `db` as local PostgreSQL and does not apply
the production Supabase CA certificate to that connection.

## Troubleshooting

Inspect service status:

```bash
docker compose ps
```

Inspect setup or migration errors:

```bash
docker compose logs setup
```

Rebuild after dependency or application changes:

```bash
docker compose up --build
```

If a configured port is already in use, change the corresponding
`*_HOST_PORT` value in `.env` and rebuild.
