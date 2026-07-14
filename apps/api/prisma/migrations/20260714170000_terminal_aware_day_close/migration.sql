-- Freeze a business day while its offline terminals synchronize.
ALTER TYPE "BusinessDayStatus" ADD VALUE IF NOT EXISTS 'CLOSING' BEFORE 'SUBMITTED';

CREATE TABLE "PosTerminalDayCloseReadiness" (
    "id" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "terminalId" TEXT NOT NULL,
    "cutoffAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "syncedThroughAt" TIMESTAMP(3),
    "pendingSaleCount" INTEGER,
    "overriddenAt" TIMESTAMP(3),
    "overriddenById" TEXT,
    "overrideReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosTerminalDayCloseReadiness_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PosTerminalDayCloseReadiness_businessDate_terminalId_key"
ON "PosTerminalDayCloseReadiness"("businessDate", "terminalId");

CREATE INDEX "PosTerminalDayCloseReadiness_terminalId_cutoffAt_idx"
ON "PosTerminalDayCloseReadiness"("terminalId", "cutoffAt");

CREATE INDEX "PosTerminalDayCloseReadiness_businessDate_confirmedAt_idx"
ON "PosTerminalDayCloseReadiness"("businessDate", "confirmedAt");

CREATE INDEX "PosTerminalDayCloseReadiness_overriddenById_idx"
ON "PosTerminalDayCloseReadiness"("overriddenById");

ALTER TABLE "PosTerminalDayCloseReadiness"
ADD CONSTRAINT "PosTerminalDayCloseReadiness_businessDate_fkey"
FOREIGN KEY ("businessDate") REFERENCES "BusinessDayState"("businessDate")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PosTerminalDayCloseReadiness"
ADD CONSTRAINT "PosTerminalDayCloseReadiness_terminalId_fkey"
FOREIGN KEY ("terminalId") REFERENCES "PosTerminal"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PosTerminalDayCloseReadiness"
ADD CONSTRAINT "PosTerminalDayCloseReadiness_overriddenById_fkey"
FOREIGN KEY ("overriddenById") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
