-- Retailer credit accounts for Sales.
CREATE TYPE "CustomerType" AS ENUM ('INDIVIDUAL', 'RETAILER');

CREATE TABLE "Retailer" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "contactPerson" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "address" TEXT,
  "creditLimit" DECIMAL(14,2) NOT NULL,
  "notes" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT,

  CONSTRAINT "Retailer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Retailer_name_key" ON "Retailer"("name");
CREATE INDEX "Retailer_isActive_idx" ON "Retailer"("isActive");
CREATE INDEX "Retailer_createdById_idx" ON "Retailer"("createdById");

ALTER TABLE "Retailer"
  ADD CONSTRAINT "Retailer_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Sale"
  ADD COLUMN "customerType" "CustomerType" NOT NULL DEFAULT 'INDIVIDUAL',
  ADD COLUMN "retailerId" TEXT;

CREATE INDEX "Sale_customerType_idx" ON "Sale"("customerType");
CREATE INDEX "Sale_retailerId_idx" ON "Sale"("retailerId");

ALTER TABLE "Sale"
  ADD CONSTRAINT "Sale_retailerId_fkey"
  FOREIGN KEY ("retailerId") REFERENCES "Retailer"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PosSession"
  ADD COLUMN "customerType" "CustomerType" NOT NULL DEFAULT 'INDIVIDUAL',
  ADD COLUMN "retailerId" TEXT;

CREATE INDEX "PosSession_customerType_idx" ON "PosSession"("customerType");
CREATE INDEX "PosSession_retailerId_idx" ON "PosSession"("retailerId");

ALTER TABLE "PosSession"
  ADD CONSTRAINT "PosSession_retailerId_fkey"
  FOREIGN KEY ("retailerId") REFERENCES "Retailer"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
