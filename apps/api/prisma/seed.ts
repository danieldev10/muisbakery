import "dotenv/config";

import { hash } from "bcryptjs";
import {
  CustomerType,
  FinishedProductStockMovementType,
  MaterialRequestStatus,
  PaymentMethod,
  Prisma,
  ProductionMaterialStockMovementType,
  RawMaterialStockMovementType,
  Role,
  SalesReturnDisposition,
} from "@prisma/client";

import { createPrismaClient } from "../src/database/prisma.client";

const prisma = createPrismaClient();

const adminEmail = (
  process.env.SEED_ADMIN_EMAIL ?? "admin@muisbakery.local"
).toLowerCase();
const adminName = process.env.SEED_ADMIN_NAME ?? "Muis Bakery Admin";
const suppliedPassword = process.env.SEED_ADMIN_PASSWORD;
const demoPassword =
  process.env.SEED_DEMO_PASSWORD ??
  process.env.SEED_ADMIN_PASSWORD ??
  "MuisBakeryDemo123!";

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

const DEFAULT_EXPENSE_CATEGORIES = [
  { name: "Rent", description: "Shop and bakery premises rent." },
  { name: "Salaries & wages", description: "Staff pay and allowances." },
  { name: "Utilities", description: "Electricity, water, and gas." },
  { name: "Fuel & generator", description: "Diesel, petrol, and generator maintenance." },
  { name: "Transport & delivery", description: "Delivery runs and logistics." },
  { name: "Packaging", description: "Nylon, wrappers, and branded packaging." },
  { name: "Equipment & maintenance", description: "Repairs and spare parts." },
  { name: "Other", description: "Anything that does not fit another category." },
];

const DEMO_SUPPLIER = {
  name: "Muis Bakery Demo Supplier",
  contactName: "Demo Procurement Desk",
  phone: "08000000000",
  email: "supplier@muisbakery.local",
  address: "Demo supply warehouse",
  notes: "Seeded supplier for workflow testing.",
};

const DEMO_RAW_MATERIALS = [
  { name: "Flour", baseUnit: "kg", targetQuantity: 1000, unitCost: 3200 },
  { name: "Sugar", baseUnit: "kg", targetQuantity: 300, unitCost: 2500 },
  { name: "Yeast", baseUnit: "kg", targetQuantity: 50, unitCost: 18000 },
  { name: "Baking Fat", baseUnit: "kg", targetQuantity: 200, unitCost: 4500 },
  { name: "Salt", baseUnit: "kg", targetQuantity: 80, unitCost: 900 },
  { name: "Milk Powder", baseUnit: "kg", targetQuantity: 120, unitCost: 8000 },
  { name: "Bread Improver", baseUnit: "kg", targetQuantity: 30, unitCost: 22000 },
  { name: "Coconut Flakes", baseUnit: "kg", targetQuantity: 120, unitCost: 6500 },
  { name: "Banana Puree", baseUnit: "kg", targetQuantity: 150, unitCost: 3000 },
  { name: "Water", baseUnit: "L", targetQuantity: 1000, unitCost: 100 },
  { name: "Butter", baseUnit: "kg", targetQuantity: 100, unitCost: 9000 },
  { name: "Eggs", baseUnit: "pc", targetQuantity: 1000, unitCost: 250 },
] as const;

const DEMO_PRODUCTS = [
  {
    name: "Full Loaf Bread",
    unitPrice: 1200,
    yieldQuantity: 100,
    ingredients: [
      ["Flour", 50],
      ["Sugar", 5],
      ["Yeast", 0.8],
      ["Baking Fat", 2],
      ["Salt", 1],
      ["Water", 30],
      ["Bread Improver", 0.4],
    ],
  },
  {
    name: "Sliced Bread",
    unitPrice: 1500,
    yieldQuantity: 100,
    ingredients: [
      ["Flour", 45],
      ["Sugar", 4.5],
      ["Yeast", 0.75],
      ["Baking Fat", 2],
      ["Salt", 0.9],
      ["Water", 28],
      ["Milk Powder", 1.5],
      ["Bread Improver", 0.35],
    ],
  },
  {
    name: "Coconut Bread",
    unitPrice: 1700,
    yieldQuantity: 100,
    ingredients: [
      ["Flour", 40],
      ["Sugar", 6],
      ["Yeast", 0.7],
      ["Baking Fat", 3],
      ["Salt", 0.8],
      ["Water", 25],
      ["Coconut Flakes", 5],
      ["Milk Powder", 2],
    ],
  },
  {
    name: "Banana Bread",
    unitPrice: 1800,
    yieldQuantity: 100,
    ingredients: [
      ["Flour", 35],
      ["Sugar", 5],
      ["Yeast", 0.6],
      ["Baking Fat", 2.5],
      ["Salt", 0.7],
      ["Water", 20],
      ["Banana Puree", 8],
      ["Milk Powder", 1.5],
    ],
  },
] as const;

const DEMO_ROLE_USERS = [
  {
    name: "Muis Bakery Store",
    email: "store@muisbakery.local",
    role: Role.STORE,
  },
  {
    name: "Muis Bakery Production",
    email: "production@muisbakery.local",
    role: Role.PRODUCTION,
  },
  {
    name: "Muis Bakery Sales",
    email: "sales@muisbakery.local",
    role: Role.SALES,
  },
  {
    name: "Muis Bakery Management",
    email: "management@muisbakery.local",
    role: Role.MANAGEMENT,
  },
] as const;

const DEMO_PRODUCTION_STOCK_TARGETS = [
  ["Flour", 350],
  ["Sugar", 60],
  ["Yeast", 8],
  ["Baking Fat", 30],
  ["Salt", 15],
  ["Water", 220],
  ["Bread Improver", 6],
  ["Milk Powder", 18],
  ["Coconut Flakes", 20],
  ["Banana Puree", 20],
] as const;

