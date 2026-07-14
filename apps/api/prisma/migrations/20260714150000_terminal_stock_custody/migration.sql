-- Extend the central finished-goods ledger for transfers into and out of
-- terminal custody. These values are only used by application code after this
-- migration commits.
ALTER TYPE "FinishedProductStockMovementType" ADD VALUE IF NOT EXISTS 'ALLOCATE_TO_TERMINAL';
ALTER TYPE "FinishedProductStockMovementType" ADD VALUE IF NOT EXISTS 'RELEASE_FROM_TERMINAL';

CREATE TYPE "PosTerminalStockMovementType" AS ENUM (
    'ALLOCATE',
    'SALE',
    'RELEASE',
    'RETURN',
    'ADJUST'
);

-- Do not mutate stock while legacy allocations are already overcommitted.
-- Run `npm run stock:custody:audit` before deployment for the full report.
DO $$
DECLARE
    overallocated_products TEXT;
BEGIN
    SELECT string_agg(
        format(
            '%s (%s): allocated=%s, central=%s, excess=%s',
            p."name",
            p."id",
            totals."allocatedRemaining",
            totals."centralRemaining",
            totals."allocatedRemaining" - totals."centralRemaining"
        ),
        E'\n'
    )
    INTO overallocated_products
    FROM (
        SELECT
            a."productId",
            SUM(GREATEST(a."allocatedQuantity" - a."soldQuantity", 0))::INTEGER AS "allocatedRemaining",
            COALESCE((
                SELECT SUM(b."quantityRemaining")
                FROM "SalesProductBatch" b
                WHERE b."productId" = a."productId"
            ), 0)::INTEGER AS "centralRemaining"
        FROM "PosTerminalStockAllocation" a
        GROUP BY a."productId"
    ) totals
    JOIN "Product" p ON p."id" = totals."productId"
    WHERE totals."allocatedRemaining" > totals."centralRemaining";

    IF overallocated_products IS NOT NULL THEN
        RAISE EXCEPTION E'Terminal stock custody migration blocked by overallocated products:\n%\nReconcile the allocations and rerun the migration.', overallocated_products;
    END IF;
END $$;

CREATE TABLE "PosTerminalStockBatch" (
    "id" TEXT NOT NULL,
    "allocationId" TEXT NOT NULL,
    "terminalId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sourceBatchId" TEXT NOT NULL,
    "quantityAllocated" INTEGER NOT NULL,
    "quantityRemaining" INTEGER NOT NULL,
    "unitCost" DECIMAL(14,4) NOT NULL,
    "allocatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "PosTerminalStockBatch_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PosTerminalStockBatch_quantity_check" CHECK (
        "quantityAllocated" > 0
        AND "quantityRemaining" >= 0
        AND "quantityRemaining" <= "quantityAllocated"
    )
);

CREATE TABLE "PosTerminalStockMovement" (
    "id" TEXT NOT NULL,
    "terminalId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "terminalBatchId" TEXT NOT NULL,
    "type" "PosTerminalStockMovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "saleId" TEXT,
    "saleItemId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "actorId" TEXT,

    CONSTRAINT "PosTerminalStockMovement_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PosTerminalStockMovement_quantity_check" CHECK (
        "quantity" > 0 AND "balanceAfter" >= 0
    )
);

ALTER TABLE "SaleItemBatch" ADD COLUMN "terminalBatchId" TEXT;
ALTER TABLE "SalesProductReturn" ADD COLUMN "terminalBatchId" TEXT;

CREATE INDEX "PosTerminalStockBatch_allocationId_allocatedAt_idx"
ON "PosTerminalStockBatch"("allocationId", "allocatedAt");
CREATE INDEX "PosTerminalStockBatch_terminalId_productId_quantityRemaining_idx"
ON "PosTerminalStockBatch"("terminalId", "productId", "quantityRemaining");
CREATE INDEX "PosTerminalStockBatch_sourceBatchId_idx"
ON "PosTerminalStockBatch"("sourceBatchId");
CREATE INDEX "PosTerminalStockBatch_createdById_idx"
ON "PosTerminalStockBatch"("createdById");

CREATE INDEX "PosTerminalStockMovement_terminalId_occurredAt_idx"
ON "PosTerminalStockMovement"("terminalId", "occurredAt");
CREATE INDEX "PosTerminalStockMovement_productId_occurredAt_idx"
ON "PosTerminalStockMovement"("productId", "occurredAt");
CREATE INDEX "PosTerminalStockMovement_terminalBatchId_idx"
ON "PosTerminalStockMovement"("terminalBatchId");
CREATE INDEX "PosTerminalStockMovement_type_idx"
ON "PosTerminalStockMovement"("type");
CREATE INDEX "PosTerminalStockMovement_saleId_idx"
ON "PosTerminalStockMovement"("saleId");
CREATE INDEX "PosTerminalStockMovement_saleItemId_idx"
ON "PosTerminalStockMovement"("saleItemId");
CREATE INDEX "PosTerminalStockMovement_actorId_idx"
ON "PosTerminalStockMovement"("actorId");

CREATE INDEX "SaleItemBatch_terminalBatchId_idx"
ON "SaleItemBatch"("terminalBatchId");
CREATE INDEX "SalesProductReturn_terminalBatchId_idx"
ON "SalesProductReturn"("terminalBatchId");

