-- CreateEnum
CREATE TYPE "PosSessionStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED', 'EXPIRED');

-- CreateTable
CREATE TABLE "PosSession" (
    "id" TEXT NOT NULL,
    "displayToken" TEXT NOT NULL,
    "status" "PosSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "customerName" TEXT,
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "amountPaid" DECIMAL(14,2),
    "notes" TEXT,
    "expiresAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "completedSaleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "PosSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosSessionItem" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosSessionItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PosSession_displayToken_key" ON "PosSession"("displayToken");

-- CreateIndex
CREATE UNIQUE INDEX "PosSession_completedSaleId_key" ON "PosSession"("completedSaleId");

-- CreateIndex
CREATE INDEX "PosSession_status_idx" ON "PosSession"("status");

-- CreateIndex
CREATE INDEX "PosSession_createdById_idx" ON "PosSession"("createdById");

-- CreateIndex
CREATE INDEX "PosSession_createdAt_idx" ON "PosSession"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PosSessionItem_sessionId_productId_key" ON "PosSessionItem"("sessionId", "productId");

-- CreateIndex
CREATE INDEX "PosSessionItem_productId_idx" ON "PosSessionItem"("productId");

-- AddForeignKey
ALTER TABLE "PosSession" ADD CONSTRAINT "PosSession_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosSession" ADD CONSTRAINT "PosSession_completedSaleId_fkey" FOREIGN KEY ("completedSaleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosSessionItem" ADD CONSTRAINT "PosSessionItem_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PosSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosSessionItem" ADD CONSTRAINT "PosSessionItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
