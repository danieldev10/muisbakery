import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

function createAdapter() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is required to initialize Prisma.");
  }

  const caPath = join(process.cwd(), "certs", "prod-ca-2021.crt");
  const ssl = existsSync(caPath)
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
