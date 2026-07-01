-- CreateEnum
CREATE TYPE "FinishedProductStockMovementType" AS ENUM ('RECEIVE_FROM_PRODUCTION', 'SALE', 'RETURN', 'ADJUSTMENT');

-- CreateTable
CREATE TABLE "ProductionRun" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantityProduced" DECIMAL(14,3) NOT NULL,
    "quantityTransferred" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "wasteQuantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "producedAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "ProductionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionRunMaterialRequest" (
    "productionRunId" TEXT NOT NULL,
    "materialRequestId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductionRunMaterialRequest_pkey" PRIMARY KEY ("productionRunId", "materialRequestId")
);

-- CreateTable
CREATE TABLE "ProductionWaste" (
    "id" TEXT NOT NULL,
    "productionRunId" TEXT,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "reason" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "ProductionWaste_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesProductBatch" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productionRunId" TEXT,
    "batchNumber" INTEGER NOT NULL,
    "batchDate" DATE NOT NULL,
    "quantityReceived" DECIMAL(14,3) NOT NULL,
    "quantityRemaining" DECIMAL(14,3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "SalesProductBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesProductStockMovement" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "type" "FinishedProductStockMovementType" NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "balanceAfter" DECIMAL(14,3) NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "actorId" TEXT,

    CONSTRAINT "SalesProductStockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductionRun_productId_producedAt_idx" ON "ProductionRun"("productId", "producedAt");

-- CreateIndex
CREATE INDEX "ProductionRun_createdById_idx" ON "ProductionRun"("createdById");

-- CreateIndex
CREATE INDEX "ProductionRun_producedAt_idx" ON "ProductionRun"("producedAt");

-- CreateIndex
CREATE INDEX "ProductionRunMaterialRequest_materialRequestId_idx" ON "ProductionRunMaterialRequest"("materialRequestId");

-- CreateIndex
CREATE INDEX "ProductionWaste_productionRunId_idx" ON "ProductionWaste"("productionRunId");

-- CreateIndex
CREATE INDEX "ProductionWaste_productId_recordedAt_idx" ON "ProductionWaste"("productId", "recordedAt");

-- CreateIndex
CREATE INDEX "ProductionWaste_createdById_idx" ON "ProductionWaste"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "SalesProductBatch_productId_batchNumber_key" ON "SalesProductBatch"("productId", "batchNumber");

-- CreateIndex
CREATE INDEX "SalesProductBatch_productId_batchDate_idx" ON "SalesProductBatch"("productId", "batchDate");

-- CreateIndex
CREATE INDEX "SalesProductBatch_productionRunId_idx" ON "SalesProductBatch"("productionRunId");

-- CreateIndex
CREATE INDEX "SalesProductBatch_quantityRemaining_idx" ON "SalesProductBatch"("quantityRemaining");

-- CreateIndex
CREATE INDEX "SalesProductBatch_createdById_idx" ON "SalesProductBatch"("createdById");

-- CreateIndex
CREATE INDEX "SalesProductStockMovement_productId_occurredAt_idx" ON "SalesProductStockMovement"("productId", "occurredAt");

-- CreateIndex
CREATE INDEX "SalesProductStockMovement_batchId_idx" ON "SalesProductStockMovement"("batchId");

-- CreateIndex
CREATE INDEX "SalesProductStockMovement_type_idx" ON "SalesProductStockMovement"("type");

-- CreateIndex
CREATE INDEX "SalesProductStockMovement_actorId_idx" ON "SalesProductStockMovement"("actorId");

-- AddForeignKey
ALTER TABLE "ProductionRun" ADD CONSTRAINT "ProductionRun_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionRun" ADD CONSTRAINT "ProductionRun_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionRunMaterialRequest" ADD CONSTRAINT "ProductionRunMaterialRequest_productionRunId_fkey" FOREIGN KEY ("productionRunId") REFERENCES "ProductionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionRunMaterialRequest" ADD CONSTRAINT "ProductionRunMaterialRequest_materialRequestId_fkey" FOREIGN KEY ("materialRequestId") REFERENCES "MaterialRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionWaste" ADD CONSTRAINT "ProductionWaste_productionRunId_fkey" FOREIGN KEY ("productionRunId") REFERENCES "ProductionRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionWaste" ADD CONSTRAINT "ProductionWaste_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionWaste" ADD CONSTRAINT "ProductionWaste_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesProductBatch" ADD CONSTRAINT "SalesProductBatch_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesProductBatch" ADD CONSTRAINT "SalesProductBatch_productionRunId_fkey" FOREIGN KEY ("productionRunId") REFERENCES "ProductionRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesProductBatch" ADD CONSTRAINT "SalesProductBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesProductStockMovement" ADD CONSTRAINT "SalesProductStockMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesProductStockMovement" ADD CONSTRAINT "SalesProductStockMovement_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "SalesProductBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesProductStockMovement" ADD CONSTRAINT "SalesProductStockMovement_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
