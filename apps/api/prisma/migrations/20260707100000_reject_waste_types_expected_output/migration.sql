-- Store can reject material requests with a note.
ALTER TYPE "MaterialRequestStatus" ADD VALUE 'REJECTED';

-- Distinguish damaged waste (a real loss) from waste returned to production
-- (reusable, increases later yields).
CREATE TYPE "ProductionWasteType" AS ENUM ('DAMAGED', 'RETURNED_TO_PRODUCTION');

ALTER TABLE "ProductionWaste" ADD COLUMN "type" "ProductionWasteType" NOT NULL DEFAULT 'DAMAGED';

CREATE INDEX "ProductionWaste_type_idx" ON "ProductionWaste"("type");

-- Expected output derived from the recipe and the materials actually used,
-- so undercut runs (actual < expected) can be flagged.
ALTER TABLE "ProductionRun" ADD COLUMN "expectedQuantity" INTEGER;

-- Damaged finished stock gets its own movement type instead of ADJUSTMENT.
ALTER TYPE "FinishedProductStockMovementType" ADD VALUE 'DAMAGED';
