-- AlterTable
ALTER TABLE "PosSession" ADD COLUMN "terminalId" TEXT;

-- CreateTable
CREATE TABLE "PosTerminal" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "displayToken" TEXT NOT NULL,
    "currentSessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "PosTerminal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PosTerminal_displayToken_key" ON "PosTerminal"("displayToken");

-- CreateIndex
CREATE UNIQUE INDEX "PosTerminal_currentSessionId_key" ON "PosTerminal"("currentSessionId");

-- CreateIndex
CREATE INDEX "PosTerminal_createdById_idx" ON "PosTerminal"("createdById");

-- CreateIndex
CREATE INDEX "PosTerminal_createdAt_idx" ON "PosTerminal"("createdAt");

-- CreateIndex
CREATE INDEX "PosSession_terminalId_idx" ON "PosSession"("terminalId");

-- AddForeignKey
ALTER TABLE "PosSession" ADD CONSTRAINT "PosSession_terminalId_fkey" FOREIGN KEY ("terminalId") REFERENCES "PosTerminal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosTerminal" ADD CONSTRAINT "PosTerminal_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosTerminal" ADD CONSTRAINT "PosTerminal_currentSessionId_fkey" FOREIGN KEY ("currentSessionId") REFERENCES "PosSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
