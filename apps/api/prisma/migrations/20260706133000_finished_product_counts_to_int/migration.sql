-- Convert count-based finished-product fields from Decimal to Integer.
-- Raw-material measurements remain Decimal because kg/L/etc. can be fractional.

ALTER TABLE "Recipe"
  ALTER COLUMN "yieldQuantity" TYPE INTEGER USING ROUND("yieldQuantity")::INTEGER;

ALTER TABLE "ProductionRun"
  ALTER COLUMN "quantityProduced" TYPE INTEGER USING ROUND("quantityProduced")::INTEGER,
  ALTER COLUMN "quantityTransferred" TYPE INTEGER USING ROUND("quantityTransferred")::INTEGER,
  ALTER COLUMN "wasteQuantity" TYPE INTEGER USING ROUND("wasteQuantity")::INTEGER;

ALTER TABLE "ProductionWaste"
  ALTER COLUMN "quantity" TYPE INTEGER USING ROUND("quantity")::INTEGER;

ALTER TABLE "SalesProductBatch"
  ALTER COLUMN "quantityReceived" TYPE INTEGER USING ROUND("quantityReceived")::INTEGER,
  ALTER COLUMN "quantityRemaining" TYPE INTEGER USING ROUND("quantityRemaining")::INTEGER;

ALTER TABLE "SalesProductStockMovement"
  ALTER COLUMN "quantity" TYPE INTEGER USING ROUND("quantity")::INTEGER,
  ALTER COLUMN "balanceAfter" TYPE INTEGER USING ROUND("balanceAfter")::INTEGER;

ALTER TABLE "PosSessionItem"
  ALTER COLUMN "quantity" TYPE INTEGER USING ROUND("quantity")::INTEGER;

ALTER TABLE "SaleItem"
  ALTER COLUMN "quantity" TYPE INTEGER USING ROUND("quantity")::INTEGER;

ALTER TABLE "SaleItemBatch"
  ALTER COLUMN "quantity" TYPE INTEGER USING ROUND("quantity")::INTEGER;

ALTER TABLE "SalesProductReturn"
  ALTER COLUMN "quantity" TYPE INTEGER USING ROUND("quantity")::INTEGER;
