import "dotenv/config";

import { hash } from "bcryptjs";

import { createPrismaClient } from "../src/database/prisma.client";

const prisma = createPrismaClient();

const adminEmail = (
  process.env.SEED_ADMIN_EMAIL ?? "admin@muisbakery.local"
).toLowerCase();
const adminName = process.env.SEED_ADMIN_NAME ?? "Muis Bakery Admin";
const suppliedPassword = process.env.SEED_ADMIN_PASSWORD;

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
];

const DEFAULT_SETTINGS: Record<string, boolean> = {
  requireMaterialRequestApproval: true,
  requireStockAdjustmentApproval: true,
};

async function seedAdmin() {
  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (existingAdmin) {
    const passwordHash = suppliedPassword
      ? await hash(suppliedPassword, 12)
      : undefined;

    const admin = await prisma.user.update({
      where: { id: existingAdmin.id },
      data: {
        name: adminName,
        role: "ADMIN",
        isActive: true,
        ...(passwordHash ? { passwordHash } : {}),
      },
    });

    await prisma.auditLog.create({
      data: {
        action: "SEED_ADMIN_UPDATED",
        entityType: "User",
        entityId: admin.id,
        actorId: admin.id,
        metadata: {
          email: admin.email,
          passwordChanged: Boolean(passwordHash),
        },
      },
    });

    console.log(`Admin already exists: ${admin.email}`);
    console.log(
      passwordHash
        ? "Admin password was updated from SEED_ADMIN_PASSWORD."
        : "Admin password was left unchanged.",
    );
    return;
  }

  if (!suppliedPassword) {
    throw new Error("SEED_ADMIN_PASSWORD is required to create the first Admin.");
  }

  const passwordHash = await hash(suppliedPassword, 12);
  const admin = await prisma.user.create({
    data: {
      name: adminName,
      email: adminEmail,
      passwordHash,
      role: "ADMIN",
      isActive: true,
    },
  });

  await prisma.auditLog.create({
    data: {
      action: "SEED_ADMIN_CREATED",
      entityType: "User",
      entityId: admin.id,
      actorId: admin.id,
      metadata: { email: admin.email },
    },
  });

  console.log("Created initial Admin account.");
  console.log(`Email: ${admin.email}`);
  console.log("Password loaded from SEED_ADMIN_PASSWORD.");
}

async function seedReferenceData() {
  // Upsert keeps existing rows untouched so re-seeding never clobbers edits.
  for (const unit of DEFAULT_UNITS) {
    await prisma.unit.upsert({
      where: { abbreviation: unit.abbreviation },
      create: unit,
      update: {},
    });
  }

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await prisma.setting.upsert({
      where: { key },
      create: { key, value },
      update: {},
    });
  }

  console.log(
    `Ensured ${DEFAULT_UNITS.length} default units and approval settings.`,
  );
}

async function main() {
  await seedAdmin();
  await seedReferenceData();
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
