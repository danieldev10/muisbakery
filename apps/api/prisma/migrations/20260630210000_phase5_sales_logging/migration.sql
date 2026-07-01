-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'TRANSFER', 'POS', 'CREDIT');

-- CreateEnum
CREATE TYPE "SalesReturnDisposition" AS ENUM ('RETURN_TO_STOCK', 'DAMAGED');

-- CreateTable
CREATE TABLE "Sale" (
    "id" TEXT NOT NULL,
    "saleNumber" SERIAL NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "customerName" TEXT,
    "soldAt" TIMESTAMP(3) NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(14,2) NOT NULL,
    "amountPaid" DECIMAL(14,2) NOT NULL,
    "balanceDue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleItem" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "lineTotal" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleItemBatch" (
    "id" TEXT NOT NULL,
    "saleItemId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaleItemBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesProductReturn" (
    "id" TEXT NOT NULL,
    "saleItemId" TEXT,
    "productId" TEXT NOT NULL,
    "batchId" TEXT,
    "disposition" "SalesReturnDisposition" NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "reason" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "SalesProductReturn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Sale_saleNumber_key" ON "Sale"("saleNumber");

-- CreateIndex
CREATE INDEX "Sale_soldAt_idx" ON "Sale"("soldAt");

-- CreateIndex
CREATE INDEX "Sale_paymentMethod_idx" ON "Sale"("paymentMethod");

-- CreateIndex
CREATE INDEX "Sale_createdById_idx" ON "Sale"("createdById");

-- CreateIndex
CREATE INDEX "SaleItem_saleId_idx" ON "SaleItem"("saleId");

-- CreateIndex
CREATE INDEX "SaleItem_productId_idx" ON "SaleItem"("productId");

-- CreateIndex
CREATE INDEX "SaleItemBatch_saleItemId_idx" ON "SaleItemBatch"("saleItemId");

-- CreateIndex
CREATE INDEX "SaleItemBatch_batchId_idx" ON "SaleItemBatch"("batchId");

-- CreateIndex
CREATE INDEX "SalesProductReturn_saleItemId_idx" ON "SalesProductReturn"("saleItemId");

-- CreateIndex
CREATE INDEX "SalesProductReturn_productId_recordedAt_idx" ON "SalesProductReturn"("productId", "recordedAt");

-- CreateIndex
CREATE INDEX "SalesProductReturn_batchId_idx" ON "SalesProductReturn"("batchId");

-- CreateIndex
CREATE INDEX "SalesProductReturn_disposition_idx" ON "SalesProductReturn"("disposition");

-- CreateIndex
CREATE INDEX "SalesProductReturn_createdById_idx" ON "SalesProductReturn"("createdById");

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleItemBatch" ADD CONSTRAINT "SaleItemBatch_saleItemId_fkey" FOREIGN KEY ("saleItemId") REFERENCES "SaleItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleItemBatch" ADD CONSTRAINT "SaleItemBatch_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "SalesProductBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesProductReturn" ADD CONSTRAINT "SalesProductReturn_saleItemId_fkey" FOREIGN KEY ("saleItemId") REFERENCES "SaleItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesProductReturn" ADD CONSTRAINT "SalesProductReturn_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesProductReturn" ADD CONSTRAINT "SalesProductReturn_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "SalesProductBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesProductReturn" ADD CONSTRAINT "SalesProductReturn_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
