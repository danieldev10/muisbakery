import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const LOCAL_DATABASE_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

function createAdapter() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is required to initialize Prisma.");
  }

  const caPath = join(process.cwd(), "certs", "prod-ca-2021.crt");
  const databaseHost = new URL(connectionString).hostname;
  const ssl = !LOCAL_DATABASE_HOSTS.has(databaseHost) && existsSync(caPath)
    ? {
        ca: readFileSync(caPath, "utf8"),
        rejectUnauthorized: true,
      }
    : undefined;

  return new PrismaPg({
    connectionString,
    ssl,
  });
}

export function getPrismaClientOptions() {
  return {
    adapter: createAdapter(),
    log:
      process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  } satisfies ConstructorParameters<typeof PrismaClient>[0];
}

export function createPrismaClient() {
  return new PrismaClient(getPrismaClientOptions());
}
