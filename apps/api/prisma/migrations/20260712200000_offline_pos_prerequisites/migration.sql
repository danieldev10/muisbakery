ALTER TABLE "PosTerminal"
  ADD COLUMN "pairingCodeHash" TEXT,
  ADD COLUMN "pairingCodeExpiresAt" TIMESTAMP(3),
  ADD COLUMN "pairedAt" TIMESTAMP(3),
  ADD COLUMN "pairedById" TEXT,
  ADD COLUMN "deviceSecretHash" TEXT,
  ADD COLUMN "deviceSecretIssuedAt" TIMESTAMP(3);

ALTER TABLE "RetailerOrderApproval"
  ADD COLUMN "terminalId" TEXT;

ALTER TABLE "Sale"
  ADD COLUMN "clientRequestId" TEXT,
  ADD COLUMN "terminalId" TEXT;

CREATE TABLE "PosTerminalStockAllocation" (
  "id" TEXT NOT NULL,
  "terminalId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "allocatedQuantity" INTEGER NOT NULL,
  "soldQuantity" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PosTerminalStockAllocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PosTerminalRetailerCreditAllocation" (
  "id" TEXT NOT NULL,
  "terminalId" TEXT NOT NULL,
  "retailerId" TEXT NOT NULL,
  "allocatedAmount" DECIMAL(14,2) NOT NULL,
  "usedAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PosTerminalRetailerCreditAllocation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PosTerminal_pairedById_idx" ON "PosTerminal"("pairedById");
CREATE INDEX "RetailerOrderApproval_terminalId_idx" ON "RetailerOrderApproval"("terminalId");
CREATE UNIQUE INDEX "Sale_clientRequestId_key" ON "Sale"("clientRequestId");
CREATE INDEX "Sale_terminalId_idx" ON "Sale"("terminalId");
CREATE UNIQUE INDEX "PosTerminalStockAllocation_terminalId_productId_key" ON "PosTerminalStockAllocation"("terminalId", "productId");
CREATE INDEX "PosTerminalStockAllocation_productId_idx" ON "PosTerminalStockAllocation"("productId");
CREATE UNIQUE INDEX "PosTerminalRetailerCreditAllocation_terminalId_retailerId_key" ON "PosTerminalRetailerCreditAllocation"("terminalId", "retailerId");
CREATE INDEX "PosTerminalRetailerCreditAllocation_retailerId_idx" ON "PosTerminalRetailerCreditAllocation"("retailerId");
CREATE INDEX "PosTerminalRetailerCreditAllocation_isActive_idx" ON "PosTerminalRetailerCreditAllocation"("isActive");

ALTER TABLE "PosTerminal"
  ADD CONSTRAINT "PosTerminal_pairedById_fkey" FOREIGN KEY ("pairedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RetailerOrderApproval"
  ADD CONSTRAINT "RetailerOrderApproval_terminalId_fkey" FOREIGN KEY ("terminalId") REFERENCES "PosTerminal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Sale"
  ADD CONSTRAINT "Sale_terminalId_fkey" FOREIGN KEY ("terminalId") REFERENCES "PosTerminal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PosTerminalStockAllocation"
  ADD CONSTRAINT "PosTerminalStockAllocation_terminalId_fkey" FOREIGN KEY ("terminalId") REFERENCES "PosTerminal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PosTerminalStockAllocation"
  ADD CONSTRAINT "PosTerminalStockAllocation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PosTerminalRetailerCreditAllocation"
  ADD CONSTRAINT "PosTerminalRetailerCreditAllocation_terminalId_fkey" FOREIGN KEY ("terminalId") REFERENCES "PosTerminal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PosTerminalRetailerCreditAllocation"
  ADD CONSTRAINT "PosTerminalRetailerCreditAllocation_retailerId_fkey" FOREIGN KEY ("retailerId") REFERENCES "Retailer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
