-- CreateEnum
CREATE TYPE "ProductionMaterialStockMovementType" AS ENUM ('RECEIVE_FROM_STORE', 'CONSUME', 'WASTE', 'ADJUSTMENT');

-- CreateTable
CREATE TABLE "ProductionMaterialStockBatch" (
    "id" TEXT NOT NULL,
    "rawMaterialId" TEXT NOT NULL,
    "materialRequestId" TEXT,
    "materialRequestIssueId" TEXT,
    "storeBatchId" TEXT,
    "quantityReceived" DECIMAL(14,3) NOT NULL,
    "quantityRemaining" DECIMAL(14,3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "ProductionMaterialStockBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionRunMaterialUsage" (
    "id" TEXT NOT NULL,
    "productionRunId" TEXT NOT NULL,
    "rawMaterialId" TEXT NOT NULL,
    "expectedQuantity" DECIMAL(14,3),
    "actualQuantity" DECIMAL(14,3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductionRunMaterialUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionMaterialStockMovement" (
    "id" TEXT NOT NULL,
    "rawMaterialId" TEXT NOT NULL,
    "productionBatchId" TEXT NOT NULL,
    "productionRunId" TEXT,
    "type" "ProductionMaterialStockMovementType" NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "balanceAfter" DECIMAL(14,3) NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "actorId" TEXT,

    CONSTRAINT "ProductionMaterialStockMovement_pkey" PRIMARY KEY ("id")
);

-- Backfill production stock for raw materials already issued from Store.
INSERT INTO "ProductionMaterialStockBatch" (
    "id",
    "rawMaterialId",
    "materialRequestId",
    "materialRequestIssueId",
    "storeBatchId",
    "quantityReceived",
    "quantityRemaining",
    "receivedAt",
    "createdAt",
    "createdById"
)
SELECT
    'pstock_' || md5(issue."id"),
    request."rawMaterialId",
    issue."requestId",
    issue."id",
    issue."batchId",
    issue."quantity",
    issue."quantity",
    issue."createdAt",
    issue."createdAt",
    issue."issuedById"
FROM "MaterialRequestIssue" issue
JOIN "MaterialRequest" request ON request."id" = issue."requestId";

INSERT INTO "ProductionMaterialStockMovement" (
    "id",
    "rawMaterialId",
    "productionBatchId",
    "type",
    "quantity",
    "balanceAfter",
    "occurredAt",
    "note",
    "actorId"
)
SELECT
    'pmove_' || md5(issue."id"),
    request."rawMaterialId",
    'pstock_' || md5(issue."id"),
    'RECEIVE_FROM_STORE',
    issue."quantity",
    issue."quantity",
    issue."createdAt",
    'Backfilled from Store issue',
    issue."issuedById"
FROM "MaterialRequestIssue" issue
JOIN "MaterialRequest" request ON request."id" = issue."requestId";

-- CreateIndex
CREATE UNIQUE INDEX "ProductionMaterialStockBatch_materialRequestIssueId_key" ON "ProductionMaterialStockBatch"("materialRequestIssueId");

-- CreateIndex
CREATE INDEX "ProductionMaterialStockBatch_rawMaterialId_receivedAt_idx" ON "ProductionMaterialStockBatch"("rawMaterialId", "receivedAt");

-- CreateIndex
CREATE INDEX "ProductionMaterialStockBatch_materialRequestId_idx" ON "ProductionMaterialStockBatch"("materialRequestId");

-- CreateIndex
CREATE INDEX "ProductionMaterialStockBatch_storeBatchId_idx" ON "ProductionMaterialStockBatch"("storeBatchId");

-- CreateIndex
CREATE INDEX "ProductionMaterialStockBatch_quantityRemaining_idx" ON "ProductionMaterialStockBatch"("quantityRemaining");

-- CreateIndex
CREATE INDEX "ProductionMaterialStockBatch_createdById_idx" ON "ProductionMaterialStockBatch"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionRunMaterialUsage_productionRunId_rawMaterialId_key" ON "ProductionRunMaterialUsage"("productionRunId", "rawMaterialId");

-- CreateIndex
CREATE INDEX "ProductionRunMaterialUsage_rawMaterialId_idx" ON "ProductionRunMaterialUsage"("rawMaterialId");

-- CreateIndex
CREATE INDEX "ProductionMaterialStockMovement_rawMaterialId_occurredAt_idx" ON "ProductionMaterialStockMovement"("rawMaterialId", "occurredAt");

-- CreateIndex
CREATE INDEX "ProductionMaterialStockMovement_productionBatchId_idx" ON "ProductionMaterialStockMovement"("productionBatchId");

-- CreateIndex
CREATE INDEX "ProductionMaterialStockMovement_productionRunId_idx" ON "ProductionMaterialStockMovement"("productionRunId");

-- CreateIndex
CREATE INDEX "ProductionMaterialStockMovement_type_idx" ON "ProductionMaterialStockMovement"("type");

-- CreateIndex
CREATE INDEX "ProductionMaterialStockMovement_actorId_idx" ON "ProductionMaterialStockMovement"("actorId");

-- AddForeignKey
ALTER TABLE "ProductionMaterialStockBatch" ADD CONSTRAINT "ProductionMaterialStockBatch_rawMaterialId_fkey" FOREIGN KEY ("rawMaterialId") REFERENCES "RawMaterial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionMaterialStockBatch" ADD CONSTRAINT "ProductionMaterialStockBatch_materialRequestId_fkey" FOREIGN KEY ("materialRequestId") REFERENCES "MaterialRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionMaterialStockBatch" ADD CONSTRAINT "ProductionMaterialStockBatch_materialRequestIssueId_fkey" FOREIGN KEY ("materialRequestIssueId") REFERENCES "MaterialRequestIssue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionMaterialStockBatch" ADD CONSTRAINT "ProductionMaterialStockBatch_storeBatchId_fkey" FOREIGN KEY ("storeBatchId") REFERENCES "RawMaterialBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionMaterialStockBatch" ADD CONSTRAINT "ProductionMaterialStockBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionRunMaterialUsage" ADD CONSTRAINT "ProductionRunMaterialUsage_productionRunId_fkey" FOREIGN KEY ("productionRunId") REFERENCES "ProductionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionRunMaterialUsage" ADD CONSTRAINT "ProductionRunMaterialUsage_rawMaterialId_fkey" FOREIGN KEY ("rawMaterialId") REFERENCES "RawMaterial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionMaterialStockMovement" ADD CONSTRAINT "ProductionMaterialStockMovement_rawMaterialId_fkey" FOREIGN KEY ("rawMaterialId") REFERENCES "RawMaterial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionMaterialStockMovement" ADD CONSTRAINT "ProductionMaterialStockMovement_productionBatchId_fkey" FOREIGN KEY ("productionBatchId") REFERENCES "ProductionMaterialStockBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionMaterialStockMovement" ADD CONSTRAINT "ProductionMaterialStockMovement_productionRunId_fkey" FOREIGN KEY ("productionRunId") REFERENCES "ProductionRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionMaterialStockMovement" ADD CONSTRAINT "ProductionMaterialStockMovement_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