const DEMO_PRODUCTION_RUNS = [
  {
    productName: "Full Loaf Bread",
    quantityProduced: 180,
    quantityTransferred: 174,
    wasteQuantity: 6,
    wasteReason: "Underweight loaves",
    producedHoursAgo: 30,
  },
  {
    productName: "Sliced Bread",
    quantityProduced: 150,
    quantityTransferred: 146,
    wasteQuantity: 4,
    wasteReason: "Packaging damage",
    producedHoursAgo: 24,
  },
  {
    productName: "Coconut Bread",
    quantityProduced: 120,
    quantityTransferred: 116,
    wasteQuantity: 4,
    wasteReason: "Overbaked batch",
    producedHoursAgo: 18,
  },
  {
    productName: "Banana Bread",
    quantityProduced: 80,
    quantityTransferred: 77,
    wasteQuantity: 3,
    wasteReason: "Damaged during cooling",
    producedHoursAgo: 10,
  },
] as const;

const DEMO_WORKFLOW_MARKER = "DEMO-WORKFLOW";

const DEMO_SALES = [
  {
    label: "Morning counter sales",
    customerName: "Walk-in customers",
    paymentMethod: PaymentMethod.CASH,
    soldHoursAgo: 5,
    discount: 0,
    items: [
      ["Full Loaf Bread", 20],
      ["Sliced Bread", 15],
    ],
  },
  {
    label: "Office supply order",
    customerName: "Office pantry order",
    paymentMethod: PaymentMethod.TRANSFER,
    soldHoursAgo: 3,
    discount: 1000,
    items: [
      ["Sliced Bread", 12],
      ["Coconut Bread", 10],
    ],
  },
  {
    label: "Credit customer pickup",
    customerName: "Neighbourhood shop",
    paymentMethod: PaymentMethod.CREDIT,
    soldHoursAgo: 1,
    discount: 0,
    amountPaid: 5000,
    items: [
      ["Full Loaf Bread", 10],
      ["Banana Bread", 8],
    ],
  },
] as const;

const DEMO_RETAILERS = [
  {
    name: "Amina Stores",
    contactPerson: "Amina Yusuf",
    phone: "08030000001",
    email: "amina.stores@muisbakery.local",
    address: "Market Road retail kiosk",
    creditLimit: 500000,
    notes: "Seeded retailer account for credit-limit sales testing.",
  },
  {
    name: "Neighbourhood Shop",
    contactPerson: "Retail Desk",
    phone: "08030000002",
    email: "neighbourhood.shop@muisbakery.local",
    address: "Neighbourhood estate store",
    creditLimit: 350000,
    notes: "Seeded retailer account for credit-limit sales testing.",
  },
] as const;

const DEMO_EXPENSES = [
  {
    categoryName: "Rent",
    amount: 150000,
    incurredDaysAgo: 8,
    vendor: "Muis Bakery Premises",
    paymentMethod: PaymentMethod.TRANSFER,
    note: "Monthly bakery premises rent.",
  },
  {
    categoryName: "Salaries & wages",
    amount: 220000,
    incurredDaysAgo: 6,
    vendor: "Staff payroll",
    paymentMethod: PaymentMethod.TRANSFER,
    note: "Weekly staff wage run.",
  },
  {
    categoryName: "Utilities",
    amount: 38500,
    incurredDaysAgo: 4,
    vendor: "Electricity and water",
    paymentMethod: PaymentMethod.TRANSFER,
    note: "Electricity and water payment.",
  },
  {
    categoryName: "Fuel & generator",
    amount: 52000,
    incurredDaysAgo: 3,
    vendor: "Generator fuel supplier",
    paymentMethod: PaymentMethod.CASH,
    note: "Generator fuel for production week.",
  },
  {
    categoryName: "Packaging",
    amount: 28000,
    incurredDaysAgo: 2,
    vendor: "Packaging supplier",
    paymentMethod: PaymentMethod.POS,
    note: "Bread wrappers and carry bags.",
  },
] as const;

function toBatchDate(value: Date) {
  return new Date(
    Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()),
  );
}

function roundQuantity(value: number) {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function decimalToNumber(value: Prisma.Decimal | number | string) {
  return Number(value.toString());
}

function hoursAgo(hours: number) {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

function currentMonthDateDaysAgo(daysAgo: number) {
  const today = new Date();
  const dayOfMonth = Math.max(1, today.getUTCDate() - daysAgo);

  return new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), dayOfMonth),
  );
}

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
        ...(passwordHash
          ? { passwordHash, authVersion: { increment: 1 } }
          : {}),
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
    return admin;
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
  return admin;
}

async function seedDemoRoleUsers(adminId: string) {
  const passwordHash = await hash(demoPassword, 12);
  const users = new Map<
    Role,
    Awaited<ReturnType<typeof prisma.user.upsert>>
  >();

  for (const demoUser of DEMO_ROLE_USERS) {
    const user = await prisma.user.upsert({
      where: { email: demoUser.email },
      create: {
        name: demoUser.name,
        email: demoUser.email,
        passwordHash,
        role: demoUser.role,
        isActive: true,
        createdById: adminId,
      },
      update: {
        name: demoUser.name,
        passwordHash,
        authVersion: { increment: 1 },
        role: demoUser.role,
        isActive: true,
      },
    });

    users.set(demoUser.role, user);
  }

  const store = users.get(Role.STORE);
  const production = users.get(Role.PRODUCTION);
  const sales = users.get(Role.SALES);
  const management = users.get(Role.MANAGEMENT);

  if (!store || !production || !sales || !management) {
    throw new Error("Demo role users were not created.");
  }

  console.log(
    `Ensured demo users for Store, Production, Sales, and Management. Password source: ${
      process.env.SEED_DEMO_PASSWORD
        ? "SEED_DEMO_PASSWORD"
        : process.env.SEED_ADMIN_PASSWORD
          ? "SEED_ADMIN_PASSWORD"
          : "built-in demo fallback"
    }.`,
  );

  return { store, production, sales, management };
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

  for (const category of DEFAULT_EXPENSE_CATEGORIES) {
    await prisma.expenseCategory.upsert({
      where: { name: category.name },
      create: category,
      update: {},
    });
  }

  console.log(
    `Ensured ${DEFAULT_UNITS.length} default units, ${DEFAULT_EXPENSE_CATEGORIES.length} expense categories, and approval settings.`,
  );
}

