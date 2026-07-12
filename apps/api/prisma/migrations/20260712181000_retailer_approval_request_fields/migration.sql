ALTER TABLE "RetailerOrderApproval"
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "requestedById" TEXT,
  ALTER COLUMN "status" SET DEFAULT 'PENDING';

CREATE INDEX "RetailerOrderApproval_requestedById_idx" ON "RetailerOrderApproval"("requestedById");

ALTER TABLE "RetailerOrderApproval"
  ADD CONSTRAINT "RetailerOrderApproval_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
