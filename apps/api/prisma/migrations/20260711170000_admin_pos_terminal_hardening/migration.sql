ALTER TABLE "PosTerminal"
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "offlineEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "lastSeenAt" TIMESTAMP(3),
  ADD COLUMN "lastSyncedAt" TIMESTAMP(3);

CREATE INDEX "PosTerminal_isActive_idx" ON "PosTerminal"("isActive");
CREATE INDEX "PosTerminal_offlineEnabled_idx" ON "PosTerminal"("offlineEnabled");