async function seedDemoRetailers(salesUserId: string) {
  for (const retailer of DEMO_RETAILERS) {
    await prisma.retailer.upsert({
      where: { name: retailer.name },
      create: {
        ...retailer,
        creditLimit: new Prisma.Decimal(retailer.creditLimit.toFixed(2)),
        createdById: salesUserId,
      },
      update: {
        contactPerson: retailer.contactPerson,
        phone: retailer.phone,
        email: retailer.email,
        address: retailer.address,
        creditLimit: new Prisma.Decimal(retailer.creditLimit.toFixed(2)),
        notes: retailer.notes,
        isActive: true,
      },
    });
  }

  console.log(`Ensured ${DEMO_RETAILERS.length} demo retailer accounts.`);
}

async function getUnitMap() {
  const units = await prisma.unit.findMany();
  return new Map(units.map((unit) => [unit.abbreviation, unit]));
}

async function seedDemoCatalogue() {
  const unitMap = await getUnitMap();
  const materialByName = new Map<
    string,
    Awaited<ReturnType<typeof prisma.rawMaterial.upsert>>
  >();

  for (const material of DEMO_RAW_MATERIALS) {
    const unit = unitMap.get(material.baseUnit);

    if (!unit) {
      throw new Error(`Missing unit ${material.baseUnit}.`);
    }

    const rawMaterial = await prisma.rawMaterial.upsert({
      where: { name: material.name },
      create: {
        name: material.name,
        description: `Seeded ${material.name.toLowerCase()} for workflow testing.`,
        baseUnitId: unit.id,
        unitCost: material.unitCost,
        isActive: true,
      },
      update: {
        baseUnitId: unit.id,
        unitCost: material.unitCost,
        isActive: true,
      },
    });

    materialByName.set(material.name, rawMaterial);
  }

  const loafUnit = unitMap.get("loaf");

  if (!loafUnit) {
    throw new Error("Missing loaf unit.");
  }

  for (const demoProduct of DEMO_PRODUCTS) {
    const product = await prisma.product.upsert({
      where: { name_size: { name: demoProduct.name, size: "" } },
      create: {
        name: demoProduct.name,
        size: "",
        description: `Seeded ${demoProduct.name.toLowerCase()} for testing.`,
        unitId: loafUnit.id,
        unitPrice: demoProduct.unitPrice,
        retailerPrice: demoProduct.unitPrice,
        discountPercent: 0,
        isActive: true,
      },
      update: {
        unitId: loafUnit.id,
        unitPrice: demoProduct.unitPrice,
        retailerPrice: demoProduct.unitPrice,
        discountPercent: 0,
        isActive: true,
      },
    });

    const recipe = await prisma.recipe.upsert({
      where: { productId: product.id },
      create: {
        productId: product.id,
        yieldQuantity: demoProduct.yieldQuantity,
        notes: `Seeded recipe for ${demoProduct.name}. Quantities yield ${demoProduct.yieldQuantity} loaves.`,
        isActive: true,
      },
      update: {
        yieldQuantity: demoProduct.yieldQuantity,
        notes: `Seeded recipe for ${demoProduct.name}. Quantities yield ${demoProduct.yieldQuantity} loaves.`,
        isActive: true,
      },
    });

    await prisma.recipeItem.deleteMany({
      where: { recipeId: recipe.id },
    });

    await prisma.recipeItem.createMany({
      data: demoProduct.ingredients.map(([materialName, quantity]) => {
        const rawMaterial = materialByName.get(materialName);

        if (!rawMaterial) {
          throw new Error(`Missing raw material ${materialName}.`);
        }

        return {
          recipeId: recipe.id,
          rawMaterialId: rawMaterial.id,
          quantity,
          unitId: rawMaterial.baseUnitId,
        };
      }),
    });
  }

  console.log(
    `Ensured ${DEMO_RAW_MATERIALS.length} demo raw materials, ${DEMO_PRODUCTS.length} products, and recipes.`,
  );
}

