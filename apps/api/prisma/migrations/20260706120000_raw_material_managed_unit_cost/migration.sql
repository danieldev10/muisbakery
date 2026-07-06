-- AlterTable
ALTER TABLE "RawMaterial" ADD COLUMN "unitCost" DECIMAL(14,2);

-- Backfill managed material costs from the latest receipt cost where available.
UPDATE "RawMaterial" material
SET "unitCost" = source."unitCost"
FROM (
    SELECT DISTINCT ON ("rawMaterialId")
        "rawMaterialId",
        "unitCost"
    FROM "RawMaterialReceipt"
    WHERE "unitCost" IS NOT NULL
    ORDER BY "rawMaterialId", "receivedAt" DESC, "createdAt" DESC
) source
WHERE material."id" = source."rawMaterialId"
  AND material."unitCost" IS NULL;

-- Fall back to the latest batch cost for installations created before receipts.
UPDATE "RawMaterial" material
SET "unitCost" = source."unitCost"
FROM (
    SELECT DISTINCT ON ("rawMaterialId")
        "rawMaterialId",
        "unitCost"
    FROM "RawMaterialBatch"
    WHERE "unitCost" IS NOT NULL
    ORDER BY "rawMaterialId", "receivedAt" DESC, "createdAt" DESC
) source
WHERE material."id" = source."rawMaterialId"
  AND material."unitCost" IS NULL;
