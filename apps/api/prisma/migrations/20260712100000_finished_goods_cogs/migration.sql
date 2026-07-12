ALTER TABLE "SalesProductBatch"
  ADD COLUMN "unitCost" DECIMAL(14,4) NOT NULL DEFAULT 0,
  ADD COLUMN "totalCost" DECIMAL(14,2) NOT NULL DEFAULT 0;

WITH run_costs AS (
  SELECT
    pr."id" AS "productionRunId",
    pr."quantityProduced" AS "quantityProduced",
    COALESCE(SUM(pm."quantity" * COALESCE(rmb."unitCost", 0)), 0) AS "materialCost"
  FROM "ProductionRun" pr
  LEFT JOIN "ProductionMaterialStockMovement" pm
    ON pm."productionRunId" = pr."id"
   AND pm."type" = 'CONSUME'
  LEFT JOIN "ProductionMaterialStockBatch" pmb
    ON pmb."id" = pm."productionBatchId"
  LEFT JOIN "RawMaterialBatch" rmb
    ON rmb."id" = pmb."storeBatchId"
  GROUP BY pr."id", pr."quantityProduced"
)
UPDATE "SalesProductBatch" batch
SET
  "unitCost" = ROUND(run_costs."materialCost" / NULLIF(run_costs."quantityProduced", 0), 4),
  "totalCost" = ROUND(
    (run_costs."materialCost" / NULLIF(run_costs."quantityProduced", 0)) * batch."quantityReceived",
    2
  )
FROM run_costs
WHERE batch."productionRunId" = run_costs."productionRunId"
  AND run_costs."quantityProduced" > 0;
