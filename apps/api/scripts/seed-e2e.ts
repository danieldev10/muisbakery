import { hash } from "bcryptjs";

import { assertSafeTestDatabaseUrl } from "../src/config/test-database";
import { getTestDatabaseUrl } from "./test-database";

export const E2E_FIXTURES = {
  password: "E2ePass!123",
  users: {
    admin: {
      id: "e2e-user-admin",
      email: "admin.e2e@muisbakery.test",
      name: "E2E Admin",
    },
    sales: {
      id: "e2e-user-sales",
      email: "sales.e2e@muisbakery.test",
      name: "E2E Sales",
    },
    management: {
      id: "e2e-user-management",
      email: "management.e2e@muisbakery.test",
      name: "E2E Management",
    },
  },
  unit: {
    id: "e2e-unit-loaf",
    name: "Loaf",
    abbreviation: "loaf",
  },
  products: {
    allocated: {
      id: "e2e-product-allocated",
      name: "E2E Allocated Bread",
      size: "700g",
      price: "1200.00",
    },
    unallocated: {
      id: "e2e-product-unallocated",
      name: "E2E Unallocated Bread",
      size: "500g",
      price: "900.00",
    },
    reports: {
      id: "e2e-product-reports",
      name: "E2E Report Bread",
      size: "400g",
      price: "750.00",
    },
  },
} as const;

async function main() {
  const testDatabaseUrl = assertSafeTestDatabaseUrl(getTestDatabaseUrl()).url;
  Object.assign(process.env, {
    NODE_ENV: "test",
    DATABASE_URL: testDatabaseUrl,
    DIRECT_URL: testDatabaseUrl,
  });

  const [{ createPrismaClient }, { Role }] = await Promise.all([
    import("../src/database/prisma.client"),
    import("@prisma/client"),
  ]);
  const prisma = createPrismaClient();

  try {
    const passwordHash = await hash(E2E_FIXTURES.password, 10);
    await prisma.user.createMany({
      data: [
        {
          ...E2E_FIXTURES.users.admin,
          passwordHash,
          role: Role.ADMIN,
        },
        {
          ...E2E_FIXTURES.users.sales,
          passwordHash,
          role: Role.SALES,
        },
        {
          ...E2E_FIXTURES.users.management,
          passwordHash,
          role: Role.MANAGEMENT,
        },
      ],
    });
    await prisma.unit.create({ data: E2E_FIXTURES.unit });

    const products = Object.values(E2E_FIXTURES.products);
    await prisma.product.createMany({
      data: products.map((product) => ({
        id: product.id,
        name: product.name,
        size: product.size,
        unitId: E2E_FIXTURES.unit.id,
        unitPrice: product.price,
      })),
    });

    const now = new Date();
    const batchDate = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    await prisma.salesProductBatch.createMany({
      data: products.map((product, index) => ({
        id: `e2e-sales-batch-${index + 1}`,
        productId: product.id,
        batchNumber: 1,
        batchDate,
        quantityReceived: 1_000,
        quantityRemaining: 1_000,
        unitCost: "400.0000",
        totalCost: "400000.00",
        receivedAt: now,
        createdById: E2E_FIXTURES.users.admin.id,
      })),
    });

    console.log(
      `Seeded Stage 3 browser fixtures in ${new URL(testDatabaseUrl).pathname.slice(1)}.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
