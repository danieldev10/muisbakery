-- AlterTable
ALTER TABLE "RawMaterialBatch" ADD COLUMN "batchDate" DATE;

-- Backfill existing batches by the date they were first received.
UPDATE "RawMaterialBatch"
SET "batchDate" = CAST("receivedAt" AS DATE)
WHERE "batchDate" IS NULL;

ALTER TABLE "RawMaterialBatch" ALTER COLUMN "batchDate" SET NOT NULL;

-- AlterTable
ALTER TABLE "RawMaterialStockMovement" ADD COLUMN "receiptId" TEXT;

-- CreateTable
CREATE TABLE "RawMaterialReceipt" (
    "id" TEXT NOT NULL,
    "rawMaterialId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "supplierId" TEXT,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unitCost" DECIMAL(14,2),
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "RawMaterialReceipt_pkey" PRIMARY KEY ("id")
);

-- Backfill one receipt row for any batches created before receipt tracking existed.
INSERT INTO "RawMaterialReceipt" (
    "id",
    "rawMaterialId",
    "batchId",
    "supplierId",
    "quantity",
    "unitCost",
    "receivedAt",
    "reference",
    "notes",
    "createdAt",
    "createdById"
)
SELECT
    'receipt_' || md5(random()::text || clock_timestamp()::text || "id"),
    "rawMaterialId",
    "id",
    "supplierId",
    "quantityReceived",
    "unitCost",
    "receivedAt",
    "reference",
    "notes",
    "createdAt",
    "createdById"
FROM "RawMaterialBatch";

UPDATE "RawMaterialStockMovement" movement
SET "receiptId" = receipt."id"
FROM "RawMaterialReceipt" receipt
WHERE movement."batchId" = receipt."batchId"
  AND movement."type" = 'RECEIVE'
  AND movement."receiptId" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "RawMaterialBatch_rawMaterialId_batchDate_key" ON "RawMaterialBatch"("rawMaterialId", "batchDate");

-- CreateIndex
CREATE INDEX "RawMaterialBatch_batchDate_idx" ON "RawMaterialBatch"("batchDate");

-- CreateIndex
CREATE INDEX "RawMaterialReceipt_rawMaterialId_receivedAt_idx" ON "RawMaterialReceipt"("rawMaterialId", "receivedAt");

-- CreateIndex
CREATE INDEX "RawMaterialReceipt_batchId_idx" ON "RawMaterialReceipt"("batchId");

-- CreateIndex
CREATE INDEX "RawMaterialReceipt_supplierId_idx" ON "RawMaterialReceipt"("supplierId");

-- CreateIndex
CREATE INDEX "RawMaterialReceipt_createdById_idx" ON "RawMaterialReceipt"("createdById");

-- CreateIndex
CREATE INDEX "RawMaterialStockMovement_receiptId_idx" ON "RawMaterialStockMovement"("receiptId");

-- AddForeignKey
ALTER TABLE "RawMaterialReceipt" ADD CONSTRAINT "RawMaterialReceipt_rawMaterialId_fkey" FOREIGN KEY ("rawMaterialId") REFERENCES "RawMaterial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawMaterialReceipt" ADD CONSTRAINT "RawMaterialReceipt_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "RawMaterialBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawMaterialReceipt" ADD CONSTRAINT "RawMaterialReceipt_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawMaterialReceipt" ADD CONSTRAINT "RawMaterialReceipt_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawMaterialStockMovement" ADD CONSTRAINT "RawMaterialStockMovement_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "RawMaterialReceipt"("id") ON DELETE SET NULL ON UPDATE CASCADE;
