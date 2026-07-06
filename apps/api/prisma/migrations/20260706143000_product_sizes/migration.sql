-- Add product sizes and allow size-specific product variants.

ALTER TABLE "Product" ADD COLUMN "size" TEXT NOT NULL DEFAULT '';

DROP INDEX IF EXISTS "Product_name_key";

CREATE UNIQUE INDEX "Product_name_size_key" ON "Product"("name", "size");
