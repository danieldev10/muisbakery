-- CreateEnum
CREATE TYPE "MaterialRequestStatus" AS ENUM ('PENDING', 'PARTIALLY_ISSUED', 'FULFILLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RawMaterialStockMovementType" AS ENUM ('RECEIVE', 'ISSUE', 'ADJUSTMENT');

-- CreateTable
CREATE TABLE "RawMaterialBatch" (
    "id" TEXT NOT NULL,
    "rawMaterialId" TEXT NOT NULL,
    "supplierId" TEXT,
    "batchNumber" INTEGER NOT NULL,
    "quantityReceived" DECIMAL(14,3) NOT NULL,
    "quantityRemaining" DECIMAL(14,3) NOT NULL,
    "unitCost" DECIMAL(14,2),
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "RawMaterialBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RawMaterialStockMovement" (
    "id" TEXT NOT NULL,
    "rawMaterialId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "type" "RawMaterialStockMovementType" NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "balanceAfter" DECIMAL(14,3) NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "actorId" TEXT,

    CONSTRAINT "RawMaterialStockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialRequest" (
    "id" TEXT NOT NULL,
    "rawMaterialId" TEXT NOT NULL,
    "requestedQuantity" DECIMAL(14,3) NOT NULL,
    "issuedQuantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "status" "MaterialRequestStatus" NOT NULL DEFAULT 'PENDING',
    "neededBy" TIMESTAMP(3),
    "notes" TEXT,
    "responseNotes" TEXT,
    "requestedById" TEXT NOT NULL,
    "issuedById" TEXT,
    "fulfilledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaterialRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialRequestIssue" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "issuedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialRequestIssue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RawMaterialBatch_rawMaterialId_batchNumber_key" ON "RawMaterialBatch"("rawMaterialId", "batchNumber");

-- CreateIndex
CREATE INDEX "RawMaterialBatch_rawMaterialId_receivedAt_idx" ON "RawMaterialBatch"("rawMaterialId", "receivedAt");

-- CreateIndex
CREATE INDEX "RawMaterialBatch_supplierId_idx" ON "RawMaterialBatch"("supplierId");

-- CreateIndex
CREATE INDEX "RawMaterialBatch_quantityRemaining_idx" ON "RawMaterialBatch"("quantityRemaining");

-- CreateIndex
CREATE INDEX "RawMaterialStockMovement_rawMaterialId_occurredAt_idx" ON "RawMaterialStockMovement"("rawMaterialId", "occurredAt");

-- CreateIndex
CREATE INDEX "RawMaterialStockMovement_batchId_idx" ON "RawMaterialStockMovement"("batchId");

-- CreateIndex
CREATE INDEX "RawMaterialStockMovement_type_idx" ON "RawMaterialStockMovement"("type");

-- CreateIndex
CREATE INDEX "RawMaterialStockMovement_actorId_idx" ON "RawMaterialStockMovement"("actorId");

-- CreateIndex
CREATE INDEX "MaterialRequest_rawMaterialId_idx" ON "MaterialRequest"("rawMaterialId");

-- CreateIndex
CREATE INDEX "MaterialRequest_requestedById_idx" ON "MaterialRequest"("requestedById");

-- CreateIndex
CREATE INDEX "MaterialRequest_issuedById_idx" ON "MaterialRequest"("issuedById");

-- CreateIndex
CREATE INDEX "MaterialRequest_status_idx" ON "MaterialRequest"("status");

-- CreateIndex
CREATE INDEX "MaterialRequest_createdAt_idx" ON "MaterialRequest"("createdAt");

-- CreateIndex
CREATE INDEX "MaterialRequestIssue_requestId_idx" ON "MaterialRequestIssue"("requestId");

-- CreateIndex
CREATE INDEX "MaterialRequestIssue_batchId_idx" ON "MaterialRequestIssue"("batchId");

-- CreateIndex
CREATE INDEX "MaterialRequestIssue_issuedById_idx" ON "MaterialRequestIssue"("issuedById");

-- AddForeignKey
ALTER TABLE "RawMaterialBatch" ADD CONSTRAINT "RawMaterialBatch_rawMaterialId_fkey" FOREIGN KEY ("rawMaterialId") REFERENCES "RawMaterial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawMaterialBatch" ADD CONSTRAINT "RawMaterialBatch_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawMaterialBatch" ADD CONSTRAINT "RawMaterialBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawMaterialStockMovement" ADD CONSTRAINT "RawMaterialStockMovement_rawMaterialId_fkey" FOREIGN KEY ("rawMaterialId") REFERENCES "RawMaterial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawMaterialStockMovement" ADD CONSTRAINT "RawMaterialStockMovement_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "RawMaterialBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawMaterialStockMovement" ADD CONSTRAINT "RawMaterialStockMovement_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialRequest" ADD CONSTRAINT "MaterialRequest_rawMaterialId_fkey" FOREIGN KEY ("rawMaterialId") REFERENCES "RawMaterial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialRequest" ADD CONSTRAINT "MaterialRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialRequest" ADD CONSTRAINT "MaterialRequest_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialRequestIssue" ADD CONSTRAINT "MaterialRequestIssue_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "MaterialRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialRequestIssue" ADD CONSTRAINT "MaterialRequestIssue_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "RawMaterialBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialRequestIssue" ADD CONSTRAINT "MaterialRequestIssue_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