async function topUpStoreStock(adminId: string) {
  const supplier = await prisma.supplier.upsert({
    where: { name: DEMO_SUPPLIER.name },
    create: DEMO_SUPPLIER,
    update: {
      ...DEMO_SUPPLIER,
      isActive: true,
    },
  });

  const receivedAt = new Date();
  const batchDate = toBatchDate(receivedAt);
  let toppedUpCount = 0;

  for (const material of DEMO_RAW_MATERIALS) {
    const rawMaterial = await prisma.rawMaterial.findUniqueOrThrow({
      where: { name: material.name },
      include: { baseUnit: true },
    });
    const unitCost = rawMaterial.unitCost ?? material.unitCost;

    const batches = await prisma.rawMaterialBatch.findMany({
      where: { rawMaterialId: rawMaterial.id },
      select: { quantityRemaining: true },
    });
    const currentQuantity = batches.reduce(
      (sum, batch) => sum + Number(batch.quantityRemaining.toString()),
      0,
    );
    const quantityToAdd = roundQuantity(
      material.targetQuantity - currentQuantity,
    );

    if (quantityToAdd <= 0) {
      continue;
    }

    const batch = await prisma.$transaction(
      async (tx) => {
        const existingBatch = await tx.rawMaterialBatch.findUnique({
          where: {
            rawMaterialId_batchDate: {
              rawMaterialId: rawMaterial.id,
              batchDate,
            },
          },
        });

        const activeBatch = existingBatch
          ? await tx.rawMaterialBatch.update({
              where: { id: existingBatch.id },
              data: {
                quantityReceived: { increment: quantityToAdd },
                quantityRemaining: { increment: quantityToAdd },
                supplierId: existingBatch.supplierId ?? supplier.id,
                unitCost: existingBatch.unitCost ?? unitCost,
                reference: existingBatch.reference ?? "DEMO-SEED",
                notes: existingBatch.notes ?? "Demo stock top-up",
              },
            })
          : await tx.rawMaterialBatch.create({
              data: {
                rawMaterialId: rawMaterial.id,
                supplierId: supplier.id,
                batchNumber:
                  ((await tx.rawMaterialBatch.findFirst({
                    where: { rawMaterialId: rawMaterial.id },
                    orderBy: { batchNumber: "desc" },
                    select: { batchNumber: true },
                  }))?.batchNumber ?? 0) + 1,
                batchDate,
                quantityReceived: quantityToAdd,
                quantityRemaining: quantityToAdd,
                unitCost,
                receivedAt,
                reference: "DEMO-SEED",
                notes: "Demo stock top-up",
                createdById: adminId,
              },
            });

        const receipt = await tx.rawMaterialReceipt.create({
          data: {
            rawMaterialId: rawMaterial.id,
            batchId: activeBatch.id,
            supplierId: supplier.id,
            quantity: quantityToAdd,
            unitCost,
            receivedAt,
            reference: "DEMO-SEED",
            notes: `Seeded ${quantityToAdd} ${rawMaterial.baseUnit.abbreviation} for workflow testing.`,
            createdById: adminId,
          },
        });

        await tx.rawMaterialStockMovement.create({
          data: {
            rawMaterialId: rawMaterial.id,
            batchId: activeBatch.id,
            receiptId: receipt.id,
            type: "RECEIVE",
            quantity: quantityToAdd,
            balanceAfter: activeBatch.quantityRemaining,
            actorId: adminId,
            note: "Demo stock top-up",
          },
        });

        return activeBatch;
      },
      { timeout: 15000, maxWait: 15000 },
    );

    toppedUpCount += 1;
    console.log(
      `Topped up ${material.name}: +${quantityToAdd} ${rawMaterial.baseUnit.abbreviation} in batch ${batch.batchNumber}.`,
    );
  }

  console.log(
    toppedUpCount === 0
      ? "Store raw material stock already meets demo targets."
      : `Topped up Store stock for ${toppedUpCount} raw materials.`,
  );
}

async function issueMaterialRequestForSeed(
  tx: Prisma.TransactionClient,
  requestId: string,
  issueQuantity: number,
  storeUserId: string,
  note: string,
) {
  await tx.$queryRaw(
    Prisma.sql`SELECT "id" FROM "MaterialRequest" WHERE "id" = ${requestId} FOR UPDATE`,
  );

  const request = await tx.materialRequest.findUniqueOrThrow({
    where: { id: requestId },
    include: {
      rawMaterial: {
        include: { baseUnit: true },
      },
    },
  });

  const requestedQuantity = decimalToNumber(request.requestedQuantity);
  const issuedQuantity = decimalToNumber(request.issuedQuantity);
  const remainingRequestQuantity = roundQuantity(
    requestedQuantity - issuedQuantity,
  );

  if (issueQuantity > remainingRequestQuantity) {
    throw new Error(
      `Cannot issue ${issueQuantity} ${request.rawMaterial.baseUnit.abbreviation} of ${request.rawMaterial.name}; only ${remainingRequestQuantity} remains on the request.`,
    );
  }

  const lockedBatchIds = await tx.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`
      SELECT "id"
      FROM "RawMaterialBatch"
      WHERE "rawMaterialId" = ${request.rawMaterialId}
        AND "quantityRemaining" > 0
      ORDER BY "receivedAt" ASC, "batchNumber" ASC
      FOR UPDATE
    `,
  );
  const batches =
    lockedBatchIds.length > 0
      ? await tx.rawMaterialBatch.findMany({
          where: { id: { in: lockedBatchIds.map((batch) => batch.id) } },
          orderBy: [{ receivedAt: "asc" }, { batchNumber: "asc" }],
        })
      : [];
  const availableQuantity = batches.reduce(
    (sum, batch) => sum + decimalToNumber(batch.quantityRemaining),
    0,
  );

  if (availableQuantity < issueQuantity) {
    throw new Error(
      `Store only has ${roundQuantity(availableQuantity).toFixed(3)} ${request.rawMaterial.baseUnit.abbreviation} of ${request.rawMaterial.name}.`,
    );
  }

  let remainingToIssue = issueQuantity;

  for (const batch of batches) {
    if (remainingToIssue <= 0) {
      break;
    }

    const batchRemaining = decimalToNumber(batch.quantityRemaining);
    const quantityFromBatch = roundQuantity(
      Math.min(batchRemaining, remainingToIssue),
    );
    const balanceAfter = roundQuantity(batchRemaining - quantityFromBatch);

    await tx.rawMaterialBatch.update({
      where: { id: batch.id },
      data: { quantityRemaining: balanceAfter },
    });

    await tx.rawMaterialStockMovement.create({
      data: {
        rawMaterialId: request.rawMaterialId,
        batchId: batch.id,
        type: RawMaterialStockMovementType.ISSUE,
        quantity: quantityFromBatch,
        balanceAfter,
        actorId: storeUserId,
        note,
      },
    });

    const materialIssue = await tx.materialRequestIssue.create({
      data: {
        requestId: request.id,
        batchId: batch.id,
        quantity: quantityFromBatch,
        issuedById: storeUserId,
      },
    });

    const productionBatch = await tx.productionMaterialStockBatch.create({
      data: {
        rawMaterialId: request.rawMaterialId,
        materialRequestId: request.id,
        materialRequestIssueId: materialIssue.id,
        storeBatchId: batch.id,
        quantityReceived: quantityFromBatch,
        quantityRemaining: quantityFromBatch,
        receivedAt: materialIssue.createdAt,
        createdById: storeUserId,
      },
    });

    await tx.productionMaterialStockMovement.create({
      data: {
        rawMaterialId: request.rawMaterialId,
        productionBatchId: productionBatch.id,
        type: ProductionMaterialStockMovementType.RECEIVE_FROM_STORE,
        quantity: quantityFromBatch,
        balanceAfter: quantityFromBatch,
        actorId: storeUserId,
        note,
      },
    });

    remainingToIssue = roundQuantity(remainingToIssue - quantityFromBatch);
  }

  const nextIssuedQuantity = roundQuantity(issuedQuantity + issueQuantity);

  await tx.materialRequest.update({
    where: { id: request.id },
    data: {
      issuedQuantity: nextIssuedQuantity,
      status:
        nextIssuedQuantity >= requestedQuantity
          ? MaterialRequestStatus.FULFILLED
          : MaterialRequestStatus.PARTIALLY_ISSUED,
      issuedById: storeUserId,
      fulfilledAt:
        nextIssuedQuantity >= requestedQuantity ? new Date() : null,
      responseNotes: note,
    },
  });
}

