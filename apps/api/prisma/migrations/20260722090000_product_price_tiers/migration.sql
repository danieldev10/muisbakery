CREATE TYPE "SalePriceType" AS ENUM ('WALK_IN', 'RETAILER', 'DISCOUNTED');

ALTER TABLE "Product"
ADD COLUMN "retailerPrice" DECIMAL(14,2),
ADD COLUMN "discountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0;

UPDATE "Product"
SET "retailerPrice" = "unitPrice"
WHERE "unitPrice" IS NOT NULL;

ALTER TABLE "Product"
ADD CONSTRAINT "Product_discountPercent_check"
CHECK ("discountPercent" >= 0 AND "discountPercent" <= 100);

ALTER TABLE "Sale"
ADD COLUMN "priceType" "SalePriceType" NOT NULL DEFAULT 'WALK_IN';

UPDATE "Sale"
SET "priceType" = 'RETAILER'
WHERE "customerType" = 'RETAILER';

ALTER TABLE "PosSession"
ADD COLUMN "priceType" "SalePriceType" NOT NULL DEFAULT 'WALK_IN';

UPDATE "PosSession"
SET "priceType" = 'RETAILER'
WHERE "customerType" = 'RETAILER';
