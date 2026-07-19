import "dotenv/config";

import { writeFileSync } from "node:fs";

import { hash } from "bcryptjs";
import { Role } from "@prisma/client";

import { createPrismaClient } from "../src/database/prisma.client";

const prisma = createPrismaClient();

const DEFAULT_UNITS = [
  { name: "Kilogram", abbreviation: "kg" },
  { name: "Gram", abbreviation: "g" },
  { name: "Litre", abbreviation: "L" },
  { name: "Bag", abbreviation: "bag" },
  { name: "Carton", abbreviation: "carton" },
  { name: "Crate", abbreviation: "crate" },
  { name: "Sachet", abbreviation: "sachet" },
  { name: "Loaf", abbreviation: "loaf" },
  { name: "Piece", abbreviation: "pc" },
] as const;

const adminEmail = (
  process.env.SEED_ADMIN_EMAIL ?? "admin@muisbakery.local"
).trim().toLowerCase();
const adminName = (
  process.env.SEED_ADMIN_NAME ?? "Muis Bakery Admin"
).trim();
const adminPassword = process.env.SEED_ADMIN_PASSWORD;
const resultFile = process.env.BOOTSTRAP_RESULT_FILE;

async function bootstrap() {
  if (!adminName) {
    throw new Error("SEED_ADMIN_NAME cannot be empty.");
  }

  if (!adminPassword || adminPassword.length < 12) {
    throw new Error(
      "SEED_ADMIN_PASSWORD must contain at least 12 characters for live bootstrap.",
    );
  }

  const passwordHash = await hash(adminPassword, 12);
  let adminCreated = false;

  await prisma.$transaction(async (transaction) => {
    const existingAdmin = await transaction.user.findUnique({
      where: { email: adminEmail },
    });

    if (existingAdmin) {
      if (existingAdmin.role !== Role.ADMIN) {
        throw new Error(
          `Cannot bootstrap Admin: ${adminEmail} already belongs to a non-Admin user.`,
        );
      }

      console.log(`Admin already exists: ${existingAdmin.email}`);
      console.log("Existing Admin credentials were left unchanged.");
    } else {
      const otherAdmin = await transaction.user.findFirst({
        where: { role: Role.ADMIN },
        select: { email: true },
      });

      if (otherAdmin) {
        throw new Error(
          `Cannot bootstrap a second Admin. Existing Admin: ${otherAdmin.email}`,
        );
      }

      const admin = await transaction.user.create({
        data: {
          name: adminName,
          email: adminEmail,
          passwordHash,
          role: Role.ADMIN,
          isActive: true,
        },
      });

      await transaction.auditLog.create({
        data: {
          action: "BOOTSTRAP_ADMIN_CREATED",
          entityType: "User",
          entityId: admin.id,
          actorId: admin.id,
          metadata: { email: admin.email },
        },
      });

      adminCreated = true;
      console.log("Created the initial live Admin account.");
    }

    for (const unit of DEFAULT_UNITS) {
      await transaction.unit.upsert({
        where: { abbreviation: unit.abbreviation },
        create: unit,
        update: {},
      });
    }
  });

  console.log(`Admin email: ${adminEmail}`);
  console.log(`Ensured ${DEFAULT_UNITS.length} essential measurement units.`);
  console.log("No demo users, catalogue, stock, workflows, or transactions were created.");

  if (resultFile) {
    writeFileSync(resultFile, adminCreated ? "created\n" : "existing\n", "utf8");
  }
}

bootstrap()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
