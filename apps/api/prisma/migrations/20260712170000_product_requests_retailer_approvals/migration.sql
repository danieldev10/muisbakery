-- Product-level production requests generate underlying material request lines
-- for Store fulfillment while keeping Production focused on product output.
CREATE TYPE "RetailerOrderApprovalStatus" AS ENUM ('APPROVED', 'USED', 'REVOKED');

ALTER TABLE "Retailer"
  ALTER COLUMN "creditLimit" SET DEFAULT 0;

CREATE TABLE "ProductionRequest" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "requestedQuantity" INTEGER NOT NULL,
  "status" "MaterialRequestStatus" NOT NULL DEFAULT 'PENDING',
  "neededBy" TIMESTAMP(3),
  "notes" TEXT,
  "responseNotes" TEXT,
  "fulfilledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "requestedById" TEXT NOT NULL,

  CONSTRAINT "ProductionRequest_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "MaterialRequest"
  ADD COLUMN "productionRequestId" TEXT;

CREATE TABLE "RetailerOrderApproval" (
  "id" TEXT NOT NULL,
  "retailerId" TEXT NOT NULL,
  "approvedAmount" DECIMAL(14,2) NOT NULL,
  "status" "RetailerOrderApprovalStatus" NOT NULL DEFAULT 'APPROVED',
  "reason" TEXT,
  "expiresAt" TIMESTAMP(3),
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approvedById" TEXT,

  CONSTRAINT "RetailerOrderApproval_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Sale"
  ADD COLUMN "retailerApprovalId" TEXT;

ALTER TABLE "PosSession"
  ADD COLUMN "retailerApprovalId" TEXT;

CREATE INDEX "ProductionRequest_productId_idx" ON "ProductionRequest"("productId");
CREATE INDEX "ProductionRequest_requestedById_idx" ON "ProductionRequest"("requestedById");
CREATE INDEX "ProductionRequest_status_idx" ON "ProductionRequest"("status");
CREATE INDEX "ProductionRequest_createdAt_idx" ON "ProductionRequest"("createdAt");
CREATE INDEX "MaterialRequest_productionRequestId_idx" ON "MaterialRequest"("productionRequestId");
CREATE INDEX "RetailerOrderApproval_retailerId_status_idx" ON "RetailerOrderApproval"("retailerId", "status");
CREATE INDEX "RetailerOrderApproval_expiresAt_idx" ON "RetailerOrderApproval"("expiresAt");
CREATE INDEX "RetailerOrderApproval_approvedById_idx" ON "RetailerOrderApproval"("approvedById");
CREATE INDEX "RetailerOrderApproval_createdAt_idx" ON "RetailerOrderApproval"("createdAt");
CREATE UNIQUE INDEX "Sale_retailerApprovalId_key" ON "Sale"("retailerApprovalId");
CREATE INDEX "Sale_retailerApprovalId_idx" ON "Sale"("retailerApprovalId");

ALTER TABLE "ProductionRequest"
  ADD CONSTRAINT "ProductionRequest_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProductionRequest"
  ADD CONSTRAINT "ProductionRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MaterialRequest"
  ADD CONSTRAINT "MaterialRequest_productionRequestId_fkey" FOREIGN KEY ("productionRequestId") REFERENCES "ProductionRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RetailerOrderApproval"
  ADD CONSTRAINT "RetailerOrderApproval_retailerId_fkey" FOREIGN KEY ("retailerId") REFERENCES "Retailer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RetailerOrderApproval"
  ADD CONSTRAINT "RetailerOrderApproval_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Sale"
  ADD CONSTRAINT "Sale_retailerApprovalId_fkey" FOREIGN KEY ("retailerApprovalId") REFERENCES "RetailerOrderApproval"("id") ON DELETE SET NULL ON UPDATE CASCADE;