ALTER TABLE "PosTerminalStockBatch"
ADD CONSTRAINT "PosTerminalStockBatch_allocationId_fkey"
FOREIGN KEY ("allocationId") REFERENCES "PosTerminalStockAllocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PosTerminalStockBatch"
ADD CONSTRAINT "PosTerminalStockBatch_terminalId_fkey"
FOREIGN KEY ("terminalId") REFERENCES "PosTerminal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PosTerminalStockBatch"
ADD CONSTRAINT "PosTerminalStockBatch_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PosTerminalStockBatch"
ADD CONSTRAINT "PosTerminalStockBatch_sourceBatchId_fkey"
FOREIGN KEY ("sourceBatchId") REFERENCES "SalesProductBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PosTerminalStockBatch"
ADD CONSTRAINT "PosTerminalStockBatch_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PosTerminalStockMovement"
ADD CONSTRAINT "PosTerminalStockMovement_terminalId_fkey"
FOREIGN KEY ("terminalId") REFERENCES "PosTerminal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PosTerminalStockMovement"
ADD CONSTRAINT "PosTerminalStockMovement_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PosTerminalStockMovement"
ADD CONSTRAINT "PosTerminalStockMovement_terminalBatchId_fkey"
FOREIGN KEY ("terminalBatchId") REFERENCES "PosTerminalStockBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PosTerminalStockMovement"
ADD CONSTRAINT "PosTerminalStockMovement_saleId_fkey"
FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PosTerminalStockMovement"
ADD CONSTRAINT "PosTerminalStockMovement_saleItemId_fkey"
FOREIGN KEY ("saleItemId") REFERENCES "SaleItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PosTerminalStockMovement"
ADD CONSTRAINT "PosTerminalStockMovement_actorId_fkey"
FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SaleItemBatch"
ADD CONSTRAINT "SaleItemBatch_terminalBatchId_fkey"
FOREIGN KEY ("terminalBatchId") REFERENCES "PosTerminalStockBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalesProductReturn"
ADD CONSTRAINT "SalesProductReturn_terminalBatchId_fkey"
FOREIGN KEY ("terminalBatchId") REFERENCES "PosTerminalStockBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Distribute each legacy terminal's unsold allocation across central batches
-- FIFO, then transfer that exact quantity out of central availability.
WITH allocation_demand AS (
    SELECT
        a."id" AS "allocationId",
        a."terminalId",
        a."productId",
        GREATEST(a."allocatedQuantity" - a."soldQuantity", 0)::INTEGER AS demand,
        COALESCE(SUM(GREATEST(a."allocatedQuantity" - a."soldQuantity", 0)) OVER (
            PARTITION BY a."productId"
            ORDER BY a."terminalId", a."id"
            ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ), 0)::INTEGER AS demand_start,
        SUM(GREATEST(a."allocatedQuantity" - a."soldQuantity", 0)) OVER (
            PARTITION BY a."productId"
            ORDER BY a."terminalId", a."id"
        )::INTEGER AS demand_end
    FROM "PosTerminalStockAllocation" a
),
batch_supply AS (
    SELECT
        b."id" AS "sourceBatchId",
        b."productId",
        b."unitCost",
        COALESCE(SUM(b."quantityRemaining") OVER (
            PARTITION BY b."productId"
            ORDER BY b."receivedAt", b."batchNumber", b."id"
            ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ), 0)::INTEGER AS supply_start,
        SUM(b."quantityRemaining") OVER (
            PARTITION BY b."productId"
            ORDER BY b."receivedAt", b."batchNumber", b."id"
        )::INTEGER AS supply_end
    FROM "SalesProductBatch" b
    WHERE b."quantityRemaining" > 0
),
distribution AS (
    SELECT
        d."allocationId",
        d."terminalId",
        d."productId",
        s."sourceBatchId",
        s."unitCost",
        GREATEST(
            LEAST(d.demand_end, s.supply_end) - GREATEST(d.demand_start, s.supply_start),
            0
        )::INTEGER AS quantity
    FROM allocation_demand d
    JOIN batch_supply s ON s."productId" = d."productId"
    WHERE d.demand > 0
      AND d.demand_start < s.supply_end
      AND s.supply_start < d.demand_end
)
INSERT INTO "PosTerminalStockBatch" (
    "id",
    "allocationId",
    "terminalId",
    "productId",
    "sourceBatchId",
    "quantityAllocated",
    "quantityRemaining",
    "unitCost",
    "allocatedAt",
    "createdAt",
    "updatedAt"
)
SELECT
    'migrated_' || md5("allocationId" || ':' || "sourceBatchId"),
    "allocationId",
    "terminalId",
    "productId",
    "sourceBatchId",
    quantity,
    quantity,
    "unitCost",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM distribution
WHERE quantity > 0;

UPDATE "SalesProductBatch" central
SET "quantityRemaining" = central."quantityRemaining" - transferred.quantity
FROM (
    SELECT "sourceBatchId", SUM("quantityRemaining")::INTEGER AS quantity
    FROM "PosTerminalStockBatch"
    WHERE "id" LIKE 'migrated_%'
    GROUP BY "sourceBatchId"
) transferred
WHERE central."id" = transferred."sourceBatchId";

INSERT INTO "PosTerminalStockMovement" (
    "id",
    "terminalId",
    "productId",
    "terminalBatchId",
    "type",
    "quantity",
    "balanceAfter",
    "occurredAt",
    "note"
)
SELECT
    'movement_' || md5(custody."id" || ':allocate'),
    custody."terminalId",
    custody."productId",
    custody."id",
    'ALLOCATE'::"PosTerminalStockMovementType",
    custody."quantityAllocated",
    custody."quantityRemaining",
    CURRENT_TIMESTAMP,
    'Migrated existing POS terminal allocation into physical custody'
FROM "PosTerminalStockBatch" custody
WHERE custody."id" LIKE 'migrated_%';

-- Existing aggregate allocations already include historical sold quantities.
-- The custody rows represent only the unsold physical balance transferred now.
