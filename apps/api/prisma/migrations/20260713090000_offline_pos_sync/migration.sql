CREATE TYPE "PosOfflineSyncStatus" AS ENUM ('SYNCED', 'DUPLICATE', 'CONFLICT', 'FAILED');

CREATE TABLE "PosOfflineSyncAttempt" (
  "id" TEXT NOT NULL,
  "terminalId" TEXT NOT NULL,
  "clientRequestId" TEXT NOT NULL,
  "status" "PosOfflineSyncStatus" NOT NULL,
  "saleId" TEXT,
  "payload" JSONB NOT NULL,
  "errorMessage" TEXT,
  "conflictCode" TEXT,
  "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "syncedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PosOfflineSyncAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PosOfflineSyncAttempt_terminalId_clientRequestId_key" ON "PosOfflineSyncAttempt"("terminalId", "clientRequestId");
CREATE INDEX "PosOfflineSyncAttempt_status_idx" ON "PosOfflineSyncAttempt"("status");
CREATE INDEX "PosOfflineSyncAttempt_saleId_idx" ON "PosOfflineSyncAttempt"("saleId");
CREATE INDEX "PosOfflineSyncAttempt_attemptedAt_idx" ON "PosOfflineSyncAttempt"("attemptedAt");

ALTER TABLE "PosOfflineSyncAttempt"
  ADD CONSTRAINT "PosOfflineSyncAttempt_terminalId_fkey" FOREIGN KEY ("terminalId") REFERENCES "PosTerminal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PosOfflineSyncAttempt"
  ADD CONSTRAINT "PosOfflineSyncAttempt_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;