async function topUpProductionStockForTesting(
  productionUserId: string,
  storeUserId: string,
) {
  let requestCount = 0;

  for (const [materialName, targetQuantity] of DEMO_PRODUCTION_STOCK_TARGETS) {
    const rawMaterial = await prisma.rawMaterial.findUniqueOrThrow({
      where: { name: materialName },
      include: { baseUnit: true },
    });
    const currentStock = await prisma.productionMaterialStockBatch.aggregate({
      where: { rawMaterialId: rawMaterial.id },
      _sum: { quantityRemaining: true },
    });
    const currentQuantity = currentStock._sum.quantityRemaining
      ? decimalToNumber(currentStock._sum.quantityRemaining)
      : 0;
    const quantityToRequest = roundQuantity(targetQuantity - currentQuantity);

    if (quantityToRequest <= 0) {
      continue;
    }

    await prisma.$transaction(
      async (tx) => {
        const request = await tx.materialRequest.create({
          data: {
            rawMaterialId: rawMaterial.id,
            requestedQuantity: quantityToRequest,
            requestedById: productionUserId,
            neededBy: hoursAgo(-24),
            notes: `${DEMO_WORKFLOW_MARKER}: Production stock top-up for ${materialName}.`,
          },
        });

        await issueMaterialRequestForSeed(
          tx,
          request.id,
          quantityToRequest,
          storeUserId,
          `${DEMO_WORKFLOW_MARKER}: Store approved demo request for ${materialName}.`,
        );
      },
      { timeout: 15000, maxWait: 15000 },
    );

    requestCount += 1;
    console.log(
      `Created and issued demo request for ${materialName}: ${quantityToRequest} ${rawMaterial.baseUnit.abbreviation}.`,
    );
  }

  console.log(
    requestCount === 0
      ? "Production raw material stock already meets demo workflow targets."
      : `Created and issued ${requestCount} demo Production material requests.`,
  );
}

const seedProductInclude = {
  unit: true,
  recipe: {
    include: {
      items: {
        include: {
          rawMaterial: {
            include: { baseUnit: true },
          },
        },
      },
    },
  },
} satisfies Prisma.ProductInclude;

type SeedProduct = Prisma.ProductGetPayload<{
  include: typeof seedProductInclude;
}>;

function expectedUsagesForSeed(product: SeedProduct, quantityProduced: number) {
  if (!product.recipe?.isActive) {
    return [];
  }

  const yieldQuantity = decimalToNumber(product.recipe.yieldQuantity);

  if (yieldQuantity <= 0) {
    return [];
  }

  return product.recipe.items.map((item) => ({
    rawMaterialId: item.rawMaterialId,
    rawMaterialName: item.rawMaterial.name,
    unit: item.rawMaterial.baseUnit.abbreviation,
    expectedQuantity: roundQuantity(
      (decimalToNumber(item.quantity) * quantityProduced) / yieldQuantity,
    ),
  }));
}

