-- Retailer repayment ledger and settlement allocations.
CREATE TABLE "RetailerPayment" (
  "id" TEXT NOT NULL,
  "retailerId" TEXT NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "paymentMethod" "PaymentMethod" NOT NULL,
  "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reference" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" TEXT,

  CONSTRAINT "RetailerPayment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RetailerPaymentAllocation" (
  "id" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "saleId" TEXT NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RetailerPaymentAllocation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RetailerPayment_retailerId_paidAt_idx"
  ON "RetailerPayment"("retailerId", "paidAt");
CREATE INDEX "RetailerPayment_paymentMethod_idx"
  ON "RetailerPayment"("paymentMethod");
CREATE INDEX "RetailerPayment_createdById_idx"
  ON "RetailerPayment"("createdById");

CREATE UNIQUE INDEX "RetailerPaymentAllocation_paymentId_saleId_key"
  ON "RetailerPaymentAllocation"("paymentId", "saleId");
CREATE INDEX "RetailerPaymentAllocation_saleId_idx"
  ON "RetailerPaymentAllocation"("saleId");

ALTER TABLE "RetailerPayment"
  ADD CONSTRAINT "RetailerPayment_retailerId_fkey"
  FOREIGN KEY ("retailerId") REFERENCES "Retailer"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RetailerPayment"
  ADD CONSTRAINT "RetailerPayment_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RetailerPaymentAllocation"
  ADD CONSTRAINT "RetailerPaymentAllocation_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "RetailerPayment"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RetailerPaymentAllocation"
  ADD CONSTRAINT "RetailerPaymentAllocation_saleId_fkey"
  FOREIGN KEY ("saleId") REFERENCES "Sale"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
