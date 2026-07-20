# Encrypted Supabase Database Backups

The bakery's local PostgreSQL database remains the primary database. This
optional Docker service creates consistent PostgreSQL archives, encrypts them
locally, and uploads only the encrypted files to a private Supabase Storage
bucket.

This is backup storage, not live database replication. Application requests do
not depend on Supabase, so an internet or Supabase outage does not stop local
bakery operations.

## Security Model

- PostgreSQL creates a compressed custom-format dump with `pg_dump`.
- `age` encrypts the dump before it leaves the local server.
- Supabase receives the `.dump.age` archive and its SHA-256 checksum.
- The private age recovery key must be kept outside the local server and
  outside Supabase. Store it in an approved password manager or encrypted
  offline device.
- Supabase S3 credentials are server-side credentials with broad Storage
  access. Put them only in the server's ignored `.env` file.
- Each archive has a unique UTC timestamp because Supabase Storage does not
  provide S3 object versioning.

## 1. Create The Supabase Storage Destination

In the chosen Supabase project:

1. Open **Storage** and create a private bucket named
   `muisbakery-database-backups`.
2. Open **Storage > Configuration > S3** and enable S3 access.
3. Generate a server-side S3 access key and secret.
4. Record the S3 endpoint and region shown by Supabase. The secret is only
   displayed once.

Do not use the public Supabase anon key for this service.

## 2. Create The Offline Recovery Key

Build the backup image, then generate an age identity from the repository root:

```bash
docker compose --profile backup build backup
docker compose --profile backup run --rm --no-deps \
  --entrypoint age-keygen backup > muisbakery-backup.agekey
```

The command prints a public recipient beginning with `age1` to the terminal.
Record that public recipient. Move `muisbakery-backup.agekey` to approved secure
offline storage, confirm it can be retrieved, and delete the server copy. Files
ending in `.agekey` are ignored by Git, but they still must not remain on the
server.

The public recipient is safe to place in `.env`; the private identity is not.

## 3. Configure The Local Server

Add the following to the installation's existing `.env`. Keep its current
database, JWT, and internal API secrets unchanged.

```env
COMPOSE_PROFILES=backup
SUPABASE_S3_ENDPOINT=https://YOUR_PROJECT_REF.storage.supabase.co/storage/v1/s3
SUPABASE_S3_REGION=YOUR_SUPABASE_S3_REGION
SUPABASE_S3_ACCESS_KEY_ID=YOUR_SERVER_SIDE_S3_ACCESS_KEY
SUPABASE_S3_SECRET_ACCESS_KEY=YOUR_SERVER_SIDE_S3_SECRET_KEY
SUPABASE_STORAGE_BUCKET=muisbakery-database-backups
BACKUP_AGE_RECIPIENT=age1YOUR_PUBLIC_RECIPIENT

BACKUP_PREFIX=database
BACKUP_INTERVAL_SECONDS=86400
BACKUP_RETRY_SECONDS=900
BACKUP_LOCAL_RETENTION_DAYS=7
BACKUP_TIMEZONE=Africa/Lagos
```

`BACKUP_INTERVAL_SECONDS=86400` creates one successful backup every 24 hours.
The schedule is persisted across container restarts. Failed uploads remain in
the backup volume and retry every 15 minutes; a failed upload never deletes the
local encrypted archive.

Supabase backups are not automatically deleted. Define an approved retention
policy before removing any remote archive.

## 4. Start And Test Backups

Start or update the normal stack. `COMPOSE_PROFILES=backup` makes the backup
service start with it:

```bash
docker compose up -d --build
```

Run an immediate backup without waiting for the schedule:

```bash
npm run docker:backup
```

Inspect the service log:

```bash
npm run docker:backup:logs
```

Confirm that the private Supabase bucket contains two new objects:

```text
database/muisbakery-YYYYMMDDTHHMMSSZ.dump.age
database/muisbakery-YYYYMMDDTHHMMSSZ.dump.age.sha256
```

The normal update command remains safe and preserves both PostgreSQL and local
backup volumes:

```bash
git pull --ff-only
docker compose up -d --build
```

Do not run `docker compose down -v`; `-v` deletes local database and backup
volumes.

## 5. Perform A Restore Drill

A backup is not proven until it has been restored. At least monthly, restore a
recent archive into a temporary database without touching the live database.

1. Download the `.dump.age` file and matching `.sha256` file from Supabase.
2. Put the offline private age identity on the recovery workstation only for
   the drill.
3. Verify and decrypt:

```bash
sha256sum -c muisbakery-YYYYMMDDTHHMMSSZ.dump.age.sha256
age --decrypt \
  --identity muisbakery-backup.agekey \
  --output muisbakery-restore-test.dump \
  muisbakery-YYYYMMDDTHHMMSSZ.dump.age
```

4. Copy the dump into PostgreSQL and restore it into a separate database:

```bash
docker compose exec -T db createdb -U muisbakery muisbakery_restore_test
docker compose cp muisbakery-restore-test.dump db:/tmp/muisbakery-restore-test.dump
docker compose exec -T db pg_restore \
  -U muisbakery \
  -d muisbakery_restore_test \
  --no-owner \
  --exit-on-error \
  /tmp/muisbakery-restore-test.dump
```

5. Inspect key row counts or log in against a controlled test instance, then
   remove the temporary database and decrypted dump:

```bash
docker compose exec -T db dropdb -U muisbakery muisbakery_restore_test
docker compose exec -T db rm -f /tmp/muisbakery-restore-test.dump
```

Never restore over the live `muisbakery` database without an approved recovery
window, a second verified backup, and a written rollback plan.

## Operational Checks

Check these weekly:

- `docker compose ps` shows the backup service running.
- `docker compose logs --tail=100 backup` contains a recent success timestamp.
- Supabase contains a recent encrypted archive and checksum.
- The private recovery key remains retrievable by authorized management.

Also keep a secure copy of the installation's `.env`, Compose version, and
recovery procedure. The database archive alone does not preserve deployment
secrets or server configuration.