async function createProductionRunForSeed(
  tx: Prisma.TransactionClient,
  product: SeedProduct,
  run: (typeof DEMO_PRODUCTION_RUNS)[number],
  productionUserId: string,
) {
  const producedAt = hoursAgo(run.producedHoursAgo);
  const usages = expectedUsagesForSeed(product, run.quantityProduced);

  if (usages.length === 0) {
    throw new Error(`Product ${product.name} does not have an active recipe.`);
  }

  const createdRun = await tx.productionRun.create({
    data: {
      productId: product.id,
      quantityProduced: run.quantityProduced,
      quantityTransferred: run.quantityTransferred,
      wasteQuantity: run.wasteQuantity,
      producedAt,
      notes: `${DEMO_WORKFLOW_MARKER}: Seeded ${product.name} production run.`,
      createdById: productionUserId,
    },
  });

  for (const usage of usages) {
    const lockedBatchIds = await tx.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`
        SELECT "id"
        FROM "ProductionMaterialStockBatch"
        WHERE "rawMaterialId" = ${usage.rawMaterialId}
          AND "quantityRemaining" > 0
        ORDER BY "receivedAt" ASC, "createdAt" ASC
        FOR UPDATE
      `,
    );
    const batches =
      lockedBatchIds.length > 0
        ? await tx.productionMaterialStockBatch.findMany({
            where: { id: { in: lockedBatchIds.map((batch) => batch.id) } },
            orderBy: [{ receivedAt: "asc" }, { createdAt: "asc" }],
          })
        : [];
    const availableQuantity = batches.reduce(
      (sum, batch) => sum + decimalToNumber(batch.quantityRemaining),
      0,
    );

    if (availableQuantity < usage.expectedQuantity) {
      throw new Error(
        `Production only has ${roundQuantity(availableQuantity).toFixed(3)} ${usage.unit} of ${usage.rawMaterialName}.`,
      );
    }

    await tx.productionRunMaterialUsage.create({
      data: {
        productionRunId: createdRun.id,
        rawMaterialId: usage.rawMaterialId,
        expectedQuantity: usage.expectedQuantity,
        actualQuantity: usage.expectedQuantity,
      },
    });

    let remainingToConsume = usage.expectedQuantity;

    for (const batch of batches) {
      if (remainingToConsume <= 0) {
        break;
      }

      const batchRemaining = decimalToNumber(batch.quantityRemaining);
      const quantityFromBatch = roundQuantity(
        Math.min(batchRemaining, remainingToConsume),
      );
      const balanceAfter = roundQuantity(batchRemaining - quantityFromBatch);

      await tx.productionMaterialStockBatch.update({
        where: { id: batch.id },
        data: { quantityRemaining: balanceAfter },
      });

      await tx.productionMaterialStockMovement.create({
        data: {
          rawMaterialId: usage.rawMaterialId,
          productionBatchId: batch.id,
          productionRunId: createdRun.id,
          type: ProductionMaterialStockMovementType.CONSUME,
          quantity: quantityFromBatch,
          balanceAfter,
          actorId: productionUserId,
          note: `${DEMO_WORKFLOW_MARKER}: Consumed for ${product.name}.`,
        },
      });

      remainingToConsume = roundQuantity(remainingToConsume - quantityFromBatch);
    }
  }

  if (run.wasteQuantity > 0) {
    await tx.productionWaste.create({
      data: {
        productionRunId: createdRun.id,
        productId: product.id,
        quantity: run.wasteQuantity,
        reason: run.wasteReason,
        recordedAt: producedAt,
        createdById: productionUserId,
      },
    });
  }

  if (run.quantityTransferred > 0) {
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "Product" WHERE "id" = ${product.id} FOR UPDATE`,
    );

    const latestBatch = await tx.salesProductBatch.findFirst({
      where: { productId: product.id },
      orderBy: { batchNumber: "desc" },
      select: { batchNumber: true },
    });
    const batchNumber = (latestBatch?.batchNumber ?? 0) + 1;

    const batch = await tx.salesProductBatch.create({
      data: {
        productId: product.id,
        productionRunId: createdRun.id,
        batchNumber,
        batchDate: toBatchDate(producedAt),
        quantityReceived: run.quantityTransferred,
        quantityRemaining: run.quantityTransferred,
        receivedAt: producedAt,
        notes: `${DEMO_WORKFLOW_MARKER}: Received from seeded production run.`,
        createdById: productionUserId,
      },
    });

    await tx.salesProductStockMovement.create({
      data: {
        productId: product.id,
        batchId: batch.id,
        type: FinishedProductStockMovementType.RECEIVE_FROM_PRODUCTION,
        quantity: run.quantityTransferred,
        balanceAfter: run.quantityTransferred,
        actorId: productionUserId,
        note: `${DEMO_WORKFLOW_MARKER}: Received from Production.`,
      },
    });
  }
}

async function seedProductionWorkflowForTesting(productionUserId: string) {
  let createdRuns = 0;

  for (const demoRun of DEMO_PRODUCTION_RUNS) {
    const product = await prisma.product.findUniqueOrThrow({
      where: { name_size: { name: demoRun.productName, size: "" } },
      include: seedProductInclude,
    });
    const existingRun = await prisma.productionRun.findFirst({
      where: {
        productId: product.id,
        notes: `${DEMO_WORKFLOW_MARKER}: Seeded ${product.name} production run.`,
      },
      select: { id: true },
    });

    if (existingRun) {
      continue;
    }

    await prisma.$transaction(
      async (tx) => {
        await createProductionRunForSeed(
          tx,
          product,
          demoRun,
          productionUserId,
        );
      },
      { timeout: 15000, maxWait: 15000 },
    );

    createdRuns += 1;
    console.log(
      `Created demo run for ${product.name}: ${demoRun.quantityProduced} ${product.unit.abbreviation}, ${demoRun.wasteQuantity} waste.`,
    );
  }

  console.log(
    createdRuns === 0
      ? "Demo production runs and waste already exist."
      : `Created ${createdRuns} demo production runs with linked waste and Sales batches.`,
  );
}

async function createSaleForSeed(
  tx: Prisma.TransactionClient,
  demoSale: (typeof DEMO_SALES)[number],
  salesUserId: string,
) {
  const soldAt = hoursAgo(demoSale.soldHoursAgo);
  const items = [];

  for (const [productName, quantity] of demoSale.items) {
    const product = await tx.product.findUniqueOrThrow({
      where: { name_size: { name: productName, size: "" } },
      include: { unit: true },
    });
    const unitPrice = decimalToNumber(product.unitPrice ?? 0);

    if (unitPrice <= 0) {
      throw new Error(`${product.name} needs a unit price before seeding sales.`);
    }

    items.push({
      product,
      quantity,
      unitPrice,
      lineTotal: roundMoney(quantity * unitPrice),
    });
  }

  const subtotal = roundMoney(
    items.reduce((sum, item) => sum + item.lineTotal, 0),
  );
  const discount = roundMoney(demoSale.discount);
  const totalAmount = roundMoney(subtotal - discount);
  const amountPaid = roundMoney(
    "amountPaid" in demoSale && typeof demoSale.amountPaid === "number"
      ? demoSale.amountPaid
      : totalAmount,
  );
  const balanceDue = roundMoney(totalAmount - amountPaid);
  const retailer =
    demoSale.paymentMethod === PaymentMethod.CREDIT
      ? await tx.retailer.findUnique({
          where: { name: demoSale.customerName },
          select: { id: true, name: true },
        })
      : null;
  const sale = await tx.sale.create({
    data: {
      customerType: retailer ? CustomerType.RETAILER : CustomerType.INDIVIDUAL,
      retailerId: retailer?.id ?? null,
      customerName: retailer?.name ?? demoSale.customerName,
      paymentMethod: demoSale.paymentMethod,
      soldAt,
      subtotal,
      discount,
      totalAmount,
      amountPaid,
      balanceDue,
      notes: `${DEMO_WORKFLOW_MARKER}: Seeded sale - ${demoSale.label}.`,
      createdById: salesUserId,
    },
  });

  for (const item of items) {
    const lockedBatchIds = await tx.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`
        SELECT "id"
        FROM "SalesProductBatch"
        WHERE "productId" = ${item.product.id}
          AND "quantityRemaining" > 0
        ORDER BY "receivedAt" ASC, "batchNumber" ASC
        FOR UPDATE
      `,
    );
    const batches =
      lockedBatchIds.length > 0
        ? await tx.salesProductBatch.findMany({
            where: { id: { in: lockedBatchIds.map((batch) => batch.id) } },
            orderBy: [{ receivedAt: "asc" }, { batchNumber: "asc" }],
          })
        : [];
    const availableQuantity = batches.reduce(
      (sum, batch) => sum + decimalToNumber(batch.quantityRemaining),
      0,
    );

    if (availableQuantity < item.quantity) {
      throw new Error(
        `Sales only has ${roundQuantity(availableQuantity).toFixed(3)} ${item.product.unit.abbreviation} of ${item.product.name}.`,
      );
    }

    const saleItem = await tx.saleItem.create({
      data: {
        saleId: sale.id,
        productId: item.product.id,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal: item.lineTotal,
      },
    });

    let remainingToSell: number = item.quantity;

    for (const batch of batches) {
      if (remainingToSell <= 0) {
        break;
      }

      const batchRemaining = decimalToNumber(batch.quantityRemaining);
      const quantityFromBatch = roundQuantity(
        Math.min(batchRemaining, remainingToSell),
      );
      const balanceAfter = roundQuantity(batchRemaining - quantityFromBatch);

      await tx.salesProductBatch.update({
        where: { id: batch.id },
        data: { quantityRemaining: balanceAfter },
      });

      await tx.saleItemBatch.create({
        data: {
          saleItemId: saleItem.id,
          batchId: batch.id,
          quantity: quantityFromBatch,
        },
      });

      await tx.salesProductStockMovement.create({
        data: {
          productId: item.product.id,
          batchId: batch.id,
          type: FinishedProductStockMovementType.SALE,
          quantity: quantityFromBatch,
          balanceAfter,
          actorId: salesUserId,
          note: `${DEMO_WORKFLOW_MARKER}: Sale #${sale.saleNumber}.`,
        },
      });

      remainingToSell = roundQuantity(remainingToSell - quantityFromBatch);
    }
  }

  return sale;
}

