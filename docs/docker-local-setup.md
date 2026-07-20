# Local Docker Setup

This setup runs the complete application locally:

- PostgreSQL 16
- Nest API
- Next.js web application
- Prisma migrations
- First-run live bootstrap

It supports a clean bakery installation as well as explicit demo/testing mode.
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
creates the database, applies all Prisma migrations, and bootstraps the first
Admin account plus essential measurement units.

Open:

- Web application: <http://localhost:3000>
- API health check: <http://localhost:3001/health>
- PostgreSQL from the host: `localhost:5433`

The Web and API ports listen on the local network by default. Another device
can use the Docker host's private address, for example:

- Web application: `http://192.168.1.15:3000`
- API health check: `http://192.168.1.15:3001/health`

The database port remains bound to `127.0.0.1` and is not exposed to the LAN.
The host firewall must allow inbound TCP ports `3000` and `3001`.

## First Admin Login

The default bootstrap does not use a committed password. Read the generated
one-time password after the first startup:

```bash
docker compose logs setup
```

The Admin email defaults to `admin@muisbakery.local`. Change the generated
password immediately after signing in, then create the real Store, Production,
Sales, and Management users from the Admin workspace.

The live bootstrap creates no suppliers, retailers, raw materials, products,
recipes, stock, production records, sales, expenses, or other sample activity.

## Optional Demo Mode

Demo data remains available for development and demonstrations, but it must be
requested explicitly in `.env`:

```env
SEED_MODE=demo
```

Demo mode uses `MuisBakeryDemo123!` for its local sample accounts unless
`SEED_ADMIN_PASSWORD` and `SEED_DEMO_PASSWORD` are supplied. Never use demo
mode for the handed-over bakery database.

## Stop Or Restart

Stop the running containers:

```bash
docker compose down
```

Restart with the existing database:

```bash
docker compose up
```

Migrations are checked on every startup. Bootstrap or demo seeding only runs
the first time, so normal restarts do not change users or operational data.

Follow application logs:

```bash
docker compose logs -f api web
```

For encrypted off-site PostgreSQL backups to a private Supabase Storage bucket,
follow [Encrypted Supabase Database Backups](database-backups.md). The backup
service is optional and does not put Supabase in the application's live request
path.

## Back Up And Reset For Handover

Obtain sponsor/manager approval before resetting, then pull the version
containing the live bootstrap:

```bash
git pull --ff-only
```

Keep the installation's existing `.env` file and credentials unchanged. A data
reset does not require rotating `POSTGRES_PASSWORD`, `AUTH_JWT_SECRET`, or
`INTERNAL_API_SECRET`. If no `.env` file is currently used, no new one is
required for this reset. The default `SEED_MODE=bootstrap` will be used.

Next create a backup outside the Docker volume:

```bash
docker compose exec -T db pg_dump -U muisbakery -d muisbakery -Fc > muisbakery-pre-handover.dump
```

Confirm the backup file exists and is not empty. Then permanently delete the
Docker database and setup marker, and start a clean live installation:

```bash
docker compose down -v
docker compose up --build
docker compose logs setup
```

The `-v` flag is destructive. Do not use it for normal updates or restarts.

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
- `BIND_ADDRESS`: application bind address; defaults to `0.0.0.0` for LAN use.
- `POSTGRES_BIND_ADDRESS`: database bind address; defaults to `127.0.0.1`.
- `PUBLIC_HOST`: hostname or LAN IP used by browsers.
- `SEED_MODE=bootstrap`: default; create only the first Admin and units.
- `SEED_MODE=demo`: explicitly load the old demonstration dataset.
- `SEED_MODE=none`: apply migrations without creating an Admin or reference data.
- `SEED_ADMIN_PASSWORD`: optional live bootstrap password; when blank, a random
  one-time password is written to the setup container logs.

If `PUBLIC_HOST` or `API_HOST_PORT` changes, rebuild the web image because
`NEXT_PUBLIC_API_URL` is embedded during the Next.js build:

```bash
docker compose up --build
```

`PUBLIC_HOST` is optional. When it is not set, the browser automatically uses
the LAN/Tailscale IPv4 host from the page URL for the customer-display socket.
The API accepts loopback and private-network web origins in the local
development profile. Production deployments continue to accept only the
configured `WEB_ORIGIN`.

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
