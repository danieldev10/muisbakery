-- Close-of-day workflow: Sales submits the drawer count against expected
-- totals for the business date; Management reviews and signs off.

-- CreateEnum
CREATE TYPE "DayCloseStatus" AS ENUM ('SUBMITTED', 'APPROVED');

-- CreateTable
CREATE TABLE "SalesDayClose" (
    "id" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "salesCount" INTEGER NOT NULL,
    "expectedCash" DECIMAL(14,2) NOT NULL,
    "expectedTransfer" DECIMAL(14,2) NOT NULL,
    "expectedPos" DECIMAL(14,2) NOT NULL,
    "creditTotal" DECIMAL(14,2) NOT NULL,
    "countedCash" DECIMAL(14,2) NOT NULL,
    "cashVariance" DECIMAL(14,2) NOT NULL,
    "damagedQuantity" INTEGER NOT NULL,
    "returnedQuantity" INTEGER NOT NULL,
    "notes" TEXT,
    "status" "DayCloseStatus" NOT NULL DEFAULT 'SUBMITTED',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewNotes" TEXT,

    CONSTRAINT "SalesDayClose_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SalesDayClose_businessDate_key" ON "SalesDayClose"("businessDate");

-- CreateIndex
CREATE INDEX "SalesDayClose_status_idx" ON "SalesDayClose"("status");

-- CreateIndex
CREATE INDEX "SalesDayClose_submittedById_idx" ON "SalesDayClose"("submittedById");

-- AddForeignKey
ALTER TABLE "SalesDayClose" ADD CONSTRAINT "SalesDayClose_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesDayClose" ADD CONSTRAINT "SalesDayClose_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