async function seedSalesForTesting(salesUserId: string) {
  let createdSales = 0;

  for (const demoSale of DEMO_SALES) {
    const existingSale = await prisma.sale.findFirst({
      where: {
        notes: `${DEMO_WORKFLOW_MARKER}: Seeded sale - ${demoSale.label}.`,
      },
      select: { id: true },
    });

    if (existingSale) {
      continue;
    }

    await prisma.$transaction(
      async (tx) => {
        await createSaleForSeed(tx, demoSale, salesUserId);
      },
      { timeout: 15000, maxWait: 15000 },
    );

    createdSales += 1;
    console.log(`Created demo sale: ${demoSale.label}.`);
  }

  console.log(
    createdSales === 0
      ? "Demo sales already exist."
      : `Created ${createdSales} demo sales with FIFO Sales stock deductions.`,
  );
}

async function seedCustomerReturnForTesting(salesUserId: string) {
  const existingReturn = await prisma.salesProductReturn.findFirst({
    where: {
      reason: `${DEMO_WORKFLOW_MARKER}: Customer returned unopened loaf.`,
    },
    select: { id: true },
  });

  if (existingReturn) {
    console.log("Demo customer return already exists.");
    return;
  }

  const saleItem = await prisma.saleItem.findFirst({
    where: {
      product: { name: "Full Loaf Bread" },
      sale: {
        notes: `${DEMO_WORKFLOW_MARKER}: Seeded sale - Morning counter sales.`,
      },
    },
    include: {
      product: { include: { unit: true } },
      batchIssues: {
        include: { batch: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!saleItem) {
    console.log("Skipped demo customer return because no matching sale item exists.");
    return;
  }

  await prisma.$transaction(
    async (tx) => {
      const issue = saleItem.batchIssues[0];

      if (!issue) {
        throw new Error("Sale item has no batch issue to return.");
      }

      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "SalesProductBatch" WHERE "id" = ${issue.batchId} FOR UPDATE`,
      );

      const batch = await tx.salesProductBatch.findUniqueOrThrow({
        where: { id: issue.batchId },
      });
      const returnQuantity = 2;
      const balanceAfter = roundQuantity(
        decimalToNumber(batch.quantityRemaining) + returnQuantity,
      );

      await tx.salesProductBatch.update({
        where: { id: batch.id },
        data: { quantityRemaining: balanceAfter },
      });

      await tx.salesProductStockMovement.create({
        data: {
          productId: saleItem.productId,
          batchId: batch.id,
          type: FinishedProductStockMovementType.RETURN,
          quantity: returnQuantity,
          balanceAfter,
          actorId: salesUserId,
          note: `${DEMO_WORKFLOW_MARKER}: Customer return to stock.`,
        },
      });

      await tx.salesProductReturn.create({
        data: {
          saleItemId: saleItem.id,
          productId: saleItem.productId,
          batchId: batch.id,
          disposition: SalesReturnDisposition.RETURN_TO_STOCK,
          quantity: returnQuantity,
          reason: `${DEMO_WORKFLOW_MARKER}: Customer returned unopened loaf.`,
          recordedAt: hoursAgo(2),
          createdById: salesUserId,
        },
      });
    },
    { timeout: 15000, maxWait: 15000 },
  );

  console.log("Created demo customer return to stock.");
}

async function seedDamagedSalesStockForTesting(salesUserId: string) {
  const existingDamage = await prisma.salesProductReturn.findFirst({
    where: {
      reason: `${DEMO_WORKFLOW_MARKER}: Damaged on Sales shelf.`,
    },
    select: { id: true },
  });

  if (existingDamage) {
    console.log("Demo damaged Sales stock already exists.");
    return;
  }

  const product = await prisma.product.findUniqueOrThrow({
    where: { name_size: { name: "Sliced Bread", size: "" } },
    include: { unit: true },
  });

  await prisma.$transaction(
    async (tx) => {
      const lockedBatchIds = await tx.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`
          SELECT "id"
          FROM "SalesProductBatch"
          WHERE "productId" = ${product.id}
            AND "quantityRemaining" > 0
          ORDER BY "receivedAt" ASC, "batchNumber" ASC
          FOR UPDATE
        `,
      );
      const batch = lockedBatchIds[0]
        ? await tx.salesProductBatch.findUniqueOrThrow({
            where: { id: lockedBatchIds[0].id },
          })
        : null;

      if (!batch) {
        throw new Error("No Sliced Bread stock exists to mark as damaged.");
      }

      const damageQuantity = 3;
      const batchRemaining = decimalToNumber(batch.quantityRemaining);

      if (batchRemaining < damageQuantity) {
        throw new Error(
          `Only ${roundQuantity(batchRemaining).toFixed(3)} ${product.unit.abbreviation} of Sliced Bread is available for damage seeding.`,
        );
      }

      const balanceAfter = roundQuantity(batchRemaining - damageQuantity);

      await tx.salesProductBatch.update({
        where: { id: batch.id },
        data: { quantityRemaining: balanceAfter },
      });

      await tx.salesProductStockMovement.create({
        data: {
          productId: product.id,
          batchId: batch.id,
          type: FinishedProductStockMovementType.ADJUSTMENT,
          quantity: damageQuantity,
          balanceAfter,
          actorId: salesUserId,
          note: `${DEMO_WORKFLOW_MARKER}: Damaged on Sales shelf.`,
        },
      });

      await tx.salesProductReturn.create({
        data: {
          productId: product.id,
          batchId: batch.id,
          disposition: SalesReturnDisposition.DAMAGED,
          quantity: damageQuantity,
          reason: `${DEMO_WORKFLOW_MARKER}: Damaged on Sales shelf.`,
          recordedAt: hoursAgo(1),
          createdById: salesUserId,
        },
      });
    },
    { timeout: 15000, maxWait: 15000 },
  );

  console.log("Created demo damaged Sales stock record.");
}

async function seedOperatingExpensesForTesting(managementUserId: string) {
  const categories = await prisma.expenseCategory.findMany({
    where: {
      name: { in: DEMO_EXPENSES.map((expense) => expense.categoryName) },
    },
    select: { id: true, name: true },
  });
  const categoryByName = new Map(
    categories.map((category) => [category.name, category]),
  );
  let createdExpenses = 0;

  for (const demoExpense of DEMO_EXPENSES) {
    const category = categoryByName.get(demoExpense.categoryName);

    if (!category) {
      throw new Error(`Missing expense category ${demoExpense.categoryName}.`);
    }

    const notes = `${DEMO_WORKFLOW_MARKER}: ${demoExpense.note}`;
    const existingExpense = await prisma.expense.findFirst({
      where: {
        notes,
        categoryId: category.id,
        voidedAt: null,
      },
      select: { id: true },
    });

    if (existingExpense) {
      continue;
    }

    const amount = new Prisma.Decimal(roundMoney(demoExpense.amount).toFixed(2));
    const incurredAt = currentMonthDateDaysAgo(demoExpense.incurredDaysAgo);
    const expense = await prisma.expense.create({
      data: {
        categoryId: category.id,
        amount,
        incurredAt,
        vendor: demoExpense.vendor,
        paymentMethod: demoExpense.paymentMethod,
        notes,
        createdById: managementUserId,
      },
      select: { id: true, amount: true, incurredAt: true },
    });

    await prisma.auditLog.create({
      data: {
        action: "MANAGEMENT_EXPENSE_RECORDED",
        entityType: "Expense",
        entityId: expense.id,
        actorId: managementUserId,
        metadata: {
          category: category.name,
          amount: expense.amount.toString(),
          incurredAt: expense.incurredAt.toISOString().slice(0, 10),
          seeded: true,
        },
      },
    });

    createdExpenses += 1;
  }

  console.log(
    createdExpenses === 0
      ? "Demo operating expenses already exist."
      : `Created ${createdExpenses} demo operating expenses for Management reporting.`,
  );
}

async function main() {
  const admin = await seedAdmin();
  const demoUsers = await seedDemoRoleUsers(admin.id);
  await seedReferenceData();
  await seedDemoRetailers(demoUsers.sales.id);
  await seedOperatingExpensesForTesting(demoUsers.management.id);
  await seedDemoCatalogue();
  await topUpStoreStock(admin.id);
  await topUpProductionStockForTesting(
    demoUsers.production.id,
    demoUsers.store.id,
  );
  await seedProductionWorkflowForTesting(demoUsers.production.id);
  await seedSalesForTesting(demoUsers.sales.id);
  await seedCustomerReturnForTesting(demoUsers.sales.id);
  await seedDamagedSalesStockForTesting(demoUsers.sales.id);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
