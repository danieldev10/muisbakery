-- Retire offline POS operations. Unsold terminal custody is returned to its
-- original central FIFO batch before the offline-only data model is removed.
DO $$
DECLARE
    custody RECORD;
    central_balance INTEGER;
BEGIN
    FOR custody IN
        SELECT
            terminal_batch."id",
            terminal_batch."terminalId",
            terminal_batch."productId",
            terminal_batch."sourceBatchId",
            terminal_batch."quantityRemaining"
        FROM "PosTerminalStockBatch" terminal_batch
        WHERE terminal_batch."quantityRemaining" > 0
        ORDER BY terminal_batch."sourceBatchId", terminal_batch."allocatedAt", terminal_batch."id"
        FOR UPDATE
    LOOP
        UPDATE "SalesProductBatch"
        SET "quantityRemaining" = "quantityRemaining" + custody."quantityRemaining"
        WHERE "id" = custody."sourceBatchId"
        RETURNING "quantityRemaining" INTO central_balance;

        IF central_balance IS NULL THEN
            RAISE EXCEPTION
                'Cannot return terminal stock batch % because source batch % is missing',
                custody."id",
                custody."sourceBatchId";
        END IF;

        INSERT INTO "SalesProductStockMovement" (
            "id",
            "productId",
            "batchId",
            "type",
            "quantity",
            "balanceAfter",
            "occurredAt",
            "note"
        )
        VALUES (
            'online_release_' || md5(custody."id"),
            custody."productId",
            custody."sourceBatchId",
            'RELEASE_FROM_TERMINAL'::"FinishedProductStockMovementType",
            custody."quantityRemaining",
            central_balance,
            CURRENT_TIMESTAMP,
            'Online-only POS migration: returned unsold terminal custody'
        );

        UPDATE "PosTerminalStockBatch"
        SET
            "quantityRemaining" = 0,
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = custody."id";
    END LOOP;
END $$;

-- A day waiting for terminal readiness is reopened because the readiness gate
-- no longer exists in the online-only workflow.
UPDATE "BusinessDayState"
SET
    "status" = 'OPEN',
    "closeCutoffAt" = NULL,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" = 'CLOSING';

ALTER TABLE "SaleItemBatch"
    DROP COLUMN IF EXISTS "terminalBatchId" CASCADE;

ALTER TABLE "SalesProductReturn"
    DROP COLUMN IF EXISTS "terminalBatchId" CASCADE;

ALTER TABLE "RetailerOrderApproval"
    DROP COLUMN IF EXISTS "terminalId" CASCADE;

DROP TABLE IF EXISTS "PosTerminalStockMovement" CASCADE;
DROP TABLE IF EXISTS "PosOfflineSyncAttempt" CASCADE;
DROP TABLE IF EXISTS "PosTerminalDayCloseReadiness" CASCADE;
DROP TABLE IF EXISTS "PosTerminalRetailerCreditAllocation" CASCADE;
DROP TABLE IF EXISTS "PosTerminalStockBatch" CASCADE;
DROP TABLE IF EXISTS "PosTerminalStockAllocation" CASCADE;

ALTER TABLE "PosTerminal"
    DROP COLUMN IF EXISTS "pairingCodeHash",
    DROP COLUMN IF EXISTS "pairingCodeExpiresAt",
    DROP COLUMN IF EXISTS "pairedAt",
    DROP COLUMN IF EXISTS "pairedById",
    DROP COLUMN IF EXISTS "deviceSecretHash",
    DROP COLUMN IF EXISTS "deviceSecretIssuedAt",
    DROP COLUMN IF EXISTS "offlineEnabled",
    DROP COLUMN IF EXISTS "lastSeenAt",
    DROP COLUMN IF EXISTS "lastSyncedAt";

ALTER TABLE "BusinessDayState"
    DROP COLUMN IF EXISTS "closeCutoffAt";

ALTER TABLE "BusinessDayState"
    ALTER COLUMN "status" DROP DEFAULT;

ALTER TYPE "BusinessDayStatus" RENAME TO "BusinessDayStatus_old";
CREATE TYPE "BusinessDayStatus" AS ENUM (
    'OPEN',
    'SUBMITTED',
    'STALE',
    'APPROVED'
);

ALTER TABLE "BusinessDayState"
    ALTER COLUMN "status" TYPE "BusinessDayStatus"
    USING ("status"::text::"BusinessDayStatus");

ALTER TABLE "BusinessDayState"
    ALTER COLUMN "status" SET DEFAULT 'OPEN';

DROP TYPE "BusinessDayStatus_old";
DROP TYPE IF EXISTS "PosOfflineSyncStatus";
DROP TYPE IF EXISTS "PosTerminalStockMovementType";
