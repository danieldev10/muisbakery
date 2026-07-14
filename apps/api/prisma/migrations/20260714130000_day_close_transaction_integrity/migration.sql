-- CreateEnum
CREATE TYPE "BusinessDayStatus" AS ENUM ('OPEN', 'SUBMITTED', 'STALE', 'APPROVED');

-- AlterTable
ALTER TABLE "SalesDayClose"
ADD COLUMN "submittedActivityVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "BusinessDayState" (
    "businessDate" DATE NOT NULL,
    "activityVersion" INTEGER NOT NULL DEFAULT 0,
    "status" "BusinessDayStatus" NOT NULL DEFAULT 'OPEN',
    "lastActivityAt" TIMESTAMP(3),
    "closeCutoffAt" TIMESTAMP(3),
    "reopenedAt" TIMESTAMP(3),
    "reopenedById" TEXT,
    "reopenReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessDayState_pkey" PRIMARY KEY ("businessDate")
);

-- Backfill a state row for every existing close before adding the relation.
INSERT INTO "BusinessDayState" (
    "businessDate",
    "activityVersion",
    "status",
    "lastActivityAt",
    "closeCutoffAt",
    "createdAt",
    "updatedAt"
)
SELECT
    "businessDate",
    0,
    CASE
      WHEN "status" = 'APPROVED' THEN 'APPROVED'::"BusinessDayStatus"
      ELSE 'SUBMITTED'::"BusinessDayStatus"
    END,
    "submittedAt",
    "submittedAt",
    "submittedAt",
    CURRENT_TIMESTAMP
FROM "SalesDayClose";

-- CreateIndex
CREATE INDEX "BusinessDayState_status_idx" ON "BusinessDayState"("status");

-- CreateIndex
CREATE INDEX "BusinessDayState_reopenedById_idx" ON "BusinessDayState"("reopenedById");

-- AddForeignKey
ALTER TABLE "BusinessDayState"
ADD CONSTRAINT "BusinessDayState_reopenedById_fkey"
FOREIGN KEY ("reopenedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesDayClose"
ADD CONSTRAINT "SalesDayClose_businessDate_fkey"
FOREIGN KEY ("businessDate") REFERENCES "BusinessDayState"("businessDate") ON DELETE RESTRICT ON UPDATE CASCADE;
